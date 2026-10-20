# inline-notes — `/fb` for Claude Code

Line-by-line review of a Claude reply, like comments on a pull request. `/fb` opens the last reply in a pane; you walk its lines, attach comments to a line or a range, and press `s`: every comment, with the lines it quotes, lands in the prompt as one message for Claude to work through.

A port of the `/fb` reviewer from the pi coding agent. The interface is in Russian; keys work on both the Latin and the Russian (ЙЦУКЕН) layout.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install inline-notes --marketplace DaniilMats/inline-notes
```

Answer `y` to add the marketplace, then pick a scope (Enter takes the user scope: every session). The mod is active right away.

From a shell:

```
claude plugin install inline-notes --marketplace DaniilMats/inline-notes
```

In the desktop app, where `/plugin` does not run: click **+** next to the prompt box, then **Plugins** → **Add marketplace** with `DaniilMats/inline-notes`, then **Add plugin**.

## Use

| Command | What it does |
| --- | --- |
| `/fb` | review the last reply (or reopen the review in progress) |
| `/fb N` | review reply number N — each reply is followed by a dim `↳ /fb N` line |
| `/fb --send` | `s` sends the comments at once instead of filling the prompt |

Keys go to the field above the text right after `/fb`; no mouse needed.

| Key | Action |
| --- | --- |
| `j` / `k`, `↓` / `↑` | next / previous line (a block in rendered mode) |
| `g` / `G` | top / bottom |
| `v` | start or clear a range selection |
| `c`, `Enter` | comment on the line or range |
| `e` / `d` | edit / delete the comment on the line |
| `n` / `N` | next / previous comment |
| `m` | toggle rendered Markdown (tables, code blocks) |
| `f` | full-screen pane and back |
| `s` | put the comments in the prompt |
| `q` | close the review (twice when there are comments) |
| `?` | all keys |

Screenshots can't go into the pane: after `s` the prompt is the normal input box, paste them there before Enter.

## Notes

- The pane background is fixed to `#292c33` (`BACKGROUND` in `hooks/register.tsx`); change it if your terminal theme differs.
- Works on the terminal and desktop surfaces.

## License

MIT
