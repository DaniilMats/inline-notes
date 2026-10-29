// The pane, the page and the prompt speak Russian, the text written in the code, or English:
// the `language` option. Every Russian message goes through tr, which swaps in its English
// twin from EN; inline-notes-tui carries the same English for the same Russian.

/** The `language` option. */
export type Language = 'ru' | 'en'

const EN = {
  // review.ts: statuses
  'Выделение с L%d: двигайте курсор, затем c/Enter. v снимает.': 'Selecting from L%d: move the cursor, then c/Enter. v clears it.',
  'Выделение снято.': 'Selection cleared.',
  '%s — пустая строка: в промпт она уйдёт как «∅».': '%s is a blank line: the prompt will quote it as “∅”.',
  'На этой строке нет комментария.': 'No comment on this line.',
  'Пустой комментарий отброшен.': 'Empty comment dropped.',
  '#%d изменён.': '#%d updated.',
  '#%d добавлен на %s.': '#%d added on %s.',
  '#%d удалён.': '#%d deleted.',
  'Комментариев пока нет.': 'No comments yet.',
  'Нечего отправлять: комментариев нет.': 'Nothing to send: no comments.',
  'Нажмите s ещё раз, чтобы отправить сразу (--send).': 'Press s again to send at once (--send).',
  'Нажмите q ещё раз, чтобы выбросить %s.': 'Press q again to discard %s.',
  'Панель шире, насколько даёт Claude Code. Мало места — w откроет ревью в браузере.':
    'The pane is as wide as Claude Code allows. Short of room? w opens the review in the browser.',

  // review.ts: the prompt
  'У меня есть inline-комментарии к твоему ответу #%d.\n\nПожалуйста, обработай их одним ответом: пройди по каждому пункту, объясни что меняешь/уточняешь, и если уместно — дай обновлённую версию ответа. Не игнорируй ни один комментарий.':
    'I have inline comments on your reply #%d.\n\nPlease address them in one reply: go through each point, explain what you change or clarify, and where it helps, give an updated version of the reply. Do not skip any comment.',
  'Комментарий:': 'Comment:',
  '… ещё %d строк(и)': '… %d more line(s)',

  // layout.ts
  'блок %d/%d (%s)': 'block %d/%d (%s)',
  'строка %d/%d': 'line %d/%d',
  'выделение %s': 'selection %s',
  'комментариев: %d': 'comments: %d',
  'feedback · ответ #%d «%s»': 'feedback · reply #%d “%s”',
  сохранить: 'save',

  // reviewer.tsx
  'feedback · клавиши': 'feedback · keys',
  ' (в скобках — русская раскладка; любая клавиша закрывает)': ' (any key closes; the keys work on the Russian layout too)',

  // register.tsx
  'Ревью открыто в браузере: там «Скопировать промпт», затем вставьте сюда.': 'The review is open in the browser: press “Copy prompt” there, then paste it here.',
  'Браузер не открылся: откройте %s': 'The browser did not open: open %s',
  'Не удалось открыть в браузере: %s': 'Could not open in the browser: %s',
  'Ревью отменено.': 'Review cancelled.',
  'не удалось отправить': 'could not send',
  'поле ввода недоступно (открыт диалог?)': 'the prompt box is unavailable (is a dialog open?)',
  'Не отправлено: %s. Комментарии на месте.': 'Not sent: %s. The comments are kept.',
  'Отправлено комментариев: %d.': 'Comments sent: %d.',
  '%s в поле ввода: проверьте, при желании вставьте скриншот, и Enter.': '%s in the prompt box: check it, paste a screenshot if you like, and press Enter.',
  '%s в поле ввода после вашего текста: проверьте, при желании вставьте скриншот, и Enter.':
    '%s in the prompt box after your text: check it, paste a screenshot if you like, and press Enter.',
  'Ревью ответа #%d открыто: %s, Enter — комментарий, s — в промпт, ? — все клавиши.': 'Review of reply #%d is open: %s, Enter comments, s to prompt, ? all keys.',
  'Ревью ответа #%d снова открыто: %s, Enter — комментарий, s — в промпт, ? — все клавиши.': 'Review of reply #%d is open again: %s, Enter comments, s to prompt, ? all keys.',
  'j/k — блоки, m — исходник': 'j/k blocks, m source',
  'j/k — строки, m — рендер': 'j/k lines, m render',
  'Построчные комментарии к ответу Claude: /fb — последний ответ, /fb N — ответ N; --send отправляет сразу':
    'Line comments on a Claude reply: /fb the last reply, /fb N reply N; --send sends at once',
  'Ревью ответа #%d открыто, в нём %s: сначала s (в промпт) или q (закрыть); /fb без аргументов возвращает к нему.':
    'The review of reply #%d is open with %s: press s (to prompt) or q (close) first; /fb without arguments returns to it.',
  'В сессии ещё нет ответов с текстом.': 'The session has no replies with text yet.',
  'Нет ответа #%s: номера от 1 до %d (их показывает строка ↳ /fb N после ответа).': 'No reply #%s: numbers run from 1 to %d (the ↳ /fb N line after each reply shows them).',
  'Ревью /fb работает в терминале и desktop.': 'The /fb review works in the terminal and the desktop app.',
  'Нет открытого ревью: /fb': 'No review open: /fb',
  'Новый комментарий к %s': 'New comment on %s',
  'Правка #%d к %s': 'Editing #%d on %s',
} as const

/** A message the interface or the prompt says: the Russian, which EN has the English for. */
export type Phrase = keyof typeof EN

/** `text` in `lang` (Russian when unset), each `%d` or `%s` filled from `args` in order. */
export function tr(lang: Language | undefined, text: Phrase, ...args: (string | number)[]): string {
  let i = 0
  return (lang === 'en' ? EN[text] : text).replace(/%[ds]/g, () => String(args[i++]))
}

/** `1 комментарий`, `3 комментария`, `5 комментариев`; `1 comment`, `5 comments`. */
export function commentCount(n: number, lang?: Language): string {
  if (lang === 'en') return n === 1 ? '1 comment' : `${n} comments`
  const tens = n % 100
  const ones = n % 10
  const form = tens >= 11 && tens <= 14 ? 'комментариев' : ones === 1 ? 'комментарий' : ones >= 2 && ones <= 4 ? 'комментария' : 'комментариев'

  return `${n} ${form}`
}

/** EN as the tests check it: every value English, its arguments as the Russian's. */
export const ENGLISH: Readonly<Record<string, string>> = EN
