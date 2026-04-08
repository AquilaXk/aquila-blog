/* eslint-disable @next/next/no-img-element */
import styled from "@emotion/styled"
import React from "react"
import { CONFIG } from "site.config"
import AppIcon from "src/components/icons/AppIcon"
import ProfileImage from "src/components/ProfileImage"
import Tag from "src/components/Tag"
import { formatDateTime } from "src/libs/utils"
import {
  parseThumbnailFocusXFromUrl,
  parseThumbnailFocusYFromUrl,
  parseThumbnailZoomFromUrl,
  stripThumbnailFocusFromUrl,
} from "src/libs/thumbnailFocus"
import { TPost } from "src/types"

type Props = {
  data: TPost
  likesCount?: number
  hitCount?: number
  actorHasLiked?: boolean
  likePending?: boolean
  hideLikeActionOnDesktop?: boolean
  hideShareActionOnDesktop?: boolean
  hideActionButtonsOnMobile?: boolean
  shareFeedback?: "copied" | "shared" | "failed" | null
  onToggleLike?: () => void
  onSharePost?: () => void
  showModifyAction?: boolean
  showDeleteAction?: boolean
  adminActionPending?: boolean
  onEditPost?: () => void
  onDeletePost?: () => void
  interactiveTags?: boolean
  showEngagement?: boolean
  showThumbnail?: boolean
}

