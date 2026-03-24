import { uiTokens } from "@shared/ui-tokens"

type FeedRailTokens = {
  chipMaxWidthPx?: number
  desktopMinWidthPx?: number
  widthPx?: number
  offsetMinPx?: number
  offsetMaxPx?: number
  offsetAnchorPx?: number
}

type FeedTokens = {
  chipGapPx?: number
  searchFieldMinHeightPx?: number
  rail?: FeedRailTokens
}

const asFiniteNumber = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback

const touchTokens = (uiTokens.touch ?? {}) as { mobileMinTargetPx?: number }
const feedTokens = (uiTokens.feed ?? {}) as FeedTokens
const railTokens = (feedTokens.rail ?? {}) as FeedRailTokens
const FEED_TAG_RAIL_CHIP_MAX_DEFAULT_PX = 1200
const FEED_TAG_RAIL_DESKTOP_MIN_DEFAULT_PX = 1201

const resolveRailBreakpoint = () => {
  const chipMaxToken = asFiniteNumber(railTokens.chipMaxWidthPx, FEED_TAG_RAIL_CHIP_MAX_DEFAULT_PX)
  const desktopMinToken = asFiniteNumber(railTokens.desktopMinWidthPx, FEED_TAG_RAIL_DESKTOP_MIN_DEFAULT_PX)

  // file: dependency 캐시로 구형 토큰(1519/1520)이 남아도, 피드 레일은 최신 기준(1200/1201)을 우선 적용한다.
  if (desktopMinToken >= 1500 || chipMaxToken >= 1500) {
    return {
      chipMaxPx: FEED_TAG_RAIL_CHIP_MAX_DEFAULT_PX,
      desktopMinPx: FEED_TAG_RAIL_DESKTOP_MIN_DEFAULT_PX,
    }
  }

  return {
    chipMaxPx: chipMaxToken,
    desktopMinPx: desktopMinToken,
  }
}

const railBreakpoint = resolveRailBreakpoint()

export const MOBILE_TOUCH_TARGET_MIN_PX = asFiniteNumber(touchTokens.mobileMinTargetPx, 34)
export const FEED_CHIP_GAP_PX = asFiniteNumber(feedTokens.chipGapPx, 6)
export const FEED_SEARCH_FIELD_MIN_HEIGHT_PX = asFiniteNumber(feedTokens.searchFieldMinHeightPx, 36)

// 레일 토큰은 캐시/패키지 드리프트로 누락될 수 있어 피드 컴포넌트에서 항상 fallback을 둔다.
export const FEED_TAG_RAIL_CHIP_MAX_PX = railBreakpoint.chipMaxPx
export const FEED_TAG_RAIL_DESKTOP_MIN_PX = railBreakpoint.desktopMinPx
export const FEED_TAG_RAIL_WIDTH_PX = asFiniteNumber(railTokens.widthPx, 184)
export const FEED_TAG_RAIL_OFFSET_MIN_PX = asFiniteNumber(railTokens.offsetMinPx, -216)
export const FEED_TAG_RAIL_OFFSET_MAX_PX = asFiniteNumber(railTokens.offsetMaxPx, -56)
export const FEED_TAG_RAIL_OFFSET_ANCHOR_PX = asFiniteNumber(railTokens.offsetAnchorPx, 584)
