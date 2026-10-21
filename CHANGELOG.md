# Changelog

## 0.8.0 — 2026-10-21

- A comment is typed in a real field, under its line across the pane: the arrows, `Home`/`End`, `⇧Enter` for a new line, a paste and dictation work as in Claude Code's prompt box. A paste no longer lands in the prompt box when the comment was opened with a click.
- A click in the pane hands the keyboard back to the field: the terminal's caret stays on the cursor's marker instead of jumping to the prompt.
- A key that reaches the reviewer while a comment is typed hands the keyboard back to the field instead of being typed past it.
- `f` widens the pane only as far as Claude Code allows, and says so: since Claude Code 2.1.306 a docked pane stays under half the terminal, whatever a plugin asks for. The status points to `w`, which opens the review in the browser.

## 0.7.0 — 2026-10-21

- The mouse works in the rendered view (`m`) as in the source view: a click picks a block, a second click on it opens a comment, a click on a comment edits it. Blocks are found by their estimated heights.
- A click on a comment edits that comment, not the first one on its line or block.
- A code block counts the rows the renderer draws, without its ``` lines: in the rendered view the caret and clicks no longer slip two rows further with each code block above them.

## 0.6.1 — 2026-10-21

- The README installs in two steps: add the marketplace, then install the plugin from it.
- The README describes the mouse in the pane: a click moves the cursor to a line, a second click on it opens a comment, and a click on a comment edits it.

## 0.6.0 — 2026-10-20

- `w` in the pane opens the review as a page in your browser: the reply at a comfortable reading width, set in Literata, with comments added by a click or a drag across the line numbers and the pane's own keys. **Скопировать промпт** puts the same prompt `s` builds on the clipboard; paste it into Claude Code.
- The page follows the Claude Code theme, keeps its comments across a reload, and shows raw HTML from a reply as text, never running it.

## 0.5.1 — 2026-10-20

- The terminal's caret no longer sits in the pane's corner and no longer jumps there while you type: it stands on the cursor's `▌` marker, and inside the comment box at the insertion point.

## 0.5.0 — 2026-10-20

- The pane fits Claude Code: the header sits on the pane's own frame color as a title bar, the body fills the rest, and the cursor's line is a highlighted band with an accent marker. Colors follow the Claude Code theme (dark or light).
- `/fb` opens with the cursor on the first line and no visible input field: keys go to the review at once.
- `↑` / `↓` move the cursor, as `j` / `k` do.
- Hints show `Enter` for a comment; the `ctrl+x Tab` hint is gone.
- Comment counts read in proper Russian plural forms.

## 0.4.0 — 2026-10-20

- First public release: `/fb`, `/fb N`, `/fb --send`; line and range comments; source and rendered views; full-screen pane; Russian keyboard layout.
