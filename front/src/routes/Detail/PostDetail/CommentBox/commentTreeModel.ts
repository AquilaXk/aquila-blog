import { TPostComment } from "src/types"

export type CommentNode = TPostComment & {
  replies: CommentNode[]
}

export const flattenReplies = (nodes: CommentNode[]): CommentNode[] => {
  const flattened: CommentNode[] = []

  const walk = (items: CommentNode[]) => {
    items.forEach((item) => {
      flattened.push(item)
      if (item.replies.length > 0) {
        walk(item.replies)
      }
    })
  }

  walk(nodes)
  return flattened
}

export const buildCommentTree = (comments: TPostComment[]): CommentNode[] => {
  const map = new Map<number, CommentNode>()
  const roots: CommentNode[] = []

  comments.forEach((comment) => {
    map.set(comment.id, { ...comment, replies: [] })
  })

  comments.forEach((comment) => {
    const node = map.get(comment.id)
    if (!node) return

    if (comment.parentCommentId && map.has(comment.parentCommentId)) {
      map.get(comment.parentCommentId)?.replies.push(node)
    } else {
      roots.push(node)
    }
  })

  return roots
}
