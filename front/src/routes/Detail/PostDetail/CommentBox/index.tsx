import { apiFetch } from "src/apis/backend/client"
import { TPost } from "src/types"
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react"
import styled from "@emotion/styled"

type Props = {
  data: TPost
}

type MemberMe = {
  id: number
  username: string
  nickname: string
  profileImageUrl: string
}

type PostComment = {
  id: number
  authorId: number
  authorName: string
  authorProfileImageUrl: string
  postId: number
  content: string
  actorCanModify: boolean
  actorCanDelete: boolean
}

type RsData<T> = {
  resultCode: string
  msg: string
  data: T
}

const CommentBox: React.FC<Props> = ({ data }) => {
  const postId = useMemo(() => Number(data.id), [data.id])

  const [me, setMe] = useState<MemberMe | null>(null)
  const [comments, setComments] = useState<PostComment[]>([])
  const [commentInput, setCommentInput] = useState("")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null)
  const [editingCommentInput, setEditingCommentInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")

  const loadMe = useCallback(async () => {
    try {
      const member = await apiFetch<MemberMe>("/member/api/v1/auth/me")
      setMe(member)
    } catch {
      setMe(null)
    }
  }, [])

  const loadComments = useCallback(async () => {
    if (!Number.isInteger(postId) || postId <= 0) {
      setComments([])
      return
    }

    try {
      const rows = await apiFetch<PostComment[]>(`/post/api/v1/posts/${postId}/comments`)
      setComments(rows)
    } catch {
      setComments([])
    }
  }, [postId])

  useEffect(() => {
    void loadMe()
    void loadComments()
  }, [loadMe, loadComments])

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!username.trim() || !password.trim()) {
      setError("아이디와 비밀번호를 입력해주세요.")
      return
    }

    setIsLoading(true)
    setError("")

    try {
      await apiFetch<RsData<unknown>>("/member/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      })
      setPassword("")
      await loadMe()
      await loadComments()
    } catch {
      setError("로그인에 실패했습니다. 계정을 확인해주세요.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleLogout = async () => {
    setIsLoading(true)
    setError("")

    try {
      await apiFetch<RsData<unknown>>("/member/api/v1/auth/logout", {
        method: "DELETE",
      })
      setMe(null)
      setPassword("")
      setEditingCommentId(null)
      setEditingCommentInput("")
    } catch {
      setError("로그아웃에 실패했습니다.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleWriteComment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!me) {
      setError("댓글 작성은 로그인 후 가능합니다.")
      return
    }

    if (!commentInput.trim()) {
      setError("댓글 내용을 입력해주세요.")
      return
    }

    setIsLoading(true)
    setError("")

    try {
      await apiFetch<RsData<PostComment>>(`/post/api/v1/posts/${postId}/comments`, {
        method: "POST",
        body: JSON.stringify({ content: commentInput }),
      })
      setCommentInput("")
      await loadComments()
    } catch {
      setError("댓글 작성에 실패했습니다.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeleteComment = async (commentId: number) => {
    setIsLoading(true)
    setError("")

    try {
      await apiFetch<RsData<unknown>>(
        `/post/api/v1/posts/${postId}/comments/${commentId}`,
        { method: "DELETE" }
      )
      if (editingCommentId === commentId) {
        setEditingCommentId(null)
        setEditingCommentInput("")
      }
      await loadComments()
    } catch {
      setError("댓글 삭제에 실패했습니다.")
    } finally {
      setIsLoading(false)
    }
  }

  const startEdit = (comment: PostComment) => {
    setEditingCommentId(comment.id)
    setEditingCommentInput(comment.content)
    setError("")
  }

  const cancelEdit = () => {
    setEditingCommentId(null)
    setEditingCommentInput("")
  }

  const handleModifyComment = async (commentId: number) => {
    if (!editingCommentInput.trim()) {
      setError("댓글 내용을 입력해주세요.")
      return
    }

    setIsLoading(true)
    setError("")

    try {
      await apiFetch<RsData<unknown>>(
        `/post/api/v1/posts/${postId}/comments/${commentId}`,
        {
          method: "PUT",
          body: JSON.stringify({ content: editingCommentInput }),
        }
      )
      setEditingCommentId(null)
      setEditingCommentInput("")
      await loadComments()
    } catch {
      setError("댓글 수정에 실패했습니다.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <StyledWrapper>
      <h3>Comments</h3>

      {!me && (
        <form onSubmit={handleLogin} className="loginForm">
          <div className="row">
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="아이디"
              autoComplete="username"
            />
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="비밀번호"
              autoComplete="current-password"
            />
            <button type="submit" disabled={isLoading}>
              로그인
            </button>
          </div>
          <p className="caption">댓글 작성은 로그인 후 가능합니다.</p>
        </form>
      )}

      {me && (
        <div className="accountRow">
          <span>{me.nickname}님으로 로그인됨</span>
          <button type="button" onClick={handleLogout} disabled={isLoading}>
            로그아웃
          </button>
        </div>
      )}

      <form onSubmit={handleWriteComment} className="writeForm">
        <textarea
          value={commentInput}
          onChange={(event) => setCommentInput(event.target.value)}
          placeholder={me ? "댓글을 입력하세요" : "로그인 후 댓글을 작성할 수 있습니다"}
          disabled={!me || isLoading}
        />
        <button type="submit" disabled={!me || isLoading}>
          댓글 작성
        </button>
      </form>

      {error && <p className="error">{error}</p>}

      <ul className="commentList">
        {comments.map((comment) => (
          <li key={comment.id}>
            <div className="head">
              <strong>{comment.authorName}</strong>
              <div className="actions">
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
                  <button
                    type="button"
                    onClick={() => handleModifyComment(comment.id)}
                    disabled={isLoading}
                  >
                    저장
                  </button>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    disabled={isLoading}
                    className="subtle"
                  >
                    취소
                  </button>
                </div>
              </div>
            ) : (
              <p>{comment.content}</p>
            )}
          </li>
        ))}
      </ul>
    </StyledWrapper>
  )
}

export default CommentBox

const StyledWrapper = styled.section`
  margin-top: 2.5rem;

  h3 {
    margin-bottom: 0.75rem;
    font-size: 1.125rem;
    font-weight: 700;
  }

  .loginForm,
  .writeForm {
    margin-bottom: 1rem;
  }

  .row {
    display: grid;
    grid-template-columns: 1fr 1fr auto;
    gap: 0.5rem;

    @media (max-width: 768px) {
      grid-template-columns: 1fr;
    }
  }

  .accountRow {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    font-size: 0.875rem;
    color: ${({ theme }) => theme.colors.gray11};
  }

  input,
  textarea {
    width: 100%;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    border-radius: 0.5rem;
    background-color: ${({ theme }) => theme.colors.gray3};
    color: ${({ theme }) => theme.colors.gray12};
    padding: 0.625rem 0.75rem;
  }

  textarea {
    min-height: 96px;
    resize: vertical;
  }

  button {
    border: none;
    border-radius: 0.5rem;
    background-color: ${({ theme }) => theme.colors.gray12};
    color: ${({ theme }) => theme.colors.gray1};
    padding: 0.625rem 0.9rem;
    cursor: pointer;

    :disabled {
      cursor: not-allowed;
      opacity: 0.6;
    }
  }

  button.subtle {
    background-color: ${({ theme }) => theme.colors.gray6};
    color: ${({ theme }) => theme.colors.gray12};
  }

  button.danger {
    background-color: #d14343;
    color: #fff;
  }

  .caption {
    margin-top: 0.5rem;
    font-size: 0.8125rem;
    color: ${({ theme }) => theme.colors.gray10};
  }

  .error {
    margin: 0.5rem 0 1rem;
    color: #d14343;
    font-size: 0.875rem;
  }

  .commentList {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;

    li {
      border: 1px solid ${({ theme }) => theme.colors.gray5};
      border-radius: 0.75rem;
      padding: 0.75rem;
      background-color: ${({ theme }) => theme.colors.gray3};
    }

    .head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.35rem;
    }

    .actions,
    .editActions {
      display: flex;
      align-items: center;
      gap: 0.4rem;

      button {
        padding: 0.35rem 0.55rem;
        font-size: 0.75rem;
      }
    }

    .editBox {
      display: flex;
      flex-direction: column;
      gap: 0.45rem;
    }

    p {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-word;
      color: ${({ theme }) => theme.colors.gray12};
      line-height: 1.55;
    }
  }
`
