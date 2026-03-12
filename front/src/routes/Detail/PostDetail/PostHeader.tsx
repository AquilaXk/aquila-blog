import styled from "@emotion/styled"
import Image from "next/image"
import React from "react"
import { MdFavorite, MdFavoriteBorder } from "react-icons/md"
import { CONFIG } from "site.config"
import Category from "src/components/Category"
import ProfileImage from "src/components/ProfileImage"
import Tag from "src/components/Tag"
import { formatDateTime } from "src/libs/utils"
import { TPost } from "src/types"

type Props = {
  data: TPost
  category?: string
  likesCount?: number
  hitCount?: number
  actorHasLiked?: boolean
  likePending?: boolean
  onToggleLike?: () => void
}

const PostHeader: React.FC<Props> = ({
  data,
  category,
  likesCount,
  hitCount,
  actorHasLiked = false,
  likePending = false,
  onToggleLike,
}) => {
  const authorImageSrc = data.author?.[0]?.profile_photo || CONFIG.profile.image
  const publishedAt = formatDateTime(data.createdTime, CONFIG.lang)
  const modifiedAt =
    data.modifiedTime && data.modifiedTime !== data.createdTime
      ? formatDateTime(data.modifiedTime, CONFIG.lang)
      : ""

  return (
    <StyledWrapper>
      <div className="taxonomyRow">
        {category && <Category readOnly={data.status?.[0] === "PublicOnDetail"}>{category}</Category>}
        {data.tags?.map((tag) => (
          <Tag key={tag}>{tag}</Tag>
        ))}
      </div>

      <h1 className="title">{data.title}</h1>

      <div className="metaRow">
        {data.author?.[0]?.name && (
          <div className="author">
            <div className="avatar">
              <ProfileImage
                src={authorImageSrc}
                alt="profile_photo"
                priority
                fillContainer
                width={48}
                height={48}
              />
            </div>
            <div className="authorText">
              <strong>{data.author[0].name}</strong>
              <div className="metaText">
                <span>{publishedAt}</span>
                {modifiedAt && (
                  <>
                    <span className="dot" />
                    <span>수정 {modifiedAt}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="actions">
          <button
            type="button"
            className="likeButton"
            aria-pressed={actorHasLiked}
            data-active={actorHasLiked}
            disabled={likePending}
            onClick={onToggleLike}
          >
            {actorHasLiked ? <MdFavorite /> : <MdFavoriteBorder />}
            <span>좋아요 {likesCount ?? data.likesCount ?? 0}</span>
          </button>

          <div className="stats" aria-label="post stats">
            <span>댓글 {data.commentsCount ?? 0}</span>
            <span className="dot" />
            <span>조회 {hitCount ?? data.hitCount ?? 0}</span>
          </div>
        </div>
      </div>

      {data.thumbnail && (
        <div className="thumbnail">
          <Image src={data.thumbnail} css={{ objectFit: "cover" }} fill alt={data.title} />
        </div>
      )}

      <div className="divider" />
    </StyledWrapper>
  )
}

export default PostHeader

const StyledWrapper = styled.header`
  .taxonomyRow {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.55rem;
    margin-bottom: 1rem;

    > span {
      min-height: 32px;
      padding: 0.38rem 0.78rem;
      border-radius: 999px;
      font-size: 0.86rem;
      line-height: 1;
      font-weight: 600;
    }
  }

  .title {
    margin: 0;
    font-size: clamp(2rem, 4.2vw, 3.2rem);
    line-height: 1.18;
    letter-spacing: -0.035em;
    font-weight: 780;
    color: ${({ theme }) => theme.colors.gray12};
    max-width: 18ch;
  }

  .metaRow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
    margin-top: 1.4rem;
  }

  .author {
    display: flex;
    align-items: center;
    gap: 0.85rem;
    min-width: 0;
  }

  .avatar {
    position: relative;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    overflow: hidden;
    background: ${({ theme }) => theme.colors.gray3};

    img {
      object-fit: cover;
      object-position: center 38%;
    }
  }

  .authorText {
    display: grid;
    gap: 0.18rem;
    min-width: 0;

    strong {
      color: ${({ theme }) => theme.colors.gray12};
      font-size: 1rem;
      font-weight: 700;
    }
  }

  .metaText,
  .stats {
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem;
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.92rem;
    font-weight: 500;
  }

  .actions {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 0.7rem;
  }

  .likeButton {
    display: inline-flex;
    align-items: center;
    gap: 0.42rem;
    min-height: 40px;
    padding: 0 0.9rem;
    border-radius: 999px;
    border: 1px solid ${({ theme }) => theme.colors.gray7};
    background: ${({ theme }) => theme.colors.gray2};
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.9rem;
    font-weight: 700;
    cursor: pointer;
    transition:
      border-color 0.18s ease,
      background-color 0.18s ease,
      color 0.18s ease;

    svg {
      font-size: 1.05rem;
    }

    &[data-active="true"] {
      border-color: ${({ theme }) => theme.colors.red7};
      background: ${({ theme }) => theme.colors.red3};
      color: ${({ theme }) => theme.colors.red11};
    }

    :disabled {
      opacity: 0.72;
      cursor: not-allowed;
    }
  }

  .dot {
    width: 0.22rem;
    height: 0.22rem;
    border-radius: 50%;
    background: ${({ theme }) => theme.colors.gray8};
  }

  .thumbnail {
    overflow: hidden;
    position: relative;
    margin-top: 2rem;
    border-radius: 1.3rem;
    width: 100%;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background-color: ${({ theme }) => theme.colors.gray3};
    padding-bottom: 52%;
  }

  .divider {
    margin-top: 2rem;
    border-bottom: 1px solid ${({ theme }) => theme.colors.gray6};
  }

  @media (max-width: 768px) {
    .taxonomyRow {
      margin-bottom: 0.8rem;
    }

    .taxonomyRow > span {
      min-height: 30px;
      font-size: 0.8rem;
    }

    .title {
      font-size: clamp(1.8rem, 8vw, 2.4rem);
      line-height: 1.2;
    }

    .metaRow {
      margin-top: 1.15rem;
      align-items: flex-start;
    }

    .actions {
      width: 100%;
      justify-content: flex-start;
    }

    .metaText,
    .stats {
      font-size: 0.86rem;
    }

    .divider {
      margin-top: 1.5rem;
    }
  }
`
