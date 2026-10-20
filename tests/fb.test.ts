import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { fieldKeys, fieldStart, markOf } from '../hooks/field'
import { fitTop, measure, rowsOf, tableRows } from '../hooks/layout'
import {
  arm,
  blocksOf,
  buildPrompt,
  deleteAtCursor,
  handleKey,
  keyName,
  saveDraft,
  scrollBy,
  setCursor,
  startAdd,
  startEdit,
  startReview,
  toggleSelection,
  walkBlocks,
} from '../hooks/review'
import type { FbReview } from '../types'

const REPLY = 'Флаки есть, но их не видно.\nПоход в базу один.\n\nPub/Sub влияет редко.'
const step = (r: FbReview, key: string, extra = {}) => handleKey(r, { key, ...extra }, 2) as FbReview
const run = ($: Engine, args: string) =>
  $.command.run({ command: 'fb', args, origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })
const PANE_PROPS = { title: 'fb', isFocused: true, bodyColumns: 100, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 30 }, view: {} }

test('a range comment quotes its numbered lines in the prompt', () => {
  let r = startReview(3, REPLY, false)
  r = toggleSelection(r)
  r = setCursor(r, 1)
  r = saveDraft(startAdd(r), '  почему один?  ')
  expect(r.comments).toEqual([{ id: 1, start: 0, end: 1, body: 'почему один?' }])
  expect(r.anchor).toBeNull()
  const prompt = buildPrompt(r)
  expect(prompt).toContain('ответу #3')
  expect(prompt).toContain('1. L1-L2\n> 1: Флаки есть, но их не видно.\n> 2: Поход в базу один.\nКомментарий:\nпочему один?')
})

test('edit, delete, empty drafts and the blank-line warning', () => {
  let r = startAdd(setCursor(startReview(1, REPLY, false), 2))
  expect(r.status).toContain('L3 — пустая строка')
  r = saveDraft(r, 'x')
  expect(buildPrompt(r)).toContain('> 3: ∅')
  r = saveDraft(startEdit(r), 'y')
  expect(r.comments[0]?.body).toBe('y')
  r = saveDraft(startAdd(r), '   ')
  expect(r.comments).toHaveLength(1)
  expect(deleteAtCursor(r).comments).toHaveLength(0)
})

test('s fills at once; with --send s and q need a second press', () => {
  const empty = startReview(1, REPLY, true)
  expect(arm(empty, 'cancel')).toBe('cancel')
  expect(typeof arm(empty, 'submit')).toBe('object') // nothing to send
  const r = saveDraft(startAdd(empty), 'x')
  const once = arm(r, 'submit')
  expect(typeof once).toBe('object')
  expect(arm(once as typeof r, 'submit')).toBe('submit')
  expect(arm({ ...r, send: false }, 'submit')).toBe('submit')
})

test('Russian-layout keys name the same commands', () => {
  expect(['о', 'л', 'с', 'ы', 'й'].map(key => keyName({ key }))).toEqual(['j', 'k', 'c', 's', 'q'])
  expect(keyName({ key: 'П' })).toBe('G')
  expect(keyName({ key: 'g', shift: true })).toBe('G')
  expect(keyName({ key: 'в', ctrl: true })).toBe('ctrl+d')
})

test('handleKey moves, comments in Cyrillic and submits', () => {
  let r = startReview(1, REPLY, false)
  r = step(step(r, 'о'), 'П') // j, then G: the last line
  expect(r.cursor).toBe(3)
  r = step(r, 'п') // g: back to the top
  r = step(r, 'с') // c: open a draft; letters now type
  for (const key of ['о', 'к', 'space', '!', 'escape', 'f5', ' test']) r = step(r, key) // the last one is a paste
  r = step(r, 'return', { shift: true })
  r = step(step(r, 'x'), 'backspace')
  r = step(r, 'return')
  expect(r.comments).toEqual([{ id: 1, start: 0, end: 0, body: 'ок ! test' }])
  expect(handleKey(r, { key: 'ы' }, 2)).toBe('submit')
})