const PostHeader: React.FC<Props> = ({
  data,
  likesCount,
  hitCount,
  actorHasLiked = false,
  likePending = false,
  hideLikeActionOnDesktop = false,
  hideShareActionOnDesktop = false,
  hideActionButtonsOnMobile = false,
  shareFeedback = null,
  onToggleLike,
  onSharePost,
  showModifyAction = false,
  showDeleteAction = false,
  adminActionPending = false,
  onEditPost,
  onDeletePost,
  interactiveTags = true,
  showEngagement = true,
  showThumbnail = true,
}) => {
  const authorName = data.author?.[0]?.name || CONFIG.profile.name
  const authorImageSrc = data.author?.[0]?.profile_photo || CONFIG.profile.image
  const tags = (data.tags || []).map((tag) => tag.trim()).filter(Boolean)
  const publishedAt = formatDateTime(data.createdTime, CONFIG.lang)
  const modifiedAt =
    data.modifiedTime && data.modifiedTime !== data.createdTime
      ? formatDateTime(data.modifiedTime, CONFIG.lang)
      : ""
  const thumbnailSrc = data.thumbnail ? stripThumbnailFocusFromUrl(data.thumbnail) : ""
  const thumbnailFocusX = parseThumbnailFocusXFromUrl(data.thumbnail || "")
  const thumbnailFocusY = parseThumbnailFocusYFromUrl(data.thumbnail || "")
  const thumbnailZoom = parseThumbnailZoomFromUrl(data.thumbnail || "")
  const shareFeedbackMessage =
    shareFeedback === "failed"
      ? "공유에 실패했습니다."
      : shareFeedback === "shared"
        ? "복사 완료"
        : "복사 완료"

  return (
    <StyledWrapper>
      {tags.length > 0 ? (
        <div className="taxonomyRow">
          {tags.map((tag) =>
            interactiveTags ? (
              <Tag key={tag}>{tag}</Tag>
            ) : (
              <span key={tag} className="staticTag">
                {tag}
              </span>
            )
          )}
        </div>
      ) : null}

      <h1 className="title">{data.title}</h1>

      <div className="metaRow">
        {data.author?.[0]?.name && (
          <div className="author">
            <div className="avatar">
              <ProfileImage
                src={authorImageSrc}
                alt={`${authorName} profile image`}
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
              {(showModifyAction || showDeleteAction) && (
                <div className="authorUtilities">
                  {showModifyAction && (
                    <button type="button" className="adminButton" onClick={onEditPost} disabled={adminActionPending}>
                      <AppIcon name="edit" />
                      <span>수정</span>
                    </button>
                  )}
                  {showDeleteAction && (
                    <button type="button" className="adminButton dangerButton" onClick={onDeletePost} disabled={adminActionPending}>
                      <AppIcon name="trash" />
                      <span>{adminActionPending ? "삭제 중..." : "삭제"}</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {showEngagement ? (
        <div className="actions">
          {showEngagement ? (
            <div className="engagementRow" aria-label="post engagement">
              <div className="stats" aria-label="post stats">
                <span className="statChip commentStatChip" data-hide-mobile={hideActionButtonsOnMobile}>
                  댓글 {data.commentsCount ?? 0}
                </span>
                <span className="statChip viewStatChip">
                  <span className="statMetaLabel">
                    <AppIcon name="eye" />
                    <span>조회</span>
                  </span>
                  <strong className="statMetricValue">{hitCount ?? data.hitCount ?? 0}</strong>
                </span>
                {onToggleLike && (
                  <button
                    type="button"
                    className="mobileLikeButton"
                    aria-label={`좋아요 ${likesCount ?? data.likesCount ?? 0}`}
                    aria-pressed={actorHasLiked}
                    data-active={actorHasLiked}
                    disabled={likePending}
                    onClick={onToggleLike}
                  >
                    <span className="mobileLikeHeading">
                      <AppIcon name={actorHasLiked ? "heart-filled" : "heart"} />
                      <span>좋아요</span>
                    </span>
                    <strong className="mobileLikeValue">{likesCount ?? data.likesCount ?? 0}</strong>
                  </button>
                )}
              </div>
              <button
                type="button"
                className="likeButton"
                aria-pressed={actorHasLiked}
                data-active={actorHasLiked}
                data-hide-desktop={hideLikeActionOnDesktop}
                data-hide-mobile={hideActionButtonsOnMobile}
                disabled={likePending}
                onClick={onToggleLike}
              >
                <AppIcon name={actorHasLiked ? "heart-filled" : "heart"} />
                <span>좋아요 {likesCount ?? data.likesCount ?? 0}</span>
              </button>

              {onSharePost && (
                <button
                  type="button"
                  className="shareButton"
                  data-hide-desktop={hideShareActionOnDesktop}
                  data-hide-mobile={hideActionButtonsOnMobile}
                  aria-label="게시글 공유"
                  onClick={onSharePost}
                >
                  <AppIcon name="share" />
                  <span>공유</span>
                </button>
              )}
            </div>
          ) : null}
          {showEngagement && shareFeedback && (
            <span
              className="shareFeedbackPill"
              data-hide-desktop={hideShareActionOnDesktop}
              data-hide-mobile={hideActionButtonsOnMobile}
              role="status"
              aria-live="polite"
            >
              {shareFeedbackMessage}
            </span>
          )}
        </div>
        ) : null}
      </div>

      {showThumbnail && thumbnailSrc && (
        <div className="thumbnail">
          <img
            src={thumbnailSrc}
            alt={data.title}
            loading="eager"
            {...({ fetchpriority: "high" } as Record<string, string>)}
            decoding="async"
            draggable={false}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: `${thumbnailFocusX}% ${thumbnailFocusY}%`,
              transform: `scale(${thumbnailZoom})`,
              transformOrigin: `${thumbnailFocusX}% ${thumbnailFocusY}%`,
            }}
          />
        </div>
      )}

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
      display: inline-flex;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
      min-height: 32px;
      padding: 0.38rem 0.78rem;
      border-radius: 999px;
      font-size: 0.86rem;
      line-height: 1.2;
      font-weight: 600;
    }
  }

  .staticTag {
    display: inline-flex;
    align-items: center;
    min-height: 32px;
    padding: 0.38rem 0.78rem;
    border-radius: 999px;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    font-size: 0.86rem;
    line-height: 1.2;
    font-weight: 600;
    color: ${({ theme }) => theme.colors.gray11};
    background-color: ${({ theme }) => theme.colors.gray3};
  }

  .title {
    margin: 0;
    font-size: clamp(1.94rem, 3.8vw, 3rem);
    line-height: 1.18;
    letter-spacing: -0.035em;
    font-weight: 780;
    color: ${({ theme }) => theme.colors.gray12};
    max-width: 18ch;
    overflow-wrap: anywhere;
    word-break: break-word;
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
      overflow-wrap: anywhere;
    }
  }

  .metaText,
  .stats {
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.42rem;
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.9rem;
    min-width: 0;
  }

  .metaText {
    font-weight: 500;
  }

  .authorUtilities {
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.45rem;
    margin-top: 0.5rem;
  }

  .actions {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 0.52rem;
  }

  .engagementRow {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 0.52rem;
    min-width: 0;
  }

  .shareFeedbackPill {
    display: inline-flex;
    align-items: center;
    min-height: 34px;
    padding: 0 0.78rem;
    border-radius: 999px;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.colors.gray2};
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.82rem;
    font-weight: 650;
    line-height: 1;
  }

  .adminButton {
    display: inline-flex;
    align-items: center;
    gap: 0.42rem;
    min-height: 34px;
    padding: 0 0.76rem;
    border-radius: 999px;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.colors.gray2};
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.82rem;
    font-weight: 700;
    cursor: pointer;
    transition:
      border-color 0.18s ease,
      background-color 0.18s ease,
      color 0.18s ease;

    :disabled {
      opacity: 0.72;
      cursor: not-allowed;
    }
  }

  .dangerButton {
    border-color: ${({ theme }) => theme.colors.red7};
    background: transparent;
    color: ${({ theme }) => theme.colors.red11};
  }

  .mobileLikeButton {
    display: none;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: 0.44rem;
    min-height: 40px;
    padding: 0.72rem 0.9rem;
    border-radius: 14px;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.colors.gray2};
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.88rem;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 12px 24px rgba(0, 0, 0, 0.18);
    transition:
      border-color 0.18s ease,
      background-color 0.18s ease,
      color 0.18s ease,
      transform 0.18s ease;

    svg {
      font-size: 1.02rem;
    }

    &[data-active="true"] {
      border-color: ${({ theme }) => theme.colors.red7};
      background: ${({ theme }) => theme.colors.red3};

      svg {
        color: ${({ theme }) => theme.colors.red10};
      }
    }

    :disabled {
      opacity: 0.72;
      cursor: not-allowed;
    }
  }

  .mobileLikeHeading {
    display: inline-flex;
    align-items: center;
    gap: 0.42rem;
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.8rem;
    font-weight: 700;
    line-height: 1;
  }

  .mobileLikeValue {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 1.34rem;
    line-height: 1;
    letter-spacing: -0.03em;
  }

  .likeButton {
    display: inline-flex;
    align-items: center;
    gap: 0.42rem;
    min-height: 40px;
    padding: 0 0.9rem;
    border-radius: 8px;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: transparent;
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
      background: transparent;
      color: ${({ theme }) => theme.colors.gray12};

      svg {
        color: ${({ theme }) => theme.colors.red10};
      }
    }

    :disabled {
      opacity: 0.72;
      cursor: not-allowed;
    }
  }

  .shareButton {
    display: inline-flex;
    align-items: center;
    gap: 0.42rem;
    min-height: 40px;
    padding: 0 0.9rem;
    border-radius: 8px;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: transparent;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.9rem;
    font-weight: 700;
    cursor: pointer;
    transition:
      border-color 0.18s ease,
      background-color 0.18s ease,
      color 0.18s ease;

    svg {
      font-size: 1rem;
    }
  }

  .dot {
    width: 0.22rem;
    height: 0.22rem;
    border-radius: 50%;
    background: ${({ theme }) => theme.colors.gray8};
  }

  .statChip {
    display: inline-flex;
    align-items: center;
    gap: 0.42rem;
    min-height: 40px;
    padding: 0 0.82rem;
    border-radius: 8px;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: transparent;
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.9rem;
    font-weight: 650;
    line-height: 1;
  }

  .viewStatChip {
    justify-content: space-between;
  }

  .statMetaLabel {
    display: inline-flex;
    align-items: center;
    gap: 0.34rem;
    color: ${({ theme }) => theme.colors.gray11};

    svg {
      font-size: 0.96rem;
    }
  }

  .statMetricValue {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.96rem;
    font-weight: 760;
    letter-spacing: -0.02em;
  }

  .thumbnail {
    overflow: hidden;
    position: relative;
    margin-top: 2rem;
    border-radius: 10px;
    width: 100%;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background-color: ${({ theme }) => theme.colors.gray3};
    padding-bottom: 52%;
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
      font-size: clamp(1.75rem, 7.8vw, 2.3rem);
      line-height: 1.2;
    }

    .metaRow {
      margin-top: 1.15rem;
      align-items: flex-start;
    }

    .actions {
      width: 100%;
      justify-content: flex-start;
      display: grid;
      gap: 0.55rem;
    }

    .engagementRow {
      width: 100%;
      display: grid;
      gap: 0.55rem;
    }

    .stats {
      width: 100%;
      display: grid;
      grid-template-columns: minmax(0, 0.92fr) minmax(0, 1.08fr);
      gap: 0.6rem;
    }

    .mobileLikeButton {
      display: inline-flex;
    }

    .commentStatChip[data-hide-mobile="true"] {
      display: none;
    }

    .shareFeedbackPill {
      width: fit-content;
    }

    .metaText,
    .stats {
      font-size: 0.86rem;
    }

    .statChip,
    .mobileLikeButton,
    .likeButton,
    .shareButton {
      width: 100%;
    }

    .viewStatChip,
    .mobileLikeButton {
      min-height: 64px;
      border-radius: 16px;
      padding: 0.85rem 0.95rem;
    }

    .viewStatChip {
      flex-direction: column;
      align-items: flex-start;
      justify-content: center;
      gap: 0.52rem;
      background: ${({ theme }) => theme.colors.gray2};
    }

    .statMetaLabel {
      font-size: 0.8rem;
    }

    .statMetricValue,
    .mobileLikeValue {
      font-size: 1.4rem;
    }

    .likeButton,
    .shareButton {
      min-height: 38px;
      justify-content: center;
    }
  }

  @media (max-width: 1023px) {
    .likeButton[data-hide-mobile="true"],
    .shareButton[data-hide-mobile="true"],
    .shareFeedbackPill[data-hide-mobile="true"] {
      display: none;
    }
  }

  @media (min-width: 1201px) {
    .likeButton[data-hide-desktop="true"],
    .shareButton[data-hide-desktop="true"],
    .shareFeedbackPill[data-hide-desktop="true"] {
      display: none;
    }
  }
`
