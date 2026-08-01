import {
  type RefObject,
  type UIEvent as ReactUIEvent,
  type WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useRef,
} from "react"
import {
  collectMarkdownHeadings,
  mapScrollFocusBetweenAnchors,
  type ScrollAnchor,
  type ScrollRange,
} from "./markdownEditorScrollSyncModel"
import { getWheelDeltaYPixels } from "./markdownEditorToolbarModel"

type UseMarkdownEditorScrollSyncArgs = {
  textareaRef: RefObject<HTMLTextAreaElement | null>
  previewScrollRef: RefObject<HTMLDivElement | null>
}

type ScrollMeasurement = {
  anchors: ScrollAnchor[]
  range: ScrollRange
}

type SourceMeasurementCache = ScrollMeasurement & {
  value: string
  layoutSignature: string
}

type PreviewMeasurementCache = ScrollMeasurement & {
  root: HTMLElement
  layoutSignature: string
}

type ProgrammaticScrollTarget = "write" | "preview"

const SCROLL_FOCUS_RATIO = 0.25
const PREVIEW_HEADING_SELECTOR = ".aq-markdown h1, .aq-markdown h2, .aq-markdown h3, .aq-markdown h4, .aq-markdown h5, .aq-markdown h6"

const parsePixelValue = (value: string) => Number.parseFloat(value) || 0
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max))

const createSourceMeasurement = (textarea: HTMLTextAreaElement): ScrollMeasurement => {
  const headings = collectMarkdownHeadings(textarea.value)
  const style = window.getComputedStyle(textarea)
  const mirror = document.createElement("div")
  const rect = textarea.getBoundingClientRect()

  Object.assign(mirror.style, {
    position: "fixed",
    inset: "0 auto auto -100000px",
    visibility: "hidden",
    pointerEvents: "none",
    width: `${rect.width}px`,
    boxSizing: style.boxSizing,
    paddingTop: style.paddingTop,
    paddingRight: style.paddingRight,
    paddingBottom: style.paddingBottom,
    paddingLeft: style.paddingLeft,
    borderTopWidth: style.borderTopWidth,
    borderRightWidth: style.borderRightWidth,
    borderBottomWidth: style.borderBottomWidth,
    borderLeftWidth: style.borderLeftWidth,
    borderStyle: "solid",
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    fontStyle: style.fontStyle,
    lineHeight: style.lineHeight,
    letterSpacing: style.letterSpacing,
    whiteSpace: "pre-wrap",
    overflowWrap: style.overflowWrap,
    wordBreak: style.wordBreak,
    tabSize: style.tabSize,
  })

  const anchorElements: Array<{ key: string; element: HTMLSpanElement }> = []
  let cursor = 0
  for (const heading of headings) {
    mirror.append(document.createTextNode(textarea.value.slice(cursor, heading.offset)))
    const anchor = document.createElement("span")
    anchor.style.display = "inline-block"
    anchor.style.width = "0"
    anchor.style.height = "0"
    anchor.style.verticalAlign = "top"
    mirror.append(anchor)
    anchorElements.push({ key: heading.key, element: anchor })
    cursor = heading.offset
  }
  mirror.append(document.createTextNode(textarea.value.slice(cursor) || "\u200b"))
  document.body.append(mirror)

  const paddingTop = parsePixelValue(style.paddingTop)
  const paddingBottom = parsePixelValue(style.paddingBottom)
  const measurement = {
    anchors: anchorElements.map(({ key, element }) => ({ key, position: element.offsetTop })),
    range: {
      start: paddingTop,
      end: Math.max(paddingTop, mirror.scrollHeight - paddingBottom),
    },
  }

  mirror.remove()
  return measurement
}

const createPreviewMeasurement = (preview: HTMLElement, root: HTMLElement): ScrollMeasurement => {
  const previewRect = preview.getBoundingClientRect()
  const rootRect = root.getBoundingClientRect()
  const rootStart = rootRect.top - previewRect.top + preview.scrollTop
  const occurrences = new Map<string, number>()

  const anchors = Array.from(preview.querySelectorAll<HTMLElement>(PREVIEW_HEADING_SELECTOR)).flatMap((heading) => {
    const level = Number.parseInt(heading.tagName.slice(1), 10)
    const text = heading.textContent?.replace(/\s+/g, " ").trim() ?? ""
    if (!text || !Number.isFinite(level)) return []

    const occurrenceKey = `${level}:${text}`
    const occurrence = occurrences.get(occurrenceKey) ?? 0
    occurrences.set(occurrenceKey, occurrence + 1)
    const rect = heading.getBoundingClientRect()
    return [{
      key: `${occurrenceKey}:${occurrence}`,
      position: rect.top - previewRect.top + preview.scrollTop,
    }]
  })

  return {
    anchors,
    range: {
      start: rootStart,
      end: Math.max(rootStart, rootStart + root.scrollHeight),
    },
  }
}

const mapScrollTop = ({
  source,
  target,
  sourceMeasurement,
  targetMeasurement,
}: {
  source: HTMLElement
  target: HTMLElement
  sourceMeasurement: ScrollMeasurement
  targetMeasurement: ScrollMeasurement
}) => {
  const sourceFocus = source.scrollTop + source.clientHeight * SCROLL_FOCUS_RATIO
  const targetFocus = mapScrollFocusBetweenAnchors({
    sourceFocus,
    sourceAnchors: sourceMeasurement.anchors,
    targetAnchors: targetMeasurement.anchors,
    sourceRange: sourceMeasurement.range,
    targetRange: targetMeasurement.range,
  })
  const targetMax = Math.max(0, target.scrollHeight - target.clientHeight)
  return clamp(targetFocus - target.clientHeight * SCROLL_FOCUS_RATIO, 0, targetMax)
}

