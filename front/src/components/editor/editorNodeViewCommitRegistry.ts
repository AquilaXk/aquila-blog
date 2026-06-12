export type NodeViewCommitFlusher = () => void

const pendingNodeViewCommitFlushers = new Set<NodeViewCommitFlusher>()
const scopedPendingNodeViewCommitFlushers = new WeakMap<object, Set<NodeViewCommitFlusher>>()

export const registerPendingNodeViewCommitFlusher = (
  flush: NodeViewCommitFlusher,
  scope?: object | null
) => {
  if (scope) {
    const flushers = scopedPendingNodeViewCommitFlushers.get(scope) ?? new Set<NodeViewCommitFlusher>()
    flushers.add(flush)
    scopedPendingNodeViewCommitFlushers.set(scope, flushers)
    return () => {
      flushers.delete(flush)
    }
  }

  pendingNodeViewCommitFlushers.add(flush)
  return () => {
    pendingNodeViewCommitFlushers.delete(flush)
  }
}

const flushNodeViewCommitSet = (flushers: Iterable<NodeViewCommitFlusher>) => {
  for (const flush of Array.from(flushers)) {
    flush()
  }
}

export const flushPendingNodeViewAttributeCommits = (scope?: object | null) => {
  if (scope) {
    const scopedFlushers = scopedPendingNodeViewCommitFlushers.get(scope)
    if (scopedFlushers) {
      flushNodeViewCommitSet(scopedFlushers)
    }
  }

  flushNodeViewCommitSet(pendingNodeViewCommitFlushers)
}
