import Link from "next/link"
import { CONFIG } from "site.config"
import { formatDate } from "src/libs/utils"
import { TPost } from "../../../types"
import styled from "@emotion/styled"
import { uiTokens } from "@shared/ui-tokens"
import { toCanonicalPostPath } from "src/libs/utils/postPath"
import AppIcon from "src/components/icons/AppIcon"
import { memo, useCallback, useEffect, useMemo, useRef } from "react"
import Router from "next/router"
import ProfileImage from "src/components/ProfileImage"
import {
  parseThumbnailFocusXFromUrl,
  parseThumbnailFocusYFromUrl,
  parseThumbnailZoomFromUrl,
  stripThumbnailFocusFromUrl,
} from "src/libs/thumbnailFocus"
import { normalizeCardSummary } from "src/libs/postSummary"

type Props = {
  data: TPost
  layout?: "regular" | "pinned"
}

const FEED_CARD_META_FONT_SIZE_REM = uiTokens.feed.card.metaFontSizeRem
const FEED_CARD_SUMMARY_LINES = uiTokens.feed.card.summaryLines
const FEED_CARD_SUMMARY_LINE_HEIGHT = uiTokens.feed.card.summaryLineHeight
const FEED_CARD_TITLE_LINE_HEIGHT = uiTokens.feed.card.titleLineHeight
const FEED_CARD_RADIUS_PX = 4
const FEED_CARD_SHADOW = "0 8px 20px rgba(2, 6, 23, 0.14)"
const FEED_CARD_SHADOW_HOVER = "0 18px 34px rgba(2, 6, 23, 0.2)"
const FEED_CARD_HOVER_TRANSLATE_PX = -8
const PREFETCH_DELAY_MS = 1200

type NavigatorConnectionLike = {
  saveData?: boolean
  effectiveType?: string
}

const prefetchedPostPaths = new Set<string>()
const inflightPrefetchPaths = new Set<string>()

const getNavigatorConnection = (): NavigatorConnectionLike | undefined => {
  if (typeof navigator === "undefined") return undefined
  return (navigator as Navigator & { connection?: NavigatorConnectionLike }).connection
}

const isNavigatorOnline = () => {
  if (typeof navigator === "undefined") return true
  return navigator.onLine !== false
}

const hasPrefetchedPostPath = (path: string) => prefetchedPostPaths.has(path)

const requestIntentPrefetch = async (path: string) => {
  if (prefetchedPostPaths.has(path) || inflightPrefetchPaths.has(path)) return

  inflightPrefetchPaths.add(path)
  try {
    await Router.prefetch(path)
    prefetchedPostPaths.add(path)
  } finally {
    inflightPrefetchPaths.delete(path)
  }
}

