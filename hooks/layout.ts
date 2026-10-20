// Row arithmetic and the header text for the reviewer, kept free of JSX so tests can drive it.
import type { FbReview } from '../types'
import { blockIndex, blocksOf, currentRange, lineRef, linesOf } from './review'

/** A hint: the key, drawn bold, and what it does. */
export type Hint = [string, string]

const HINTS: Hint[] = [
  ['j/k', 'строка'], ['v', 'выделить'], ['Enter', 'коммент'], ['m', 'рендер'], ['f', 'весь экран'],
  ['s', 'в промпт'], ['q', 'отмена'], ['?', 'все клавиши'],
]
const DRAFT_HINTS: Hint[] = [['Enter', 'сохранить'], ['⇧Enter', 'новая строка'], ['пустой Enter', 'отмена']]
const PREVIEW_HINTS: Hint[] = [
  ['j/k', 'блок'], ['v', 'выделить'], ['Enter', 'коммент'], ['m', 'исходник'], ['f', 'весь экран'],
  ['s', 'в промпт'], ['q', 'отмена'], ['?', 'все клавиши'],
]
export const HINT_GAP = ' · '

const snippet = (lines: string[]) => {
  const first = lines.find(l => l.trim() !== '')?.replace(/[`*_#>|]/g, '').replace(/\s+/g, ' ').trim() ?? ''
  return first.length > 40 ? `${first.slice(0, 39)}…` : first
}

export function titleOf(r: FbReview, lines: string[]) {
  const blocks = blocksOf(r.text)
  const parts = [
    r.preview
      ? `блок ${blockIndex(blocks, r.cursor) + 1}/${blocks.length} (${lineRef(currentRange({ ...r, anchor: null }))})`
      : `строка ${r.cursor + 1}/${lines.length}`,
  ]
  if (r.anchor !== null) parts.push(`выделение ${lineRef(currentRange(r))}`)
  parts.push(`комментариев: ${r.comments.length}`)
  if (r.send) parts.push('--send')

  return { head: `feedback · ответ #${r.index} «${snippet(lines)}»`, tail: ` · ${parts.join(' · ')}` }
}

export const hintsOf = (r: FbReview) => (r.draft ? DRAFT_HINTS : r.preview ? PREVIEW_HINTS : HINTS)

/** The hint row as plain text: what rowsOf counts. */
export const hintOf = (r: FbReview) => hintsOf(r).map(([key, what]) => `${key} ${what}`).join(HINT_GAP)

// Greedy word wrap, as the terminal breaks a Text: a word that would cross the edge
// starts the next row, one longer than a row is cut across rows. Over, never under:
// a spare row at the bottom beats a cursor clipped off it.
// ponytail: one cell per code point; wide glyphs (CJK, emoji) undercount and scroll a row late
export const rowsOf = (text: string, width: number) => {
  const w = Math.max(1, width)
  let rows = 0
  for (const line of text.split('\n')) {
    let used = 0
    let lineRows = 1
    for (const word of line.split(' ')) {
      const len = [...word].length
      const need = used === 0 ? len : used + 1 + len
      if (need <= w) {
        used = need
      } else if (len <= w) {
        lineRows++
        used = len
      } else {
        if (used > 0) lineRows++
        lineRows += Math.ceil(len / w) - 1
        used = len % w || w
      }
    }
    rows += lineRows
  }

  return rows
}

/** Cells the gutter takes beside `width` digits: `> 12 1 │ ` is the mark, the number, the comment count and the bar. */
export const GUTTER = 7

export type Measure = {
  lines: string[]
  /** Digits the line-number gutter takes. */
  width: number
  /** Columns left for the text column. */
  content: number
  /** Rows each source line draws, its comments and an open draft included. */
  heights: number[]
}

export function measure(r: FbReview, columns: number): Measure {
  const lines = linesOf(r.text)
  const width = String(lines.length).length
  const content = Math.max(10, columns - (width + GUTTER))
  const heights = lines.map(line => rowsOf(line || ' ', content))
  const add = (line: number, rows: number) => {
    if (line < heights.length) heights[line] = (heights[line] ?? 1) + rows
  }
  for (const c of r.comments) {
    if (c.id !== r.draft?.id) add(c.end, rowsOf(`↳ #${c.id} ${lineRef(c)}: ${c.body}`, content))
  }
  if (r.draft) add(r.draft.end, draftRows(r, content))

  return { lines, width, content, heights }
}

// Words wrapped to `width` cells, as rowsOf counts them; a word longer than a row is cut.
const wrap = (text: string, width: number): string[] => {
  const w = Math.max(1, width)
  const out: string[] = []
  let line = ''
  for (const word of text.split(' ').filter(Boolean)) {
    let rest = [...word]
    const used = [...line].length
    if (used > 0 && used + 1 + rest.length <= w) {
      line += ` ${word}`
      continue
    }
    if (used > 0) out.push(line)
    while (rest.length > w) {
      out.push(rest.slice(0, w).join(''))
      rest = rest.slice(w)
    }
    line = rest.join('')
  }
  out.push(line)

  return out
}

/** Whether a rendered block is a table alone: drawn by tableRows, fitted to the pane. */
export const isTable = (source: string[]) => source.length >= 2 && source.every(l => l.trimStart().startsWith('|'))

const cellsOf = (line: string) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split(/(?<!\\)\|/)
    .map(c => c.replace(/\\\|/g, '|').replace(/\*\*|`/g, '').trim())

/**
 * A markdown table as rows of box drawing at most `width` cells wide: columns keep their
 * natural width while they fit, else share the room by need and wrap their words.
 * Markup inside cells (code, bold) is dropped; the header row is bold.
 */
export function tableRows(source: string[], width: number): { text: string; bold: boolean }[] {
  const rows = source.filter(l => !/^\s*\|?[\s:|-]+\|?\s*$/.test(l)).map(cellsOf)
  const cols = Math.max(...rows.map(r => r.length))
  for (const r of rows) while (r.length < cols) r.push('')
  const natural = Array.from({ length: cols }, (_, c) => Math.max(1, ...rows.map(r => [...r[c]!].length)))
  // Each column first gets its longest word (so words stay whole) or an equal share if those
  // overflow; the rest goes by how much text each column still has to fit.
  const room = Math.max(cols, width - 3 * cols - 1)
  const longest = rows[0]!.map((_, c) => Math.max(1, ...rows.flatMap(r => r[c]!.split(' ').map(w => [...w].length))))
  const fair = Math.max(1, Math.floor(room / cols))
  const widths = natural.map((n, c) => Math.min(n, longest[c]!))
  if (widths.reduce((a, b) => a + b, 0) > room) widths.forEach((w, c) => (widths[c] = Math.min(w, fair)))
  let left = room - widths.reduce((a, b) => a + b, 0)
  while (left > 0) {
    const need = natural.map((n, c) => n - widths[c]!)
    const total = need.reduce((a, b) => a + b, 0)
    if (total <= 0) break
    let given = 0
    need.forEach((n, c) => {
      const give = Math.min(n, Math.floor((left * n) / total))
      widths[c]! += give
      given += give
    })
    if (given === 0) widths[need.indexOf(Math.max(...need))]! += 1
    left -= Math.max(1, given)
  }
  const rule = (l: string, m: string, r: string) => l + widths.map(w => '─'.repeat(w + 2)).join(m) + r
  const out = [{ text: rule('┌', '┬', '┐'), bold: false }]
  rows.forEach((row, i) => {
    if (i > 0) out.push({ text: rule('├', '┼', '┤'), bold: false })
    const wrapped = row.map((cell, c) => wrap(cell, widths[c]!))
    const height = Math.max(...wrapped.map(w => w.length))
    for (let k = 0; k < height; k++) {
      const cells = wrapped.map((w, c) => (w[k] ?? '') + ' '.repeat(widths[c]! - [...(w[k] ?? '')].length))
      out.push({ text: `│ ${cells.join(' │ ')} │`, bold: i === 0 })
    }
  })
  out.push({ text: rule('└', '┴', '┘'), bold: false })

  return out
}

/** Cells the rendered view's gutter takes: the cursor or selection mark, the comment count. */
export const BLOCK_GUTTER = 4

/** Rows the draft box takes under its line or block: two of border, its title, the text. */
export const draftRows = (r: FbReview, content: number) => 3 + rowsOf(r.draftText || ' ', content - 4)

/**
 * Rows each rendered block is guessed to take, its comments and draft included.
 * The renderer's own heights are not known here, so a table counts generously.
 */
// ponytail: a guess for prose and lists (the renderer wraps them); tables are drawn here and counted exactly
export function blockHeights(r: FbReview, columns: number): number[] {
  const lines = linesOf(r.text)
  const blocks = blocksOf(r.text)
  const content = Math.max(10, columns - BLOCK_GUTTER)
  return blocks.map((b, i) => {
    const source = lines.slice(b.start, b.end + 1)
    let rows = isTable(source) ? tableRows(source, content).length : rowsOf(source.join('\n'), content)
    if (i > 0 && b.start > blocks[i - 1]!.end + 1) rows++ // the blank line before it
    for (const c of r.comments) {
      if (c.id !== r.draft?.id && blockIndex(blocks, c.end) === i) rows += rowsOf(`↳ #${c.id} ${lineRef(c)}: ${c.body}`, content)
    }
    if (r.draft && blockIndex(blocks, r.draft.end) === i) rows += draftRows(r, content)
    return rows
  })
}

/** What the window scrolls over: source lines, or rendered blocks; and which one the cursor is on. */
export const unitsOf = (r: FbReview, columns: number) =>
  r.preview
    ? { heights: blockHeights(r, columns), at: blockIndex(blocksOf(r.text), r.cursor) }
    : { heights: measure(r, columns).heights, at: r.cursor }

/**
 * The first line drawn: `top` moved only as far as keeping the cursor in view
 * needs, with one line of context above and one row below where there is one.
 * Walks back from the cursor, so it costs the rows of one viewport, never the
 * length of the reply.
 */
export function fitTop(heights: number[], cursor: number, top: number, viewport: number): number {
  const floor = Math.min(top, Math.max(0, cursor - 1))
  const below = cursor + 1 < heights.length ? 1 : 0
  let used = (heights[cursor] ?? 1) + below
  let first = cursor
  while (first > floor && used + (heights[first - 1] ?? 1) <= viewport) {
    first--
    used += heights[first] ?? 1
  }

  return first
}
