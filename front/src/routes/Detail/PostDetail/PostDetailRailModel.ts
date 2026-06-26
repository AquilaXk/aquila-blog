export const RIGHT_RAIL_HYBRID_MIN_VIEWPORT_PX = 1101
export const LEFT_RAIL_HYBRID_MIN_VIEWPORT_PX = 821

const DETAIL_RAIL_GAP_FROM_HEADER_PX = 20
const STICKY_BLOCKING_OVERFLOW_VALUES = new Set(["auto", "scroll", "hidden", "clip"])

export type HybridRailMetrics = {
  enabled: boolean
  left: number
  width: number
  railTopDoc: number
  articleBottomDoc: number
  innerHeight: number
  stickyBlocked: boolean
}

const getHeaderHeightFromCssVar = () => {
  if (typeof window === "undefined" || typeof document === "undefined") return 56
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--app-header-height")
  const parsed = Number.parseFloat(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 56
}

export const resolveRailTopOffset = () => getHeaderHeightFromCssVar() + DETAIL_RAIL_GAP_FROM_HEADER_PX

const hasStickyBlockingAncestor = (node: HTMLElement | null) => {
  if (typeof window === "undefined" || !node) return false
  let current = node.parentElement

  while (current && current !== document.body && current !== document.documentElement) {
    const style = window.getComputedStyle(current)
    if (
      STICKY_BLOCKING_OVERFLOW_VALUES.has(style.overflowY) ||
      STICKY_BLOCKING_OVERFLOW_VALUES.has(style.overflow)
    ) {
      return true
    }
    current = current.parentElement
  }

  return false
}

export const clearInlineRailStyle = (inner: HTMLElement | null) => {
  if (!inner) return
  inner.style.position = ""
  inner.style.top = ""
  inner.style.left = ""
  inner.style.width = ""
  inner.style.bottom = ""
  inner.style.transform = ""
}

export const measureHybridRail = (
  rail: HTMLElement | null,
  inner: HTMLElement | null,
  enabled: boolean,
  articleBottomDoc: number
): HybridRailMetrics => {
  if (!rail || !inner || !enabled) {
    return {
      enabled,
      left: 0,
      width: 0,
      railTopDoc: 0,
      articleBottomDoc: 0,
      innerHeight: 0,
      stickyBlocked: false,
    }
  }

  const railRect = rail.getBoundingClientRect()
  return {
    enabled,
    left: Math.round(railRect.left),
    width: Math.round(railRect.width),
    railTopDoc: window.scrollY + railRect.top,
    articleBottomDoc,
    innerHeight: inner.offsetHeight,
    stickyBlocked: hasStickyBlockingAncestor(rail),
  }
}

export const applyHybridRail = (inner: HTMLElement | null, metrics: HybridRailMetrics) => {
  if (!inner || !metrics.enabled || !metrics.stickyBlocked) {
    clearInlineRailStyle(inner)
    return
  }

  const topOffset = resolveRailTopOffset()
  const startFixedScrollY = metrics.railTopDoc - topOffset
  const endFixedScrollY = metrics.articleBottomDoc - topOffset - metrics.innerHeight

  if (metrics.width <= 0 || metrics.innerHeight <= 0 || endFixedScrollY <= startFixedScrollY) {
    clearInlineRailStyle(inner)
    return
  }

  if (window.scrollY < startFixedScrollY) {
    inner.style.position = "absolute"
    inner.style.top = "0px"
    inner.style.left = "0px"
    inner.style.width = "100%"
    inner.style.bottom = ""
    inner.style.transform = ""
    return
  }

  if (window.scrollY > endFixedScrollY) {
    const bottomTop = Math.max(0, metrics.articleBottomDoc - metrics.railTopDoc - metrics.innerHeight)
    inner.style.position = "absolute"
    inner.style.top = `${bottomTop}px`
    inner.style.left = "0px"
    inner.style.width = "100%"
    inner.style.bottom = ""
    inner.style.transform = ""
    return
  }

  inner.style.position = "fixed"
  inner.style.top = `${topOffset}px`
  inner.style.left = `${metrics.left}px`
  inner.style.width = `${metrics.width}px`
  inner.style.bottom = ""
  inner.style.transform = "translateZ(0)"
}
