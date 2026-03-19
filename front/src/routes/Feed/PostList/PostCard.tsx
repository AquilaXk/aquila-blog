import Link from "next/link"
import { CONFIG } from "site.config"
import { formatDate } from "src/libs/utils"
import { TPost } from "../../../types"
import Image from "next/image"
import styled from "@emotion/styled"
import { toCanonicalPostPath } from "src/libs/utils/postPath"
import AppIcon from "src/components/icons/AppIcon"
import {
  parseThumbnailFocusXFromUrl,
  parseThumbnailFocusYFromUrl,
  parseThumbnailZoomFromUrl,
  stripThumbnailFocusFromUrl,
} from "src/libs/thumbnailFocus"

type Props = {
  data: TPost
}

const PostCard: React.FC<Props> = ({ data }) => {
  const author = data.author?.[0]
  const createdAtText = formatDate(
    data?.date?.start_date || data.createdTime,
    CONFIG.lang
  )
  const summary = data.summary?.trim() || "아직 등록된 요약이 없습니다."
  const commentsCount = data.commentsCount ?? 0
  const likesCount = data.likesCount ?? 0
  const thumbnailSrc = data.thumbnail ? stripThumbnailFocusFromUrl(data.thumbnail) : ""
  const thumbnailFocusX = parseThumbnailFocusXFromUrl(data.thumbnail || "")
  const thumbnailFocusY = parseThumbnailFocusYFromUrl(data.thumbnail || "")
  const thumbnailZoom = parseThumbnailZoomFromUrl(data.thumbnail || "")

  return (
    <StyledWrapper href={toCanonicalPostPath(data.id)}>
      <article>
        {thumbnailSrc && (
          <div className="thumbnail">
            <Image
              src={thumbnailSrc}
              fill
              alt={data.title}
              sizes="(min-width: 1024px) 46vw, 96vw"
              priority={false}
              css={{
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
                  <Image src={author.profile_photo} alt="" fill sizes="34px" css={{ objectFit: "cover" }} />
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

export default PostCard

const StyledWrapper = styled(Link)`
  display: block;
  text-decoration: none;
  --post-card-shadow: 0 12px 28px rgba(0, 0, 0, 0.22);
  --post-card-shadow-hover: 0 18px 38px rgba(0, 0, 0, 0.34);
  --post-card-translate-y: -8px;

  &:focus-visible {
    outline: 0;
  }

  article {
    overflow: hidden;
    position: relative;
    height: 100%;
    display: flex;
    flex-direction: column;
    border-radius: 15px;
    border: 1px solid ${({ theme }) => theme.colors.gray5};
    background: ${({ theme }) => theme.colors.gray2};
    box-shadow: var(--post-card-shadow);
    transition:
      transform 0.22s ease,
      box-shadow 0.22s ease,
      border-color 0.22s ease;

    > .thumbnail {
      position: relative;
      width: 100%;
      aspect-ratio: 1.94 / 1;
      background-color: ${({ theme }) => theme.colors.gray4};
      overflow: hidden;
      isolation: isolate;

      &.placeholder {
        background: ${({ theme }) => theme.colors.gray4};
      }

      &::after {
        content: "";
        position: absolute;
        inset: 0;
        background: linear-gradient(180deg, rgba(0, 0, 0, 0) 45%, rgba(0, 0, 0, 0.16) 100%);
        opacity: 0.9;
        pointer-events: none;
      }

      img {
        transition: filter 0.22s ease;
      }
    }

    > .content {
      display: grid;
      grid-template-rows: auto auto auto auto;
      align-content: start;
      min-height: 0;
      padding: 1rem 1.08rem 0.92rem;
      gap: 0;

      > header {
        h2 {
          margin: 0;
          color: ${({ theme }) => theme.colors.gray12};
          font-size: clamp(1.05rem, 1.18vw, 1.2rem);
          line-height: 1.38;
          font-weight: 760;
          letter-spacing: -0.02em;
          word-break: keep-all;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      }

      > .summary {
        margin-top: 0.62rem;
        min-height: 0;

        p {
          margin: 0;
          color: ${({ theme }) => theme.colors.gray11};
          font-size: clamp(0.92rem, 0.95vw, 0.99rem);
          line-height: 1.58;
          letter-spacing: -0.01em;
          word-break: keep-all;
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      }

      > .meta {
        display: flex;
        flex-wrap: wrap;
        gap: 0.42rem;
        align-items: center;
        margin-top: 0.82rem;
        color: ${({ theme }) => theme.colors.gray10};
        font-size: 0.83rem;
        line-height: 1.35;
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
        margin-top: 0.82rem;
        padding-top: 0.68rem;
        border-top: 1px solid ${({ theme }) => theme.colors.gray5};
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
            font-size: 0.78rem;
          }

          strong {
            color: ${({ theme }) => theme.colors.gray12};
            font-size: 0.84rem;
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
          gap: 0.32rem;
          color: ${({ theme }) => theme.colors.gray11};
          font-size: 0.86rem;
          font-weight: 700;

          svg {
            width: 0.9rem;
            height: 0.9rem;
            color: ${({ theme }) => theme.colors.red10};
          }
        }
      }
    }
  }

  @media (hover: hover) and (pointer: fine) {
    &:hover article,
    &:focus-visible article {
      transform: translateY(var(--post-card-translate-y));
      box-shadow: var(--post-card-shadow-hover);
      border-color: ${({ theme }) => theme.colors.gray6};
    }

    &:hover article > .thumbnail img,
    &:focus-visible article > .thumbnail img {
      filter: brightness(0.96);
    }
  }

  &:active article {
    transform: translateY(-3px);
  }

  @media (max-width: 640px) {
    --post-card-shadow: 0 8px 22px rgba(0, 0, 0, 0.2);
    --post-card-shadow-hover: 0 10px 26px rgba(0, 0, 0, 0.28);
    --post-card-translate-y: -4px;

    article {
      border-radius: 13px;

      > .content {
        padding: 0.86rem 0.9rem 0.78rem;

        > .summary p {
          -webkit-line-clamp: 3;
        }

        > .footer {
          .author strong {
            max-width: 132px;
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
