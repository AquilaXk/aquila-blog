import dynamic from "next/dynamic"
import styled from "@emotion/styled"
import { useEffect, useRef, useState } from "react"
import { TPost, TPostComment } from "src/types"

type Props = {
  data: TPost
  initialComments?: TPostComment[] | null
}

const CommentBox = dynamic(() => import("./CommentBox"), {
  ssr: false,
  loading: () => null,
})

const DeferredCommentBox: React.FC<Props> = ({ data, initialComments = null }) => {
  const [shouldLoad, setShouldLoad] = useState(false)
  const anchorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (shouldLoad) return

    const anchor = anchorRef.current
    if (!anchor) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        setShouldLoad(true)
        observer.disconnect()
      },
      { rootMargin: "320px 0px" }
    )

    observer.observe(anchor)
    return () => observer.disconnect()
  }, [shouldLoad])

  return (
    <div ref={anchorRef}>
      {shouldLoad ? (
        <CommentBox data={data} initialComments={initialComments} />
      ) : (
        <PlaceholderCard>
          <div className="titleRow">
            <h3>댓글</h3>
            <span className="countBadge">댓글 {data.commentsCount ?? 0}</span>
          </div>
          <p>스크롤하면 댓글 인터랙션을 불러옵니다.</p>
        </PlaceholderCard>
      )}
    </div>
  )
}

export default DeferredCommentBox

const PlaceholderCard = styled.section`
  margin-top: 1.5rem;
  padding: 1.1rem 1.2rem;
  border-radius: 28px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background:
    radial-gradient(circle at top left, rgba(16, 185, 129, 0.06), transparent 36%),
    linear-gradient(180deg, ${({ theme }) => theme.colors.gray1}, ${({ theme }) => theme.colors.gray2});

  .titleRow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
  }

  h3 {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 1.3rem;
    letter-spacing: -0.02em;
  }

  .countBadge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 34px;
    padding: 0 0.85rem;
    border-radius: 999px;
    border: 1px solid ${({ theme }) => theme.colors.gray7};
    background: ${({ theme }) => theme.colors.gray1};
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.8rem;
    font-weight: 700;
  }

  p {
    margin: 0.85rem 0 0;
    color: ${({ theme }) => theme.colors.gray11};
    line-height: 1.7;
    font-size: 0.92rem;
  }
`
