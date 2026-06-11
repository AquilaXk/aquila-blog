type NodeViewCommitFlusher = () => void

const pendingNodeViewCommitFlushers = new Set<NodeViewCommitFlusher>()

export const registerPendingNodeViewCommitFlusher = (flush: NodeViewCommitFlusher) => {
  pendingNodeViewCommitFlushers.add(flush)
  return () => {
    pendingNodeViewCommitFlushers.delete(flush)
  }
}

export const flushPendingNodeViewAttributeCommits = () => {
  for (const flush of Array.from(pendingNodeViewCommitFlushers)) {
    flush()
  }
}
