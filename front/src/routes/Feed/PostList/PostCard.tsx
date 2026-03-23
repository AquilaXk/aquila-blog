import Link from "next/link"
import Image from "next/image"
import { CONFIG } from "site.config"
import { formatDate } from "src/libs/utils"
import { TPost } from "../../../types"
import styled from "@emotion/styled"
import {
  FEED_CARD_META_FONT_SIZE_REM,
  FEED_CARD_SUMMARY_LINES,
  FEED_CARD_TITLE_LINE_HEIGHT,
} from "@shared/ui-tokens"
import { toCanonicalPostPath } from "src/libs/utils/postPath"
import AppIcon from "src/components/icons/AppIcon"
import { memo, useCallback, useEffect, useMemo, useRef } from "react"
import Router from "next/router"
import {
  parseThumbnailFocusXFromUrl,
  parseThumbnailFocusYFromUrl,
  parseThumbnailZoomFromUrl,
  stripThumbnailFocusFromUrl,
} from "src/libs/thumbnailFocus"

type Props = {
  data: TPost
  layout?: "regular" | "pinned"
}

type NavigatorConnectionLike = {
  saveData?: boolean
  effectiveType?: string
  addEventListener?: (type: "change", listener: () => void) => void
  removeEventListener?: (type: "change", listener: () => void) => void
  onchange?: (() => void) | null
}

const PREFETCH_CONCURRENCY = 1
const PREFETCH_CONCURRENCY_FAST_NETWORK = 2
const MAX_PREFETCH_QUEUE_SIZE = 16
const MAX_PREFETCH_QUEUE_SIZE_MID_MEMORY = 12
const MAX_PREFETCH_QUEUE_SIZE_LOW_MEMORY = 8
const MAX_PREFETCHED_PATHS = 256
const POST_CARD_THUMBNAIL_SIZES =
  "(min-width: 1520px) 420px, (min-width: 1057px) 368px, (min-width: 768px) 46vw, 94vw"
const prefetchedPostPathLRU = new Map<string, true>()
const queuedPrefetchListeners = new Map<string, Array<(success: boolean) => void>>()
const pendingPrefetchPaths: string[] = []
let prefetchInFlightCount = 0

const getNavigatorConnection = (): NavigatorConnectionLike | undefined => {
  if (typeof navigator === "undefined") return undefined
  return (navigator as Navigator & { connection?: NavigatorConnectionLike }).connection
}

const isNavigatorOnline = () => {
  if (typeof navigator === "undefined") return true
  return navigator.onLine !== false
}

const getNavigatorDeviceMemory = () => {
  if (typeof navigator === "undefined") return undefined
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  return typeof memory === "number" && Number.isFinite(memory) ? memory : undefined
}

const hasPrefetchedPostPath = (path: string) => prefetchedPostPathLRU.has(path)

const markPrefetchedPostPath = (path: string) => {
  if (prefetchedPostPathLRU.has(path)) {
    prefetchedPostPathLRU.delete(path)
  }
  prefetchedPostPathLRU.set(path, true)

  if (prefetchedPostPathLRU.size <= MAX_PREFETCHED_PATHS) return

  const oldestPath = prefetchedPostPathLRU.keys().next().value
  if (!oldestPath) return
  prefetchedPostPathLRU.delete(oldestPath)
}

const notifyPrefetchListeners = (path: string, success: boolean) => {
  const listeners = queuedPrefetchListeners.get(path)
  queuedPrefetchListeners.delete(path)
  if (!listeners || listeners.length === 0) return
  listeners.forEach((listener) => listener(success))
}

const isQueuedForPrefetch = (path: string) => queuedPrefetchListeners.has(path)

const resolvePrefetchConcurrency = () => {
  if (typeof navigator === "undefined") return PREFETCH_CONCURRENCY
  const deviceMemory = getNavigatorDeviceMemory()
  if (typeof deviceMemory === "number" && deviceMemory <= 2) return PREFETCH_CONCURRENCY

  const connection = getNavigatorConnection()
  if (!connection || connection.saveData) return PREFETCH_CONCURRENCY
  if (connection.effectiveType === "4g") {
    if (typeof deviceMemory === "number" && deviceMemory < 8) return PREFETCH_CONCURRENCY
    return PREFETCH_CONCURRENCY_FAST_NETWORK
  }
  return PREFETCH_CONCURRENCY
}

