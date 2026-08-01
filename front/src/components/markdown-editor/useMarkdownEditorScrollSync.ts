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
  createSourceMirrorStyle,
  mapScrollFocusBetweenAnchors,
  type ScrollAnchor,
  type ScrollRange,
} from "./markdownEditorScrollSyncModel"
import { getWheelDeltaYPixels } from "./markdownEditorToolbarModel"

type UseMarkdownEditorScrollSyncArgs = {
  textareaRef: RefObject<HTMLTextAreaElement | null>
  previewScrollRef: RefObject<HTMLDivElement | null>
  previewContent: string
  splitActive: boolean
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

type ProgrammaticScroll = {
  element: HTMLElement
  scrollTop: number
}

const SCROLL_FOCUS_RATIO = 0.25
const PROGRAMMATIC_SCROLL_TOLERANCE_PX = 2
const PROGRAMMATIC_SCROLL_RELEASE_MS = 96
const PREVIEW_CONTENT_SELECTOR = "[data-testid='markdown-editor-preview-scroll']"
const PREVIEW_HEADING_SELECTOR = ".aq-markdown h1, .aq-markdown h2, .aq-markdown h3, .aq-markdown h4, .aq-markdown h5, .aq-markdown h6"

const ZERO_WIDTH_SPACE = String.fromCharCode(0x200b)

const parsePixelValue = (value: string) => Number.parseFloat(value) || 0
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max))

const createSourceMeasurement = (
  textarea: HTMLTextAreaElement,
  mirror: HTMLDivElement
): ScrollMeasurement => {
  const headings = collectMarkdownHeadings(textarea.value)
  const style = window.getComputedStyle(textarea)

  Object.assign(
    mirror.style,
    createSourceMirrorStyle({
      clientWidth: textarea.clientWidth,
      paddingTop: style.paddingTop,
      paddingRight: style.paddingRight,
      paddingBottom: style.paddingBottom,
      paddingLeft: style.paddingLeft,
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      fontStyle: style.fontStyle,
      lineHeight: style.lineHeight,
      letterSpacing: style.letterSpacing,
      overflowWrap: style.overflowWrap,
      wordBreak: style.wordBreak,
      tabSize: style.tabSize,
    })
  )

  const anchorElements: Array<{ key: string; element: HTMLSpanElement }> = []
  const nodes: Node[] = []
  let cursor = 0
  for (const heading of headings) {
    nodes.push(document.createTextNode(textarea.value.slice(cursor, heading.offset)))
    const anchor = document.createElement("span")
    anchor.style.display = "inline-block"
    anchor.style.width = "0"
    anchor.style.height = "0"
    anchor.style.verticalAlign = "top"
    nodes.push(anchor)
    anchorElements.push({ key: heading.key, element: anchor })
    cursor = heading.offset
  }
  nodes.push(document.createTextNode(textarea.value.slice(cursor) || ZERO_WIDTH_SPACE))
  mirror.replaceChildren(...nodes)

  const paddingTop = parsePixelValue(style.paddingTop)
  const paddingBottom = parsePixelValue(style.paddingBottom)

  return {
    anchors: anchorElements.map(({ key, element }) => ({ key, position: element.offsetTop })),
    range: {
      start: paddingTop,
      end: Math.max(paddingTop, mirror.scrollHeight - paddingBottom),
    },
  }
}

