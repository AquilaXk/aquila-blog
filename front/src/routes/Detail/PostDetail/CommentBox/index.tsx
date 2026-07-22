import { apiFetch } from "src/apis/backend/client"
import { useRouter } from "next/router"
import { Fragment, useCallback, useEffect, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { CONFIG } from "site.config"
import useAuthSession from "src/hooks/useAuthSession"
import { formatShortDateTime } from "src/libs/utils"
import { normalizeNextPath } from "src/libs/router"
import { toCanonicalPostPath } from "src/libs/utils/postPath"
import AppIcon from "src/components/icons/AppIcon"
import ProfileImage from "src/components/ProfileImage"
import { ConfirmDialog } from "src/design-system/ConfirmDialog"
import { Avatar, CommentItem, CommentListSkeleton, ComposerPromptCard, EmptyState, ReplyGroup, ReplyList, SectionHeader, StyledWrapper } from "./CommentBox.styles"
import {
  COMMENT_DELETE_CONFIRM_IRREVERSIBLE_GUIDANCE,
  COMMENT_DELETE_CONFIRM_TITLE,
} from "./commentActionFailureModel"
import { buildCommentTree, flattenReplies, type CommentNode } from "./commentTreeModel"
import { useCommentBoxActions } from "./useCommentBoxActions"
import { TPost, TPostComment } from "src/types"

const AuthEntryModal = dynamic(() => import("src/components/auth/AuthEntryModal"), {
  ssr: false,
  loading: () => null,
})

const preloadAuthEntryModal = () => {
  void import("src/components/auth/AuthEntryModal").then((module) => {
    module.preloadAuthEntryPanels?.("login")
  })
}

type Props = {
  data: TPost
  initialComments?: TPostComment[] | null
}

const CommentBox: React.FC<Props> = ({ data, initialComments = null }) => {
  const router = useRouter()
  const postId = useMemo(() => Number(data.id), [data.id])
  const normalizedInitialComments = useMemo(
    () => (Array.isArray(initialComments) ? initialComments : initialComments === null ? null : []),
    [initialComments]
  )
  const hasInitialComments = normalizedInitialComments !== null
  const nextPath = useMemo(() => {
    return normalizeNextPath(router.asPath, toCanonicalPostPath(data.id))
  }, [data.id, router.asPath])

  const { me, authStatus, authUnavailable } = useAuthSession()
  const [comments, setComments] = useState<TPostComment[]>(normalizedInitialComments ?? [])
  const [commentsLoading, setCommentsLoading] = useState(normalizedInitialComments === null)
  const [authPromptOpen, setAuthPromptOpen] = useState(false)
  const [authPromptDescription, setAuthPromptDescription] = useState(
    "댓글을 작성하려면 계정 로그인이 필요합니다."
  )

  const openAuthPrompt = useCallback((description?: string) => {
    if (authStatus === "unavailable") return

    preloadAuthEntryModal()
    setAuthPromptDescription(
      description || "댓글을 작성하려면 계정 로그인이 필요합니다."
    )
    setAuthPromptOpen(true)
  }, [authStatus])

  const closeAuthPrompt = useCallback(() => {
    setAuthPromptOpen(false)
  }, [])

  const loadComments = useCallback(async () => {
    if (!Number.isInteger(postId) || postId <= 0) {
      setComments([])
      setCommentsLoading(false)
      return
    }

    try {
      setCommentsLoading(true)
      const rows = await apiFetch<TPostComment[]>(`/post/api/v1/posts/${postId}/comments`)
      setComments(Array.isArray(rows) ? rows : [])
    } catch {
      setComments([])
    } finally {
      setCommentsLoading(false)
    }
  }, [postId])

  useEffect(() => {
    if (!normalizedInitialComments) return
    setComments(normalizedInitialComments)
    setCommentsLoading(false)
  }, [normalizedInitialComments])

  useEffect(() => {
    if (hasInitialComments) return
    void loadComments()
  }, [hasInitialComments, loadComments])

  useEffect(() => {
    if (!me) return
    setAuthPromptOpen(false)
  }, [me])

  const {
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
  } = useCommentBoxActions({
    postId,
    me,
    authUnavailable,
    loadComments,
    openAuthPrompt,
  })

  const commentTree = useMemo(() => buildCommentTree(comments), [comments])

  const handleComposerIntent = useCallback(() => {
    preloadAuthEntryModal()
    if (!me && !authUnavailable) openAuthPrompt()
  }, [authUnavailable, me, openAuthPrompt])

  useEffect(() => {
    const hashIndex = router.asPath.indexOf("#")
    if (hashIndex < 0) return

    const targetId = decodeURIComponent(router.asPath.slice(hashIndex + 1))
    if (!targetId) return

    const target = document.getElementById(targetId)
    if (!target) return

    const raf = window.requestAnimationFrame(() => {
      target.scrollIntoView({ block: "start", behavior: "smooth" })
    })

    return () => window.cancelAnimationFrame(raf)
  }, [comments.length, router.asPath])

  const renderAvatar = (
    profileImageDirectUrl: string | undefined,
    profileImageUrl: string | undefined,
    name: string,
    size: number,
    priority = false
  ) => {
    const imageSrc = profileImageDirectUrl || profileImageUrl
    return (
      <Avatar size={size}>
        {imageSrc ? (
          <ProfileImage
            src={imageSrc}
            alt={`${name} avatar`}
            priority={priority}
            fillContainer
            width={size}
            height={size}
          />
        ) : (
          <span className="avatarFallback" aria-hidden="true" />
        )}
      </Avatar>
    )
  }

  const renderCommentInlineError = (commentId: number) => {
    if (inlineError?.placement !== "comment" || inlineError.commentId !== commentId) {
      return null
    }

    return (
      <p className="error" role="alert">
        {inlineError.message}
      </p>
    )
  }

  const renderComment = (comment: CommentNode, isReply = false) => {
    const displayName = comment.authorName || "익명"
    const createdLabel = formatShortDateTime(comment.createdAt, CONFIG.lang)
    const edited = comment.modifiedAt !== comment.createdAt
    const isOwner = me?.id === comment.authorId
    const canModify = comment.actorCanModify || isOwner
    const canDelete = comment.actorCanDelete || isOwner
    const hasReplies = comment.replies.length > 0

    return (
      <Fragment key={comment.id}>
        <CommentItem data-reply={isReply} data-has-replies={hasReplies}>
          {renderAvatar(
            comment.authorProfileImageDirectUrl,
            comment.authorProfileImageUrl,
            displayName,
            isReply ? 38 : 44,
            !isReply
          )}
          <div className="commentBody" id={`comment-${comment.id}`}>
            <div className="head">
              <div className="meta">
                <div className="metaPrimary">
                  {isReply && (
                    <span className="replyContext" aria-hidden="true">
                      <AppIcon name="reply" aria-hidden="true" />
                    </span>
                  )}
                  <strong>{displayName}</strong>
                  <span>
                    {createdLabel}
                    {edited ? " · 수정됨" : ""}
                  </span>
                </div>
              </div>
              <div className="actions topActions">
                {canModify && (
                  <button
                    type="button"
                    onClick={() => startEdit(comment)}
                    disabled={isLoading}
                    className="subtle"
                  >
                    <AppIcon name="edit" aria-hidden="true" />
                    수정
                  </button>
                )}
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => openDeleteConfirm(comment)}
                    disabled={isLoading}
                    className="danger"
                  >
                    <AppIcon name="trash" aria-hidden="true" />
                    삭제
                  </button>
                )}
              </div>
            </div>

            {editingCommentId === comment.id ? (
              <div className="editBox">
                <textarea
                  value={editingCommentInput}
                  onChange={(event) => setEditingCommentInput(event.target.value)}
                  disabled={isLoading}
                />
                <div className="editActions">
                  <button type="button" onClick={() => handleModifyComment(comment.id)} disabled={isLoading}>
                    저장
                  </button>
                  <button type="button" onClick={cancelEdit} disabled={isLoading} className="subtle">
                    취소
                  </button>
                </div>
              </div>
            ) : (
              <p className="content">{comment.content}</p>
            )}

            <div className="foot">
              {!authUnavailable && (
                <button
                  type="button"
                  onClick={() => startReply(comment.id, displayName, comment.authorId)}
                  disabled={isLoading}
                  className="replyTrigger"
                >
                  <AppIcon name="reply" aria-hidden="true" />
                  답글 달기
                </button>
              )}
            </div>

            {replyingToCommentId === comment.id && (
              <form className="replyForm" onSubmit={(event) => handleReplySubmit(event, comment.id)}>
                <textarea
                  value={replyInput}
                  onChange={(event) => setReplyInput(event.target.value)}
                  placeholder={`${displayName}님에게 답글 작성`}
                  disabled={isLoading}
                />
                <div className="editActions">
                  <button type="submit" disabled={isLoading}>
                    답글 등록
                  </button>
                  <button type="button" onClick={cancelReply} disabled={isLoading} className="subtle">
                    취소
                  </button>
                </div>
              </form>
            )}

            {renderCommentInlineError(comment.id)}
          </div>
        </CommentItem>
      </Fragment>
    )
  }

  return (
    <StyledWrapper>
      <SectionHeader>
        <h3>댓글</h3>
        <div className="countBadge">댓글 {comments.length}</div>
      </SectionHeader>

      <form onSubmit={handleWriteComment} className="writeForm">
        <div className="composerAvatar">
          {renderAvatar(
            me?.profileImageDirectUrl,
            me?.profileImageUrl,
            me?.nickname || me?.username || "guest",
            44,
            true
          )}
        </div>
        <div className="composerBody">
          {me ? (
            <>
              <textarea
                value={commentInput}
                onChange={(event) => setCommentInput(event.target.value)}
                placeholder="질문이나 의견을 남겨주세요."
                disabled={isLoading}
              />
              <div className="composerFooter">
                <button type="submit" disabled={isLoading}>
                  댓글 작성
                </button>
              </div>
            </>
          ) : authUnavailable ? (
            <ComposerPromptCard data-tone="error">
              <strong>인증 상태를 확인할 수 없습니다.</strong>
              <p>잠시 후 다시 시도해주세요. 문제가 계속되면 새로고침 후 다시 시도하는 편이 안전합니다.</p>
            </ComposerPromptCard>
          ) : (
            <ComposerPromptCard data-tone="neutral">
              <strong>로그인 후 댓글을 작성할 수 있습니다.</strong>
              <p>질문이나 의견을 남기려면 먼저 로그인해 주세요.</p>
              <button type="button" onClick={handleComposerIntent}>
                로그인하고 댓글 작성
              </button>
            </ComposerPromptCard>
          )}
          {inlineError?.placement === "composer" && (
            <p className="error" role="alert">
              {inlineError.message}
            </p>
          )}
        </div>
      </form>

      {commentsLoading ? (
        <CommentListSkeleton aria-hidden="true">
          <li>
            <span className="avatar" />
            <div className="body">
              <span className="title" />
              <span className="line wide" />
              <span className="line medium" />
            </div>
          </li>
          <li>
            <span className="avatar" />
            <div className="body">
              <span className="title" />
              <span className="line wide" />
              <span className="line narrow" />
            </div>
          </li>
        </CommentListSkeleton>
      ) : commentTree.length > 0 ? (
        <ul className="commentList">
          {commentTree.map((comment) => (
            <li key={comment.id}>{renderComment(comment)}</li>
          ))}
        </ul>
      ) : (
        <EmptyState>
          <strong>첫 댓글을 남겨보세요.</strong>
          <span>아직 등록된 댓글이 없습니다.</span>
        </EmptyState>
      )}
      <ConfirmDialog
        open={deleteConfirm != null}
        titleId="comment-delete-title"
        descriptionId="comment-delete-description"
        title={COMMENT_DELETE_CONFIRM_TITLE}
        description={
          <>
            <span>{COMMENT_DELETE_CONFIRM_IRREVERSIBLE_GUIDANCE}</span>
            <span className="rowTitle">{deleteConfirm?.snippet ?? ""}</span>
          </>
        }
        confirmLabel={isLoading ? "삭제 중..." : "삭제 확정"}
        cancelLabel="취소"
        confirmTone="danger"
        onConfirm={() => {
          void confirmDeleteComment()
        }}
        onCancel={closeDeleteConfirm}
      />
      <AuthEntryModal
        open={authPromptOpen}
        onClose={closeAuthPrompt}
        nextPath={nextPath}
        title="로그인"
        description={authPromptDescription}
      />
    </StyledWrapper>
  )
}

export default CommentBox