test('the comment field edits at the caret: arrows, lines, home/end, delete', () => {
  let r = step(startReview(1, REPLY, false), 'c')
  for (const key of ['а', 'в']) r = step(r, key)
  r = step(step(r, 'left'), 'б') // insert between: абв
  r = step(step(r, 'end'), 'return', { shift: true })
  for (const key of ['г', 'д', 'е']) r = step(r, key)
  r = step(r, 'up') // from column 3 of «где» to column 3 of «абв»
  expect(r.draftCaret).toBe(3)
  r = step(step(r, 'home'), 'delete') // drop а
  expect(r.draftText).toBe('бв\nгде')
  r = step(step(r, 'down'), 'у', { ctrl: true }) // ctrl+у is ctrl+e: end of the second line
  r = step(r, 'backspace')
  expect(r.draftText).toBe('бв\nгд')
  expect(step(r, 'return').comments[0]?.body).toBe('бв\nгд')
})

test('a review saved before the caret existed still edits at its end', () => {
  const old = { ...saveDraft(startAdd(startReview(1, REPLY, false)), 'x'), draft: { start: 0, end: 0 }, draftText: 'аб' } as Partial<FbReview>
  delete old.draftCaret
  const r = handleKey(old as FbReview, { key: 'в' }, 2) as FbReview
  expect(r.draftText).toBe('абв')
  expect(r.draftCaret).toBe(3)
})

test('help, preview and the wheel', () => {
  let r = startReview(1, REPLY, false)
  r = step(r, '?')
  expect(r.help).toBe(true)
  r = step(r, 'j') // any key closes the help and does nothing else
  expect(r.help).toBe(false)
  expect(r.cursor).toBe(0)
  r = step(r, 'ь') // m: rendered; a step is a block
  expect(r.preview).toBe(true)
  expect(step(r, 'j').cursor).toBe(3)
  r = step(r, 'm')
  expect(scrollBy(r, 2).cursor).toBe(2) // a line per row the engine asks
  expect(scrollBy(r, -5).cursor).toBe(0)
  const typing = step(r, 'c')
  expect(scrollBy(typing, 1)).toBe(typing) // no wheel while a comment is typed
})

const MD = '## Итог\nабзац один\nпродолжение\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```go\nx := 1\n\ny := 2\n```\n- пункт один\n  хвост\n- пункт два'

test('blocks: a heading, a paragraph, a table, a fence across a blank line, list items', () => {
  expect(blocksOf(MD)).toEqual([
    { start: 0, end: 0 },
    { start: 1, end: 2 },
    { start: 4, end: 6 },
    { start: 8, end: 12 },
    { start: 13, end: 14 },
    { start: 15, end: 15 },
  ])
  expect(blocksOf('')).toEqual([{ start: 0, end: 0 }])
})

test('rendered: comments take whole blocks and quote their lines', () => {
  let r = step(startReview(1, MD, false), 'm')
  r = step(step(r, 'j'), 'j') // the table
  expect(r.cursor).toBe(4)
  for (const key of ['c', 'x', 'return']) r = step(r, key)
  expect(r.comments).toEqual([{ id: 1, start: 4, end: 6, body: 'x' }])
  expect(buildPrompt(r)).toContain('1. L5-L7\n> 5: | a | b |\n> 6: |---|---|\n> 7: | 1 | 2 |')
  r = step(step(r, 'v'), 'j') // the table and the fence
  for (const key of ['c', 'y', 'return']) r = step(r, key)
  expect(r.comments.at(-1)).toMatchObject({ start: 4, end: 12, body: 'y' })
  r = step(step(r, 'g'), 'n') // from the heading to the first comment's block
  expect(r.cursor).toBe(4)
  expect(step(r, 'n').cursor).toBe(4) // both start on the table: n wraps to it
  r = step(r, 'm') // back to the source, where a comment made mid-block is found by its line
  r = step(setCursor(r, 5), 'e')
  expect(r.draft?.id).toBe(1)
})

test('f asks the pane for the whole screen and gives it back', async ($, on) => {
  on('session.messages', () => ({ value: [{ role: 'assistant', text: MD, toolUses: [] }] }))
  const opens: { columns?: number; rows?: number }[] = []
  on('ui.open', (_, e) => {
    opens.push({ columns: e.columns, rows: e.rows })
    return { value: { isPlaced: true } }
  })
  on('ui.close', () => ({ value: undefined }))
  on('clock.now', () => ({ value: 1 }))
  await run($, '')
  const ui = await $.ui.mount({ plugin: 'inline-notes', surface: 'terminal', component: 'Pane', requestId: 'fb', props: PANE_PROPS, viewport: { columns: 100, rows: 30 } })
  await ui.input({ key: 'keys', text: '\u2060а', kind: 'change' }) // f on the Russian layout
  expect(opens.at(-1)).toEqual({ columns: 120, rows: 30 })
  await ui.input({ key: 'keys', text: '\u200bf', kind: 'change' })
  expect(opens.at(-1)).toEqual({ columns: undefined, rows: undefined })
  await ui.input({ key: 'keys', text: '\u2060m', kind: 'change' }) // rendered: a block per Markdown
  expect(await ui.find({ text: /блок 1\/6 \(L1\)/, in: 'review' })).toBeDefined()
})

