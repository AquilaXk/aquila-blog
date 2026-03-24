import { uiTokens } from "@shared/ui-tokens"

type FeedRailTokens = {
  chipMaxWidthPx?: number
  desktopMinWidthPx?: number
  widthPx?: number
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

export const MOBILE_TOUCH_TARGET_MIN_PX = asFiniteNumber(touchTokens.mobileMinTargetPx, 34)
export const FEED_CHIP_GAP_PX = asFiniteNumber(feedTokens.chipGapPx, 6)
export const FEED_SEARCH_FIELD_MIN_HEIGHT_PX = asFiniteNumber(feedTokens.searchFieldMinHeightPx, 36)

// 레일 토큰 누락에만 fallback을 적용하고, 임계값 보정 해킹은 사용하지 않는다.
export const FEED_TAG_RAIL_CHIP_MAX_PX = asFiniteNumber(
  railTokens.chipMaxWidthPx,
  FEED_TAG_RAIL_CHIP_MAX_DEFAULT_PX
)
export const FEED_TAG_RAIL_DESKTOP_MIN_PX = asFiniteNumber(
  railTokens.desktopMinWidthPx,
  FEED_TAG_RAIL_DESKTOP_MIN_DEFAULT_PX
)
export const FEED_TAG_RAIL_WIDTH_PX = asFiniteNumber(railTokens.widthPx, 184)
