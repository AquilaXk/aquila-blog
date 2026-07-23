import { applyMermaidSoftWrapHints, extractNormalizedMermaidSource } from "src/libs/markdown/mermaid"
import {
  DESKTOP_MERMAID_MIN_VIEWPORT_PX,
  MERMAID_COMPLEX_SCALE_CAP,
  MERMAID_DESKTOP_SAFE_MARGIN_PX,
  MERMAID_DESKTOP_WIDE_MAX_PX,
  MERMAID_EXPAND_THRESHOLD_PX,
  MERMAID_RENDER_TIMEOUT_MS,
  MERMAID_VIEWPORT_ROOT_MARGIN,
  buildMermaidCacheKey,
  estimateMermaidComplexity,
  isMermaidSource,
  readMermaidCache,
  writeMermaidCache,
} from "src/libs/markdown/mermaidRuntimeConfig"
import { openMermaidOverlay } from "src/libs/markdown/mermaidRuntimeOverlay"
import {
  createMermaidRenderTimeoutError,
  isMermaidRenderTimeoutError,
  isMermaidSyntaxError,
  isNegativeRectWidthError,
  renderMermaidErrorState,
  sanitizeRenderableMermaidSource,
  stabilizeMermaidSvgLabels,
  stripRiskyFlowchartDirectives,
} from "src/libs/markdown/mermaidRuntimeSanitize"
import type {
  DesktopWideLaneBounds,
  MermaidComplexityLevel,
  MermaidRuntimeInstance,
  MermaidRuntimePreset,
} from "src/libs/markdown/mermaidRuntimeTypes"

type MermaidRuntimeControllerOptions = {
  root: HTMLElement
  preset: MermaidRuntimePreset
  allowDesktopWideLane: boolean
  lazyViewport: boolean
  shouldLogMermaidWarnings: boolean
  getMermaid: () => Promise<MermaidRuntimeInstance>
  isDisposed: () => boolean
  retryTimers: Set<number>
  readParseWarning: () => string | null
  clearParseWarning: () => void
}