const PostCard: React.FC<Props> = ({ data, layout = "regular" }) => {
  const author = data.author?.[0]
  const postPath = toCanonicalPostPath(data.id)
  const prefetchTimeoutRef = useRef<number | null>(null)
  const hasPrefetchedRef = useRef(false)
  const createdAtText = formatDate(
    data?.date?.start_date || data.createdTime,
    CONFIG.lang
  )
  const summary = normalizeCardSummary(data.summary)
  const commentsCount = data.commentsCount ?? 0
  const likesCount = data.likesCount ?? 0
  const { thumbnailSrc, thumbnailFocusX, thumbnailFocusY, thumbnailZoom } = useMemo(() => {
    const rawThumbnail = data.thumbnail || ""
    return {
      thumbnailSrc: rawThumbnail ? stripThumbnailFocusFromUrl(rawThumbnail) : "",
      thumbnailFocusX: parseThumbnailFocusXFromUrl(rawThumbnail),
      thumbnailFocusY: parseThumbnailFocusYFromUrl(rawThumbnail),
      thumbnailZoom: parseThumbnailZoomFromUrl(rawThumbnail),
    }
  }, [data.thumbnail])

  const clearPrefetchTimer = useCallback(() => {
    if (!prefetchTimeoutRef.current) return
    window.clearTimeout(prefetchTimeoutRef.current)
    prefetchTimeoutRef.current = null
  }, [])

  const canPrefetchOnCurrentNetwork = useCallback(() => {
    if (!isNavigatorOnline()) return false
    if (typeof navigator === "undefined") return true
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return false
    const connection = getNavigatorConnection()
    if (!connection) return true
    if (connection.saveData) return false
    if (connection.effectiveType === "slow-2g" || connection.effectiveType === "2g") return false
    return true
  }, [])

  const prefetchPost = useCallback(() => {
    if (hasPrefetchedRef.current) return
    if (!canPrefetchOnCurrentNetwork()) return
    hasPrefetchedRef.current = true
    void requestIntentPrefetch(postPath).catch(() => {
      hasPrefetchedRef.current = false
    })
  }, [canPrefetchOnCurrentNetwork, postPath])

  const handleMouseEnter = useCallback(() => {
    if (hasPrefetchedRef.current) return
    if (hasPrefetchedPostPath(postPath)) {
      hasPrefetchedRef.current = true
      return
    }
    if (!canPrefetchOnCurrentNetwork()) return
    clearPrefetchTimer()
    prefetchTimeoutRef.current = window.setTimeout(prefetchPost, PREFETCH_DELAY_MS)
  }, [canPrefetchOnCurrentNetwork, clearPrefetchTimer, postPath, prefetchPost])

  const handleMouseLeave = useCallback(() => {
    clearPrefetchTimer()
  }, [clearPrefetchTimer])

  useEffect(() => {
    return () => clearPrefetchTimer()
  }, [clearPrefetchTimer])

  return (
    <StyledWrapper
      href={postPath}
      data-layout={layout}
      prefetch={false}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleMouseEnter}
      onBlur={handleMouseLeave}
    >
      <article>
        {thumbnailSrc && (
          <div className="thumbnail">
            <ProfileImage
              src={thumbnailSrc}
              alt=""
              aria-hidden
              fillContainer
              priority={layout === "pinned"}
              loading={layout === "pinned" ? "eager" : "lazy"}
              style={{
                objectFit: "cover",
                objectPosition: `${thumbnailFocusX}% ${thumbnailFocusY}%`,
                transform: `scale(${thumbnailZoom})`,
                transformOrigin: `${thumbnailFocusX}% ${thumbnailFocusY}%`,
              }}
            />
          </div>
        )}
        {!thumbnailSrc && <div className="thumbnail placeholder" aria-hidden="true" />}
        <div className="content">
          <header>
            <h2>{data.title}</h2>
          </header>
          <div className="summary">
            <p>{summary}</p>
          </div>
          <div className="meta">
            <span>{createdAtText}</span>
            <span className="dot">·</span>
            <span className="comment">
              <AppIcon name="message" />
              {commentsCount}개의 댓글
            </span>
          </div>
          <div className="footer">
            <div className="author">
              <span className="avatar" aria-hidden="true">
                {author?.profile_photo ? (
                  <ProfileImage
                    src={author.profile_photo}
                    alt=""
                    fillContainer
                    width={24}
                    height={24}
                    priority={layout === "pinned"}
                    loading={layout === "pinned" ? "eager" : "lazy"}
                  />
                ) : (
                  <span className="initial">{(author?.name || "A").slice(0, 1).toUpperCase()}</span>
                )}
              </span>
              <span className="by">by</span>
              <strong>{author?.name || "관리자"}</strong>
            </div>
            <div className="like">
              <AppIcon name={likesCount > 0 ? "heart-filled" : "heart"} />
              <span>{likesCount}</span>
            </div>
          </div>
        </div>
      </article>
    </StyledWrapper>
  )
}

