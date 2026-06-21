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
}

const FEED_CARD_META_FONT_SIZE_REM = uiTokens.feed.card.metaFontSizeRem
const FEED_CARD_SUMMARY_LINES = uiTokens.feed.card.summaryLines
const FEED_CARD_SUMMARY_LINE_HEIGHT = uiTokens.feed.card.summaryLineHeight
const FEED_CARD_TITLE_LINE_HEIGHT = uiTokens.feed.card.titleLineHeight
const FEED_CARD_RADIUS_PX = 14
const INTERNAL_CATEGORY_TAGS = new Set(["Pinned"])

const toDisplayCategoryLabel = (post: TPost) => {
  const rawLabel =
    post.category?.[0] ||
    post.tags?.find((tag) => !INTERNAL_CATEGORY_TAGS.has(tag)) ||
    "Engineering"
  return splitCategoryDisplay(rawLabel).label
}

const PostCard: React.FC<Props> = ({ data, layout = "regular" }) => {
  const author = data.author?.[0]
  const postPath = toCanonicalPostPath(data.id)
  const createdAtText = formatDate(
    data?.date?.start_date || data.createdTime,
    CONFIG.lang
  )
  const summary = normalizeCardSummary(data.summary)
  const commentsCount = data.commentsCount ?? 0
  const likesCount = data.likesCount ?? 0
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
        {!thumbnailSrc && (
          <div className="thumbnail brandCover" data-ui="feed-card-brand-cover" aria-label={`${data.title} cover`}>
            <span className="coverCategory">{categoryLabel}</span>
            <strong>{data.title}</strong>
            <span className="coverBrand">AquilaLog</span>
          </div>
        )}
        <div className="content">
          <div className="category">{categoryLabel}</div>
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

export default memo(PostCard)

const StyledWrapper = styled.a`
  display: block;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  text-decoration: none;
  --post-card-translate-y: -8px;
  --post-card-border-color: ${({ theme }) => theme.publicDesign.border};
  --post-card-border-strong: ${({ theme }) => theme.publicDesign.accent};
  --post-card-surface: ${({ theme }) => theme.publicDesign.readableSurface};
  --post-card-surface-elevated: ${({ theme }) => theme.publicDesign.surfaceElevated};
  --post-card-shadow-current: ${({ theme }) =>
    theme.scheme === "light" ? "0 12px 34px rgba(15, 23, 42, 0.08)" : "0 12px 34px rgba(1, 4, 9, 0.26)"};
  --post-card-shadow-hover-current: ${({ theme }) =>
    theme.scheme === "light" ? "0 18px 42px rgba(15, 23, 42, 0.13)" : "0 20px 52px rgba(1, 4, 9, 0.36)"};
  --post-card-cover-text: ${({ theme }) => theme.colors.gray12};
  --post-card-cover-muted: ${({ theme }) => theme.colors.gray10};
  --post-card-cover-bg: ${({ theme }) =>
    theme.scheme === "light"
      ? "linear-gradient(135deg, rgba(37, 99, 235, 0.12), rgba(34, 197, 94, 0.08)), #f8fafc"
      : "linear-gradient(135deg, rgba(88, 166, 255, 0.2), rgba(126, 231, 135, 0.08)), #111722"};

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
    border: ${({ theme }) => `${theme.variables.ui.card.borderWidth}px solid var(--post-card-border-color)`};
    background:
      ${({ theme }) =>
        theme.scheme === "light"
          ? "linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(255, 255, 255, 0.98))"
          : "linear-gradient(180deg, rgba(33, 38, 45, 0.34), rgba(22, 27, 34, 0.98))"},
      var(--post-card-surface);
    box-shadow: var(--post-card-shadow-current);

    > .thumbnail {
      position: relative;
      width: 100%;
      max-width: 100%;
      aspect-ratio: 1.92 / 1;
      background-color: var(--post-card-surface-elevated);
      overflow: hidden;
      isolation: isolate;

      img {
        transition: transform 0.28s ease-in;
      }

      &.placeholder {
        background: var(--post-card-surface-elevated);
      }

      &.brandCover {
        min-height: 0;
        aspect-ratio: 1.92 / 1;
        display: grid;
        align-content: end;
        gap: 0.36rem;
        padding: 1rem;
        background:
          radial-gradient(circle at 82% 18%, ${({ theme }) =>
            theme.scheme === "light" ? "rgba(37, 99, 235, 0.16)" : "rgba(88, 166, 255, 0.28)"}, transparent 34%),
          var(--post-card-cover-bg);
        color: var(--post-card-cover-text);

        .coverCategory {
          width: fit-content;
          border-radius: 999px;
          border: 1px solid ${({ theme }) => theme.publicDesign.accent};
          background: ${({ theme }) => theme.publicDesign.accentMuted};
          color: ${({ theme }) => theme.colors.accentLink};
          padding: 0.22rem 0.5rem;
          font-size: 0.64rem;
          line-height: 1.2;
          font-weight: 860;
        }

        strong {
          max-width: 12ch;
          color: var(--post-card-cover-text);
          font-size: clamp(1.35rem, 2.5vw, 2rem);
          line-height: 0.94;
          letter-spacing: -0.07em;
          font-weight: 920;
          text-transform: uppercase;
        }

        .coverBrand {
          color: var(--post-card-cover-muted);
          font-size: 0.7rem;
          font-weight: 820;
          letter-spacing: 0.02em;
        }
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

      > .category {
        width: fit-content;
        margin-bottom: 0.42rem;
        color: ${({ theme }) => (theme.scheme === "light" ? theme.colors.blue11 : theme.colors.accentLink)};
        font-size: 0.7rem;
        line-height: 1.2;
        font-weight: 860;
        letter-spacing: 0.035em;
        text-transform: uppercase;
      }

      > header {
        h2 {
          margin: 0;
          color: ${({ theme }) => theme.colors.gray12};
          font-size: 1.12rem;
          line-height: ${FEED_CARD_TITLE_LINE_HEIGHT};
          font-weight: 840;
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
        border-top: 1px solid var(--post-card-border-color);
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
            background: var(--post-card-surface-elevated);
            display: inline-flex;
            align-items: center;
            justify-content: center;

            .initial {
              font-size: 0.72rem;
              font-weight: 800;
              color: ${({ theme }) => theme.colors.gray12};
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
          color: ${({ theme }) => theme.colors.gray10};
          font-size: 0.75rem;
          font-weight: 700;

          svg {
            width: 0.75rem;
            height: 0.75rem;
            color: #ff7b72;
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
      box-shadow: var(--post-card-shadow-hover-current);
      border-color: var(--post-card-border-strong);

      > .thumbnail img {
        transform: scale(${({ theme }) => (theme.scheme === "light" ? 1.01 : 1.025)});
      }

      @media screen and (max-width: 1024px) {
        transform: none;
      }
    }
  }

  @media (max-width: 640px) {
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
