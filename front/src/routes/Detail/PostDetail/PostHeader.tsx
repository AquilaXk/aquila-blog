/* eslint-disable @next/next/no-img-element */
import React from "react"
import Link from "next/link"
import { CONFIG } from "site.config"
import AppIcon from "src/components/icons/AppIcon"
import ProfileImage from "src/components/ProfileImage"
import { formatDateTime } from "src/libs/utils"
import {
  parseThumbnailFocusXFromUrl,
  parseThumbnailFocusYFromUrl,
  parseThumbnailZoomFromUrl,
  stripThumbnailFocusFromUrl,
} from "src/libs/thumbnailFocus"
import { TPost } from "src/types"
import { StyledWrapper } from "./PostHeader.styles"

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
  useAdminShellFallback?: boolean
  adminActionPending?: boolean
  onEditPost?: () => void
  onDeletePost?: () => void
  deckSummary?: string
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
  useAdminShellFallback = false,
  adminActionPending = false,
  onEditPost,
  onDeletePost,
  deckSummary,
  showEngagement = true,
  showThumbnail = true,
}) => {
  const authorName = data.author?.[0]?.name || CONFIG.profile.name
  const authorImageSrc = data.author?.[0]?.profile_photo || CONFIG.profile.image
  const tags = (data.tags || []).map((tag) => tag.trim()).filter(Boolean)
  const primaryTaxonomy = (data.category?.[0] || tags[0] || data.type[0] || "").trim()
  const typeLabel = data.type[0] === "Post" ? "Production note" : data.type[0]
  const publishedAt = formatDateTime(data.createdTime, CONFIG.lang)
  const modifiedAt =
    data.modifiedTime && data.modifiedTime !== data.createdTime
      ? formatDateTime(data.modifiedTime, CONFIG.lang)
      : ""
  const thumbnailSrc = data.thumbnail ? stripThumbnailFocusFromUrl(data.thumbnail) : ""
  const thumbnailFocusX = parseThumbnailFocusXFromUrl(data.thumbnail || "")
  const thumbnailFocusY = parseThumbnailFocusYFromUrl(data.thumbnail || "")
  const thumbnailZoom = parseThumbnailZoomFromUrl(data.thumbnail || "")
  const shellModifyFallback = useAdminShellFallback && Boolean(onEditPost) && !showModifyAction
  const shellDeleteFallback = useAdminShellFallback && Boolean(onDeletePost) && !showDeleteAction
  const shouldRenderAuthorUtilities =
    showModifyAction || showDeleteAction || shellModifyFallback || shellDeleteFallback
  const authorUtilitiesShellOnly = !showModifyAction && !showDeleteAction && (shellModifyFallback || shellDeleteFallback)
  const shareFeedbackMessage =
    shareFeedback === "failed"
      ? "공유에 실패했습니다."
      : shareFeedback === "shared"
        ? "복사 완료"
        : "복사 완료"
  const resolvedDeckSummary = (deckSummary ?? data.summary ?? "").trim()

  return (
    <StyledWrapper>
      <Link href="/" className="backLink">
        <span aria-hidden="true">←</span>
        <span>모든 글</span>
      </Link>
      {primaryTaxonomy ? (
        <div className="heroLabel">
          {primaryTaxonomy}
          <span aria-hidden="true">·</span>
          {typeLabel}
        </div>
      ) : null}
      <h1 className="title">{data.title}</h1>
      {resolvedDeckSummary ? <p className="deck">{resolvedDeckSummary}</p> : null}

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
                <span className="dot mobileMetaOnly" />
                <span className="metaInlineMetric metaInlineViewStat mobileMetaOnly">
                  <AppIcon name="eye" />
                  <span>조회 {hitCount ?? data.hitCount ?? 0}</span>
                </span>
              </div>
              {shouldRenderAuthorUtilities && (
                <div className="authorUtilities" data-shell-only={authorUtilitiesShellOnly ? "true" : "false"}>
                  {(showModifyAction || shellModifyFallback) && (
                    <button
                      type="button"
                      className="adminButton"
                      data-shell-fallback={shellModifyFallback ? "true" : "false"}
                      onClick={onEditPost}
                      disabled={adminActionPending}
                    >
                      <AppIcon name="edit" />
                      <span>수정</span>
                    </button>
                  )}
                  {(showDeleteAction || shellDeleteFallback) && (
                    <button
                      type="button"
                      className="adminButton dangerButton"
                      data-shell-fallback={shellDeleteFallback ? "true" : "false"}
                      onClick={onDeletePost}
                      disabled={adminActionPending}
                    >
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
          <div className="actions" data-hide-mobile={hideActionButtonsOnMobile}>
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
            {shareFeedback && (
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