const arePostCardPropsEqual = (prev: Props, next: Props) => {
  const prevAuthor = prev.data.author?.[0]
  const nextAuthor = next.data.author?.[0]

  return (
    prev.layout === next.layout &&
    prev.data.id === next.data.id &&
    prev.data.title === next.data.title &&
    prev.data.summary === next.data.summary &&
    prev.data.thumbnail === next.data.thumbnail &&
    prev.data.modifiedTime === next.data.modifiedTime &&
    prev.data.createdTime === next.data.createdTime &&
    prev.data.commentsCount === next.data.commentsCount &&
    prev.data.likesCount === next.data.likesCount &&
    prevAuthor?.name === nextAuthor?.name &&
    prevAuthor?.profile_photo === nextAuthor?.profile_photo
  )
}

export default memo(PostCard, arePostCardPropsEqual)

const StyledWrapper = styled(Link)`
  display: block;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  text-decoration: none;
  --post-card-shadow: ${FEED_CARD_SHADOW};
  --post-card-shadow-hover: ${FEED_CARD_SHADOW_HOVER};
  --post-card-translate-y: ${FEED_CARD_HOVER_TRANSLATE_PX}px;

  &[data-layout="regular"] {
    content-visibility: auto;
    contain-intrinsic-size: 1px 420px;
  }

  &:focus-visible {
    outline: 0;
  }

  article {
    overflow: hidden;
    position: relative;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    height: 100%;
    display: flex;
    flex-direction: column;
    border-radius: ${FEED_CARD_RADIUS_PX}px;
    border: ${({ theme }) => `${theme.variables.ui.card.borderWidth}px solid ${theme.colors.gray4}`};
    background: ${({ theme }) => theme.colors.gray1};
    box-shadow: var(--post-card-shadow);

    > .thumbnail {
      position: relative;
      width: 100%;
      max-width: 100%;
      aspect-ratio: 1.92 / 1;
      background-color: ${({ theme }) => theme.colors.gray4};
      overflow: hidden;
      isolation: isolate;

      img {
        transition: transform 0.28s ease-in;
      }

      &.placeholder {
        background: ${({ theme }) => theme.colors.gray3};
      }

      &::after {
        content: "";
        position: absolute;
        inset: 0;
        background: linear-gradient(180deg, rgba(0, 0, 0, 0) 45%, rgba(0, 0, 0, 0.16) 100%);
        opacity: 0.9;
        pointer-events: none;
      }
    }

    > .content {
      display: grid;
      grid-template-rows: auto auto auto auto;
      align-content: start;
      min-height: 0;
      padding: ${({ theme }) => `${theme.variables.ui.card.padding}px`};
      gap: 0;

      > header {
        h2 {
          margin: 0;
          color: ${({ theme }) => theme.colors.gray12};
          font-size: 1.02rem;
          line-height: ${FEED_CARD_TITLE_LINE_HEIGHT};
          font-weight: 760;
          letter-spacing: -0.01em;
          word-break: keep-all;
          overflow-wrap: anywhere;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      }

      > .summary {
        margin-top: 0.28rem;
        height: 3.9375rem;

        p {
          margin: 0;
          color: ${({ theme }) => theme.colors.gray10};
          font-size: 0.85rem;
          line-height: ${FEED_CARD_SUMMARY_LINE_HEIGHT};
          letter-spacing: -0.01em;
          word-break: keep-all;
          overflow-wrap: anywhere;
          display: -webkit-box;
          -webkit-line-clamp: ${FEED_CARD_SUMMARY_LINES};
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      }

      > .meta {
        display: flex;
        flex-wrap: wrap;
        gap: 0.42rem;
        align-items: center;
        margin-top: 0.6rem;
        padding-bottom: 0.88rem;
        color: ${({ theme }) => theme.colors.gray10};
        font-size: ${FEED_CARD_META_FONT_SIZE_REM}rem;
        line-height: 1.45;
        letter-spacing: -0.01em;

        .dot {
          opacity: 0.56;
        }

        .comment {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;

          svg {
            width: 0.92rem;
            height: 0.92rem;
            opacity: 0.85;
          }
        }
      }

      > .footer {
        margin-top: auto;
        padding-top: 0.74rem;
        border-top: 1px solid ${({ theme }) => theme.colors.gray4};
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.6rem;

        .author {
          display: inline-flex;
          align-items: center;
          gap: 0.42rem;
          min-width: 0;

          .avatar {
            position: relative;
            width: 24px;
            height: 24px;
            border-radius: 999px;
            overflow: hidden;
            flex: 0 0 auto;
            border: none;
            background: ${({ theme }) => theme.colors.gray4};
            display: inline-flex;
            align-items: center;
            justify-content: center;

            .initial {
              font-size: 0.72rem;
              font-weight: 800;
              color: ${({ theme }) => theme.colors.gray11};
            }
          }

          .by {
            color: ${({ theme }) => theme.colors.gray10};
            font-size: 0.72rem;
          }

          strong {
            color: ${({ theme }) => theme.colors.gray12};
            font-size: 0.76rem;
            font-weight: 760;
            line-height: 1.2;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: clamp(84px, 18vw, 170px);
          }
        }

        .like {
          display: inline-flex;
          align-items: center;
          gap: 0.42rem;
          color: ${({ theme }) => theme.colors.gray11};
          font-size: 0.75rem;
          font-weight: 700;

          svg {
            width: 0.75rem;
            height: 0.75rem;
            color: ${({ theme }) => theme.colors.red10};
          }
        }
      }
    }
  }

  @media (hover: hover) and (pointer: fine) {
    article {
      transition:
        transform 0.25s ease-in,
        box-shadow 0.25s ease-in,
        border-color 0.25s ease-in;
    }

    &:hover article,
    &:focus-visible article {
      transform: translateY(${({ theme }) => (theme.scheme === "light" ? "-2px" : "var(--post-card-translate-y)")});
      box-shadow: ${({ theme }) =>
        theme.scheme === "light" ? "0 8px 18px rgba(15, 23, 42, 0.06)" : "var(--post-card-shadow-hover)"};
      border-color: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray5 : theme.colors.gray5)};

      > .thumbnail img {
        transform: scale(${({ theme }) => (theme.scheme === "light" ? 1.01 : 1.025)});
      }

      @media screen and (max-width: 1024px) {
        transform: none;
      }
    }
  }

  @media (max-width: 640px) {
    --post-card-shadow: ${FEED_CARD_SHADOW};
    --post-card-shadow-hover: ${FEED_CARD_SHADOW_HOVER};
    --post-card-translate-y: -4px;

    article {
      border-radius: ${FEED_CARD_RADIUS_PX}px;

      > .thumbnail {
        max-height: 232px;
      }

      > .content {
        padding: ${({ theme }) => `${theme.variables.ui.card.padding}px`};

        > header h2 {
          -webkit-line-clamp: 2;
        }

        > .summary p {
          -webkit-line-clamp: 3;
        }

        > .summary {
          height: 3.9375rem;
        }

        > .footer {
          .author strong {
            max-width: 132px;
          }
        }
      }
    }
  }

  &[data-layout="regular"] {
    @media (min-width: 1201px) {
      article {
        > .content {
          padding: 1rem 1rem 0.88rem;

          > header h2 {
            font-size: 1rem;
            line-height: 1.4;
            -webkit-line-clamp: 2;
          }

          > .summary {
            margin-top: 0.34rem;
            height: 3.9375rem;

            p {
              font-size: 0.875rem;
              line-height: ${FEED_CARD_SUMMARY_LINE_HEIGHT};
            }
          }

          > .meta {
            flex-wrap: nowrap;
            margin-top: 0.68rem;
            padding-bottom: 0.92rem;
            line-height: 1.45;
            min-width: 0;

            .comment {
              white-space: nowrap;
            }
          }

          > .footer {
            margin-top: 0;
            padding-top: 0.62rem;
          }
        }
      }
    }
  }

  @media (prefers-reduced-motion: reduce) {
    article,
    article > .thumbnail img {
      transition: none;
    }
  }
`
