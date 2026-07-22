import type { BlockSnippetSpec } from "./markdownEditorBlockSnippets"
import type { planFormatShortcutMutation } from "./markdownEditorKeyboardModel"
import type { MarkdownEditorMode } from "./markdownEditorModeTabs"

export type PendingToolbarInsert =
  | { kind: "block"; spec: BlockSnippetSpec }
  | { kind: "wrap"; before: string; after: string; toggle?: boolean }
  | { kind: "format"; shortcut: Parameters<typeof planFormatShortcutMutation>[3] }

export type PendingToolbarInsertQueue = {
  pending: PendingToolbarInsert | null
  transitionInFlight: boolean
}

export type PendingToolbarInsertFlushSkipReason = "disabled" | "preview" | "missing-textarea"

export const emptyPendingToolbarInsertQueue = (): PendingToolbarInsertQueue => ({
  pending: null,
  transitionInFlight: false,
})

export const queuePendingToolbarInsert = (insert: PendingToolbarInsert): PendingToolbarInsertQueue => ({
  pending: insert,
  transitionInFlight: true,
})

export const resolvePendingToolbarInsertAfterFlushSkip = (
  queue: PendingToolbarInsertQueue,
  reason: PendingToolbarInsertFlushSkipReason
): PendingToolbarInsertQueue => {
  if (reason === "disabled" || reason === "preview") {
    return emptyPendingToolbarInsertQueue()
  }

  if (reason === "missing-textarea" && !queue.transitionInFlight) {
    return emptyPendingToolbarInsertQueue()
  }

  return queue
}

export const resolvePendingToolbarInsertWhenModeChanges = (
  queue: PendingToolbarInsertQueue,
  nextMode: MarkdownEditorMode
): PendingToolbarInsertQueue => {
  if (nextMode === "preview" && queue.pending !== null) {
    return emptyPendingToolbarInsertQueue()
  }

  return queue
}

export const shouldSchedulePendingToolbarInsertFlush = (queue: PendingToolbarInsertQueue): boolean =>
  queue.pending !== null && queue.transitionInFlight
