import { CONFIG } from "site.config"
import Tag from "src/components/Tag"
import { TPost } from "src/types"
import { formatDateTime } from "src/libs/utils"
import Image from "next/image"
import React from "react"
import styled from "@emotion/styled"

type Props = {
  data: TPost
}

const PostHeader: React.FC<Props> = ({ data }) => {
  const authorImageSrc = data.author?.[0]?.profile_photo || CONFIG.profile.image
  const bypassOptimizer =
    authorImageSrc.includes("/redirectToProfileImg") || authorImageSrc.startsWith("data:")
  const publishedAt = formatDateTime(data.createdTime, CONFIG.lang)
  const modifiedAt =
    data.modifiedTime && data.modifiedTime !== data.createdTime
      ? formatDateTime(data.modifiedTime, CONFIG.lang)
      : ""

  return (
    <StyledWrapper>
      <div className="eyebrow">Post Detail</div>
      <h1 className="title">{data.title}</h1>
      {data.type[0] !== "Paper" && (
        <div className="metaCard">
          <div className="authorRow">
            {data.author?.[0]?.name && (
              <div className="author">
                <div className="avatar">
                  <Image
                    src={authorImageSrc}
                    alt="profile_photo"
                    fill
                    unoptimized={bypassOptimizer}
                  />
                </div>
                <div className="authorText">
                  <strong>{data.author[0].name}</strong>
                  <span>{publishedAt}</span>
                </div>
              </div>
            )}
            <div className="stats">
              <span>댓글 {data.commentsCount ?? 0}</span>
              <span>좋아요 {data.likesCount ?? 0}</span>
              <span>조회 {data.hitCount ?? 0}</span>
            </div>
          </div>

          <div className="infoGrid">
            <div className="infoItem">
              <label>게시 시각</label>
              <strong>{publishedAt}</strong>
            </div>
            <div className="infoItem">
              <label>최종 수정</label>
              <strong>{modifiedAt || "게시 시각과 동일"}</strong>
            </div>
          </div>

          {data.tags && (
            <div className="tags">
              {data.tags.map((tag: string) => (
                <Tag key={tag}>{tag}</Tag>
              ))}
            </div>
          )}

          {data.thumbnail && (
            <div className="thumbnail">
              <Image src={data.thumbnail} css={{ objectFit: "cover" }} fill alt={data.title} />
            </div>
          )}
        </div>
      )}
    </StyledWrapper>
  )
}

export default PostHeader

const StyledWrapper = styled.header`
  .eyebrow {
    display: inline-flex;
    margin-bottom: 0.7rem;
    border-radius: 999px;
    padding: 0.36rem 0.68rem;
    border: 1px solid ${({ theme }) => theme.colors.blue7};
    background: ${({ theme }) => theme.colors.blue3};
    color: ${({ theme }) => theme.colors.blue11};
    font-size: 0.74rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .title {
    margin: 0;
    font-size: clamp(2rem, 4vw, 3rem);
    line-height: 1.08;
    letter-spacing: -0.05em;
    font-weight: 800;
    color: ${({ theme }) => theme.colors.gray12};
  }

  .metaCard {
    margin-top: 1.35rem;
    padding: 1rem;
    border-radius: 24px;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background:
      radial-gradient(circle at top left, rgba(37, 99, 235, 0.12), transparent 34%),
      ${({ theme }) => theme.colors.gray1};
  }

  .authorRow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.9rem;
    flex-wrap: wrap;
    margin-bottom: 1rem;
  }

  .author {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    min-width: 0;
  }

  .avatar {
    position: relative;
    width: 52px;
    height: 52px;
    border-radius: 50%;
    overflow: hidden;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.colors.gray2};

    img {
      object-fit: cover;
      object-position: center 38%;
    }
  }

  .authorText {
    display: grid;
    gap: 0.15rem;
    min-width: 0;

    strong {
      color: ${({ theme }) => theme.colors.gray12};
      font-size: 1rem;
    }

    span {
      color: ${({ theme }) => theme.colors.gray11};
      font-size: 0.82rem;
    }
  }

  .stats {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;

    span {
      display: inline-flex;
      align-items: center;
      min-height: 34px;
      padding: 0 0.76rem;
      border-radius: 999px;
      border: 1px solid ${({ theme }) => theme.colors.gray7};
      background: ${({ theme }) => theme.colors.gray2};
      color: ${({ theme }) => theme.colors.gray11};
      font-size: 0.8rem;
      font-weight: 700;
    }
  }

  .infoGrid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.65rem;
    margin-bottom: 0.95rem;

    @media (max-width: 680px) {
      grid-template-columns: 1fr;
    }
  }

  .infoItem {
    display: grid;
    gap: 0.2rem;
    padding: 0.82rem 0.9rem;
    border-radius: 18px;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.colors.gray2};

    label {
      color: ${({ theme }) => theme.colors.gray11};
      font-size: 0.74rem;
      font-weight: 700;
    }

    strong {
      color: ${({ theme }) => theme.colors.gray12};
      font-size: 0.92rem;
      line-height: 1.5;
    }
  }

  .tags {
    display: flex;
    overflow-x: auto;
    flex-wrap: nowrap;
    gap: 0.5rem;
    max-width: 100%;
    margin-bottom: 1rem;
    padding-bottom: 0.15rem;
  }

  .thumbnail {
    overflow: hidden;
    position: relative;
    margin-bottom: 0.25rem;
    border-radius: 1.5rem;
    width: 100%;
    background-color: ${({ theme }) => theme.colors.gray4};
    padding-bottom: 58%;

    @media (min-width: 1024px) {
      padding-bottom: 46%;
    }
  }
`