export const useMarkdownEditorScrollSync = ({
  textareaRef,
  previewScrollRef,
}: UseMarkdownEditorScrollSyncArgs) => {
  const sourceMeasurementCacheRef = useRef<SourceMeasurementCache | null>(null)
  const previewMeasurementCacheRef = useRef<PreviewMeasurementCache | null>(null)
  const programmaticTargetRef = useRef<ProgrammaticScrollTarget | null>(null)
  const releaseFrameRef = useRef<number | null>(null)

  useEffect(() => () => {
    if (releaseFrameRef.current !== null) window.cancelAnimationFrame(releaseFrameRef.current)
  }, [])

  const getSourceMeasurement = useCallback((textarea: HTMLTextAreaElement) => {
    const style = window.getComputedStyle(textarea)
    const layoutSignature = [
      textarea.clientWidth,
      style.fontFamily,
      style.fontSize,
      style.fontWeight,
      style.lineHeight,
      style.letterSpacing,
      style.paddingTop,
      style.paddingRight,
      style.paddingBottom,
      style.paddingLeft,
      style.overflowWrap,
      style.wordBreak,
      style.tabSize,
    ].join(":")
    const cached = sourceMeasurementCacheRef.current
    if (cached?.value === textarea.value && cached.layoutSignature === layoutSignature) return cached

    const measurement = createSourceMeasurement(textarea)
    const next = { ...measurement, value: textarea.value, layoutSignature }
    sourceMeasurementCacheRef.current = next
    return next
  }, [])

  const getPreviewMeasurement = useCallback((preview: HTMLElement) => {
    const root = preview.querySelector<HTMLElement>(".aq-markdown")
    if (!root) return null

    const headingCount = preview.querySelectorAll(PREVIEW_HEADING_SELECTOR).length
    const layoutSignature = [
      preview.clientWidth,
      preview.scrollHeight,
      root.scrollHeight,
      root.textContent?.length ?? 0,
      headingCount,
    ].join(":")
    const cached = previewMeasurementCacheRef.current
    if (cached?.root === root && cached.layoutSignature === layoutSignature) return cached

    const measurement = createPreviewMeasurement(preview, root)
    const next = { ...measurement, root, layoutSignature }
    previewMeasurementCacheRef.current = next
    return next
  }, [])

  const setProgrammaticScroll = useCallback((
    targetKind: ProgrammaticScrollTarget,
    target: HTMLElement,
    nextScrollTop: number
  ) => {
    if (Math.abs(target.scrollTop - nextScrollTop) < 1) return

    if (releaseFrameRef.current !== null) window.cancelAnimationFrame(releaseFrameRef.current)
    programmaticTargetRef.current = targetKind
    target.scrollTop = nextScrollTop
    releaseFrameRef.current = window.requestAnimationFrame(() => {
      if (programmaticTargetRef.current === targetKind) programmaticTargetRef.current = null
      releaseFrameRef.current = null
    })
  }, [])

  const handleWriteScroll = useCallback(
    (event: ReactUIEvent<HTMLTextAreaElement>) => {
      if (programmaticTargetRef.current === "write") return

      const preview = previewScrollRef.current
      if (!preview) return
      const sourceMeasurement = getSourceMeasurement(event.currentTarget)
      const targetMeasurement = getPreviewMeasurement(preview)
      if (!targetMeasurement) return

      setProgrammaticScroll(
        "preview",
        preview,
        mapScrollTop({
          source: event.currentTarget,
          target: preview,
          sourceMeasurement,
          targetMeasurement,
        })
      )
    },
    [getPreviewMeasurement, getSourceMeasurement, previewScrollRef, setProgrammaticScroll]
  )

  const handlePreviewScroll = useCallback(
    (event: ReactUIEvent<HTMLElement>) => {
      if (programmaticTargetRef.current === "preview") return

      const textarea = textareaRef.current
      if (!textarea) return
      const sourceMeasurement = getPreviewMeasurement(event.currentTarget)
      if (!sourceMeasurement) return
      const targetMeasurement = getSourceMeasurement(textarea)

      setProgrammaticScroll(
        "write",
        textarea,
        mapScrollTop({
          source: event.currentTarget,
          target: textarea,
          sourceMeasurement,
          targetMeasurement,
        })
      )
    },
    [getPreviewMeasurement, getSourceMeasurement, setProgrammaticScroll, textareaRef]
  )

  const handlePreviewWheel = useCallback((event: ReactWheelEvent<HTMLElement>) => {
    if (event.deltaY === 0) return

    const preview = event.currentTarget
    const deltaYPixels = getWheelDeltaYPixels(event, preview)
    const maxScrollTop = preview.scrollHeight - preview.clientHeight
    const nextScrollTop = preview.scrollTop + deltaYPixels
    if (nextScrollTop >= 0 && nextScrollTop <= maxScrollTop) return

    event.preventDefault()

    const clampedScrollTop = Math.max(0, Math.min(nextScrollTop, maxScrollTop))
    const remainingDeltaY = nextScrollTop - clampedScrollTop
    preview.scrollTop = clampedScrollTop
    if (remainingDeltaY === 0) return

    window.scrollBy({
      top: remainingDeltaY,
    })
  }, [])

  return { handleWriteScroll, handlePreviewScroll, handlePreviewWheel }
}
