import type { Ref, RefObject } from "react"
import AppIcon from "src/components/icons/AppIcon"
import { CompactTocSection, MobileSummaryBar } from "./PostDetail.styles"
import type { TocItem } from "./PostDetailTocModel"

type EngagementState = {
  likesCount: number
  hitCount: number
  actorHasLiked: boolean
}

type ShareFeedback = "copied" | "shared" | "failed" | null

type FloatingActionRailProps = {
  railRef: RefObject<HTMLElement | null>
  innerRef: RefObject<HTMLDivElement | null>
  active: boolean
  showFloatingLike: boolean
  engagement: EngagementState
  likePending: boolean
  shareFeedback: ShareFeedback
  onToggleLike: () => void
  onSharePost: () => void
}

export const FloatingActionRail = ({
  railRef,
  innerRef,
  active,
  showFloatingLike,
  engagement,
  likePending,
  shareFeedback,
  onToggleLike,
  onSharePost,
}: FloatingActionRailProps) => (
  <aside ref={railRef as Ref<HTMLElement>} className="leftRail" data-hybrid-active={active} aria-hidden={!showFloatingLike}>
    {showFloatingLike ? (
      <div ref={innerRef as Ref<HTMLDivElement>} className="leftRailInner">
        <div className="floatingLikeCluster">
          <div className="floatingLikeStat">
            <button
              type="button"
              className="floatingActionButton floatingLikeButton"
              title="좋아요"
              data-tooltip="좋아요"
              aria-label={`좋아요 ${engagement.likesCount}`}
              aria-pressed={engagement.actorHasLiked}
              data-active={engagement.actorHasLiked}
              disabled={likePending}
              onClick={onToggleLike}
            >
              <AppIcon name={engagement.actorHasLiked ? "heart-filled" : "heart"} />
            </button>
            <span className="floatingLikeCount" aria-hidden="true">
              {engagement.likesCount}
            </span>
          </div>
          <div className="floatingShareStat">
            <button
              type="button"
              className="floatingActionButton floatingShareButton"
              title="공유"
              data-tooltip="공유"
              aria-label="게시글 공유"
              onClick={onSharePost}
            >
              <AppIcon name="share" />
            </button>
          </div>
          {shareFeedback ? (
            <span className="floatingShareFeedback" role="status" aria-live="polite">
              {shareFeedback === "failed" ? "공유 실패" : "복사 완료"}
            </span>
          ) : null}
        </div>
      </div>
    ) : null}
  </aside>
)

type MobileSummaryActionsProps = {
  engagement: EngagementState
  likePending: boolean
  shareFeedback: ShareFeedback
  shareProgressLabel: string | null
  commentsRailActive: boolean
  commentsCount: number
  commentsProgressLabel: string
  onToggleLike: () => void
  onSharePost: () => void
  onScrollToComments: () => void
}

export const MobileSummaryActions = ({
  engagement,
  likePending,
  shareFeedback,
  shareProgressLabel,
  commentsRailActive,
  commentsCount,
  commentsProgressLabel,
  onToggleLike,
  onSharePost,
  onScrollToComments,
}: MobileSummaryActionsProps) => (
  <MobileSummaryBar aria-label="빠른 이동 및 반응">
    <button
      type="button"
      data-active={engagement.actorHasLiked}
      data-tone="accent"
      aria-label={`좋아요 ${engagement.likesCount}`}
      aria-pressed={engagement.actorHasLiked}
      disabled={likePending}
      onClick={onToggleLike}
    >
      <AppIcon name={engagement.actorHasLiked ? "heart-filled" : "heart"} />
      <span>좋아요</span>
      <strong>{engagement.likesCount}</strong>
    </button>
    <button
      type="button"
      data-active={Boolean(shareFeedback)}
      data-tone="accent"
      aria-label={
        shareFeedback === "failed"
          ? "공유 실패, 다시 시도"
          : shareFeedback === "shared"
            ? "링크 복사 완료"
            : shareFeedback === "copied"
              ? "공유 링크 복사 완료"
              : "공유"
      }
      onClick={onSharePost}
    >
      <AppIcon name="share" />
      <span>{shareFeedback === "copied" ? "복사" : shareFeedback === "shared" ? "복사" : shareFeedback === "failed" ? "실패" : "공유"}</span>
      {shareProgressLabel ? <strong>{shareProgressLabel}</strong> : null}
    </button>
    <button
      type="button"
      data-active={commentsRailActive}
      data-tone="accent"
      aria-label={commentsRailActive ? `댓글 영역 읽는 중, 댓글 ${commentsCount}개` : `댓글 ${commentsCount}개`}
      onClick={onScrollToComments}
    >
      <AppIcon name="message" />
      <span>댓글</span>
      <strong>{commentsProgressLabel}</strong>
    </button>
  </MobileSummaryBar>
)

