import { apiFetch } from "src/apis/backend/client"
import { FormEvent, useCallback, useEffect, useState } from "react"
import {
  buildCommentContentSnippet,
  resolveCommentActionFailure,
  type CommentActionKind,
} from "./commentActionFailureModel"
import { TPostComment } from "src/types"

type RsData<T> = {
  resultCode: string
  msg: string
  data: T
}

export type CommentInlineError =
  | { placement: "composer"; message: string }
  | { placement: "comment"; commentId: number; message: string }

type CommentInlineErrorTarget =
  | { placement: "composer" }
  | { placement: "comment"; commentId: number }

export type DeleteConfirmState = {
  commentId: number
  snippet: string
}

type UseCommentBoxActionsArgs = {
  postId: number
  me: { id: number } | null
  authUnavailable: boolean
  loadComments: () => Promise<void>
  openAuthPrompt: (description?: string) => void
}

export const useCommentBoxActions = ({
  postId,
  me,
  authUnavailable,
  loadComments,
  openAuthPrompt,
}: UseCommentBoxActionsArgs) => {
  const [commentInput, setCommentInput] = useState("")
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null)
  const [editingCommentInput, setEditingCommentInput] = useState("")
  const [replyingToCommentId, setReplyingToCommentId] = useState<number | null>(null)
  const [replyInput, setReplyInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [inlineError, setInlineError] = useState<CommentInlineError | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState | null>(null)

  const clearInlineError = useCallback(() => {
    setInlineError(null)
  }, [])

  useEffect(() => {
    setDeleteConfirm(null)
    setInlineError(null)
  }, [postId])

  const applyActionFailure = useCallback(
    (error: unknown, action: CommentActionKind, target: CommentInlineErrorTarget) => {
      const failure = resolveCommentActionFailure(error, action)
      if (failure.kind === "unauthorized") {
        openAuthPrompt("세션이 만료되었습니다. 다시 로그인해 주세요.")
        return
      }

      setInlineError({ ...target, message: failure.message })
    },
    [openAuthPrompt]
  )

  const submitComment = async (content: string, parentCommentId?: number | null) => {
    const trimmed = content.trim()
    const action: CommentActionKind = parentCommentId ? "reply" : "create"
    const errorTarget: CommentInlineErrorTarget =
      parentCommentId != null
        ? { placement: "comment", commentId: parentCommentId }
        : { placement: "composer" }

    if (authUnavailable && !me) {
      setInlineError({
        ...errorTarget,
        message: "인증 상태를 확인할 수 없습니다. 잠시 후 다시 시도해주세요.",
      })
      return false
    }

    if (!me) {
      openAuthPrompt()
      return false
    }

    if (!trimmed) {
      setInlineError({
        ...errorTarget,
        message: parentCommentId ? "답글 내용을 입력해주세요." : "댓글 내용을 입력해주세요.",
      })
      return false
    }

    setIsLoading(true)
    clearInlineError()

    try {
      await apiFetch<RsData<TPostComment>>(`/post/api/v1/posts/${postId}/comments`, {
        method: "POST",
        body: JSON.stringify({
          content: trimmed,
          ...(parentCommentId ? { parentCommentId } : {}),
        }),
      })
      await loadComments()
      return true
    } catch (error) {
      applyActionFailure(error, action, errorTarget)
      return false
    } finally {
      setIsLoading(false)
    }
  }

  const handleWriteComment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const ok = await submitComment(commentInput)
    if (ok) setCommentInput("")
  }

  const handleReplySubmit = async (event: FormEvent<HTMLFormElement>, parentCommentId: number) => {
    event.preventDefault()
    const ok = await submitComment(replyInput, parentCommentId)
    if (!ok) return
    setReplyInput("")
    setReplyingToCommentId(null)
  }

  const openDeleteConfirm = (comment: TPostComment) => {
    if (isLoading) return
    clearInlineError()
    setDeleteConfirm({
      commentId: comment.id,
      snippet: buildCommentContentSnippet(comment.content),
    })
  }

  const closeDeleteConfirm = useCallback(() => {
    if (isLoading) return
    setDeleteConfirm(null)
  }, [isLoading])

  const confirmDeleteComment = async () => {
    if (!deleteConfirm || isLoading) return

    const commentId = deleteConfirm.commentId
    setIsLoading(true)
    clearInlineError()

    try {
      await apiFetch<RsData<unknown>>(`/post/api/v1/posts/${postId}/comments/${commentId}`, {
        method: "DELETE",
      })
      if (editingCommentId === commentId) {
        setEditingCommentId(null)
        setEditingCommentInput("")
      }
      if (replyingToCommentId === commentId) {
        setReplyingToCommentId(null)
        setReplyInput("")
      }
      setDeleteConfirm(null)
      await loadComments()
    } catch (error) {
      setDeleteConfirm(null)
      applyActionFailure(error, "delete", { placement: "comment", commentId })
    } finally {
      setIsLoading(false)
    }
  }

  const startEdit = (comment: TPostComment) => {
    setEditingCommentId(comment.id)
    setEditingCommentInput(comment.content)
    setReplyingToCommentId(null)
    setReplyInput("")
    clearInlineError()
  }

  const cancelEdit = () => {
    setEditingCommentId(null)
    setEditingCommentInput("")
  }

  const startReply = (commentId: number, displayName: string, authorId: number) => {
    if (authUnavailable && !me) {
      setInlineError({
        placement: "comment",
        commentId,
        message: "인증 상태를 확인할 수 없습니다. 잠시 후 다시 시도해주세요.",
      })
      return
    }

    if (!me) {
      openAuthPrompt()
      return
    }

    setReplyingToCommentId(commentId)
    setReplyInput(me.id === authorId ? "" : `@${displayName} `)
    setEditingCommentId(null)
    setEditingCommentInput("")
    clearInlineError()
  }

  const cancelReply = () => {
    setReplyingToCommentId(null)
    setReplyInput("")
  }

  const handleModifyComment = async (commentId: number) => {
    if (!editingCommentInput.trim()) {
      setInlineError({
        placement: "comment",
        commentId,
        message: "댓글 내용을 입력해주세요.",
      })
      return
    }

    setIsLoading(true)
    clearInlineError()

    try {
      await apiFetch<RsData<unknown>>(`/post/api/v1/posts/${postId}/comments/${commentId}`, {
        method: "PUT",
        body: JSON.stringify({ content: editingCommentInput }),
      })
      setEditingCommentId(null)
      setEditingCommentInput("")
      await loadComments()
    } catch (error) {
      applyActionFailure(error, "edit", { placement: "comment", commentId })
    } finally {
      setIsLoading(false)
    }
  }

  return {
    cancelEdit,
    cancelReply,
    closeDeleteConfirm,
    commentInput,
    confirmDeleteComment,
    deleteConfirm,
    editingCommentId,
    editingCommentInput,
    handleModifyComment,
    handleReplySubmit,
    handleWriteComment,
    inlineError,
    isLoading,
    openDeleteConfirm,
    replyingToCommentId,
    replyInput,
    setCommentInput,
    setEditingCommentInput,
    setReplyInput,
    startEdit,
    startReply,
  }
}
