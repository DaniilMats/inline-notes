// The /fb reviewer, over the source lines or the rendered blocks (m), as a Client
// surface module: it owns the keyboard once a click
// focuses it, so keys are read raw and the Russian layout maps onto the same commands.
// State lives here (a post per frame keeps only the last); the hooks module gets
// a `sync` snapshot to reopen from and a `finish` with the outcome. A review the
// hooks changed themselves (a wheel scroll) comes back with a higher `rev` and is adopted.
import type { ClientSurface, RenderElement } from 'claude-code'

import type { FbReview } from '../types'
import { BLOCK_GUTTER, GUTTER, HINT_GAP, draftRows, headerRows, hintsOf, isTable, measure, rowsOf, tableRows, titleOf, windowOf } from './layout'
import { blockIndex, blocksOf, commentsAt, currentRange, handleKey, isSelected, lineRef, setCursor, startAdd, startEdit } from './review'

/** `background` paints the body, `highlight` the cursor's line; the header stays on the pane's own frame color. */
type Props = { review: FbReview; background: string; highlight: string }
type State = { review: FbReview }

// Theme keys, so the accents follow the person's theme as Claude Code's own do.
const ACCENT = 'claude'
const COMMENT = 'warning'
const SELECTION = 'suggestion'

const HELP: [string, string][] = [
  ['j / k, ↑ / ↓ (о / л)', 'строка вниз / вверх; в рендере — блок'],
  ['g / G, Home / End (п / П)', 'в начало / в конец'],
  ['ctrl+d / ctrl+u, PgDn / PgUp', 'страница вниз / вверх'],
  ['v (м)', 'начать или снять выделение диапазона'],
  ['Enter, клик по строке с курсором', 'комментарий к строке или диапазону'],
  ['e (у), клик по комментарию', 'править комментарий'],
  ['d (в)', 'удалить комментарий на строке'],
  ['n / N (т / Т)', 'следующий / предыдущий комментарий'],
  ['m (ь)', 'отрисованный markdown: таблицы как в ответе, курсор и комментарии — по блокам (абзац, пункт, таблица, код)'],
  ['f (а)', 'панель на весь экран и обратно'],
  ['s (ы)', 'собрать комментарии в поле ввода; с --send — отправить сразу, двойным нажатием'],
  ['q (й)', 'закрыть ревью; с комментариями — двойным нажатием'],
  ['Esc', 'вернуться в поле ввода Claude; панель и комментарии остаются, /fb или клик возвращают'],
  ['скриншот', 'в панель не вставить; после s промпт в обычном поле ввода — вставьте туда перед Enter'],
  ['в поле комментария', 'текст печатается в рамку под строкой; Enter сохраняет, Backspace стирает; после клика по панели ещё ⇧Enter — новая строка, стрелки/Home/End/ctrl+a/ctrl+e двигают каретку'],
]

// Reviews saved by earlier versions lack the newer fields.
const normalize = (r: FbReview): FbReview => ({
  ...r,
  rev: r.rev ?? 0,
  help: r.help ?? false,
  draftText: r.draftText ?? '',
  draftCaret: r.draftCaret ?? [...(r.draftText ?? '')].length,
})

type Hit = { line: number; edit?: number }

