// /fb: line comments on a Claude reply, batched back into the prompt.
// A port of the pi reviewer: the pane holds a
// Client (./reviewer.tsx) that reads keys raw, so the Russian layout works too. A Client
// takes the keyboard only from a click, so a one-line field above it takes the keys
// whenever the pane does (/fb, ctrl+x Tab) and feeds them to the same handleKey.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { FbReview } from '../types'
import { GENERATIONS, fieldKeys, fieldStart, markOf } from './field'
import type { Field } from './field'
import { buildPrompt, handleKey, lineRef, scrollBy, startReview, walkBlocks } from './review'

const PANE = 'fb'
// The engine fills a pane with the user-message gray (#666666), which washes out
// everything drawn on it; the terminal's own background reads as in the transcript.
// ponytail: fixed to this terminal theme (#292c33); make it a userConfig option if the theme changes
const BACKGROUND = '#292c33'
const review = atom({ plugin: 'inline-notes', key: 'review' } as const, null as FbReview | null)

// The key field holds an invisible mark (./field.ts) and nothing else: each handled change
// swaps it for the next generation, and a field drawn with a different value drops what was typed.
const mark = atom({ plugin: 'inline-notes', key: 'mark' } as const, 0 as number)
// The generation drawn last, and the field's text as last read.
// ponytail: module state; a reload resets it and at worst re-reads one keystroke
let drawnGen = 0
let typing: Field = fieldStart(0)
// A mark set by a version that kept a string there reads as generation 0.
const genOf = (m: unknown) => (typeof m === 'number' ? m : 0)
// Keys are handled one change after another: Enter reads the review the typing before it left.
let handling: Promise<void> = Promise.resolve()
// The terminal's size as last seen, which f asks the pane to take.
// ponytail: module state; after a reload f waits for the next draw or /fb to know it
let screen = { columns: 0, rows: 0 }

type Message = { type: 'sync'; review: FbReview } | { type: 'finish'; outcome: 'submit' | 'cancel'; review: FbReview }

// The data comes from our own module, but it crossed a boundary as `unknown`.
function asMessage(data: unknown): Message | undefined {
  const m = data as Partial<Message> | null
  if (!m || typeof m.review?.opened !== 'number') return undefined
  if (m.type === 'sync' || (m.type === 'finish' && (m.outcome === 'submit' || m.outcome === 'cancel'))) return m as Message
  return undefined
}

async function replies($: EngineInterface): Promise<string[]> {
  const messages = await $.session.messages()
  return messages.filter(m => m.role === 'assistant' && m.text.trim() !== '').map(m => m.text)
}

// A change the hooks make themselves reaches the reviewer by outranking its rev.
const bump = (r: FbReview, patch: Partial<FbReview>): FbReview => ({ ...r, ...patch, rev: (r.rev ?? 0) + 1 })

// Wide, the pane asks for the whole screen (columns docked, rows inline); an open
// without them goes back to the engine's share. A size the person dragged wins either way.
const openPane = ($: EngineInterface, r: FbReview) =>
  $.ui.open({
    id: PANE,
    title: `feedback #${r.index}`,
    focus: true,
    ...(r.wide && screen.columns > 0 ? { columns: screen.columns, rows: Math.max(1, screen.rows) } : {}),
  })

// What a change of the review asks of the pane: its size.
async function follow($: EngineInterface, prev: FbReview, next: FbReview) {
  if (!!prev.wide !== !!next.wide) await openPane($, next).catch(() => undefined)
}

async function close($: EngineInterface) {
  await update($, review, () => null)
  await $.ui.close({ id: PANE }).catch(() => undefined) // already closed with × — nothing to do
}

// The comments leave the review only once the prompt has them; a refusal keeps everything.
async function finish($: EngineInterface, outcome: 'submit' | 'cancel', r: FbReview) {
  if (outcome === 'cancel') {
    await close($)
    $.ui.toast('Ревью отменено.')
    return
  }
  const prompt = buildPrompt(r)
  let failure: string | undefined
  let appended = false
  if (r.send) {
    const sent = await $.prompt.submit({ text: prompt, asUser: true }).catch(() => ({ drop: 'не удалось отправить' }))
    if ('drop' in sent) failure = sent.drop
  } else {
    const box = await $.prompt.read().catch(() => ({ text: '' }))
    appended = box.text.trim() !== '' // never over what the person already typed
    const filled = await $.prompt
      .fill(appended ? { text: `\n\n${prompt}`, mode: 'append' } : { text: prompt })
      .catch(() => ({ isFilled: false as const }))
    if (!filled.isFilled) failure = 'поле ввода недоступно (открыт диалог?)'
  }
  if (failure !== undefined) {
    await update($, review, cur => (cur ? bump(cur, { armed: null, status: `Не отправлено: ${failure}. Комментарии на месте.` }) : cur))
    return
  }
  await close($)
  $.ui.toast(
    r.send
      ? `Отправлено комментариев: ${r.comments.length}.`
      : `${r.comments.length} комментари(й/ев) в поле ввода${appended ? ' после вашего текста' : ''}: проверьте, при желании вставьте скриншот, и Enter.`,
  )
}

// Characters typed into the key field, run through the reviewer's own key handling.
function typeKeys($: EngineInterface, typed: string) {
  const run = () => runKeys($, typed)
  handling = handling.then(run, run)

  return handling
}