const createPreviewMeasurement = (
  preview: HTMLElement,
  root: HTMLElement,
  content: HTMLElement
): ScrollMeasurement => {
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

  // source가 `mirror.scrollHeight - paddingBottom`을 쓰는 것과 같은 형태로 본문 끝을 잡아
  // 마지막 heading 이후 tail 보간이 한쪽 padding만큼 어긋나지 않게 한다.
  const contentPaddingBottom = parsePixelValue(window.getComputedStyle(content).paddingBottom)

  return {
    anchors,
    range: {
      start: rootStart,
      end: Math.max(rootStart, preview.scrollHeight - contentPaddingBottom),
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
  // 문서 상단에서는 초점을 viewport 상단까지 끌어올려 두 pane이 함께 본문 시작에 정렬되게 한다.
  const focusOffset = Math.min(source.clientHeight * SCROLL_FOCUS_RATIO, Math.max(0, source.scrollTop))
  const sourceFocus = clamp(
    source.scrollTop + focusOffset,
    Math.min(sourceMeasurement.range.start, sourceMeasurement.range.end),
    Math.max(sourceMeasurement.range.start, sourceMeasurement.range.end)
  )
  // 같은 heading이 두 pane에서 같은 화면 높이에 오도록 source의 viewport offset을 그대로 쓴다.
  const viewportOffset = sourceFocus - source.scrollTop
  const targetFocus = mapScrollFocusBetweenAnchors({
    sourceFocus,
    sourceAnchors: sourceMeasurement.anchors,
    targetAnchors: targetMeasurement.anchors,
    sourceRange: sourceMeasurement.range,
    targetRange: targetMeasurement.range,
  })
  const targetMax = Math.max(0, target.scrollHeight - target.clientHeight)
  return clamp(targetFocus - viewportOffset, 0, targetMax)
}

export const useMarkdownEditorScrollSync = ({
  textareaRef,
  previewScrollRef,
  previewContent,
  splitActive,
}: UseMarkdownEditorScrollSyncArgs) => {
  const sourceMeasurementCacheRef = useRef<SourceMeasurementCache | null>(null)
  const previewMeasurementCacheRef = useRef<PreviewMeasurementCache | null>(null)
  const programmaticScrollRef = useRef<ProgrammaticScroll | null>(null)
  const releaseTimerRef = useRef<number | null>(null)
  const mirrorRef = useRef<HTMLDivElement | null>(null)
  const lastScrollOwnerRef = useRef<ProgrammaticScrollTarget>("write")
  const resyncFrameRef = useRef<number | null>(null)

  useEffect(() => () => {
    if (releaseTimerRef.current !== null) window.clearTimeout(releaseTimerRef.current)
    if (resyncFrameRef.current !== null) window.cancelAnimationFrame(resyncFrameRef.current)
    mirrorRef.current?.remove()
    mirrorRef.current = null
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

    // mirror를 재사용해 타이핑 중 매번 element를 새로 붙였다 떼는 강제 레이아웃을 피한다.
    let mirror = mirrorRef.current
    if (!mirror) {
      mirror = document.createElement("div")
      mirror.setAttribute("aria-hidden", "true")
      document.body.append(mirror)
      mirrorRef.current = mirror
    }

    const measurement = createSourceMeasurement(textarea, mirror)
    const next = { ...measurement, value: textarea.value, layoutSignature }
    sourceMeasurementCacheRef.current = next
    return next
  }, [])

  const getPreviewMeasurement = useCallback((preview: HTMLElement) => {
    const root = preview.querySelector<HTMLElement>(".aq-markdown")
    const contentElement = preview.querySelector<HTMLElement>(PREVIEW_CONTENT_SELECTOR)
    if (!root || !contentElement) return null

    // heading text까지 signature에 넣어야 `## Alpha` → `## Bravo`처럼 길이·높이가 그대로인 편집에서도
    // 옛 anchor key가 남지 않는다. 전체 textContent를 순회하지 않으므로 scroll 비용은 heading 수에 비례한다.
    const headings = preview.querySelectorAll<HTMLElement>(PREVIEW_HEADING_SELECTOR)
    const headingSignature = Array.from(headings, (heading) => `${heading.tagName}:${heading.textContent ?? ""}`)
      .join(" ")
    const layoutSignature = [
      preview.clientWidth,
      preview.scrollHeight,
      root.scrollHeight,
      headingSignature,
    ].join(":")
    const cached = previewMeasurementCacheRef.current
    if (cached?.root === root && cached.layoutSignature === layoutSignature) return cached

    const measurement = createPreviewMeasurement(preview, root, contentElement)
    const next = { ...measurement, root, layoutSignature }
    previewMeasurementCacheRef.current = next
    return next
  }, [])

  const clearProgrammaticScroll = useCallback(() => {
    programmaticScrollRef.current = null
    if (releaseTimerRef.current !== null) {
      window.clearTimeout(releaseTimerRef.current)
      releaseTimerRef.current = null
    }
  }, [])

  const setProgrammaticScroll = useCallback((target: HTMLElement, nextScrollTop: number) => {
    if (Math.abs(target.scrollTop - nextScrollTop) < 1) return

    clearProgrammaticScroll()
    target.scrollTop = nextScrollTop
    programmaticScrollRef.current = { element: target, scrollTop: target.scrollTop }
    releaseTimerRef.current = window.setTimeout(clearProgrammaticScroll, PROGRAMMATIC_SCROLL_RELEASE_MS)
  }, [clearProgrammaticScroll])

  /**
   * 우리가 만든 scroll인지 값으로 판정한다. 같은 frame 안에서 사용자가 반대 pane을 스크롤해도
   * scrollTop이 기록값과 달라지므로 입력이 조용히 버려지지 않는다.
   */
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

  const syncFromWrite = useCallback(
    (textarea: HTMLTextAreaElement) => {
      const preview = previewScrollRef.current
      if (!preview) return
      const targetMeasurement = getPreviewMeasurement(preview)
      if (!targetMeasurement) return

      setProgrammaticScroll(
        preview,
        mapScrollTop({
          source: textarea,
          target: preview,
          sourceMeasurement: getSourceMeasurement(textarea),
          targetMeasurement,
        })
      )
    },
    [getPreviewMeasurement, getSourceMeasurement, previewScrollRef, setProgrammaticScroll]
  )

  const syncFromPreview = useCallback(
    (preview: HTMLElement) => {
      const textarea = textareaRef.current
      if (!textarea) return
      const sourceMeasurement = getPreviewMeasurement(preview)
      if (!sourceMeasurement) return

      setProgrammaticScroll(
        textarea,
        mapScrollTop({
          source: preview,
          target: textarea,
          sourceMeasurement,
          targetMeasurement: getSourceMeasurement(textarea),
        })
      )
    },
    [getPreviewMeasurement, getSourceMeasurement, setProgrammaticScroll, textareaRef]
  )

  const resyncFromLastScrollOwner = useCallback(() => {
    const textarea = textareaRef.current
    const preview = previewScrollRef.current
    if (!textarea || !preview) return

    if (lastScrollOwnerRef.current === "preview") {
      syncFromPreview(preview)
      return
    }
    syncFromWrite(textarea)
  }, [previewScrollRef, syncFromPreview, syncFromWrite, textareaRef])

  const scheduleResync = useCallback(() => {
    if (resyncFrameRef.current !== null) window.cancelAnimationFrame(resyncFrameRef.current)
    resyncFrameRef.current = window.requestAnimationFrame(() => {
      resyncFrameRef.current = null
      resyncFromLastScrollOwner()
    })
  }, [resyncFromLastScrollOwner])

  const handleWriteScroll = useCallback(
    (event: ReactUIEvent<HTMLTextAreaElement>) => {
      if (consumeProgrammaticScroll(event.currentTarget)) return

      lastScrollOwnerRef.current = "write"
      syncFromWrite(event.currentTarget)
    },
    [consumeProgrammaticScroll, syncFromWrite]
  )

  const handlePreviewScroll = useCallback(
    (event: ReactUIEvent<HTMLElement>) => {
      if (consumeProgrammaticScroll(event.currentTarget)) return

      lastScrollOwnerRef.current = "preview"
      syncFromPreview(event.currentTarget)
    },
    [consumeProgrammaticScroll, syncFromPreview]
  )

  // 이미지 load·Mermaid 렌더·resize처럼 scroll 없이 높이만 바뀌는 경로에서 재정렬한다.
  // 관찰 대상의 크기는 건드리지 않고 캐시만 무효화해 ResizeObserver 루프를 만들지 않는다.
  useEffect(() => {
    if (!splitActive || typeof ResizeObserver === "undefined") return

    const textarea = textareaRef.current
    const preview = previewScrollRef.current
    const previewContentElement = preview?.querySelector<HTMLElement>(PREVIEW_CONTENT_SELECTOR)
    if (!textarea || !previewContentElement) return

    const observer = new ResizeObserver(() => {
      sourceMeasurementCacheRef.current = null
      previewMeasurementCacheRef.current = null
      scheduleResync()
    })
    observer.observe(previewContentElement)
    observer.observe(textarea)

    return () => observer.disconnect()
  }, [previewScrollRef, scheduleResync, splitActive, textareaRef])

  // preview 렌더가 커밋된 뒤 재정렬한다. scroll 없이 본문만 바뀌는 편집에서 anchor가 어긋난 채 남지 않는다.
  useEffect(() => {
    if (!splitActive) return
    previewMeasurementCacheRef.current = null
    scheduleResync()
  }, [previewContent, scheduleResync, splitActive])

  useEffect(() => {
    sourceMeasurementCacheRef.current = null
    previewMeasurementCacheRef.current = null

    if (splitActive) {
      lastScrollOwnerRef.current = "write"
      const textarea = textareaRef.current
      if (textarea) syncFromWrite(textarea)
      return
    }

    // Preview 단독 모드는 공개 제목·요약 헤더부터 다시 보여준다.
    const preview = previewScrollRef.current
    if (preview) setProgrammaticScroll(preview, 0)
  }, [previewScrollRef, setProgrammaticScroll, splitActive, syncFromWrite, textareaRef])

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