export default function Reviewer(props: Props, surface: ClientSurface<State>): RenderElement {
  const { Box, Markdown, Text } = surface.elements
  const incoming = normalize(props.review)
  const held = surface.state
  const sameReview = held !== undefined && held.review.opened === incoming.opened
  // Adopt the props for a new review, and for one the hooks advanced past ours.
  const adopt = !sameReview || incoming.rev! > held.review.rev!
  const state: State = adopt ? { review: incoming } : held
  if (adopt) surface.setState(state)

  const r = state.review
  const columns = surface.columns || 80
  const rows = surface.rows || 24
  // `top` counts what the window scrolls over: lines, or blocks when rendered. The hooks
  // fit the same window from the same review, to put the terminal's caret on it.
  const { inner, viewport, units, top } = windowOf(r, columns, rows)
  const { lines, width, content, heights } = measure(r, inner)

  // Every change made here: a higher rev, a refit of the window, a copy to the hooks.
  const apply = (next: FbReview | 'submit' | 'cancel', from: State) => {
    if (typeof next === 'string') return surface.post({ type: 'finish', outcome: next, review: from.review })
    if (next === from.review) return
    const moved = { ...next, rev: (from.review.rev ?? 0) + 1 }
    const review = { ...moved, top: windowOf(moved, surface.columns || columns, surface.rows || rows).top }
    surface.setState({ ...from, review })
    surface.post({ type: 'sync', review })
  }
  const current = () => surface.state ?? state

  surface.onKey(ev => {
    const from = current()
    apply(handleKey(from.review, ev, Math.max(1, viewport - 2)), from)
  })

  // The pane: the header on the frame's own color, so it reads as the pane's title bar,
  // and the body filling the rest in `background`.
  const frame = (header: RenderElement, body: RenderElement[]) => (
    <Box flexDirection="column" width={columns} height={rows} overflow="hidden">
      <Box flexDirection="column" flexShrink={0} paddingX={1}>
        {header}
      </Box>
      <Box flexDirection="column" flexGrow={1} backgroundColor={props.background} paddingX={1} overflow="hidden">
        {body}
      </Box>
    </Box>
  )

  if (r.help) {
    surface.onPointer(() => undefined) // the last frame's handler would act on rows that are not drawn
    return frame(
      <>
        <Text>
          <Text bold>feedback · клавиши</Text> (в скобках — русская раскладка; любая клавиша закрывает)
        </Text>
        <Text> </Text>
      </>,
      HELP.map(([keys, what]) => (
        <Box flexDirection="row">
          <Box width={Math.min(42, Math.floor(inner / 2))} flexShrink={0}>
            <Text color={ACCENT}>{keys}</Text>
          </Box>
          <Box flexShrink={1}>
            <Text>{what}</Text>
          </Box>
        </Box>
      )),
    )
  }

  const { head, tail } = titleOf(r, lines)
  const hints = hintsOf(r)
  const header = (
    <>
      <Text>
        <Text bold>{head}</Text>
        {tail}
      </Text>
      <Text>
        {hints.flatMap(([key, what], i) => [
          ...(i > 0 ? [HINT_GAP] : []),
          <Text bold>{key}</Text>,
          ` ${what}`,
        ])}
      </Text>
      {r.status !== '' && <Text bold>{r.status}</Text>}
    </>
  )

  const draft = r.draft
  const chars = draft ? [...r.draftText] : []
  // The comment being typed, under its line or block: the field above the reviewer types into it.
  const draftBox = (left: number, boxWidth: number) =>
    draft && (
      <Box flexDirection="column" flexShrink={0} borderStyle="round" borderColor={ACCENT} paddingX={1} marginLeft={left} width={boxWidth}>
        <Text color={ACCENT}>
          {draft.id === undefined ? 'Новый комментарий' : `Правка #${draft.id}`} к {lineRef(draft)}
        </Text>
        <Text>
          {chars.slice(0, r.draftCaret).join('')}
          <Text inverse>{chars[r.draftCaret]?.replace('\n', ' ') || ' '}</Text>
          {chars[r.draftCaret] === '\n' ? '\n' : ''}
          {chars.slice(r.draftCaret + 1).join('')}
        </Text>
      </Box>
    )
  const count = (n: number) => <Text color={COMMENT}>{n === 0 ? ' ' : n > 9 ? '*' : String(n)}</Text>
  const comment = (text: string, left: number, boxWidth: number) => (
    <Box marginLeft={left} width={boxWidth}>
      <Text color={COMMENT}>{text}</Text>
    </Box>
  )

  if (r.preview) {
    // Rendered: a Markdown per block, drawn as replies are (tables too), from the block
    // the window starts at. Clicks are not mapped: the blocks' heights are only guessed.
    // The last block runs past the bottom; unshrunk, the overflow is cut there and not
    // squeezed out of the draft box above it.
    surface.onPointer(() => undefined)
    const blocks = blocksOf(r.text)
    const selected = r.anchor === null ? null : currentRange(r)
    const wide = Math.max(10, inner - BLOCK_GUTTER)
    const shown: RenderElement[] = []
    let filled = 0
    for (let i = top; i < blocks.length && filled < viewport; i++) {
      const b = blocks[i]!
      const isCursor = i === units.at
      const marked = selected !== null && selected.start <= b.start && b.end <= selected.end
      shown.push(
        <Box flexDirection="column" flexShrink={0} marginTop={i > top && b.start > blocks[i - 1]!.end + 1 ? 1 : 0}>
          <Box flexDirection="row" backgroundColor={isCursor ? props.highlight : undefined}>
            <Box width={BLOCK_GUTTER} flexShrink={0}>
              <Text color={isCursor ? ACCENT : SELECTION}>{isCursor ? '▌' : marked ? '┃' : ' '} </Text>
              {count(r.comments.filter(c => c.start <= b.end && b.start <= c.end).length)}
            </Box>
            <Box width={wide} flexDirection="column">
              {isTable(lines.slice(b.start, b.end + 1)) ? (
                tableRows(lines.slice(b.start, b.end + 1), wide).map(row => <Text bold={row.bold}>{row.text}</Text>)
              ) : (
                <Markdown text={lines.slice(b.start, b.end + 1).join('\n')} />
              )}
            </Box>
          </Box>
          {r.comments
            .filter(c => c.id !== draft?.id && blockIndex(blocks, c.end) === i)
            .map(c => comment(`↳ #${c.id} ${lineRef(c)}: ${c.body}`, BLOCK_GUTTER, wide))}
          {draft && blockIndex(blocks, draft.end) === i ? draftBox(BLOCK_GUTTER, wide) : null}
        </Box>,
      )
      filled += units.heights[i] ?? 1
    }
    return frame(header, shown)
  }

  // Which source line (and which comment) each drawn row belongs to, for clicks.
  const hits: Hit[] = Array.from({ length: headerRows(r, lines, inner) }, () => ({ line: -1 }))
  const body: RenderElement[] = []
  let used = 0
  for (let i = top; i < lines.length && used < viewport; i++) {
    const isCursor = i === r.cursor
    const lineRows = rowsOf(lines[i] || ' ', content)
    for (let k = 0; k < lineRows; k++) hits.push({ line: i })
    body.push(
      <Box flexDirection="row" backgroundColor={isCursor ? props.highlight : undefined}>
        <Text color={isCursor ? ACCENT : undefined} dimColor={!isCursor} bold={isCursor}>
          {isCursor ? '▌' : ' '} {String(i + 1).padStart(width)}{' '}
        </Text>
        {count(commentsAt(r, i).length)}
        <Text dimColor> │ </Text>
        <Box width={content}>
          <Text inverse={isSelected(r, i)} bold={isCursor}>
            {lines[i] || ' '}
          </Text>
        </Box>
      </Box>,
    )
    for (const c of r.comments.filter(c => c.end === i && c.id !== draft?.id)) {
      const text = `↳ #${c.id} ${lineRef(c)}: ${c.body}`
      for (let k = 0; k < rowsOf(text, content); k++) hits.push({ line: i, edit: c.id })
      body.push(comment(text, width + GUTTER, content))
    }
    if (draft && draft.end === i) {
      for (let k = 0; k < draftRows(r, content); k++) hits.push({ line: i })
      body.push(draftBox(width + GUTTER, content)!)
    }
    used += heights[i] ?? 1
  }

  surface.onPointer(ev => {
    if (ev.type !== 'down' || ev.button !== 'left') return
    const from = current()
    const hit = hits[ev.y]
    if (!hit || hit.line < 0 || from.review.draft) return
    const at = setCursor(from.review, hit.line)
    apply(hit.edit !== undefined ? startEdit(at) : hit.line === from.review.cursor ? startAdd(at) : at, from)
  })

  return frame(header, body)
}