type CompactTocProps = {
  sectionRef: RefObject<HTMLElement | null>
  visibleTocItems: TocItem[]
  activeTocId: string
  onNavigate: (id: string) => void
}

export const CompactToc = ({ sectionRef, visibleTocItems, activeTocId, onNavigate }: CompactTocProps) => (
  <CompactTocSection ref={sectionRef as Ref<HTMLElement>} aria-label="접이식 목차">
    <details>
      <summary>
        <div className="summaryCopy">
          <strong>목차</strong>
          <span>{visibleTocItems.length}개 섹션</span>
        </div>
        <span className="summaryChevron" aria-hidden="true">
          <AppIcon name="chevron-down" />
        </span>
      </summary>
      <ol>
        {visibleTocItems.map((item) => (
          <li key={`compact-${item.id}`} data-level={item.level}>
            <button
              type="button"
              data-active={activeTocId === item.id}
              title={item.text}
              aria-label={item.text}
              onClick={() => onNavigate(item.id)}
            >
              {item.text}
            </button>
          </li>
        ))}
      </ol>
    </details>
  </CompactTocSection>
)

type RightTocRailProps = {
  railRef: RefObject<HTMLElement | null>
  innerRef: RefObject<HTMLElement | null>
  listRef: RefObject<HTMLOListElement | null>
  active: boolean
  showStickyToc: boolean
  visibleTocItems: TocItem[]
  activeTocId: string
  hasDepth4Toc: boolean
  showDetailedToc: boolean
  onToggleDetailed: () => void
  onNavigate: (id: string) => void
}

export const RightTocRail = ({
  railRef,
  innerRef,
  listRef,
  active,
  showStickyToc,
  visibleTocItems,
  activeTocId,
  hasDepth4Toc,
  showDetailedToc,
  onToggleDetailed,
  onNavigate,
}: RightTocRailProps) => (
  <aside ref={railRef as Ref<HTMLElement>} className="rightRail" data-hybrid-active={active} aria-hidden={!showStickyToc}>
    {showStickyToc ? (
      <nav ref={innerRef as Ref<HTMLElement>} className="rightRailInner" aria-label="목차">
        <div className="rightRailHead">
          <div className="rightRailTitleGroup">
            <h2 className="rightRailTitle">목차</h2>
            <span className="rightRailMeta">{visibleTocItems.length}개 섹션</span>
          </div>
          {hasDepth4Toc && (
            <button
              type="button"
              className="tocDepthToggle"
              onClick={onToggleDetailed}
              aria-pressed={showDetailedToc}
            >
              {showDetailedToc ? "h4 접기" : "h4 보기"}
            </button>
          )}
        </div>
        <ol ref={listRef as Ref<HTMLOListElement>}>
          {visibleTocItems.map((item) => (
            <li key={item.id} data-level={item.level}>
              <button
                type="button"
                data-active={activeTocId === item.id}
                title={item.text}
                aria-label={item.text}
                onClick={() => onNavigate(item.id)}
              >
                {item.text}
              </button>
            </li>
          ))}
        </ol>
      </nav>
    ) : null}
  </aside>
)