test('rendered: the Client walks blocks with the arrows and boxes the draft under its block', async ($, on) => {
  on('session.messages', () => ({ value: [{ role: 'assistant', text: MD, toolUses: [] }] }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))
  on('clock.now', () => ({ value: 1 }))
  await run($, '')
  const ui = await $.ui.mount({ plugin: 'inline-notes', surface: 'terminal', component: 'Pane', requestId: 'fb', props: PANE_PROPS, viewport: { columns: 100, rows: 30 } })
  await ui.key({ key: 'ь', in: 'review' }) // m
  for (let i = 0; i < 5; i++) await ui.key({ key: 'down', in: 'review' })
  expect(await ui.find({ text: /блок 6\/6/, in: 'review' })).toBeDefined()
  await ui.key({ key: 'up', in: 'review' })
  expect(await ui.find({ text: /блок 5\/6 \(L14-L15\)/, in: 'review' })).toBeDefined()
  await ui.key({ key: 'c', in: 'review' })
  expect(await ui.find({ text: /Новый комментарий к L14-L15/, in: 'review' })).toBeDefined()
  for (const key of ['о', 'к']) await ui.key({ key, in: 'review' })
  await ui.key({ key: 'return', in: 'review' })
  expect(await ui.find({ text: /↳ #1 L14-L15: ок/, in: 'review' })).toBeDefined()
})

test('rendered: the arrows walk blocks, a page five, Home/End to an edge', () => {
  const r = step(startReview(1, MD, false), 'm')
  expect(walkBlocks(r, 1, 80).cursor).toBe(1) // ↓: the paragraph under the heading
  expect(walkBlocks(walkBlocks(r, 1, 80), -1, 80).cursor).toBe(0) // ↑
  expect(walkBlocks(r, 30, 80).cursor).toBe(15) // PgDn: five blocks on, the last list item
  expect(walkBlocks(r, 80, 80).cursor).toBe(15) // End
  expect(walkBlocks(walkBlocks(r, 80, 80), -80, 80).cursor).toBe(0) // Home
  const typing = step(r, 'c')
  expect(walkBlocks(typing, 1, 80)).toBe(typing) // no walking while a comment is typed
})

test('fitTop keeps the cursor in view at one viewport of cost', () => {
  const flat = Array.from({ length: 20 }, () => 1)
  expect(fitTop(flat, 0, 0, 5)).toBe(0)
  expect(fitTop(flat, 10, 0, 5)).toBe(7) // lines 7-10 and one row of context below
  expect(fitTop(flat, 19, 0, 5)).toBe(15) // at the end, no row below to keep
  expect(fitTop(flat, 6, 7, 5)).toBe(5) // scrolling up shows one line above the cursor
  expect(fitTop([3, 3, 3], 1, 0, 5)).toBe(1) // a wrapped line that fills the window stands alone
  const long = Array.from({ length: 5000 }, () => 1)
  const started = Date.now()
  expect(fitTop(long, 4999, 0, 40)).toBe(4960)
  expect(Date.now() - started).toBeLessThan(50)
  const r = saveDraft(startAdd(setCursor(startReview(1, REPLY, false), 1)), 'заметка')
  const { heights } = measure(r, 60)
  expect(heights[1]).toBe(2) // the line and its comment row
})

test('rowsOf wraps by words, as the terminal does', () => {
  expect(rowsOf('aaaaaa bbbbbb cccccc', 10)).toBe(3) // 20 chars: two rows by characters, three by words
  expect(rowsOf('abcdefghijklmnopqrstuvwxy', 10)).toBe(3) // one word longer than a row is cut
  expect(rowsOf('ab cd', 10)).toBe(1)
  expect(rowsOf('', 10)).toBe(1)
  expect(rowsOf('ab\ncd', 10)).toBe(2)
})

test('/fb in the pane: Russian keys drive the Client, s fills the prompt', async ($, on) => {
  on('session.messages', () => ({
    value: [
      { role: 'user', text: 'вопрос', toolUses: [] },
      { role: 'assistant', text: 'первый ответ', toolUses: [] },
      { role: 'assistant', text: REPLY, toolUses: [] },
    ],
  }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))
  on('clock.now', () => ({ value: 1 }))
  on('prompt.read', () => ({ value: { text: '', cursor: 0 } }))
  let filled = ''
  on('prompt.fill', (_, e) => {
    filled = e.text
    return { isFilled: true }
  })

  expect((await run($, '')).text).toContain('#2')
  const ui = await $.ui.mount({ plugin: 'inline-notes', surface: 'terminal', component: 'Pane', requestId: 'fb', props: PANE_PROPS, viewport: { columns: 100, rows: 30 } })
  expect(await ui.find({ text: 'Поход в базу один.', in: 'review' })).toBeDefined()
    await ui.key({ key: 'о', in: 'review' }) // j
  await ui.key({ key: 'с', in: 'review' }) // c
  for (const key of ['р', 'у', 'ч', 'к', 'а', 'space', '?']) await ui.key({ key, in: 'review' })
  await ui.key({ key: 'return', in: 'review' })
  expect(await ui.find({ text: /↳ #1 L2: ручка \?/, in: 'review' })).toBeDefined()
  expect((await run($, '3')).text).toContain('сначала s') // a second review never drops this one's comments
  await ui.key({ key: 'ы', in: 'review' }) // s
  expect(filled).toContain('1. L2\n> 2: Поход в базу один.\nКомментарий:\nручка ?')
  expect((await run($, '')).text).toContain('#2 открыто') // closed: /fb starts afresh
})

test('a refused prompt keeps the review; a busy box gets the comments appended', async ($, on) => {
  on('session.messages', () => ({ value: [{ role: 'assistant', text: REPLY, toolUses: [] }] }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('clock.now', () => ({ value: 1 }))
  let closed = 0
  on('ui.close', () => {
    closed++
    return { value: undefined }
  })
  const box = 'мой черновик'
  on('prompt.read', () => ({ value: { text: box, cursor: box.length } }))
  const fills: { text: string; mode?: string }[] = []
  let refuse = true
  on('prompt.fill', (_, e) => {
    fills.push({ text: e.text, mode: e.mode })
    return refuse ? { isFilled: false, refusal: 'dialog' } : { isFilled: true }
  })

  await run($, '')
  const ui = await $.ui.mount({ plugin: 'inline-notes', surface: 'terminal', component: 'Pane', requestId: 'fb', props: PANE_PROPS, viewport: { columns: 100, rows: 30 } })
  for (const key of ['c', 'x', 'return', 's']) await ui.key({ key, in: 'review' })
  expect(closed).toBe(0)
  expect(await ui.find({ text: /Не отправлено: поле ввода недоступно/, in: 'review' })).toBeDefined()
  expect(await ui.find({ text: /↳ #1 L1: x/, in: 'review' })).toBeDefined() // the comment survived
  refuse = false
  await ui.key({ key: 's', in: 'review' })
  expect(closed).toBe(1)
  expect(fills.at(-1)).toMatchObject({ mode: 'append' })
  expect(fills.at(-1)?.text.startsWith('\n\n')).toBe(true)
})

test('the key field drives the review without a click; Enter there opens a comment typed into its box', async ($, on) => {
  on('session.messages', () => ({ value: [{ role: 'assistant', text: REPLY, toolUses: [] }] }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))
  on('clock.now', () => ({ value: 1 }))
  on('prompt.read', () => ({ value: { text: '', cursor: 0 } }))
  let filled = ''
  on('prompt.fill', (_, e) => {
    filled = e.text
    return { isFilled: true }
  })
  await run($, '')
  const ui = await $.ui.mount({ plugin: 'inline-notes', surface: 'terminal', component: 'Pane', requestId: 'fb', props: PANE_PROPS, viewport: { columns: 100, rows: 30 } })
  const type = (text: string) => ui.input({ key: 'keys', text, kind: 'change' })
  // The field holds an invisible mark of generation 0; each handled change draws the next generation.
  await type(markOf(0) + 'о') // j
  expect(await ui.find({ text: /строка 2\/4/, in: 'review' })).toBeDefined()
  await type(markOf(1) + 'jj') // the swap reached the field: typed afresh
  expect(await ui.find({ text: /строка 4\/4/, in: 'review' })).toBeDefined()
  await type(markOf(1) + 'jjkk') // typed before the next swap reached it: goes on from the last change
  expect(await ui.find({ text: /строка 2\/4/, in: 'review' })).toBeDefined()
  await ui.input({ key: 'keys', text: markOf(3), kind: 'submit' }) // Enter: a comment on line 2
  expect(await ui.find({ text: /Новый комментарий к L2/, in: 'review' })).toBeDefined()
  // The comment is typed through the same field, here with the caret before the mark, and lands in the box.
  await type('шлём' + markOf(4))
  expect(await ui.find({ text: /^шлём\s*$/, in: 'review' })).toBeDefined() // the caret after it
  await type('шлём скриншотт' + markOf(4))
  await type(markOf(6).slice(0, 3)) // the field reset to generation 6, then Backspace ate a mark character
  expect(await ui.find({ text: /^шлём скриншот\s*$/, in: 'review' })).toBeDefined()
  await ui.input({ key: 'keys', text: markOf(7), kind: 'submit' })
  expect(await ui.find({ text: /↳ #1 L2: шлём скриншот$/, in: 'review' })).toBeDefined()
  await type(markOf(8) + 's')
  expect(filled).toContain('1. L2\n> 2: Поход в базу один.\nКомментарий:\nшлём скриншот')
})

test('a mark left by an older version (a string) still draws the pane and reads keys', async ($, on) => {
  on('session.messages', () => ({ value: [{ role: 'assistant', text: REPLY, toolUses: [] }] }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))
  on('clock.now', () => ({ value: 1 }))
  // The first read of the mark finds what 0.4.0 kept there: one of its two invisible characters.
  let stale = true
  on('state.get', (_, e, next) => {
    if (e.key !== 'mark' || !stale) return next(e)
    stale = false
    return { value: { value: '\u2060', version: 1 } }
  })
  await run($, '')
  const ui = await $.ui.mount({ plugin: 'inline-notes', surface: 'terminal', component: 'Pane', requestId: 'fb', props: PANE_PROPS, viewport: { columns: 100, rows: 30 } })
  expect(await ui.find({ text: /строка 1\/4/, in: 'review' })).toBeDefined()
  await ui.input({ key: 'keys', text: markOf(0) + 'j', kind: 'change' })
  expect(await ui.find({ text: /строка 2\/4/, in: 'review' })).toBeDefined()
})

test('the key field reads typing wherever the caret is, before and after a swap reaches it', () => {
  let f = fieldStart(0)
  const at = (drawn: number, value: string) => {
    const got = fieldKeys(f, drawn, value)
    f = got.field
    return got.keys
  }
  expect(at(0, markOf(0) + 'ab')).toBe('ab')
  expect(at(1, markOf(0) + 'abc')).toBe('c') // the swap to 1 drawn, not yet on screen
  expect(at(1, markOf(0) + 'abX')).toBe('\bX') // the last character replaced
  expect(at(1, 'd' + markOf(1))).toBe('d') // reset to 1, the caret before the mark
  expect(at(2, markOf(2).slice(0, 3))).toBe('\b') // reset to 2, Backspace over the bare mark
  expect(at(3, markOf(2).slice(0, 2))).toBe('\b')
  expect(at(4, markOf(2).slice(0, 1))).toBe('\b')
  expect(at(4, '')).toBe('\b')
  expect(at(4, 'x')).toBe('x') // typed into the emptied field
  expect(at(5, markOf(5) + 'q')).toBe('q') // generation 5 wears the mark of 1 again: still told from 2
  expect(at(6, markOf(5) + 'qr')).toBe('r')
})

test('a rendered table fits the pane: columns share the width and wrap their words', () => {
  const table = [
    '| Что | Прод (`env:prod`) | Комментарий |',
    '|---|---|---|',
    '| `ListOrders` (gRPC) | ~50k/сутки | Вызывает только `billing-web`. Объём стабилен уже 15 месяцев |',
    '| pub/sub | 0 | — |',
  ]
  const wide = tableRows(table, 200)
  expect(wide.length).toBe(7) // top, header, rule, row, rule, row, bottom: nothing wraps
  expect(wide[1]?.bold).toBe(true)
  expect(wide[1]?.text.startsWith('│ Что               │ Прод (env:prod) │ Комментарий ')).toBe(true) // markup dropped
  expect([...wide[3]!.text].length).toBe([...wide[1]!.text].length) // as wide as its longest cells, no wider
  const narrow = tableRows(table, 50)
  for (const row of narrow) expect([...row.text].length).toBe(50)
  expect(narrow.map(r => r.text).join('\n')).toContain('Объём')
  expect(narrow.length).toBeGreaterThan(7) // the comment wraps
  expect(narrow.at(-1)?.text.startsWith('└')).toBe(true)
})
