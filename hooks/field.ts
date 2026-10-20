// The key field above the reviewer, read back as keys. The field holds an invisible mark and
// nothing else; a handled change swaps the mark, and a field drawn with another value drops
// what was typed into it. The mark a change carries tells a field the swap has reached (its
// text is all new) from one it has not yet (its text goes on from the change before), so a
// key typed while the swap is on its way is read too, wherever the caret put it.

// Four invisible characters, one per generation: word joiner, zero-width space, invisible separator,
// invisible plus. Each is a grapheme of its own (a joiner would cling to its neighbour and go with it
// under one Backspace), and a mark is one of them four times over, so whatever backspaces leave of
// it still names its generation.
const ZERO = ['\u2060', '\u200b', '\u2063', '\u2064'] as const
const WIDTH = 4

/** How many marks there are before they repeat. */
export const GENERATIONS = ZERO.length

/** The mark of generation `g`. */
export const markOf = (g: number) => ZERO[g % GENERATIONS]!.repeat(WIDTH)

const isMark = (c: string) => (ZERO as readonly string[]).includes(c)
const marksOf = (v: string) => [...v].filter(isMark).join('')
const textOf = (v: string) => [...v].filter(c => !isMark(c))

/** The generation a mark, or what is left of one, is from. */
const genOf = (left: string) => (ZERO as readonly string[]).indexOf(left[0] ?? '')

/** The field's text as last read, and the generation its mark came from. */
export type Field = { seen: string; seenGen: number }

export const fieldStart = (gen: number): Field => ({ seen: markOf(gen), seenGen: gen })

/**
 * The keys behind a change of the field, given the mark drawn last: what was typed since
 * the change before, `\b` for each character erased, and the state to read the next change with.
 */
export function fieldKeys(f: Field, drawnGen: number, value: string): { keys: string; field: Field } {
  const left = marksOf(value) // the mark, or what backspaces left of it
  const fits = (g: number) => genOf(left) === g % GENERATIONS
  // Still the last change's mark: its text goes on. The drawn one: the swap reached the
  // field and this was typed into it afresh. Neither: a field lost track of, read as fresh.
  const [ref, gen] =
    left === '' || fits(f.seenGen) ? [f.seen, f.seenGen] : fits(drawnGen) ? [markOf(drawnGen), drawnGen] : [left, genOf(left)]
  const typed = textOf(value)
  const was = textOf(ref)
  let same = 0
  while (same < typed.length && same < was.length && typed[same] === was[same]) same++
  // Backspace over the bare mark eats it: the person meant the character before the caret.
  const back = Math.max(was.length - same, marksOf(ref).length - left.length)

  return { keys: '\b'.repeat(back) + typed.slice(same).join(''), field: { seen: value, seenGen: gen } }
}
