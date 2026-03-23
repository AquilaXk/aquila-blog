const uiTokens = {
  touch: {
    mobileMinTargetPx: 34,
  },
  feed: {
    chipGapPx: 6,
    searchFieldMinHeightPx: 36,
    rail: {
      chipMaxWidthPx: 1519,
      desktopMinWidthPx: 1520,
      widthPx: 184,
      offsetMinPx: -216,
      offsetMaxPx: -56,
      offsetAnchorPx: 584,
    },
    card: {
      titleLineHeight: 1.46,
      summaryLineHeight: 1.54,
      summaryLines: 3,
      metaFontSizeRem: 0.75,
    },
  },
}

const MOBILE_TOUCH_TARGET_MIN_PX = uiTokens.touch.mobileMinTargetPx
const FEED_CHIP_GAP_PX = uiTokens.feed.chipGapPx
const FEED_SEARCH_FIELD_MIN_HEIGHT_PX = uiTokens.feed.searchFieldMinHeightPx
const FEED_TAG_RAIL_CHIP_MAX_PX = uiTokens.feed.rail.chipMaxWidthPx
const FEED_TAG_RAIL_DESKTOP_MIN_PX = uiTokens.feed.rail.desktopMinWidthPx
const FEED_TAG_RAIL_WIDTH_PX = uiTokens.feed.rail.widthPx
const FEED_TAG_RAIL_OFFSET_MIN_PX = uiTokens.feed.rail.offsetMinPx
const FEED_TAG_RAIL_OFFSET_MAX_PX = uiTokens.feed.rail.offsetMaxPx
const FEED_TAG_RAIL_OFFSET_ANCHOR_PX = uiTokens.feed.rail.offsetAnchorPx
const FEED_CARD_TITLE_LINE_HEIGHT = uiTokens.feed.card.titleLineHeight
const FEED_CARD_SUMMARY_LINE_HEIGHT = uiTokens.feed.card.summaryLineHeight
const FEED_CARD_SUMMARY_LINES = uiTokens.feed.card.summaryLines
const FEED_CARD_META_FONT_SIZE_REM = uiTokens.feed.card.metaFontSizeRem

module.exports = {
  uiTokens,
  MOBILE_TOUCH_TARGET_MIN_PX,
  FEED_CHIP_GAP_PX,
  FEED_SEARCH_FIELD_MIN_HEIGHT_PX,
  FEED_TAG_RAIL_CHIP_MAX_PX,
  FEED_TAG_RAIL_DESKTOP_MIN_PX,
  FEED_TAG_RAIL_WIDTH_PX,
  FEED_TAG_RAIL_OFFSET_MIN_PX,
  FEED_TAG_RAIL_OFFSET_MAX_PX,
  FEED_TAG_RAIL_OFFSET_ANCHOR_PX,
  FEED_CARD_TITLE_LINE_HEIGHT,
  FEED_CARD_SUMMARY_LINE_HEIGHT,
  FEED_CARD_SUMMARY_LINES,
  FEED_CARD_META_FONT_SIZE_REM,
}