async function runKeys($: EngineInterface, typed: string) {
  const prev = await read($, review)
  if (!prev) return
  let r = prev
  for (const ch of typed) {
    const out = handleKey(r, { key: ch === ' ' ? 'space' : ch === '\r' ? 'return' : ch === '\b' ? 'backspace' : ch }, 10)
    if (typeof out === 'string') return finish($, out, r)
    r = out
  }
  const next = bump(r, {})
  await update($, review, () => next)
  await update($, mark, g => (genOf(g) + 1) % GENERATIONS)
  await follow($, prev, next)
}

export const register: Register = on => {
  let announced = 0

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'fb',
      description: 'Построчные комментарии к ответу Claude: /fb — последний ответ, /fb N — ответ N; --send отправляет сразу',
      argumentHint: '[N] [--send]',
    })
    announced = (await replies($)).length // history is never announced retroactively

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const count = (await replies($)).length
    if (count > announced) $.ui.log(`↳ /fb ${count}`)
    announced = count

    return next(e)
  })

  on('command.run', { command: 'fb' }, async ($, e) => {
    const tokens = e.args.trim().split(/\s+/).filter(Boolean)
    const send = tokens.some(t => t === '--send' || t === '-s')
    const ref = tokens.find(t => !t.startsWith('-'))
    screen = { ...screen, columns: e.presentation.columns }
    const open = await read($, review)
    if (open && ref === undefined && !send) {
      await openPane($, open)
      return { text: `Ревью ответа #${open.index} снова открыто: клавиши идут в поле над текстом (j/k, c, s, ? — справка).` }
    }
    if (open && open.comments.length > 0) {
      return {
        text: `Ревью ответа #${open.index} открыто, в нём ${open.comments.length} комментари(й/ев): сначала s (в промпт) или q (закрыть); /fb без аргументов возвращает к нему.`,
      }
    }

    const list = await replies($)
    if (list.length === 0) return { text: 'В сессии ещё нет ответов с текстом.' }
    const index = ref === undefined || ref === 'last' ? list.length : Number(ref)
    const text = list[index - 1]
    if (!Number.isInteger(index) || text === undefined) {
      return { text: `Нет ответа #${ref}: номера от 1 до ${list.length} (их показывает строка ↳ /fb N после ответа).` }
    }
    const opened = await $.clock.now()
    const started = startReview(index, text, send, opened)
    await update($, review, () => started)
    await openPane($, started)

    return { text: `Ревью ответа #${index} открыто: клавиши идут в поле над текстом (j/k, c, s, ? — справка).` }
  })

  on('ui.message', { requestId: PANE }, async ($, e, next) => {
    const m = asMessage(e.data)
    const current = await read($, review)
    if (!m || current?.opened !== m.review.opened) return next(e) // a stale reviewer's word
    if (m.type === 'finish') await finish($, m.outcome, m.review)
    else if ((m.review.rev ?? 0) >= (current.rev ?? 0)) {
      // A post older than our own change is dropped.
      await update($, review, () => m.review)
      await follow($, current, m.review)
    }

    return next(e)
  })

  // The wheel over the reviewer moves its cursor; the pane itself has nothing to scroll.
  on('ui.scroll', { requestId: PANE }, async ($, e, next) => {
    const r = await read($, review)
    if (!r) return next(e)
    // Rendered, a tick or a scroll key walks a block, a page five.
    const moved = r.preview ? walkBlocks(r, e.by, e.contentRows) : scrollBy(r, e.by)
    if (moved !== r) await update($, review, () => bump(moved, {}))

    return {}
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    if (e.surface !== 'terminal' && e.surface !== 'desktop') {
      const { Text } = $.ui.resolve(e)
      return <Text dimColor>Ревью /fb работает в терминале и desktop.</Text>
    }
    const { Box, Client, Input, Text } = $.ui.resolve(e)
    if (e.viewport) screen = { columns: Math.max(screen.columns, e.viewport.columns), rows: e.viewport.rows }
    const r = await read($, review)
    if (!r) return <Text dimColor>Нет открытого ревью: /fb</Text>
    drawnGen = genOf(await read($, mark))

    // Typing a comment goes through the same field: each character lands in the box under its
    // line or block, so nothing is typed into a second field above it.
    const field = (
      <Input
        key="keys"
        autoFocus
        label={r.draft ? `${r.draft.id === undefined ? 'комментарий' : `правка #${r.draft.id}`} к ${lineRef(r.draft)} →` : 'клавиши'}
        submitLabel={r.draft ? 'сохранить' : 'комментарий'}
        value={markOf(drawnGen)}
        onInput={async (value: string) => {
          const got = fieldKeys(typing, drawnGen, value)
          typing = got.field
          if (got.keys !== '') await typeKeys($, got.keys)
        }}
        onSubmit={() => typeKeys($, '\r')}
      />
    )

    // The region is the body less the field: a height-only resize catches up on
    // the next keypress, which re-renders this pane with the new bodyRows.
    return (
      <Box flexDirection="column">
        {field}
        <Client
          key="review"
          module="./reviewer.tsx"
          props={{ review: r, background: BACKGROUND, focused: e.props.isFocused }}
          width="100%"
          height={Math.max(8, e.props.scroll.bodyRows - 1)}
        />
      </Box>
    )
  })
}
