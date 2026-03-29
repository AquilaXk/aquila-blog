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
          <div className="composerSkeleton" aria-hidden="true">
            <span className="avatar" />
            <div className="body">
              <span className="line wide" />
              <span className="line medium" />
              <span className="button" />
            </div>
          </div>
          <div className="commentSkeleton" aria-hidden="true">
            <span className="line strong" />
            <span className="line medium" />
          </div>
        </PlaceholderCard>
      )}
    </div>
  )
}

export default DeferredCommentBox

const PlaceholderCard = styled.section`
  margin-top: 1.5rem;
  padding: 1rem 0;
  border-top: 1px solid ${({ theme }) => theme.colors.gray6};
  border-bottom: 1px solid ${({ theme }) => theme.colors.gray6};
  background: transparent;

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
    border-radius: 8px;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: transparent;
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.8rem;
    font-weight: 700;
  }

  .composerSkeleton,
  .commentSkeleton {
    display: grid;
    gap: 0.72rem;
    margin-top: 0.9rem;
  }

  .composerSkeleton {
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
  }

  .avatar,
  .line,
  .button {
    border-radius: 999px;
    background: ${({ theme }) => theme.colors.gray3};
    animation: comment-placeholder-pulse 1.16s ease-in-out infinite;
  }

  .avatar {
    width: 2.75rem;
    height: 2.75rem;
  }

  .body {
    display: grid;
    gap: 0.56rem;
  }

  .line {
    height: 0.92rem;
  }

  .line.wide {
    width: min(84%, 38rem);
  }

  .line.medium {
    width: min(62%, 24rem);
  }

  .line.strong {
    width: min(38%, 16rem);
  }

  .button {
    width: 6.25rem;
    height: 2rem;
  }
  @keyframes comment-placeholder-pulse {
    0% {
      opacity: 0.72;
    }
    50% {
      opacity: 1;
    }
    100% {
      opacity: 0.72;
    }
  }
`
