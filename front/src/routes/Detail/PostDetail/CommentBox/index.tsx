import { apiFetch } from "src/apis/backend/client"
import { useRouter } from "next/router"
import { FormEvent, Fragment, useCallback, useEffect, useMemo, useState } from "react"
import styled from "@emotion/styled"
import dynamic from "next/dynamic"
import { CONFIG } from "site.config"
import useAuthSession from "src/hooks/useAuthSession"
import { formatShortDateTime } from "src/libs/utils"
import { normalizeNextPath } from "src/libs/router"
import { toCanonicalPostPath } from "src/libs/utils/postPath"
import AppIcon from "src/components/icons/AppIcon"
import ProfileImage from "src/components/ProfileImage"
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

type MemberMe = {
  id: number
  username: string
  nickname: string
  profileImageUrl?: string
  profileImageDirectUrl?: string
}

type CommentNode = TPostComment & {
  replies: CommentNode[]
}

type RsData<T> = {
  resultCode: string
  msg: string
  data: T
}

const CommentBox: React.FC<Props> = ({ data, initialComments = null }) => {
  const router = useRouter()
  const postId = useMemo(() => Number(data.id), [data.id])
  const hasInitialComments = initialComments !== null
  const nextPath = useMemo(() => {
    return normalizeNextPath(router.asPath, toCanonicalPostPath(data.id))
  }, [data.id, router.asPath])

  const { me, authStatus, authUnavailable } = useAuthSession()
  const [comments, setComments] = useState<TPostComment[]>(initialComments ?? [])
  const [commentInput, setCommentInput] = useState("")
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null)
  const [editingCommentInput, setEditingCommentInput] = useState("")
  const [replyingToCommentId, setReplyingToCommentId] = useState<number | null>(null)
  const [replyInput, setReplyInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [authPromptOpen, setAuthPromptOpen] = useState(false)

  const openAuthPrompt = useCallback(() => {
    if (authStatus === "unavailable") {
      setError("인증 상태를 확인할 수 없습니다. 잠시 후 다시 시도해주세요.")
      return
    }

    setAuthPromptOpen(true)
  }, [authStatus])

  const closeAuthPrompt = useCallback(() => {
    setAuthPromptOpen(false)
  }, [])

  const loadComments = useCallback(async () => {
    if (!Number.isInteger(postId) || postId <= 0) {
      setComments([])
      return
    }

    try {
      const rows = await apiFetch<TPostComment[]>(`/post/api/v1/posts/${postId}/comments`)
      setComments(rows)
    } catch {
      setComments([])
    }
  }, [postId])

  useEffect(() => {
    if (!initialComments) return
    setComments(initialComments)
  }, [initialComments])

  useEffect(() => {
    if (hasInitialComments) return
    void loadComments()
  }, [hasInitialComments, loadComments])

  useEffect(() => {
    if (!me) return
    setAuthPromptOpen(false)
  }, [me])

  const commentTree = useMemo(() => {
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
  }, [comments])

  const submitComment = async (content: string, parentCommentId?: number | null) => {
    const trimmed = content.trim()

    if (authUnavailable && !me) {
      setError("인증 상태를 확인할 수 없습니다. 잠시 후 다시 시도해주세요.")
      return false
    }

    if (!me) {
      openAuthPrompt()
      return false
    }

    if (!trimmed) {
      setError(parentCommentId ? "답글 내용을 입력해주세요." : "댓글 내용을 입력해주세요.")
      return false
    }

    setIsLoading(true)
    setError("")

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
    } catch {
      setError(parentCommentId ? "답글 작성에 실패했습니다." : "댓글 작성에 실패했습니다.")
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

  const handleDeleteComment = async (commentId: number) => {
    setIsLoading(true)
    setError("")

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
      await loadComments()
    } catch {
      setError("댓글 삭제에 실패했습니다.")
    } finally {
      setIsLoading(false)
    }
  }

  const startEdit = (comment: TPostComment) => {
    setEditingCommentId(comment.id)
    setEditingCommentInput(comment.content)
    setReplyingToCommentId(null)
    setReplyInput("")
    setError("")
  }

  const cancelEdit = () => {
    setEditingCommentId(null)
    setEditingCommentInput("")
  }

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

  const startReply = (commentId: number, displayName: string, authorId: number) => {
    if (!me) {
      openAuthPrompt()
      return
    }

    setReplyingToCommentId(commentId)
    setReplyInput(me.id === authorId ? "" : `@${displayName} `)
    setEditingCommentId(null)
    setEditingCommentInput("")
    setError("")
  }

  const cancelReply = () => {
    setReplyingToCommentId(null)
    setReplyInput("")
  }

  const handleModifyComment = async (commentId: number) => {
    if (!editingCommentInput.trim()) {
      setError("댓글 내용을 입력해주세요.")
      return
    }

    setIsLoading(true)
    setError("")

    try {
      await apiFetch<RsData<unknown>>(`/post/api/v1/posts/${postId}/comments/${commentId}`, {
        method: "PUT",
        body: JSON.stringify({ content: editingCommentInput }),
      })
      setEditingCommentId(null)
      setEditingCommentInput("")
      await loadComments()
    } catch {
      setError("댓글 수정에 실패했습니다.")
    } finally {
      setIsLoading(false)
    }
  }

  const renderAvatar = (
    profileImageDirectUrl: string | undefined,
    profileImageUrl: string | undefined,
    name: string,
    size: number,
    priority = false
  ) => {
    const imageSrc = profileImageDirectUrl || profileImageUrl || CONFIG.profile.image
    return (
      <Avatar size={size}>
        <ProfileImage
          src={imageSrc}
          alt={`${name} avatar`}
          priority={priority}
          fillContainer
          width={size}
          height={size}
        />
      </Avatar>
    )
  }

  const renderComment = (comment: CommentNode, isReply = false) => {
    const displayName = comment.authorName || comment.authorUsername || "익명"
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
                    onClick={() => handleDeleteComment(comment.id)}
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

            {hasReplies && (
              <ReplyGroup>
                <ReplyList>
                  {comment.replies.map((reply) => (
                    <li key={reply.id}>{renderComment(reply, true)}</li>
                  ))}
                </ReplyList>
              </ReplyGroup>
            )}
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
          {renderAvatar(me?.profileImageDirectUrl, me?.profileImageUrl, me?.username || "guest", 44, true)}
        </div>
        <div className="composerBody">
          <textarea
            value={commentInput}
            onChange={(event) => setCommentInput(event.target.value)}
            onFocus={() => {
              preloadAuthEntryModal()
              if (!me && !authUnavailable) openAuthPrompt()
            }}
            onClick={() => {
              preloadAuthEntryModal()
              if (!me && !authUnavailable) openAuthPrompt()
            }}
            placeholder={
              authUnavailable ? "인증 상태를 확인할 수 없습니다. 잠시 후 다시 시도해주세요." : "의견이나 질문을 남겨주세요."
            }
            readOnly={!me}
            disabled={isLoading || authUnavailable}
          />
          <div className="composerFooter">
            <button type="submit" disabled={isLoading || authUnavailable}>
              댓글 작성
            </button>
          </div>
        </div>
      </form>

      {error && <p className="error">{error}</p>}

      {commentTree.length > 0 ? (
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
      <AuthEntryModal
        open={authPromptOpen}
        onClose={closeAuthPrompt}
        nextPath={nextPath}
        title="로그인"
        description="댓글을 작성하려면 계정 로그인이 필요합니다."
        visualTitle="환영합니다!"
        visualDescription="로그인하면 지금 보고 있는 글로 바로 돌아와 댓글과 답글을 자연스럽게 이어서 작성할 수 있습니다."
      />
    </StyledWrapper>
  )
}

export default CommentBox

const StyledWrapper = styled.section`
  margin-top: 1.5rem;
  padding: 1.15rem 1.2rem;
  border-radius: 28px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background:
    radial-gradient(circle at top left, rgba(16, 185, 129, 0.08), transparent 36%),
    linear-gradient(180deg, ${({ theme }) => theme.colors.gray1}, ${({ theme }) => theme.colors.gray2});

  textarea {
    width: 100%;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    border-radius: 16px;
    background-color: ${({ theme }) => theme.colors.gray1};
    color: ${({ theme }) => theme.colors.gray12};
    padding: 0.8rem 0.95rem;
    min-height: 104px;
    resize: vertical;
    line-height: 1.7;
  }

  button,
  a {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    min-height: 38px;
    padding: 0 0.82rem;
    border-radius: 999px;
    border: 1px solid ${({ theme }) => theme.colors.gray7};
    background-color: ${({ theme }) => theme.colors.gray1};
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.8rem;
    font-weight: 700;
    cursor: pointer;

    :disabled {
      cursor: not-allowed;
      opacity: 0.6;
    }
  }

  button.subtle {
    color: ${({ theme }) => theme.colors.gray11};
  }

  button.replyTrigger {
    justify-content: flex-start;
    padding: 0;
    min-height: auto;
    border: 0;
    background: transparent;
    color: ${({ theme }) => theme.colors.green11};
    font-size: 0.84rem;
    font-weight: 700;
  }

  button.danger {
    color: ${({ theme }) => theme.colors.red11};
    border-color: ${({ theme }) => theme.colors.red7};
    background: ${({ theme }) => theme.colors.red3};
  }

  .writeForm {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
    gap: 0.85rem;
    margin-bottom: 1rem;

    @media (max-width: 640px) {
      grid-template-columns: 1fr;
    }
  }

  .composerAvatar {
    display: flex;
    justify-content: flex-start;
    align-items: flex-start;
  }

  .composerBody {
    display: grid;
    gap: 0.6rem;
  }

  .composerFooter {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    align-items: center;
    flex-wrap: wrap;
  }

  .error {
    margin: 0 0 0.9rem;
    padding: 0.72rem 0.82rem;
    border-radius: 14px;
    border: 1px solid ${({ theme }) => theme.colors.red7};
    background: ${({ theme }) => theme.colors.red3};
    color: ${({ theme }) => theme.colors.red11};
    font-size: 0.875rem;
  }

  .commentList {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0;
  }

  .commentList > li {
    min-width: 0;
  }

  .commentList > li + li {
    border-top: 1px solid ${({ theme }) => theme.colors.gray6};
  }

  .commentBody[id] {
    scroll-margin-top: 7rem;
  }
`

const SectionHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.9rem;
  flex-wrap: wrap;
  margin-bottom: 1rem;

  h3 {
    margin: 0;
    font-size: 1.35rem;
    color: ${({ theme }) => theme.colors.gray12};
  }

  .countBadge {
    display: inline-flex;
    align-items: center;
    min-height: 38px;
    padding: 0 0.85rem;
    border-radius: 999px;
    border: 1px solid ${({ theme }) => theme.colors.gray7};
    background: ${({ theme }) => theme.colors.gray1};
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.82rem;
    font-weight: 700;
  }
`

const Avatar = styled.div<{ size: number }>`
  position: relative;
  width: ${({ size }) => `${size}px`};
  height: ${({ size }) => `${size}px`};
  flex-shrink: 0;
  overflow: hidden;
  border-radius: 50%;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};

  img {
    object-fit: cover;
    object-position: center 38%;
  }
`

const CommentItem = styled.div`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.85rem;
  padding: 1.05rem 0;

  &[data-reply="true"] {
    position: relative;
    margin-left: 1.15rem;
    padding: 0.95rem 1rem;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    border-radius: 22px;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.02), rgba(255, 255, 255, 0.01)),
      ${({ theme }) => theme.colors.gray2};
  }

  &[data-reply="true"]::before {
    content: "";
    position: absolute;
    left: -0.95rem;
    top: 1.05rem;
    bottom: 1.05rem;
    width: 2px;
    border-radius: 999px;
    background: linear-gradient(180deg, ${({ theme }) => theme.colors.green8}, transparent);
  }

  &[data-reply="true"]::after {
    content: "";
    position: absolute;
    left: -0.95rem;
    top: 1.05rem;
    width: 0.95rem;
    height: 1px;
    background: ${({ theme }) => theme.colors.green8};
  }

  @media (max-width: 640px) {
    &[data-reply="true"] {
      margin-left: 0.7rem;
      padding: 0.85rem 0.85rem 0.9rem;
    }

    &[data-reply="true"]::before {
      left: -0.65rem;
    }

    &[data-reply="true"]::after {
      left: -0.65rem;
      width: 0.65rem;
    }
  }

  .commentBody {
    min-width: 0;
  }

  .head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.85rem;
    flex-wrap: wrap;
    margin-bottom: 0.65rem;
  }

  .meta {
    display: grid;
    gap: 0.14rem;
  }

  .metaPrimary {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.38rem 0.52rem;

    strong {
      color: ${({ theme }) => theme.colors.gray12};
      font-size: 0.92rem;
    }

    span {
      color: ${({ theme }) => theme.colors.gray11};
      font-size: 0.78rem;
    }
  }

  .replyContext {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.2rem;
    height: 1.2rem;
    border-radius: 999px;
    color: ${({ theme }) => theme.colors.green11};
    background: ${({ theme }) => theme.colors.green3};
    flex-shrink: 0;
  }

  .actions,
  .editActions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }

  .topActions {
    margin-left: auto;
  }

  .content {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray12};
    line-height: 1.7;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .foot {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    margin-top: 0.95rem;
  }

  .editBox,
  .replyForm {
    display: grid;
    gap: 0.55rem;
    margin-top: 0.7rem;
  }

  @media (max-width: 640px) {
    grid-template-columns: auto minmax(0, 1fr);
    gap: 0.75rem;
    padding: 0.95rem 0;

    .topActions {
      width: 100%;
      margin-left: 0;
      justify-content: flex-start;
    }

    .metaPrimary {
      gap: 0.22rem 0.45rem;
    }

    .content {
      font-size: 0.96rem;
      line-height: 1.65;
    }

    .foot {
      margin-top: 0.72rem;
    }
  }
`

const ReplyGroup = styled.div`
  margin-top: 1rem;
  padding-left: 1.25rem;
  border-left: 2px solid ${({ theme }) => theme.colors.gray6};

  @media (max-width: 640px) {
    margin-top: 0.85rem;
    padding-left: 0.8rem;
  }
`

const ReplyList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.75rem;

  > li {
    min-width: 0;
  }

  @media (max-width: 640px) {
    gap: 0.65rem;
  }
`

const EmptyState = styled.div`
  display: grid;
  gap: 0.18rem;
  padding: 1rem 1.05rem;
  border-radius: 18px;
  border: 1px dashed ${({ theme }) => theme.colors.gray7};
  background: ${({ theme }) => theme.colors.gray1};

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.92rem;
  }

  span {
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.82rem;
  }
`
