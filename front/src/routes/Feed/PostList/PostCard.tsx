import Link from "next/link"
import { CONFIG } from "site.config"
import { formatDate } from "src/libs/utils"
import { TPost } from "../../../types"
import Image from "next/image"
import styled from "@emotion/styled"
import { toCanonicalPostPath } from "src/libs/utils/postPath"
import AppIcon from "src/components/icons/AppIcon"

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

  return (
    <StyledWrapper href={toCanonicalPostPath(data.id)}>
      <article>
        {data.thumbnail && (
          <div className="thumbnail">
            <Image
              src={data.thumbnail}
              fill
              alt={data.title}
              sizes="(min-width: 1024px) 46vw, 96vw"
              priority={false}
              css={{ objectFit: "cover" }}
            />
          </div>
        )}
        {!data.thumbnail && <div className="thumbnail placeholder" aria-hidden="true" />}
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

  article {
    overflow: clip;
    position: relative;
    height: 100%;
    display: flex;
    flex-direction: column;
    border-radius: 20px;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) =>
      theme.scheme === "dark"
        ? "linear-gradient(180deg, rgba(29, 32, 39, 0.98), rgba(25, 28, 34, 0.98))"
        : "linear-gradient(180deg, #ffffff, #f8fafc)"};
    box-shadow: ${({ theme }) =>
      theme.scheme === "dark"
        ? "0 20px 42px rgba(2, 6, 23, 0.38)"
        : "0 16px 34px rgba(15, 23, 42, 0.08)"};
    transition: transform 0.24s ease, box-shadow 0.24s ease, border-color 0.24s ease;

    &:hover {
      transform: translateY(-2px);
      border-color: ${({ theme }) => theme.colors.blue7};
      box-shadow: ${({ theme }) =>
        theme.scheme === "dark"
          ? "0 24px 46px rgba(2, 6, 23, 0.46)"
          : "0 22px 38px rgba(30, 64, 175, 0.14)"};
    }
    > .thumbnail {
      position: relative;
      width: 100%;
      aspect-ratio: 16 / 9;
      background-color: ${({ theme }) => theme.colors.gray3};

      &.placeholder {
        background:
          linear-gradient(140deg, rgba(59, 130, 246, 0.18), transparent 52%),
          ${({ theme }) => theme.colors.gray3};
      }
    }

    > .content {
      display: grid;
      grid-template-rows: auto auto auto auto;
      align-content: start;
      min-height: 0;
      padding: 1rem 1.05rem 0.88rem;
      gap: 0;

      > header {
        h2 {
          margin: 0;
          color: ${({ theme }) => theme.colors.gray12};
          font-size: clamp(1.32rem, 2.15vw, 1.92rem);
          line-height: 1.34;
          font-weight: 800;
          letter-spacing: -0.03em;
          word-break: keep-all;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      }

      > .summary {
        margin-top: 0.66rem;
        min-height: 0;

        p {
          margin: 0;
          color: ${({ theme }) => theme.colors.gray11};
          font-size: clamp(1rem, 1.2vw, 1.12rem);
          line-height: 1.68;
          letter-spacing: -0.01em;
          word-break: keep-all;
          display: -webkit-box;
          -webkit-line-clamp: 4;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      }

      > .meta {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        align-items: center;
        margin-top: 0.92rem;
        color: ${({ theme }) => theme.colors.gray10};
        font-size: 0.88rem;

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
        margin-top: 0.9rem;
        padding-top: 0.72rem;
        border-top: 1px solid ${({ theme }) => theme.colors.gray6};
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.7rem;

        .author {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          min-width: 0;

          .avatar {
            position: relative;
            width: 34px;
            height: 34px;
            border-radius: 999px;
            overflow: hidden;
            flex: 0 0 auto;
            border: 1px solid ${({ theme }) => theme.colors.gray7};
            background:
              linear-gradient(140deg, rgba(56, 189, 248, 0.2), rgba(99, 102, 241, 0.15)),
              ${({ theme }) => theme.colors.gray2};
            display: inline-flex;
            align-items: center;
            justify-content: center;

            .initial {
              font-size: 0.82rem;
              font-weight: 800;
              color: ${({ theme }) => theme.colors.gray11};
            }
          }

          .by {
            color: ${({ theme }) => theme.colors.gray10};
            font-size: 0.92rem;
          }

          strong {
            color: ${({ theme }) => theme.colors.gray12};
            font-size: 1rem;
            font-weight: 800;
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
          gap: 0.38rem;
          color: ${({ theme }) => theme.colors.gray11};
          font-size: 1.03rem;
          font-weight: 700;

          svg {
            width: 1.02rem;
            height: 1.02rem;
            color: ${({ theme }) =>
              theme.scheme === "dark" ? "#f43f5e" : "#dc2626"};
          }
        }
      }
    }
  }

  @media (max-width: 640px) {
    article {
      border-radius: 18px;

      > .content {
        padding: 0.9rem 0.92rem 0.78rem;

        > .summary p {
          -webkit-line-clamp: 3;
        }

        > .footer {
          .author strong {
            max-width: 110px;
          }
        }
      }
    }
  }

  @media (prefers-reduced-motion: reduce) {
    article {
      transition: none;

      &:hover {
        transform: none;
      }
    }
  }
`
