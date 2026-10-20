// Line numbers are 0-based and inclusive, as in the pi /fb reviewer.
export type FbComment = { id: number; start: number; end: number; body: string }
export type FbDraft = { id?: number; start: number; end: number }

export type FbReview = {
  /** When /fb opened it: tells the reviewer a new review from a redraw of the same one. */
  opened: number
  /** 1-based number of the reviewed reply among the session's text replies. */
  index: number
  text: string
  cursor: number
  anchor: number | null
  comments: FbComment[]
  nextId: number
  draft: FbDraft | null
  draftText: string
  /** Caret in draftText, in code points. */
  draftCaret: number
  /** The reply drawn rendered, a block per paragraph, list item, table or fence: the cursor walks blocks. */
  preview: boolean
  /** The pane asks for the whole screen (f). */
  wide?: boolean
  /** --send: s sends at once instead of filling the prompt. */
  send: boolean
  /** A first s or q only arms; the second one acts. */
  armed: 'submit' | 'cancel' | null
  status: string
  /** Revision: the reviewer bumps it on its own changes, the hooks on theirs (a wheel scroll); the higher one wins. */
  rev?: number
  /** The key table is shown instead of the reply. */
  help?: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'inline-notes': { review: FbReview | null; mark: number }
  }
}