export const createMermaidRuntimeController = ({
  root,
  preset,
  allowDesktopWideLane,
  lazyViewport,
  shouldLogMermaidWarnings,
  getMermaid,
  isDisposed,
  retryTimers,
  readParseWarning,
  clearParseWarning,
}: MermaidRuntimeControllerOptions) => {
  let intersectionObserver: IntersectionObserver | null = null
  let cachedDesktopWideLaneBounds: DesktopWideLaneBounds | null | undefined
  let mermaidOverlayCleanup: (() => void) | null = null
  const loggedErrorSignatures = new Set<string>()
  const maxRetryCount = 6
  const retryBaseDelayMs = 150

  const resolveDesktopWideLaneBounds = (block: HTMLElement) => {
    if (!allowDesktopWideLane) return null
    if (cachedDesktopWideLaneBounds !== undefined) return cachedDesktopWideLaneBounds

    const detailLayout = block.closest<HTMLElement>(".detailLayout")
    const rightRail = detailLayout?.querySelector<HTMLElement>(".rightRail")
    if (!detailLayout || !rightRail || rightRail.offsetParent === null) {
      cachedDesktopWideLaneBounds = null
      return cachedDesktopWideLaneBounds
    }

    const leftRail = detailLayout.querySelector<HTMLElement>(".leftRail")
    cachedDesktopWideLaneBounds = {
      leftBound:
        leftRail && leftRail.offsetParent !== null
          ? leftRail.getBoundingClientRect().right + MERMAID_DESKTOP_SAFE_MARGIN_PX
          : MERMAID_DESKTOP_SAFE_MARGIN_PX,
      rightBound: rightRail.getBoundingClientRect().left - MERMAID_DESKTOP_SAFE_MARGIN_PX,
    }
    return cachedDesktopWideLaneBounds
  }

  const renderMermaidWithTimeout = async (
    mermaidInstance: MermaidRuntimeInstance,
    renderId: string,
    sourceToRender: string
  ) => {
    let timeoutId: number | null = null
    try {
      const timed = new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(() => {
          reject(createMermaidRenderTimeoutError())
        }, MERMAID_RENDER_TIMEOUT_MS)
      })
      return await Promise.race([
        Promise.resolve(mermaidInstance.render(renderId, sourceToRender)),
        timed,
      ])
    } finally {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }
    }
  }

  const renderSourceIntoBlock = async ({
    block,
    index,
    mermaid,
    sourceToRender,
    complexityLevel,
    visibleWidth,
    blockRect,
    desktopWideLaneBounds,
  }: {
    block: HTMLElement
    index: number
    mermaid: MermaidRuntimeInstance
    sourceToRender: string
    complexityLevel: MermaidComplexityLevel
    visibleWidth: number
    blockRect: DOMRect
    desktopWideLaneBounds: DesktopWideLaneBounds | null
  }) => {
    if (isDisposed() || !block.isConnected) return
    const isMobileViewport = window.matchMedia("(max-width: 768px)").matches
    const isDesktopViewport = window.matchMedia(
      `(min-width: ${DESKTOP_MERMAID_MIN_VIEWPORT_PX}px)`
    ).matches
    const containerWidth = Math.max(280, visibleWidth)
    const reserveHeight = Math.max(120, Math.ceil(blockRect.height))

    const stage = document.createElement("div")
    stage.className = "aq-mermaid-stage mermaid"
    stage.style.minWidth = `${containerWidth}px`
    stage.style.width = `${containerWidth}px`
    stage.style.minHeight = `${reserveHeight}px`
    block.style.minHeight = `${reserveHeight}px`
    block.innerHTML = ""
    block.appendChild(stage)

    const cacheKey = buildMermaidCacheKey(sourceToRender, preset.themeKey, allowDesktopWideLane)
    const cached = readMermaidCache(cacheKey)
    let renderedSvg = cached?.svg || ""

    if (!renderedSvg) {
      const renderId = `aq-mermaid-${index}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      clearParseWarning()
      const rendered = await renderMermaidWithTimeout(mermaid, renderId, sourceToRender)
      const parseWarning = readParseWarning()
      if (parseWarning) {
        throw new Error(parseWarning)
      }
      renderedSvg = rendered.svg
      writeMermaidCache(cacheKey, {
        svg: renderedSvg,
        complexity: complexityLevel,
      })
    }
    if (isDisposed() || !block.isConnected) return

    stage.innerHTML = renderedSvg

    const svgElement = stage.querySelector("svg")
    if (!svgElement) throw new Error("Mermaid SVG 생성 실패")
    stabilizeMermaidSvgLabels(svgElement)

    const viewBox = svgElement.getAttribute("viewBox") || ""
    const viewBoxValues = viewBox
      .split(/\s+/)
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value))
    const viewBoxWidth = viewBoxValues.length === 4 ? viewBoxValues[2] : NaN
    const viewBoxHeight = viewBoxValues.length === 4 ? viewBoxValues[3] : NaN
    const attrWidth = Number(svgElement.getAttribute("width"))
    const attrHeight = Number(svgElement.getAttribute("height"))
    const fallbackWidth = Number.isFinite(attrWidth) && attrWidth > 0 ? attrWidth : containerWidth
    const fallbackHeight =
      Number.isFinite(attrHeight) && attrHeight > 0
        ? attrHeight
        : Math.max(120, Math.round(fallbackWidth * 0.6))
    const intrinsicWidth =
      Number.isFinite(viewBoxWidth) && viewBoxWidth > 0 ? viewBoxWidth : Math.max(1, fallbackWidth)
    const intrinsicHeight =
      Number.isFinite(viewBoxHeight) && viewBoxHeight > 0
        ? viewBoxHeight
        : Math.max(1, fallbackHeight)
    const exceedsArticleWidth = intrinsicWidth > containerWidth + MERMAID_EXPAND_THRESHOLD_PX
    let maxDisplayWidth = containerWidth
    let wideBleedLeft = 0
    let wideBleedRight = 0

    if (isDesktopViewport && desktopWideLaneBounds && exceedsArticleWidth) {
      const safeLaneWidth = Math.max(
        containerWidth,
        Math.round(desktopWideLaneBounds.rightBound - desktopWideLaneBounds.leftBound)
      )
      const desiredWideWidth = Math.max(
        containerWidth,
        Math.min(intrinsicWidth, MERMAID_DESKTOP_WIDE_MAX_PX, safeLaneWidth)
      )
      const desiredExtra = Math.max(0, desiredWideWidth - containerWidth)

      if (desiredExtra > 24) {
        const leftAllowance = Math.max(0, Math.round(blockRect.left - desktopWideLaneBounds.leftBound))
        const rightAllowance = Math.max(0, Math.round(desktopWideLaneBounds.rightBound - blockRect.right))
        let nextLeftBleed = Math.min(leftAllowance, Math.round(desiredExtra / 2))
        let nextRightBleed = desiredExtra - nextLeftBleed

        if (nextRightBleed > rightAllowance) {
          nextRightBleed = rightAllowance
          nextLeftBleed = Math.min(leftAllowance, desiredExtra - nextRightBleed)
        }

        if (nextLeftBleed > leftAllowance) {
          nextLeftBleed = leftAllowance
          nextRightBleed = Math.min(rightAllowance, desiredExtra - nextLeftBleed)
        }

        const actualWideWidth = containerWidth + nextLeftBleed + nextRightBleed
        if (actualWideWidth > containerWidth + 24) {
          maxDisplayWidth = actualWideWidth
          wideBleedLeft = nextLeftBleed
          wideBleedRight = nextRightBleed
        }
      }
    }
    if (complexityLevel === "high") {
      maxDisplayWidth = Math.min(maxDisplayWidth, Math.max(containerWidth, 860))
    }

    const maxReadableHeight = isMobileViewport
      ? Number.POSITIVE_INFINITY
      : Math.min(760, Math.floor(window.innerHeight * 0.74))
    const usesDesktopWideLane = complexityLevel !== "high" && maxDisplayWidth > containerWidth + 24

    let scale = 1
    if (intrinsicWidth > maxDisplayWidth) {
      scale = Math.min(scale, maxDisplayWidth / intrinsicWidth)
    }
    if (intrinsicHeight * scale > maxReadableHeight) {
      scale = Math.min(scale, maxReadableHeight / intrinsicHeight)
    }
    if (complexityLevel === "high" && !isMobileViewport) {
      scale = Math.min(scale, MERMAID_COMPLEX_SCALE_CAP)
    }

    const roundedWidth = Math.max(1, Math.round(intrinsicWidth * scale))
    const roundedHeight = Math.max(1, Math.round(intrinsicHeight * scale))
    const stageWidth = usesDesktopWideLane ? maxDisplayWidth : containerWidth
    const isHeightClamped =
      !isMobileViewport && intrinsicHeight > maxReadableHeight + MERMAID_EXPAND_THRESHOLD_PX
    const needsExpandAction =
      intrinsicWidth > maxDisplayWidth + MERMAID_EXPAND_THRESHOLD_PX ||
      isHeightClamped ||
      complexityLevel === "high"
    stage.style.width = `${stageWidth}px`
    stage.style.minHeight = `${roundedHeight}px`
    stage.style.display = "flex"
    stage.style.justifyContent = "center"
    stage.style.overflowX = usesDesktopWideLane ? "visible" : "auto"
    block.style.overflowX = usesDesktopWideLane ? "visible" : "auto"
    stage.style.setProperty("-webkit-overflow-scrolling", "touch")
    block.style.setProperty("-webkit-overflow-scrolling", "touch")
    block.dataset.mermaidWide = usesDesktopWideLane ? "true" : "false"
    block.dataset.mermaidExpandable = needsExpandAction ? "true" : "false"
    block.style.setProperty("--aq-mermaid-wide-width", `${stageWidth}px`)
    block.style.setProperty("--aq-mermaid-bleed-left", `${wideBleedLeft}px`)
    block.style.setProperty("--aq-mermaid-bleed-right", `${wideBleedRight}px`)

    svgElement.setAttribute("preserveAspectRatio", "xMidYMin meet")
    svgElement.style.width = `${roundedWidth}px`
    svgElement.style.height = `${roundedHeight}px`
    svgElement.style.maxWidth = "100%"
    svgElement.style.maxHeight = "none"
    svgElement.style.minHeight = "0"
    svgElement.style.objectFit = "contain"
    svgElement.style.margin = "0 auto"
    svgElement.style.textRendering = "geometricPrecision"
    svgElement.removeAttribute("width")
    svgElement.removeAttribute("height")

    block.querySelectorAll(".aq-mermaid-expand-btn").forEach((button) => button.remove())

    if (needsExpandAction) {
      const expandButton = document.createElement("button")
      expandButton.type = "button"
      expandButton.className = "aq-mermaid-expand-btn"
      expandButton.textContent = "확대 보기"
      expandButton.addEventListener("click", () => {
        mermaidOverlayCleanup = openMermaidOverlay(renderedSvg, mermaidOverlayCleanup)
      })
      block.appendChild(expandButton)
    }

    block.style.minHeight = ""
    stage.style.minHeight = ""
  }

  const renderMermaidBlocks = async () => {
    const codeBlocks = Array.from(
      root.querySelectorAll<HTMLElement>(
        [
          "pre > code.language-mermaid",
          "pre.aq-mermaid > code.language-mermaid",
          "pre > code[data-language='mermaid']",
          "pre[data-language='mermaid'] > code",
        ].join(", ")
      )
    )
    const preBlocks = Array.from(
      root.querySelectorAll<HTMLElement>(
        ["pre.aq-mermaid", "pre[data-aq-mermaid='true']", "pre[data-language='mermaid']"].join(", ")
      )
    )
    const mergedBlocks = new Map<HTMLElement, HTMLElement>()
    codeBlocks.forEach((codeBlock) => {
      const block = codeBlock.closest<HTMLElement>("pre")
      if (block) mergedBlocks.set(block, block)
    })
    preBlocks.forEach((block) => {
      mergedBlocks.set(block, block)
    })

    const blocks = Array.from(mergedBlocks.values())
    if (!blocks.length) return

    let renderQueue = Promise.resolve()
    const renderingIndices = new Set<number>()
    let enqueueRender: (index: number) => void = () => {}

    const scheduleRetry = (index: number, block: HTMLElement) => {
      const retryCount = Number.parseInt(block.dataset.mermaidRetryCount || "0", 10)
      if (retryCount >= maxRetryCount) return false
      block.dataset.mermaidRetryCount = String(retryCount + 1)
      const timerId = window.setTimeout(() => {
        retryTimers.delete(timerId)
        enqueueRender(index)
      }, retryBaseDelayMs * (retryCount + 1))
      retryTimers.add(timerId)
      return true
    }

    const renderSingleBlock = async (index: number) => {
      if (isDisposed()) return
      const block = blocks[index]
      if (!block?.isConnected) return
      const mermaid = await getMermaid()
      if (isDisposed() || !block.isConnected) return
      const codeBlock =
        block.querySelector<HTMLElement>("code.language-mermaid, code[data-language='mermaid'], code") || null
      const codeClassName = codeBlock?.className?.toLowerCase() || ""
      const codeDataLanguage = (codeBlock?.getAttribute("data-language") || "").toLowerCase()
      const blockClassName = block.className?.toLowerCase() || ""
      const blockDataLanguage = (block.getAttribute("data-language") || "").toLowerCase()
      const hasMermaidHint =
        blockClassName.includes("aq-mermaid") ||
        blockDataLanguage === "mermaid" ||
        codeClassName.includes("language-mermaid") ||
        codeDataLanguage === "mermaid"
      const desiredSource = applyMermaidSoftWrapHints(
        extractNormalizedMermaidSource(
          block.getAttribute("data-mermaid-source") ||
            codeBlock?.textContent ||
            block.textContent ||
            ""
        )
      )
      if (!desiredSource) return
      const renderableSource = sanitizeRenderableMermaidSource(desiredSource)
      const looksLikeMermaid = isMermaidSource(desiredSource)
      if (!hasMermaidHint && !looksLikeMermaid) return
      const complexity = estimateMermaidComplexity(renderableSource)
      block.dataset.mermaidComplexity = complexity.level
      if (!block.dataset.mermaidRendered) {
        block.dataset.mermaidRendered = "pending"
        block.dataset.mermaidPreset = preset.mode
      }

      const alreadyRendered =
        (block.dataset.mermaidRendered === "true" || block.dataset.mermaidRendered === "error") &&
        block.dataset.mermaidRenderedSource === desiredSource &&
        block.dataset.mermaidTheme === preset.themeKey
      if (alreadyRendered) return

      const blockRect = block.getBoundingClientRect()
      const desktopWideLaneBounds = resolveDesktopWideLaneBounds(block)
      const visibleWidth = Math.floor(blockRect.width)
      if (visibleWidth <= 0) {
        if (scheduleRetry(index, block)) return
        block.dataset.mermaidRendered = "error"
        block.classList.add("aq-mermaid-error")
        block.innerHTML = renderMermaidErrorState({
          source: desiredSource,
          error: "다이어그램 영역 너비를 계산할 수 없습니다. 레이아웃이 안정되면 다시 렌더링됩니다.",
        })
        return
      }

      try {
        await renderSourceIntoBlock({
          block,
          index,
          mermaid,
          sourceToRender: renderableSource,
          complexityLevel: complexity.level,
          visibleWidth,
          blockRect,
          desktopWideLaneBounds,
        })

        block.dataset.mermaidRenderedSource = desiredSource
        block.dataset.mermaidTheme = preset.themeKey
        block.dataset.mermaidPreset = preset.mode
        block.dataset.mermaidRendered = "true"
        block.dataset.mermaidRetryCount = "0"
        block.classList.remove("aq-mermaid-error")
      } catch (error) {
        const isSyntaxError = isMermaidSyntaxError(error)
        const isTimeoutError = isMermaidRenderTimeoutError(error)
        if (isNegativeRectWidthError(error) && scheduleRetry(index, block)) {
          return
        }

        const fallbackSource = stripRiskyFlowchartDirectives(desiredSource).trim()
        if (fallbackSource && fallbackSource !== desiredSource && fallbackSource !== renderableSource) {
          try {
            await renderSourceIntoBlock({
              block,
              index,
              mermaid,
              sourceToRender: fallbackSource,
              complexityLevel: complexity.level,
              visibleWidth,
              blockRect,
              desktopWideLaneBounds,
            })
            block.dataset.mermaidRenderedSource = fallbackSource
            block.dataset.mermaidTheme = preset.themeKey
            block.dataset.mermaidPreset = preset.mode
            block.dataset.mermaidRendered = "true"
            block.dataset.mermaidRetryCount = "0"
            block.classList.remove("aq-mermaid-error")
            return
          } catch (fallbackError) {
            const signature = `fallback:${fallbackSource}:${String(fallbackError)}`
            if (!loggedErrorSignatures.has(signature)) {
              loggedErrorSignatures.add(signature)
              if (shouldLogMermaidWarnings) {
                console.warn("[mermaid] fallback render failed", fallbackError)
              }
            }
            if (!isMermaidSyntaxError(fallbackError) && !isMermaidRenderTimeoutError(fallbackError) && scheduleRetry(index, block)) return
          }
        }

        if (!isSyntaxError && !isTimeoutError && scheduleRetry(index, block)) return

        block.dataset.mermaidRenderedSource = desiredSource
        block.dataset.mermaidTheme = preset.themeKey
        block.dataset.mermaidPreset = preset.mode
        block.dataset.mermaidRendered = "error"
        block.classList.add("aq-mermaid-error")
        block.style.minHeight = ""
        block.innerHTML = renderMermaidErrorState({ source: desiredSource, error })
        const signature = `${desiredSource}:${String(error)}`
        if (!loggedErrorSignatures.has(signature)) {
          loggedErrorSignatures.add(signature)
          if (shouldLogMermaidWarnings) {
            console.warn("[mermaid] render failed", error)
          }
        }
      }
    }

    enqueueRender = (index: number) => {
      if (!Number.isFinite(index) || renderingIndices.has(index)) return
      renderingIndices.add(index)
      renderQueue = renderQueue
        .then(async () => {
          await renderSingleBlock(index)
        })
        .catch((error) => {
          if (shouldLogMermaidWarnings) {
            console.warn("[mermaid] queued render failed", error)
          }
        })
        .finally(() => {
          renderingIndices.delete(index)
        })
    }

    intersectionObserver?.disconnect()
    intersectionObserver = null

    if (!lazyViewport || typeof IntersectionObserver === "undefined") {
      for (let i = 0; i < blocks.length; i += 1) {
        enqueueRender(i)
      }
      await renderQueue
      return
    }

    const indicesByBlock = new Map(blocks.map((block, index) => [block, index] as const))
    intersectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting && entry.intersectionRatio <= 0) return
          const index = indicesByBlock.get(entry.target as HTMLElement)
          if (typeof index !== "number") return
          enqueueRender(index)
          intersectionObserver?.unobserve(entry.target)
        })
      },
      {
        root: null,
        rootMargin: MERMAID_VIEWPORT_ROOT_MARGIN,
        threshold: 0.01,
      }
    )

    blocks.forEach((block) => {
      const alreadyRendered =
        (block.dataset.mermaidRendered === "true" || block.dataset.mermaidRendered === "error") &&
        block.dataset.mermaidTheme === preset.themeKey
      if (alreadyRendered) return
      intersectionObserver?.observe(block)
    })
  }

  return {
    resetLayoutCache: () => {
      cachedDesktopWideLaneBounds = undefined
    },
    renderMermaidBlocks,
    dispose: () => {
      mermaidOverlayCleanup?.()
      mermaidOverlayCleanup = null
      intersectionObserver?.disconnect()
      intersectionObserver = null
    },
  }
}