const resolvePrefetchQueueLimit = () => {
  const deviceMemory = getNavigatorDeviceMemory()
  if (typeof deviceMemory !== "number") return MAX_PREFETCH_QUEUE_SIZE
  if (deviceMemory <= 2) return MAX_PREFETCH_QUEUE_SIZE_LOW_MEMORY
  if (deviceMemory <= 4) return MAX_PREFETCH_QUEUE_SIZE_MID_MEMORY
  return MAX_PREFETCH_QUEUE_SIZE
}

const dropOldestPendingPrefetch = () => {
  const droppedPath = pendingPrefetchPaths.shift()
  if (!droppedPath) return
  notifyPrefetchListeners(droppedPath, false)
}

const trimPendingPrefetchQueueToCurrentLimit = () => {
  const limit = resolvePrefetchQueueLimit()
  while (pendingPrefetchPaths.length > limit) {
    dropOldestPendingPrefetch()
  }
}

const flushPrefetchQueue = () => {
  if (!isNavigatorOnline()) return

  while (prefetchInFlightCount < resolvePrefetchConcurrency() && pendingPrefetchPaths.length > 0) {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return

    const path = pendingPrefetchPaths.shift()
    if (!path) break

    if (hasPrefetchedPostPath(path)) {
      notifyPrefetchListeners(path, true)
      continue
    }

    prefetchInFlightCount += 1
    Router.prefetch(path)
      .then(() => {
        markPrefetchedPostPath(path)
        notifyPrefetchListeners(path, true)
      })
      .catch(() => {
        notifyPrefetchListeners(path, false)
      })
      .finally(() => {
        prefetchInFlightCount -= 1
        flushPrefetchQueue()
      })
  }
}

const enqueuePostPrefetch = (path: string, listener: (success: boolean) => void) => {
  ensurePrefetchRuntimeListeners()

  if (hasPrefetchedPostPath(path)) {
    listener(true)
    return
  }

  const queuedListeners = queuedPrefetchListeners.get(path)
  if (queuedListeners) {
    queuedListeners.push(listener)
    return
  }

  if (pendingPrefetchPaths.length >= resolvePrefetchQueueLimit()) {
    dropOldestPendingPrefetch()
  }

  queuedPrefetchListeners.set(path, [listener])
  pendingPrefetchPaths.push(path)
  flushPrefetchQueue()
}

let hasRegisteredVisibilityListener = false
let hasRegisteredConnectionListener = false
let hasRegisteredOnlineListener = false

const registerPrefetchVisibilityListener = () => {
  if (hasRegisteredVisibilityListener) return
  if (typeof document === "undefined") return
  hasRegisteredVisibilityListener = true
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return
    flushPrefetchQueue()
  })
}

const registerPrefetchConnectionListener = () => {
  if (hasRegisteredConnectionListener) return
  const connection = getNavigatorConnection()
  if (!connection) return
  hasRegisteredConnectionListener = true

  const handleConnectionChange = () => {
    trimPendingPrefetchQueueToCurrentLimit()
    flushPrefetchQueue()
  }

  if (typeof connection.addEventListener === "function") {
    connection.addEventListener("change", handleConnectionChange)
    return
  }

  connection.onchange = handleConnectionChange
}

const registerPrefetchOnlineListener = () => {
  if (hasRegisteredOnlineListener) return
  if (typeof window === "undefined") return
  hasRegisteredOnlineListener = true

  const handleOnline = () => {
    trimPendingPrefetchQueueToCurrentLimit()
    flushPrefetchQueue()
  }

  window.addEventListener("online", handleOnline)
}

