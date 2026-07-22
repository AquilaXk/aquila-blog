import { expect, test } from "@playwright/test"
import {
  buildCommentTree,
  flattenReplies,
} from "../../src/routes/Detail/PostDetail/CommentBox/commentTreeModel"
import type { TPostComment } from "../../src/types"

const baseComment = (overrides: Partial<TPostComment> & Pick<TPostComment, "id">): TPostComment => ({
  createdAt: "2026-07-22T01:00:00Z",
  modifiedAt: "2026-07-22T01:00:00Z",
  authorId: 1,
  authorName: "aquila",
  authorUsername: "aquila",
  authorProfileImageUrl: "/avatar.png",
  authorProfileImageDirectUrl: "/avatar.png",
  postId: 1254,
  parentCommentId: null,
  content: `comment-${overrides.id}`,
  actorCanModify: true,
  actorCanDelete: true,
  ...overrides,
})

test("buildCommentTree nests replies under the root comment", () => {
  const tree = buildCommentTree([
    baseComment({ id: 1, content: "루트 댓글" }),
    baseComment({ id: 2, parentCommentId: 1, content: "1차 답글" }),
    baseComment({ id: 3, parentCommentId: 2, content: "2차 답글" }),
  ])

  expect(tree).toHaveLength(1)
  expect(tree[0]?.content).toBe("루트 댓글")
  expect(tree[0]?.replies).toHaveLength(1)
  expect(tree[0]?.replies[0]?.content).toBe("1차 답글")
  expect(tree[0]?.replies[0]?.replies[0]?.content).toBe("2차 답글")
})

test("flattenReplies returns nested replies in depth-first order", () => {
  const tree = buildCommentTree([
    baseComment({ id: 1, content: "루트 댓글" }),
    baseComment({ id: 2, parentCommentId: 1, content: "1차 답글" }),
    baseComment({ id: 3, parentCommentId: 2, content: "2차 답글" }),
  ])

  expect(flattenReplies(tree[0]?.replies ?? []).map((reply) => reply.content)).toEqual([
    "1차 답글",
    "2차 답글",
  ])
})
