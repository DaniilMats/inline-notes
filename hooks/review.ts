// The /fb reviewer as pure state transitions, ported from the pi /fb reviewer.
import type { FbComment, FbReview } from '../types'
import { commentCount, tr } from './i18n'

export { commentCount } from './i18n'

// Split once per reply: every cursor move and every draw asks for the same lines.
let split: { text: string; lines: string[] } | undefined
export const linesOf = (text: string) => {
  if (split?.text !== text) split = { text, lines: text.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n') }
  return split.lines
}

export type Block = { start: number; end: number }

// A heading, a list item or a fence opens a block of its own; a blank line closes one.
// Everything else joins the block above it, so a table's rows stay one table.
const OPENS = /^\s{0,3}(#{1,6}\s|[-*+]\s|\d+[.)]\s|```|~~~)/
let blocked: { text: string; blocks: Block[] } | undefined
/** The source lines the rendered view draws as one Markdown each; never empty. */
export const blocksOf = (text: string): Block[] => {
  if (blocked?.text === text) return blocked.blocks
  const blocks: Block[] = []
  let fence: string | null = null
  let open = false
  let heading = false
  linesOf(text).forEach((line, i) => {
    const last = blocks.at(-1)
    if (fence !== null && last) {
      last.end = i
      if (line.trim().startsWith(fence)) fence = null
      return
    }
    if (line.trim() === '') {
      open = false
      return
    }
    if (open && last && !heading && !OPENS.test(line)) last.end = i
    else blocks.push({ start: i, end: i })
    open = true
    heading = /^\s{0,3}#{1,6}\s/.test(line)
    fence = line.match(/^\s{0,3}(`{3,}|~{3,})/)?.[1] ?? null
  })
  if (blocks.length === 0) blocks.push({ start: 0, end: 0 })
  blocked = { text, blocks }
  return blocks
}

/** The block holding a line, or the next one after a blank line. */
export const blockIndex = (blocks: Block[], line: number) => {
  const i = blocks.findIndex(b => line <= b.end)
  return i < 0 ? blocks.length - 1 : i
}

export function startReview(index: number, text: string, send: boolean, opened = 0): FbReview {
  return {
    opened,
    index,
    text,
    cursor: 0,
    anchor: null,
    comments: [],
    nextId: 1,
    draft: null,
    draftText: '',
    draftCaret: 0,
    preview: false,
    send,
    armed: null,
    status: '',
  }
}

export const lineRef = (c: { start: number; end: number }) =>
  c.start === c.end ? `L${c.start + 1}` : `L${c.start + 1}-L${c.end + 1}`

/** The lines a comment would take: the selection, or the cursor's line; whole blocks when rendered. */
export function currentRange(r: FbReview) {
  const from = r.anchor ?? r.cursor
  const start = Math.min(from, r.cursor)
  const end = Math.max(from, r.cursor)
  if (!r.preview) return { start, end }
  const blocks = blocksOf(r.text)
  return { start: blocks[blockIndex(blocks, start)]!.start, end: blocks[blockIndex(blocks, end)]!.end }
}

// The comments touching the cursor's line, or its block when rendered.
function commentsAtCursor(r: FbReview) {
  const { start, end } = currentRange({ ...r, anchor: null })
  return r.comments.filter(c => c.start <= end && start <= c.end)
}

export const isSelected = (r: FbReview, line: number) => {
  const { start, end } = currentRange(r)
  return r.anchor !== null && start <= line && line <= end
}

export const commentsAt = (r: FbReview, line: number) => r.comments.filter(c => c.start <= line && line <= c.end)

export function setCursor(r: FbReview, line: number): FbReview {
  let cursor = Math.max(0, Math.min(linesOf(r.text).length - 1, line))
  if (r.preview) {
    const blocks = blocksOf(r.text)
    cursor = blocks[blockIndex(blocks, cursor)]!.start // rendered, the cursor sits on a block's first line
  }
  return { ...r, cursor, armed: null, status: '' }
}

export function moveBlock(r: FbReview, by: number): FbReview {
  const blocks = blocksOf(r.text)
  const i = Math.max(0, Math.min(blocks.length - 1, blockIndex(blocks, r.cursor) + by))
  return setCursor(r, blocks[i]!.start)
}

export function toggleSelection(r: FbReview): FbReview {
  return r.anchor === null
    ? { ...r, anchor: r.cursor, armed: null, status: tr(r.lang, 'Выделение с L%d: двигайте курсор, затем c/Enter. v снимает.', r.cursor + 1) }
    : { ...r, anchor: null, armed: null, status: tr(r.lang, 'Выделение снято.') }
}

export function startAdd(r: FbReview): FbReview {
  const range = currentRange(r)
  // A blank line is easy to land on by accident; say so before the comment is typed.
  const blank = linesOf(r.text).slice(range.start, range.end + 1).every(line => line.trim() === '')
  const status = blank ? tr(r.lang, '%s — пустая строка: в промпт она уйдёт как «∅».', lineRef(range)) : ''

  return { ...r, draft: range, draftText: '', draftCaret: 0, armed: null, status }
}

/** The wheel over the reviewer: a line per row the engine asks (it already sums trackpad ticks). */
export function scrollBy(r: FbReview, by: number): FbReview {
  if (r.draft || r.help || by === 0) return r

  return setCursor(r, r.cursor + by)
}

/** The scroll keys over the rendered view: an arrow a block, a page five, Home/End (the whole tree) to an edge. */
export function walkBlocks(r: FbReview, by: number, contentRows: number): FbReview {
  if (r.draft || r.help || by === 0) return r
  if (Math.abs(by) > 1 && Math.abs(by) >= contentRows) return setCursor(r, by < 0 ? 0 : Number.MAX_SAFE_INTEGER)

  return moveBlock(r, Math.sign(by) * (Math.abs(by) > 1 ? 5 : 1))
}

/** Opens comment `id` for editing (a click on it), or the first at the cursor. */
export function startEdit(r: FbReview, id?: number): FbReview {
  const c = id === undefined ? commentsAtCursor(r)[0] : r.comments.find(x => x.id === id)
  if (!c) return { ...r, status: tr(r.lang, 'На этой строке нет комментария.') }
  return { ...r, draft: { id: c.id, start: c.start, end: c.end }, draftText: c.body, draftCaret: [...c.body].length, armed: null, status: '' }
}

/** Names the comment being typed, so another one tells itself from it; none open, undefined. */
export const draftKeyOf = (r: FbReview) => (r.draft ? `draft:${r.opened}:${r.draft.id ?? 'new'}:${r.draft.start}-${r.draft.end}` : undefined)

export function saveDraft(r: FbReview, value: string): FbReview {
  const draft = r.draft
  if (!draft) return r
  const body = value.trim()
  if (body === '') return { ...r, draft: null, draftText: '', draftCaret: 0, status: tr(r.lang, 'Пустой комментарий отброшен.') }
  if (draft.id !== undefined) {
    const comments = r.comments.map(c => (c.id === draft.id ? { ...c, body } : c))
    return { ...r, comments, draft: null, draftText: '', draftCaret: 0, anchor: null, status: tr(r.lang, '#%d изменён.', draft.id) }
  }
  const added: FbComment = { id: r.nextId, start: draft.start, end: draft.end, body }
  const comments = [...r.comments, added].sort((a, b) => a.start - b.start || a.end - b.end || a.id - b.id)
  return { ...r, comments, nextId: r.nextId + 1, draft: null, draftText: '', draftCaret: 0, anchor: null, status: tr(r.lang, '#%d добавлен на %s.', added.id, lineRef(added)) }
}

export function deleteAtCursor(r: FbReview): FbReview {
  const c = commentsAtCursor(r)[0]
  if (!c) return { ...r, status: tr(r.lang, 'На этой строке нет комментария.') }
  return { ...r, comments: r.comments.filter(x => x.id !== c.id), armed: null, status: tr(r.lang, '#%d удалён.', c.id) }
}

export function jumpNext(r: FbReview): FbReview {
  if (r.comments.length === 0) return { ...r, status: tr(r.lang, 'Комментариев пока нет.') }
  // Past the cursor's block when rendered: a comment inside it would snap back to it.
  const after = currentRange({ ...r, anchor: null }).end
  const target = r.comments.find(c => c.start > (r.preview ? after : r.cursor)) ?? r.comments[0]!
  return { ...setCursor(r, target.start), status: `#${target.id} ${lineRef(target)}.` }
}

export function jumpPrev(r: FbReview): FbReview {
  if (r.comments.length === 0) return { ...r, status: tr(r.lang, 'Комментариев пока нет.') }
  const target = [...r.comments].reverse().find(c => c.start < r.cursor) ?? r.comments.at(-1)!
  return { ...setCursor(r, target.start), status: `#${target.id} ${lineRef(target)}.` }
}

/** s and q act on the second press: one stray key never sends or drops the review. */
export function arm(r: FbReview, what: 'submit' | 'cancel'): FbReview | 'submit' | 'cancel' {
  if (what === 'submit' && r.comments.length === 0) return { ...r, status: tr(r.lang, 'Нечего отправлять: комментариев нет.') }
  if (what === 'cancel' && r.comments.length === 0) return 'cancel'
  if (what === 'submit' && !r.send) return 'submit'
  if (r.armed === what) return what
  const status =
    what === 'submit'
      ? tr(r.lang, 'Нажмите s ещё раз, чтобы отправить сразу (--send).')
      : tr(r.lang, 'Нажмите q ещё раз, чтобы выбросить %s.', commentCount(r.comments.length, r.lang))
  return { ...r, armed: what, status }
}

function quoted(r: FbReview, lines: string[], start: number, end: number, max = 12): string {
  const picked = lines.slice(start, end + 1)
  const out = picked.slice(0, max).map((line, i) => `> ${start + i + 1}: ${line || '∅'}`)
  if (picked.length > max) out.push(`> ${tr(r.lang, '… ещё %d строк(и)', picked.length - max)}`)
  return out.join('\n')
}

/** What the page (w) needs to build the prompt as buildPrompt does: its words for `r`'s language. */
export const promptWords = (r: FbReview) => ({
  intro: buildPrompt({ ...r, comments: [] }),
  comment: tr(r.lang, 'Комментарий:'),
  more: tr(r.lang, '… ещё %d строк(и)', '%d'),
})

export function buildPrompt(r: FbReview): string {
  const lines = linesOf(r.text)
  const blocks = r.comments
    .map((c, i) => [`${i + 1}. ${lineRef(c)}`, quoted(r, lines, c.start, c.end), tr(r.lang, 'Комментарий:'), c.body].join('\n'))
    .join('\n\n')

  const intro = tr(
    r.lang,
    'У меня есть inline-комментарии к твоему ответу #%d.\n\nПожалуйста, обработай их одним ответом: пройди по каждому пункту, объясни что меняешь/уточняешь, и если уместно — дай обновлённую версию ответа. Не игнорируй ни один комментарий.',
    r.index,
  )

  return `${intro}\n\n${blocks}`
}

// The same physical keys on the Russian ЙЦУКЕН layout: о is j, л is k, П is G.
const RU: Record<string, string> = {
  о: 'j', л: 'k', м: 'v', с: 'c', у: 'e', в: 'd', т: 'n', ь: 'm', ы: 's', й: 'q', п: 'g', г: 'u', а: 'f', ц: 'w',
}

/** What a key names, layout-independent: `j`, `G`, `ctrl+d`, `return`, `up`. */
export function keyName(ev: { key: string; ctrl?: true; shift?: true }): string {
  if (ev.key.length !== 1) return ev.ctrl ? `ctrl+${ev.key}` : ev.key
  const lower = ev.key.toLowerCase()
  const latin = RU[lower] ?? lower
  if (ev.ctrl) return `ctrl+${latin}`
  return ev.key !== lower || ev.shift ? latin.toUpperCase() : latin
}

// Key names the terminal sends for keys that type nothing; anything else is text (a paste too).
const SPECIAL = new Set([
  'up', 'down', 'left', 'right', 'tab', 'delete', 'insert', 'pageup', 'pagedown', 'home', 'end', 'escape',
  ...Array.from({ length: 24 }, (_, i) => `f${i + 1}`),
])

/** One key inside the comment field: a caret over code points, lines split on `\n`. */
export function editDraft(r: FbReview, ev: { key: string; ctrl?: true; shift?: true; meta?: true }): FbReview {
  const chars = [...r.draftText]
  // A review saved before the caret existed has none: start at the end, as appending did.
  let at = Math.max(0, Math.min(chars.length, r.draftCaret ?? chars.length))
  const lineStart = (i: number) => {
    while (i > 0 && chars[i - 1] !== '\n') i--
    return i
  }
  const lineEnd = (i: number) => {
    while (i < chars.length && chars[i] !== '\n') i++
    return i
  }
  const insert = (text: string) => {
    const added = [...text]
    chars.splice(at, 0, ...added)
    at += added.length
  }
  const ctrlKey = ev.ctrl ? (RU[ev.key] ?? ev.key) : '' // ctrl+ф is ctrl+a on the Russian layout
  const key = ctrlKey === 'a' ? 'home' : ctrlKey === 'e' ? 'end' : ev.key // emacs-style too
  switch (key) {
    case 'left': at = Math.max(0, at - 1); break
    case 'right': at = Math.min(chars.length, at + 1); break
    case 'home': at = lineStart(at); break
    case 'end': at = lineEnd(at); break
    case 'up': {
      const start = lineStart(at)
      at = start === 0 ? 0 : Math.min(lineStart(start - 1) + (at - start), start - 1)
      break
    }
    case 'down': {
      const end = lineEnd(at)
      at = end === chars.length ? end : Math.min(end + 1 + (at - lineStart(at)), lineEnd(end + 1))
      break
    }
    case 'backspace':
      if (at > 0) chars.splice(--at, 1)
      break
    case 'delete':
      chars.splice(at, 1)
      break
    case 'space': insert(' '); break
    case 'return': insert('\n'); break // shift+Enter; a plain Enter saves before reaching here
    default:
      if (ev.ctrl || ev.meta || SPECIAL.has(ev.key)) return r
      insert(ev.key)
  }
  return { ...r, draftText: chars.join(''), draftCaret: at }
}

/** What a key asks of the hooks: fill the prompt, drop the review, or open it in the browser (which keeps it). */
export type Outcome = 'submit' | 'cancel' | 'web'

/** One key against the review: the next state, or the review's outcome. */
export function handleKey(
  r: FbReview,
  ev: { key: string; ctrl?: true; shift?: true; meta?: true },
  page: number,
): FbReview | Outcome {
  if (r.help) return { ...r, help: false } // any key closes the help
  // A comment is typed in a field of its own; a key gets here only when typed before that field
  // was first drawn, and goes into draftText, which the field starts from.
  if (r.draft) return ev.key === 'return' && !ev.shift ? saveDraft(r, r.draftText) : editDraft(r, ev)
  const name = keyName(ev)
  if (name === '?') return { ...r, help: true }
  // Rendered, a step is a block and a page a few of them: their heights are the renderer's.
  const by = (lines: number) => (r.preview ? moveBlock(r, Math.sign(lines) * (Math.abs(lines) > 1 ? 5 : 1)) : setCursor(r, r.cursor + lines))
  switch (name) {
    case 'j': case 'down': return by(1)
    case 'k': case 'up': return by(-1)
    case 'ctrl+d': case 'pagedown': return by(page)
    case 'ctrl+u': case 'pageup': return by(-page)
    case 'g': case 'home': return setCursor(r, 0)
    case 'G': case 'end': return setCursor(r, Number.MAX_SAFE_INTEGER)
    case 'v': return toggleSelection(r)
    case 'c': case 'return': return startAdd(r)
    case 'e': return startEdit(r)
    case 'd': return deleteAtCursor(r)
    case 'n': return jumpNext(r)
    case 'N': return jumpPrev(r)
    case 'm': return setCursor({ ...r, preview: !r.preview }, r.cursor)
    // f asks for the whole screen; a docked pane gets what Claude Code grants, since 2.1.306 under half of it.
    case 'f': return { ...r, wide: !r.wide, status: r.wide ? '' : tr(r.lang, 'Панель шире, насколько даёт Claude Code. Мало места — w откроет ревью в браузере.') }
    case 'w': return 'web'
    case 's': return arm(r, 'submit')
    case 'q': return arm(r, 'cancel')
    default: return r
  }
}
