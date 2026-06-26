/* eslint-disable @next/next/no-img-element */
import React from "react"
import Link from "next/link"
import { CONFIG } from "site.config"
import AppIcon from "src/components/icons/AppIcon"
import ProfileImage from "src/components/ProfileImage"
import { useRootAdminProfile } from "src/layouts/RootLayout"
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
  data: TPost & { content?: string }
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
  const adminProfile = useRootAdminProfile()
  const postAuthor = data.author?.find((author) => author.name?.trim()) ?? null
  const usingAdminFallback = !postAuthor
  const authorName =
    postAuthor?.name?.trim() || adminProfile?.nickname?.trim() || adminProfile?.name?.trim() || "익명"
  const authorImageSrc = usingAdminFallback
    ? adminProfile?.profileImageDirectUrl || adminProfile?.profileImageUrl || ""
    : postAuthor?.profile_photo || ""
  const tags = (data.tags || []).map((tag) => tag.trim()).filter(Boolean)
  const primaryTaxonomy = (data.category?.[0] || tags[0] || "").trim()
  const rawTypeLabel = data.type?.[0]?.trim() || "Post"
  const typeLabel = rawTypeLabel === "Post" ? "Production note" : rawTypeLabel
  const heroLabels = primaryTaxonomy ? [primaryTaxonomy, typeLabel] : [typeLabel]
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
  const readSource = (data.content || data.summary || data.title).trim()
  const readTimeText = `${Math.max(1, Math.ceil(readSource.length / 500))}분 READ`
  const viewCount = hitCount ?? data.hitCount ?? 0
  const viewText = `${Intl.NumberFormat(CONFIG.lang).format(viewCount)} VIEWS`
  const authorRole = usingAdminFallback ? adminProfile?.profileRole?.trim() || "" : ""

  return (
    <StyledWrapper>
      <Link href="/" className="backLink">
        <span aria-hidden="true">←</span>
        <span>모든 글</span>
      </Link>
      {heroLabels.length > 0 ? (
        <div className="heroLabel">
          {heroLabels.map((label, index) => (
            <React.Fragment key={label}>
              {index > 0 ? <span aria-hidden="true">·</span> : null}
              {label}
            </React.Fragment>
          ))}
        </div>
      ) : null}
      <h1 className="title">{data.title}</h1>
      {resolvedDeckSummary ? <p className="deck">{resolvedDeckSummary}</p> : null}

      <div className="metaRow">
        {authorName && (
          <div className="author">
            <div className="avatar">
              {authorImageSrc ? (
                <ProfileImage
                  src={authorImageSrc}
                  alt={`${authorName} profile image`}
                  priority
                  fillContainer
                  width={38}
                  height={38}
                />
              ) : (
                <span className="avatarFallback" aria-hidden="true" />
              )}
            </div>
            <div className="authorText">
              <strong>{authorName}</strong>
              {authorRole ? <div className="metaText">{authorRole}</div> : null}
            </div>
          </div>
        )}

        {shouldRenderAuthorUtilities || showEngagement ? (
          <div className="metaUtilities">
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

            {showEngagement ? (
              <div className="actions" data-hide-mobile={hideActionButtonsOnMobile}>
                <div className="engagementRow" aria-label="post engagement">
                  <div className="stats" aria-label="post stats">
                    <span className="statChip">{publishedAt}</span>
                    <span className="statChip">{readTimeText}</span>
                    <span className="statChip">{viewText}</span>
                    {modifiedAt ? <span className="statChip">UPDATED {modifiedAt}</span> : null}
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
