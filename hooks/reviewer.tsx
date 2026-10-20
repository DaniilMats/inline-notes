// The /fb reviewer, over the source lines or the rendered blocks (m), as a Client
// surface module: it owns the keyboard once a click
// focuses it, so keys are read raw and the Russian layout maps onto the same commands.
// State lives here (a post per frame keeps only the last); the hooks module gets
// a `sync` snapshot to reopen from and a `finish` with the outcome. A review the
// hooks changed themselves (a wheel scroll) comes back with a higher `rev` and is adopted.
import type { ClientSurface, RenderElement } from 'claude-code'

import type { FbReview } from '../types'
import { BLOCK_GUTTER, GUTTER, draftRows, fitTop, hintOf, isTable, measure, rowsOf, tableRows, titleOf, unitsOf } from './layout'
import { blockIndex, blocksOf, commentsAt, currentRange, handleKey, isSelected, lineRef, setCursor, startAdd, startEdit } from './review'

type Props = { review: FbReview; background: string; focused: boolean }
type State = { review: FbReview; top: number; touched: boolean }

const HELP: [string, string][] = [
  ['j / k, ↑ / ↓ (о / л)', 'строка вниз / вверх; в рендере — блок'],
  ['g / G, Home / End (п / П)', 'в начало / в конец'],
  ['ctrl+d / ctrl+u, PgDn / PgUp', 'страница вниз / вверх'],
  ['v (м)', 'начать или снять выделение диапазона'],
  ['c (с), Enter, клик по строке с курсором', 'комментарий к строке или диапазону'],
  ['e (у), клик по комментарию', 'править комментарий'],
  ['d (в)', 'удалить комментарий на строке'],
  ['n / N (т / Т)', 'следующий / предыдущий комментарий'],
  ['m (ь)', 'отрисованный markdown: таблицы как в ответе, курсор и комментарии — по блокам (абзац, пункт, таблица, код)'],
  ['f (а)', 'панель на весь экран и обратно'],
  ['s (ы)', 'собрать комментарии в поле ввода; с --send — отправить сразу, двойным нажатием'],
  ['q (й)', 'закрыть ревью; с комментариями — двойным нажатием'],
  ['поле «клавиши» над текстом', 'получает клавиши сразу после /fb и ctrl+x Tab — мышь не нужна; ↑↓ там нет, ходите j/k (о/л)'],
  ['Esc', 'вернуться в поле ввода Claude; панель и комментарии остаются, /fb, ctrl+x Tab или клик возвращают'],
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

// Rows the header takes above the body: title, hint, status, divider.
function headerRows(r: FbReview, lines: string[], needsClick: boolean, columns: number) {
  const { head, tail } = titleOf(r, lines, needsClick)

  return rowsOf(head + tail, columns) + rowsOf(hintOf(r), columns) + (r.status ? rowsOf(r.status, columns) : 0) + 1
}

type Hit = { line: number; edit?: number }

export default function Reviewer(props: Props, surface: ClientSurface<State>): RenderElement {
  const { Box, Markdown, Text } = surface.elements
  const incoming = normalize(props.review)
  const held = surface.state
  const sameReview = held !== undefined && held.review.opened === incoming.opened
  // Adopt the props for a new review, and for one the hooks advanced past ours.
  const adopt = !sameReview || incoming.rev! > held.review.rev!
  const state: State = adopt ? { review: incoming, top: sameReview ? held.top : 0, touched: held?.touched ?? false } : held
  if (adopt) surface.setState(state)

  const r = state.review
  const columns = surface.columns || 80
  const rows = surface.rows || 24
  // The pane holding the keyboard is what routes keys here (through the field above) or to a click.
  const needsClick = !props.focused
  const { lines, width, content, heights } = measure(r, columns)
  const viewport = Math.max(3, rows - headerRows(r, lines, needsClick, columns))
  // `top` counts what the window scrolls over: lines, or blocks when rendered.
  const units = unitsOf(r, columns)
  const top = r.help ? state.top : fitTop(units.heights, units.at, state.top, viewport)

  // Every change made here: a higher rev, a refit of the window, a copy to the hooks.
  const apply = (next: FbReview | 'submit' | 'cancel', from: State) => {
    if (typeof next === 'string') return surface.post({ type: 'finish', outcome: next, review: from.review })
    if (next === from.review) return
    const review = { ...next, rev: (from.review.rev ?? 0) + 1 }
    const cols = surface.columns || columns
    const view = Math.max(3, (surface.rows || rows) - headerRows(review, lines, false, cols))
    const fit = unitsOf(review, cols)
    surface.setState({ ...from, review, top: fitTop(fit.heights, fit.at, from.top, view) })
    surface.post({ type: 'sync', review })
  }
  // The first key or click proves the keys reach us: the "click here" hint goes.
  const touched = (): State => {
    const base = surface.state ?? state
    if (base.touched) return base
    const next = { ...base, touched: true }
    surface.setState(next)
    return next
  }

  surface.onKey(ev => {
    const from = touched()
    apply(handleKey(from.review, ev, Math.max(1, viewport - 2)), from)
  })

  if (r.help) {
    surface.onPointer(() => undefined) // the last frame's handler would act on rows that are not drawn
    return (
      <Box flexDirection="column" backgroundColor={props.background} width={columns} height={rows} overflow="hidden">
        <Text bold>feedback · клавиши <Text dimColor>(в скобках — русская раскладка; любая клавиша закрывает)</Text></Text>
        <Text dimColor>{'─'.repeat(columns)}</Text>
        {HELP.map(([keys, what]) => (
          <Box flexDirection="row">
            <Box width={Math.min(42, Math.floor(columns / 2))}>
              <Text color="cyan">{keys}</Text>
            </Box>
            <Box flexShrink={1}>
              <Text>{what}</Text>
            </Box>
          </Box>
        ))}
      </Box>
    )
  }

  const { head, tail } = titleOf(r, lines, needsClick)
  const header = (
    <>
      <Text bold>
        {head}
        <Text dimColor>{tail}</Text>
      </Text>
      <Text dimColor>{hintOf(r)}</Text>
      {r.status !== '' && <Text color="yellow">{r.status}</Text>}
      <Text dimColor>{'─'.repeat(columns)}</Text>
    </>
  )

  const draft = r.draft
  const chars = draft ? [...r.draftText] : []
  // The comment being typed, under its line or block: the field above the reviewer types into it.
  const draftBox = (left: number, boxWidth: number) =>
    draft && (
      <Box flexDirection="column" flexShrink={0} borderStyle="round" borderColor="cyan" paddingX={1} marginLeft={left} width={boxWidth}>
        <Text color="cyan">
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

  if (r.preview) {
    // Rendered: a Markdown per block, drawn as replies are (tables too), from the block
    // the window starts at. Clicks are not mapped: the blocks' heights are only guessed.
    // The last block runs past the bottom; unshrunk, the overflow is cut there and not
    // squeezed out of the draft box above it.
    surface.onPointer(ev => {
      if (ev.type === 'down') touched()
    })
    const blocks = blocksOf(r.text)
    const selected = r.anchor === null ? null : currentRange(r)
    const wide = Math.max(10, columns - BLOCK_GUTTER)
    const shown: RenderElement[] = []
    let filled = 0
    for (let i = top; i < blocks.length && filled < viewport; i++) {
      const b = blocks[i]!
      const count = r.comments.filter(c => c.start <= b.end && b.start <= c.end).length
      const marked = selected !== null && selected.start <= b.start && b.end <= selected.end
      shown.push(
        <Box flexDirection="column" flexShrink={0} marginTop={i > top && b.start > blocks[i - 1]!.end + 1 ? 1 : 0}>
          <Box flexDirection="row">
            <Box width={BLOCK_GUTTER} flexShrink={0}>
              <Text color="cyan">{i === units.at ? '>' : marked ? '┃' : ' '} </Text>
              <Text color="yellow">{count === 0 ? ' ' : count > 9 ? '*' : String(count)}</Text>
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
            .map(c => (
              <Box marginLeft={BLOCK_GUTTER} width={wide}>
                <Text color="yellow">{`↳ #${c.id} ${lineRef(c)}: ${c.body}`}</Text>
              </Box>
            ))}
          {draft && blockIndex(blocks, draft.end) === i ? draftBox(BLOCK_GUTTER, wide) : null}
        </Box>,
      )
      filled += units.heights[i] ?? 1
    }
    return (
      <Box flexDirection="column" backgroundColor={props.background} width={columns} height={rows} overflow="hidden">
        {header}
        {shown}
      </Box>
    )
  }

  // Which source line (and which comment) each drawn row belongs to, for clicks.
  const hits: Hit[] = Array.from({ length: headerRows(r, lines, needsClick, columns) }, () => ({ line: -1 }))
  const body: RenderElement[] = []
  let used = 0
  for (let i = top; i < lines.length && used < viewport; i++) {
    const isCursor = i === r.cursor
    const count = commentsAt(r, i).length
    const lineRows = rowsOf(lines[i] || ' ', content)
    for (let k = 0; k < lineRows; k++) hits.push({ line: i })
    body.push(
      <Box flexDirection="row">
        <Text color={isCursor ? 'cyan' : undefined} dimColor={!isCursor}>
          {isCursor ? '>' : ' '} {String(i + 1).padStart(width)}{' '}
        </Text>
        <Text color="yellow">{count === 0 ? ' ' : count > 9 ? '*' : String(count)}</Text>
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
      body.push(
        <Box marginLeft={width + GUTTER} width={content}>
          <Text color="yellow">{text}</Text>
        </Box>,
      )
    }
    if (draft && draft.end === i) {
      for (let k = 0; k < draftRows(r, content); k++) hits.push({ line: i })
      body.push(draftBox(width + GUTTER, content)!)
    }
    used += heights[i] ?? 1
  }

  surface.onPointer(ev => {
    if (ev.type !== 'down' || ev.button !== 'left') return
    const from = touched()
    const hit = hits[ev.y]
    if (!hit || hit.line < 0 || from.review.draft) return
    const at = setCursor(from.review, hit.line)
    apply(hit.edit !== undefined ? startEdit(at) : hit.line === from.review.cursor ? startAdd(at) : at, from)
  })

  return (
    <Box flexDirection="column" backgroundColor={props.background} width={columns} height={rows} overflow="hidden">
      {header}
      {body}
    </Box>
  )
}
