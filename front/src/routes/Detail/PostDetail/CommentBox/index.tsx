import { apiFetch } from "src/apis/backend/client"
import { useRouter } from "next/router"
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react"
import styled from "@emotion/styled"
import { CONFIG } from "site.config"
import useAuthSession from "src/hooks/useAuthSession"
import { formatShortDateTime } from "src/libs/utils"
import ProfileImage from "src/components/ProfileImage"
import { TPost, TPostComment } from "src/types"

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

  const { me, authStatus, authUnavailable } = useAuthSession()
  const [comments, setComments] = useState<TPostComment[]>(initialComments ?? [])
  const [commentInput, setCommentInput] = useState("")
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null)
  const [editingCommentInput, setEditingCommentInput] = useState("")
  const [replyingToCommentId, setReplyingToCommentId] = useState<number | null>(null)
  const [replyInput, setReplyInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const loginHref = useMemo(() => {
    const next = router.asPath || `/${data.slug}`
    return `/login?next=${encodeURIComponent(next)}`
  }, [data.slug, router.asPath])

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
      setError("댓글 작성은 로그인 후 가능합니다.")
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

  const startReply = (commentId: number) => {
    setReplyingToCommentId(commentId)
    setReplyInput("")
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
    size: number
  ) => {
    const imageSrc = profileImageDirectUrl || profileImageUrl || CONFIG.profile.image
    return (
      <Avatar size={size}>
        <ProfileImage
          src={imageSrc}
          alt={`${name} avatar`}
          priority={size >= 44}
          fillContainer
          width={size}
          height={size}
        />
      </Avatar>
    )
  }

  const renderComment = (comment: CommentNode, depth = 0) => {
    const displayName = comment.authorUsername || comment.authorName
    const createdLabel = formatShortDateTime(comment.createdAt, CONFIG.lang)
    const edited = comment.modifiedAt !== comment.createdAt

    return (
      <li key={comment.id}>
        <CommentItem data-depth={depth}>
          {renderAvatar(
            comment.authorProfileImageDirectUrl,
            comment.authorProfileImageUrl,
            displayName,
            depth > 0 ? 38 : 44
          )}
          <div className="commentBody">
            <div className="head">
              <div className="meta">
                <strong>{displayName}</strong>
                <span>
                  {createdLabel}
                  {edited ? " · 수정됨" : ""}
                </span>
              </div>
              <div className="actions">
                {me && (
                  <button
                    type="button"
                    onClick={() => startReply(comment.id)}
                    disabled={isLoading}
                    className="subtle"
                  >
                    답글
                  </button>
                )}
                {comment.actorCanModify && (
                  <button
                    type="button"
                    onClick={() => startEdit(comment)}
                    disabled={isLoading}
                    className="subtle"
                  >
                    수정
                  </button>
                )}
                {comment.actorCanDelete && (
                  <button
                    type="button"
                    onClick={() => handleDeleteComment(comment.id)}
                    disabled={isLoading}
                    className="danger"
                  >
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

            {comment.replies.length > 0 && (
              <ul className="replyList">
                {comment.replies.map((reply) => renderComment(reply, depth + 1))}
              </ul>
            )}
          </div>
        </CommentItem>
      </li>
    )
  }

  return (
    <StyledWrapper>
      <SectionHeader>
        <div>
          <span className="eyebrow">Community</span>
          <h3>댓글</h3>
          <p>읽은 뒤 느낀 점이나 질문을 남겨보세요. 답글로 대화를 이어갈 수 있습니다.</p>
        </div>
        <div className="countBadge">{comments.length} comments</div>
      </SectionHeader>

      <AccountCard>
        {me ? (
          <>
            {renderAvatar(me.profileImageDirectUrl, me.profileImageUrl, me.username, 44)}
            <div>
              <strong>{me.nickname || me.username}</strong>
              <span>로그인된 계정으로 바로 댓글과 답글을 작성할 수 있습니다.</span>
            </div>
          </>
        ) : authStatus === "unavailable" ? (
          <div className="loginBox">
            <div>
              <strong>인증 상태를 확인할 수 없습니다</strong>
              <span>네트워크가 안정되면 댓글 작성 영역이 다시 활성화됩니다.</span>
            </div>
          </div>
        ) : (
          <div className="loginBox">
            <div>
              <strong>로그인이 필요합니다</strong>
              <span>댓글과 답글 작성은 로그인 후 가능합니다.</span>
            </div>
            <a href={loginHref}>로그인</a>
          </div>
        )}
      </AccountCard>

      <form onSubmit={handleWriteComment} className="writeForm">
        <div className="composerAvatar">
          {renderAvatar(me?.profileImageDirectUrl, me?.profileImageUrl, me?.username || "guest", 44)}
        </div>
        <div className="composerBody">
          <textarea
            value={commentInput}
            onChange={(event) => setCommentInput(event.target.value)}
            placeholder={
              me
                ? "의견이나 질문을 남겨주세요."
                : authStatus === "unavailable"
                  ? "인증 상태를 확인할 수 없습니다. 잠시 후 다시 시도해주세요."
                  : "로그인 후 댓글을 작성할 수 있습니다."
            }
            disabled={!me || isLoading || authUnavailable}
          />
          <div className="composerFooter">
            <span>대댓글은 각 댓글의 `답글` 버튼으로 이어서 작성할 수 있습니다.</span>
            <button type="submit" disabled={!me || isLoading || authUnavailable}>
              댓글 작성
            </button>
          </div>
        </div>
      </form>

      {error && <p className="error">{error}</p>}

      {commentTree.length > 0 ? (
        <ul className="commentList">{commentTree.map((comment) => renderComment(comment))}</ul>
      ) : (
        <EmptyState>
          <strong>첫 댓글을 남겨보세요.</strong>
          <span>아직 등록된 댓글이 없습니다.</span>
        </EmptyState>
      )}
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

  button.danger {
    color: ${({ theme }) => theme.colors.red11};
    border-color: ${({ theme }) => theme.colors.red7};
    background: ${({ theme }) => theme.colors.red3};
  }

  .writeForm {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 0.85rem;
    margin-bottom: 1rem;

    @media (max-width: 640px) {
      grid-template-columns: 1fr;
    }
  }

  .composerAvatar {
    display: flex;
    justify-content: center;
  }

  .composerBody {
    display: grid;
    gap: 0.6rem;
  }

  .composerFooter {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    align-items: center;
    flex-wrap: wrap;

    span {
      color: ${({ theme }) => theme.colors.gray11};
      font-size: 0.78rem;
      line-height: 1.5;
    }
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

  .commentList,
  .replyList {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .commentList {
    display: grid;
    gap: 0.8rem;
  }

  .replyList {
    display: grid;
    gap: 0.7rem;
    margin-top: 0.85rem;
  }
`

const SectionHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.9rem;
  flex-wrap: wrap;
  margin-bottom: 1rem;

  .eyebrow {
    display: inline-flex;
    margin-bottom: 0.45rem;
    border-radius: 999px;
    padding: 0.32rem 0.62rem;
    border: 1px solid ${({ theme }) => theme.colors.green7};
    background: ${({ theme }) => theme.colors.green3};
    color: ${({ theme }) => theme.colors.green11};
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  h3 {
    margin: 0;
    font-size: 1.35rem;
    color: ${({ theme }) => theme.colors.gray12};
  }

  p {
    margin: 0.45rem 0 0;
    color: ${({ theme }) => theme.colors.gray11};
    line-height: 1.65;
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

const AccountCard = styled.div`
  display: flex;
  align-items: center;
  gap: 0.85rem;
  margin-bottom: 1rem;
  padding: 0.85rem 0.95rem;
  border-radius: 20px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};

  strong {
    display: block;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.92rem;
  }

  span {
    display: block;
    margin-top: 0.18rem;
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.82rem;
    line-height: 1.5;
  }

  .loginBox {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    flex-wrap: wrap;
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
  padding: 0.95rem;
  border-radius: 22px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};

  &[data-depth="1"] {
    margin-left: 1.1rem;
  }

  &[data-depth="2"] {
    margin-left: 2.2rem;
  }

  &[data-depth="3"] {
    margin-left: 3.3rem;
  }

  @media (max-width: 640px) {
    &[data-depth="1"],
    &[data-depth="2"],
    &[data-depth="3"] {
      margin-left: 0.55rem;
    }
  }

  .commentBody {
    min-width: 0;
  }

  .head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.7rem;
    flex-wrap: wrap;
    margin-bottom: 0.45rem;
  }

  .meta {
    display: grid;
    gap: 0.14rem;

    strong {
      color: ${({ theme }) => theme.colors.gray12};
      font-size: 0.92rem;
    }

    span {
      color: ${({ theme }) => theme.colors.gray11};
      font-size: 0.78rem;
    }
  }

  .actions,
  .editActions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }

  .content {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray12};
    line-height: 1.7;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .editBox,
  .replyForm {
    display: grid;
    gap: 0.55rem;
    margin-top: 0.7rem;
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
