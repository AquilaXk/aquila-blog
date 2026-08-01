import {
  type RefObject,
  type UIEvent as ReactUIEvent,
  type WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useRef,
} from "react"
import {
  extractMarkdownHeadingLineIndexes,
  interpolateScrollTopByAnchors,
  type ScrollAnchorPair,
} from "./markdownEditorScrollSyncModel"
import { getWheelDeltaYPixels } from "./markdownEditorToolbarModel"

type UseMarkdownEditorScrollSyncArgs = {
  textareaRef: RefObject<HTMLTextAreaElement | null>
  previewScrollRef: RefObject<HTMLDivElement | null>
}

type ScrollSyncLayout = {
  markdown: string
  textareaClientWidth: number
  textareaScrollHeight: number
  previewClientWidth: number
  previewScrollHeight: number
  previewBodyStart: number
  previewHeadingCount: number
  writeToPreviewAnchors: ScrollAnchorPair[]
  previewToWriteAnchors: ScrollAnchorPair[]
}

type ProgrammaticScroll = {
  element: HTMLElement
  scrollTop: number
}

const PROGRAMMATIC_SCROLL_TOLERANCE_PX = 2
const PROGRAMMATIC_SCROLL_TIMEOUT_MS = 96

const parsePixelValue = (value: string) => {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const clampScrollTop = (element: HTMLElement, scrollTop: number) =>
  Math.max(0, Math.min(scrollTop, Math.max(0, element.scrollHeight - element.clientHeight)))

const measureTextareaHeadingScrollTops = (
  textarea: HTMLTextAreaElement,
  headingLineIndexes: number[]
) => {
  if (headingLineIndexes.length === 0) return []

  const computedStyle = window.getComputedStyle(textarea)
  const mirror = document.createElement("div")
  const headingLineIndexSet = new Set(headingLineIndexes)
  const headingElements = new Map<number, HTMLSpanElement>()

  Object.assign(mirror.style, {
    position: "fixed",
    left: "-100000px",
    top: "0",
    width: `${textarea.clientWidth}px`,
    height: "auto",
    minHeight: "0",
    boxSizing: "border-box",
    visibility: "hidden",
    pointerEvents: "none",
    overflow: "visible",
    paddingTop: computedStyle.paddingTop,
    paddingRight: computedStyle.paddingRight,
    paddingBottom: computedStyle.paddingBottom,
    paddingLeft: computedStyle.paddingLeft,
    border: "0",
    fontFamily: computedStyle.fontFamily,
    fontSize: computedStyle.fontSize,
    fontWeight: computedStyle.fontWeight,
    fontStyle: computedStyle.fontStyle,
    fontVariant: computedStyle.fontVariant,
    lineHeight: computedStyle.lineHeight,
    letterSpacing: computedStyle.letterSpacing,
    textTransform: computedStyle.textTransform,
    textIndent: computedStyle.textIndent,
    textAlign: computedStyle.textAlign,
    whiteSpace: computedStyle.whiteSpace,
    overflowWrap: computedStyle.overflowWrap,
    wordBreak: computedStyle.wordBreak,
    tabSize: computedStyle.tabSize,
    direction: computedStyle.direction,
  })
  mirror.setAttribute("aria-hidden", "true")

  const lines = textarea.value.split(/\r?\n/)
  lines.forEach((line, lineIndex) => {
    const lineElement = document.createElement("span")
    lineElement.textContent = line || "\u200b"
    mirror.appendChild(lineElement)
    if (headingLineIndexSet.has(lineIndex)) headingElements.set(lineIndex, lineElement)
    if (lineIndex < lines.length - 1) mirror.appendChild(document.createTextNode("\n"))
  })

  document.body.appendChild(mirror)
  const mirrorRect = mirror.getBoundingClientRect()
  const contentStartTop = mirrorRect.top + parsePixelValue(computedStyle.paddingTop)
  const scrollTops = headingLineIndexes.map((lineIndex) => {
    const headingElement = headingElements.get(lineIndex)
    return headingElement ? Math.max(0, headingElement.getBoundingClientRect().top - contentStartTop) : 0
  })
  mirror.remove()

  return scrollTops
}

export const useMarkdownEditorScrollSync = ({
  textareaRef,
  previewScrollRef,
}: UseMarkdownEditorScrollSyncArgs) => {
  const layoutCacheRef = useRef<ScrollSyncLayout | null>(null)
  const programmaticScrollRef = useRef<ProgrammaticScroll | null>(null)
  const programmaticScrollTimerRef = useRef<number | null>(null)
  const wasSplitRef = useRef(false)
  const lastScrollOwnerRef = useRef<"write" | "preview">("write")

  const clearProgrammaticScroll = useCallback(() => {
    programmaticScrollRef.current = null
    if (programmaticScrollTimerRef.current !== null) {
      window.clearTimeout(programmaticScrollTimerRef.current)
      programmaticScrollTimerRef.current = null
    }
  }, [])

  const setProgrammaticScrollTop = useCallback(
    (element: HTMLElement, requestedScrollTop: number) => {
      const nextScrollTop = clampScrollTop(element, requestedScrollTop)
      if (Math.abs(element.scrollTop - nextScrollTop) < 1) return

      clearProgrammaticScroll()
      programmaticScrollRef.current = { element, scrollTop: nextScrollTop }
      element.scrollTop = nextScrollTop
      programmaticScrollTimerRef.current = window.setTimeout(
        clearProgrammaticScroll,
        PROGRAMMATIC_SCROLL_TIMEOUT_MS
      )
    },
    [clearProgrammaticScroll]
  )

  const consumeProgrammaticScroll = useCallback(
    (element: HTMLElement) => {
      const pending = programmaticScrollRef.current
      if (!pending || pending.element !== element) return false
      if (Math.abs(element.scrollTop - pending.scrollTop) > PROGRAMMATIC_SCROLL_TOLERANCE_PX) return false

      clearProgrammaticScroll()
      return true
    },
    [clearProgrammaticScroll]
  )

  const resolveScrollSyncLayout = useCallback(() => {
    const textarea = textareaRef.current
    const preview = previewScrollRef.current
    if (!textarea || !preview) return null

    const previewRoot = preview.querySelector<HTMLElement>(".aq-markdown")
    if (!previewRoot) return null

    const previewRect = preview.getBoundingClientRect()
    const previewBodyElement =
      previewRoot.firstElementChild instanceof HTMLElement
        ? previewRoot.firstElementChild
        : previewRoot
    const previewBodyStart =
      previewBodyElement.getBoundingClientRect().top - previewRect.top + preview.scrollTop
    const previewHeadingElements = Array.from(
      previewRoot.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6")
    )
    const cachedLayout = layoutCacheRef.current

    if (
      cachedLayout &&
      cachedLayout.markdown === textarea.value &&
      cachedLayout.textareaClientWidth === textarea.clientWidth &&
      cachedLayout.textareaScrollHeight === textarea.scrollHeight &&
      cachedLayout.previewClientWidth === preview.clientWidth &&
      cachedLayout.previewScrollHeight === preview.scrollHeight &&
      Math.abs(cachedLayout.previewBodyStart - previewBodyStart) < 0.5 &&
      cachedLayout.previewHeadingCount === previewHeadingElements.length
    ) {
      return cachedLayout
    }

    const textareaStyle = window.getComputedStyle(textarea)
    const textareaPaddingTop = parsePixelValue(textareaStyle.paddingTop)
    const textareaMaxScrollTop = Math.max(0, textarea.scrollHeight - textarea.clientHeight)
    const previewMaxScrollTop = Math.max(0, preview.scrollHeight - preview.clientHeight)
    const previewBodyStartScrollTop = Math.max(
      0,
      Math.min(previewBodyStart - textareaPaddingTop, previewMaxScrollTop)
    )
    const headingLineIndexes = extractMarkdownHeadingLineIndexes(textarea.value)
    const textareaHeadingScrollTops = measureTextareaHeadingScrollTops(textarea, headingLineIndexes)
    const pairedHeadingCount = Math.min(
      textareaHeadingScrollTops.length,
      previewHeadingElements.length
    )
    const writeToPreviewAnchors: ScrollAnchorPair[] = [
      { sourceScrollTop: 0, targetScrollTop: previewBodyStartScrollTop },
    ]

    for (let index = 0; index < pairedHeadingCount; index += 1) {
      const previewHeading = previewHeadingElements[index]
      const previewHeadingScrollTop = Math.max(
        previewBodyStartScrollTop,
        Math.min(
          previewHeading.getBoundingClientRect().top -
            previewRect.top +
            preview.scrollTop -
            textareaPaddingTop,
          previewMaxScrollTop
        )
      )
      writeToPreviewAnchors.push({
        sourceScrollTop: Math.min(textareaHeadingScrollTops[index], textareaMaxScrollTop),
        targetScrollTop: previewHeadingScrollTop,
      })
    }

    if (textareaMaxScrollTop > 0.5) {
      writeToPreviewAnchors.push({
        sourceScrollTop: textareaMaxScrollTop,
        targetScrollTop: previewMaxScrollTop,
      })
    }

    const previewToWriteAnchors = writeToPreviewAnchors.map((anchor) => ({
      sourceScrollTop: anchor.targetScrollTop,
      targetScrollTop: anchor.sourceScrollTop,
    }))
    const nextLayout: ScrollSyncLayout = {
      markdown: textarea.value,
      textareaClientWidth: textarea.clientWidth,
      textareaScrollHeight: textarea.scrollHeight,
      previewClientWidth: preview.clientWidth,
      previewScrollHeight: preview.scrollHeight,
      previewBodyStart,
      previewHeadingCount: previewHeadingElements.length,
      writeToPreviewAnchors,
      previewToWriteAnchors,
    }
    layoutCacheRef.current = nextLayout
    return nextLayout
  }, [previewScrollRef, textareaRef])

  const syncFromWrite = useCallback(
    (textarea: HTMLTextAreaElement) => {
      const preview = previewScrollRef.current
      if (!preview) return

      const layout = resolveScrollSyncLayout()
      if (!layout) return
      lastScrollOwnerRef.current = "write"
      setProgrammaticScrollTop(
        preview,
        interpolateScrollTopByAnchors({
          sourceScrollTop: textarea.scrollTop,
          anchorPairs: layout.writeToPreviewAnchors,
        })
      )
    },
    [previewScrollRef, resolveScrollSyncLayout, setProgrammaticScrollTop]
  )

  const syncFromPreview = useCallback(
    (preview: HTMLElement) => {
      const textarea = textareaRef.current
      if (!textarea) return

      const layout = resolveScrollSyncLayout()
      if (!layout) return
      lastScrollOwnerRef.current = "preview"
      setProgrammaticScrollTop(
        textarea,
        interpolateScrollTopByAnchors({
          sourceScrollTop: preview.scrollTop,
          anchorPairs: layout.previewToWriteAnchors,
        })
      )
    },
    [resolveScrollSyncLayout, setProgrammaticScrollTop, textareaRef]
  )

  const handleWriteScroll = useCallback(
    (event: ReactUIEvent<HTMLTextAreaElement>) => {
      if (consumeProgrammaticScroll(event.currentTarget)) return
      syncFromWrite(event.currentTarget)
    },
    [consumeProgrammaticScroll, syncFromWrite]
  )

  const handlePreviewScroll = useCallback(
    (event: ReactUIEvent<HTMLElement>) => {
      if (consumeProgrammaticScroll(event.currentTarget)) return
      syncFromPreview(event.currentTarget)
    },
    [consumeProgrammaticScroll, syncFromPreview]
  )

  useEffect(() => {
    const textarea = textareaRef.current
    const preview = previewScrollRef.current
    const isSplit = Boolean(textarea && preview)

    if (isSplit && !wasSplitRef.current && textarea) {
      layoutCacheRef.current = null
      syncFromWrite(textarea)
    } else if (!isSplit && wasSplitRef.current && preview) {
      layoutCacheRef.current = null
      setProgrammaticScrollTop(preview, 0)
    }

    wasSplitRef.current = isSplit
  })

  useEffect(() => {
    const preview = previewScrollRef.current
    const previewContent = preview?.querySelector<HTMLElement>(
      "[data-testid='markdown-editor-preview-scroll']"
    )
    if (!preview || !previewContent || typeof ResizeObserver === "undefined") return

    let syncFrame = 0
    const observer = new ResizeObserver(() => {
      layoutCacheRef.current = null
      window.cancelAnimationFrame(syncFrame)
      syncFrame = window.requestAnimationFrame(() => {
        if (lastScrollOwnerRef.current === "preview") {
          syncFromPreview(preview)
          return
        }
        const textarea = textareaRef.current
        if (textarea) syncFromWrite(textarea)
      })
    })
    observer.observe(previewContent)

    return () => {
      observer.disconnect()
      window.cancelAnimationFrame(syncFrame)
    }
  })

  useEffect(
    () => () => {
      clearProgrammaticScroll()
    },
    [clearProgrammaticScroll]
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
