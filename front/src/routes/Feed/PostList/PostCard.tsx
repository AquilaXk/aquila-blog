import { CONFIG } from "site.config"
import { formatDate, splitCategoryDisplay } from "src/libs/utils"
import { TPost } from "../../../types"
import styled from "@emotion/styled"
import { uiTokens } from "@shared/ui-tokens"
import { toCanonicalPostPath } from "src/libs/utils/postPath"
import AppIcon from "src/components/icons/AppIcon"
import { memo, useCallback, useMemo, type MouseEvent } from "react"
import ProfileImage from "src/components/ProfileImage"
import Router from "next/router"
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
  index?: number
}

const FEED_CARD_META_FONT_SIZE_REM = uiTokens.feed.card.metaFontSizeRem
const FEED_CARD_SUMMARY_LINES = uiTokens.feed.card.summaryLines
const INTERNAL_CATEGORY_TAGS = new Set(["Pinned"])

const toDisplayCategoryLabel = (post: TPost) => {
  const rawLabel =
    post.category?.[0] ||
    post.tags?.find((tag) => !INTERNAL_CATEGORY_TAGS.has(tag)) ||
    "Engineering"
  return splitCategoryDisplay(rawLabel).label
}

const PostCard: React.FC<Props> = ({ data, layout = "regular", index = 0 }) => {
  const postPath = toCanonicalPostPath(data.id)
  const createdAtText = formatDate(
    data?.date?.start_date || data.createdTime,
    CONFIG.lang
  )
  const summary = normalizeCardSummary(data.summary)
  const commentsCount = data.commentsCount ?? 0
  const categoryLabel = toDisplayCategoryLabel(data)
  const readMinutes = Math.max(4, Math.ceil(((data.title?.length || 0) + (summary?.length || 0)) / 120))
  const viewsCount = data.hitCount ?? 0
  const viewsText =
    viewsCount >= 1000 ? `${(viewsCount / 1000).toFixed(viewsCount >= 10000 ? 0 : 1)}k views` : `${viewsCount} views`
  const { thumbnailSrc, thumbnailFocusX, thumbnailFocusY, thumbnailZoom } = useMemo(() => {
    const rawThumbnail = data.thumbnail || ""
    return {
      thumbnailSrc: rawThumbnail ? stripThumbnailFocusFromUrl(rawThumbnail) : "",
      thumbnailFocusX: parseThumbnailFocusXFromUrl(rawThumbnail),
      thumbnailFocusY: parseThumbnailFocusYFromUrl(rawThumbnail),
      thumbnailZoom: parseThumbnailZoomFromUrl(rawThumbnail),
    }
  }, [data.thumbnail])

  const handleNavigate = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return
      }

      event.preventDefault()
      void Router.push(postPath)
    },
    [postPath]
  )

  return (
    <StyledWrapper href={postPath} data-layout={layout} data-ui="feed-post-card" onClick={handleNavigate}>
      <article>
        <span className="rowIndex" aria-hidden="true">
          {String(index + 1).padStart(2, "0")}
        </span>
        <div className="content">
          <div className="tagRow">
            <span className="tag">{categoryLabel.toUpperCase()}</span>
          </div>
          <header>
            <h2>{data.title}</h2>
          </header>
          <div className="summary">
            <p>{summary}</p>
          </div>
          <div className="meta">
            <span>{createdAtText}</span>
            <span className="dot">·</span>
            <span>{readMinutes} min read</span>
            <span className="dot">·</span>
            <span>{viewsText}</span>
            <span className="dot">·</span>
            <span className="comment">
              <AppIcon name="message" />
              {commentsCount}개의 댓글
            </span>
          </div>
        </div>
        <div className="side">
          <span className="date">{createdAtText}</span>
          <div className="thumbnail" aria-label={`${data.title} 미리보기`}>
            <div className="imageFallback" aria-hidden="true">
              <span className="coverCategory">{categoryLabel}</span>
              <strong>{data.title}</strong>
              <span className="coverBrand">AquilaLog</span>
            </div>
            {thumbnailSrc ? (
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
            ) : null}
          </div>
          <span className="arrowBtn" aria-hidden="true">
          </span>
        </div>
      </article>
    </StyledWrapper>
  )
}

export default memo(PostCard)