const ensurePrefetchRuntimeListeners = () => {
  registerPrefetchVisibilityListener()
  registerPrefetchConnectionListener()
  registerPrefetchOnlineListener()
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
  const summary = data.summary?.trim() || "아직 등록된 요약이 없습니다."
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

  const prefetchPost = useCallback(() => {
    if (hasPrefetchedRef.current) return
    hasPrefetchedRef.current = true
    enqueuePostPrefetch(postPath, (success) => {
      if (success) return
      hasPrefetchedRef.current = false
    })
  }, [postPath])

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

  const handleMouseEnter = useCallback(() => {
    if (hasPrefetchedRef.current) return
    if (hasPrefetchedPostPath(postPath)) {
      hasPrefetchedRef.current = true
      return
    }
    if (isQueuedForPrefetch(postPath)) return
    if (!canPrefetchOnCurrentNetwork()) return
    clearPrefetchTimer()
    prefetchTimeoutRef.current = window.setTimeout(prefetchPost, 1800)
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
            <Image
              src={thumbnailSrc}
              alt=""
              aria-hidden
              fill
              priority={layout === "pinned"}
              loading={layout === "pinned" ? undefined : "lazy"}
              sizes={POST_CARD_THUMBNAIL_SIZES}
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
                  <Image
                    src={author.profile_photo}
                    alt=""
                    fill
                    sizes="32px"
                    style={{
                      objectFit: "cover",
                    }}
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
  text-decoration: none;
  --post-card-shadow: ${({ theme }) => theme.variables.ui.card.shadow};
  --post-card-shadow-hover: ${({ theme }) => theme.variables.ui.card.shadowHover};
  --post-card-translate-y: -6px;

  &:focus-visible {
    outline: 0;
  }

  article {
    overflow: hidden;
    position: relative;
    height: 100%;
    content-visibility: auto;
    contain-intrinsic-size: 420px;
    display: flex;
    flex-direction: column;
    border-radius: ${({ theme }) => `${theme.variables.ui.card.radius}px`};
    border: ${({ theme }) => `${theme.variables.ui.card.borderWidth}px solid ${theme.colors.gray4}`};
    background: ${({ theme }) => theme.colors.gray1};
    box-shadow: var(--post-card-shadow);

    > .thumbnail {
      position: relative;
      width: 100%;
      aspect-ratio: 1.94 / 1;
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
          font-size: 1.06rem;
          line-height: ${FEED_CARD_TITLE_LINE_HEIGHT};
          font-weight: 750;
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
        margin-top: 0.34rem;
        height: 3.9375rem;

        p {
          margin: 0;
          color: ${({ theme }) => theme.colors.gray11};
          font-size: 0.875rem;
          line-height: 1.58;
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
        margin-top: 0.66rem;
        padding-bottom: 0.95rem;
        color: ${({ theme }) => theme.colors.gray10};
        font-size: ${FEED_CARD_META_FONT_SIZE_REM}rem;
        line-height: 1.5;
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
        padding-top: 0.58rem;
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
            font-size: 0.75rem;
          }

          strong {
            color: ${({ theme }) => theme.colors.gray12};
            font-size: 0.78rem;
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
          gap: 0.5rem;
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
        box-shadow 0.25s ease-in;
    }

    &:hover article,
    &:focus-visible article {
      transform: translateY(var(--post-card-translate-y));
      box-shadow: var(--post-card-shadow-hover);

      > .thumbnail img {
        transform: scale(1.025);
      }

      @media screen and (max-width: 1024px) {
        transform: none;
      }
    }
  }

  @media (max-width: 640px) {
    --post-card-shadow: ${({ theme }) => theme.variables.ui.card.shadow};
    --post-card-shadow-hover: ${({ theme }) => theme.variables.ui.card.shadowHover};
    --post-card-translate-y: -4px;

    article {
      border-radius: ${({ theme }) => `${theme.variables.ui.card.radius}px`};

      > .content {
        padding: ${({ theme }) => `${theme.variables.ui.card.padding}px`};

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
    @media (min-width: 1201px) and (max-width: 1519px) {
      article {
        > .content {
          padding: 0.9rem 0.94rem 0.82rem;

          > header h2 {
            font-size: 1.08rem;
            line-height: 1.34;
          }

          > .summary {
            margin-top: 0.52rem;
            height: 4.25rem;

            p {
              font-size: 0.93rem;
              line-height: 1.52;
            }
          }

          > .meta {
            margin-top: 0.7rem;
            padding-bottom: 0.95rem;
          }

          > .footer {
            margin-top: 0;
            padding-top: 0.58rem;
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
