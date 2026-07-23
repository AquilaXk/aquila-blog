import { useCallback } from "react"
import { apiFetch } from "src/apis/backend/client"

type JsonValue = Record<string, unknown> | unknown[] | string | number | boolean | null

type RunStudioCommand = (key: string, fn: () => Promise<JsonValue>) => Promise<void>

type UseEditorStudioUtilityCommandsParams = {
  postId: string
  commentId: string
  commentContent: string
  run: RunStudioCommand
}

export const useEditorStudioUtilityCommands = ({
  commentContent,
  commentId,
  postId,
  run,
}: UseEditorStudioUtilityCommandsParams) => {
  const handleListComments = useCallback(() => {
    void run("commentList", () => apiFetch(`/post/api/v1/posts/${postId}/comments`))
  }, [postId, run])

  const handleReadComment = useCallback(() => {
    void run("commentOne", () => apiFetch(`/post/api/v1/posts/${postId}/comments/${commentId}`))
  }, [commentId, postId, run])

  const handleWriteComment = useCallback(() => {
    void run("commentWrite", () =>
      apiFetch(`/post/api/v1/posts/${postId}/comments`, {
        method: "POST",
        body: JSON.stringify({ content: commentContent }),
      })
    )
  }, [commentContent, postId, run])

  const handleModifyComment = useCallback(() => {
    void run("commentModify", () =>
      apiFetch(`/post/api/v1/posts/${postId}/comments/${commentId}`, {
        method: "PUT",
        body: JSON.stringify({ content: commentContent }),
      })
    )
  }, [commentContent, commentId, postId, run])

  const handleDeleteComment = useCallback(() => {
    void run("commentDelete", () =>
      apiFetch(`/post/api/v1/posts/${postId}/comments/${commentId}`, {
        method: "DELETE",
      })
    )
  }, [commentId, postId, run])

  const handleReadPostCount = useCallback(() => {
    void run("admPostCount", () => apiFetch("/post/api/v1/adm/posts/count"))
  }, [run])

  const handleReadSystemHealth = useCallback(() => {
    void run("systemHealth", () => apiFetch("/system/api/v1/adm/health"))
  }, [run])

  const handleHitPost = useCallback(() => {
    void run("hitPost", () => apiFetch(`/post/api/v1/posts/${postId}/hit`, { method: "POST" }))
  }, [postId, run])

  const handleLikePost = useCallback(() => {
    void run("likePost", () => apiFetch(`/post/api/v1/posts/${postId}/like`, { method: "PUT" }))
  }, [postId, run])

  return {
    handleDeleteComment,
    handleHitPost,
    handleLikePost,
    handleListComments,
    handleModifyComment,
    handleReadComment,
    handleReadPostCount,
    handleReadSystemHealth,
    handleWriteComment,
  }
}