const StyledWrapper = styled.a`
  display: block;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  text-decoration: none;
  --post-card-border-color: ${({ theme }) => theme.publicDesign.border};
  --post-card-border-strong: ${({ theme }) => theme.publicDesign.accent};
  --post-card-focus-ring: ${({ theme }) => theme.colors.indigo8};
  --post-card-surface: ${({ theme }) => theme.publicDesign.readableSurface};
  --post-card-surface-elevated: ${({ theme }) => theme.publicDesign.surfaceElevated};
  --post-card-cover-text: ${({ theme }) => theme.colors.gray12};
  --post-card-cover-muted: ${({ theme }) => theme.colors.gray10};
  --post-card-cover-bg: ${({ theme }) =>
    `linear-gradient(135deg, ${theme.publicDesign.accentMuted}, ${theme.colors.gray2}), ${theme.publicDesign.readableSurface}`};

  &:focus-visible {
    outline: 2px solid var(--post-card-focus-ring);
    outline-offset: 3px;
  }

  article {
    position: relative;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    display: grid;
    grid-template-columns: 48px minmax(0, 1fr) 180px;
    gap: 20px;
    align-items: start;
    border-bottom: 1px solid var(--post-card-border-color);
    padding: 28px 0;
    background: transparent;
    color: ${({ theme }) => theme.colors.gray12};

    > .rowIndex {
      align-self: start;
      padding-top: 0.24rem;
      color: ${({ theme }) => theme.colors.gray9};
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
      font-size: 0.72rem;
      line-height: 1.4;
      font-weight: 760;
    }

    > .content {
      display: grid;
      align-content: start;
      min-height: 0;
      gap: 0;
      order: 0;

      > .tagRow {
        display: flex;
        flex-wrap: wrap;
        gap: 7px;
        margin-bottom: 9px;
      }

      .tag {
        display: inline-flex;
        align-items: center;
        min-height: 26px;
        padding: 0 8px;
        border: 1px solid var(--post-card-border-color);
        background: transparent;
        color: ${({ theme }) => theme.colors.gray10};
        font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
        font-size: 0.6875rem;
        line-height: 1;
        font-weight: 650;
      }

      > header {
        h2 {
          margin: 0;
          color: ${({ theme }) => theme.colors.gray12};
          font-size: 24px;
          line-height: 1.3;
          font-weight: 820;
          letter-spacing: -0.035em;
          word-break: keep-all;
          overflow-wrap: anywhere;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      }

      > .summary {
        margin-top: 0;
        max-width: 720px;

        p {
          margin: 0;
          color: ${({ theme }) => theme.colors.gray10};
          font-size: 0.875rem;
          line-height: 1.7;
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
        gap: 0.42rem 0.52rem;
        align-items: center;
        margin-top: 14px;
        color: ${({ theme }) => theme.colors.gray10};
        font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
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
    }

    > .side {
      min-width: 0;
      align-self: stretch;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      justify-content: space-between;
      gap: 1rem;

      .date {
        color: ${({ theme }) => theme.colors.gray9};
        font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
        font-size: 0.68rem;
        line-height: 1.4;
        font-weight: 680;
      }

      .thumbnail {
        position: relative;
        width: 180px;
        aspect-ratio: 1.5 / 1;
        border: 1px solid var(--post-card-border-color);
        background-color: var(--post-card-surface-elevated);
        overflow: hidden;
        isolation: isolate;

        img {
          z-index: 1;
          transition: transform 0.28s ease-in;
        }

        .imageFallback {
          position: absolute;
          inset: 0;
          z-index: 0;
          display: grid;
          align-content: end;
          gap: 0.24rem;
          padding: 0.62rem;
          background: var(--post-card-cover-bg);
          color: var(--post-card-cover-text);
        }

        .coverCategory {
          width: fit-content;
          border: 1px solid ${({ theme }) => theme.publicDesign.accent};
          background: ${({ theme }) => theme.publicDesign.accentMuted};
          color: ${({ theme }) => theme.colors.accentLink};
          padding: 0.14rem 0.34rem;
          font-size: 0.54rem;
          line-height: 1.2;
          font-weight: 800;
        }

        strong {
          max-width: 10ch;
          color: var(--post-card-cover-text);
          font-size: 1rem;
          line-height: 0.96;
          letter-spacing: -0.06em;
          font-weight: 900;
          text-transform: uppercase;
        }

        .coverBrand {
          color: var(--post-card-cover-muted);
          font-size: 0.58rem;
          font-weight: 780;
        }

        &::after {
          content: "";
          position: absolute;
          inset: 0;
          background: ${({ theme }) => theme.publicDesign.accentMuted};
          opacity: 0.45;
          z-index: 2;
          pointer-events: none;
        }
      }

      .arrowBtn {
        width: 2.125rem;
        height: 2.125rem;
        border: 1px solid var(--post-card-border-color);
        display: grid;
        place-items: center;
        color: ${({ theme }) => theme.colors.gray10};
      }

      .arrowBtn::before {
        content: "";
        width: 0.46rem;
        height: 0.46rem;
        border-top: 1.5px solid currentColor;
        border-right: 1.5px solid currentColor;
        transform: rotate(45deg);
      }
    }
  }

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      article > .content h2 {
        color: var(--post-card-border-strong);
      }

      article > .side .arrowBtn {
        border-color: var(--post-card-border-strong);
        color: var(--post-card-border-strong);
      }

      article > .side .thumbnail img {
        transform: scale(1.025);
      }
    }
  }

  @media (max-width: 900px) {
    article {
      grid-template-columns: 32px minmax(0, 1fr);
      gap: 20px;

      > .side {
        grid-column: 2;
        align-items: stretch;
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;

        .date {
          display: none;
        }

        .thumbnail {
          width: min(100%, 18rem);
        }
      }
    }
  }

  @media (max-width: 640px) {
    article {
      > .content > header h2 {
        font-size: 1.18rem;
      }

      > .content > .summary p {
        -webkit-line-clamp: 3;
      }

      > .content > .meta {
        font-size: 0.66rem;

        .comment {
          svg {
            width: 0.78rem;
            height: 0.78rem;
          }
        }
      }
    }
  }

  @media (prefers-reduced-motion: reduce) {
    article,
    article > .side .thumbnail img {
      transition: none;
    }
  }
`
