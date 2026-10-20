# Changelog

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
