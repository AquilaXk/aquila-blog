import { RefObject, useEffect } from "react"
import useScheme from "src/hooks/useScheme"
import { extractNormalizedMermaidSource } from "src/libs/markdown/mermaid"
import { acquireBodyScrollLock } from "src/libs/utils/bodyScrollLock"

const MERMAID_SOURCE_PATTERN =
  /^(%%\{|\s*(?:info|flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie|mindmap|timeline|gitGraph|quadrantChart|requirementDiagram|c4Context|C4Context|xychart-beta)\b)/

const isMermaidSource = (rawCode: string) => {
  const normalized = rawCode.trim()
  if (!normalized) return false

  const fenced = normalized.match(/^[`~]{3,}\s*mermaid\b[\t ]*\n([\s\S]*?)\n[`~]{3,}\s*$/i)
  const body = (fenced?.[1] || normalized).trim()
  if (!body) return false

  const lines = body.split("\n").map((line) => line.trim()).filter(Boolean)
  if (!lines.length) return false

  const firstLine = lines[0].replace(/^\d+\s+/, "")
  return MERMAID_SOURCE_PATTERN.test(firstLine)
}

type MermaidVisualPreset = "service" | "github"

const MERMAID_VISUAL_PRESET: MermaidVisualPreset = "github"

const GITHUB_MERMAID_FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji"'
const DESKTOP_MERMAID_MIN_VIEWPORT_PX = 1201
const MERMAID_DESKTOP_WIDE_MAX_PX = 1100
const MERMAID_DESKTOP_SAFE_MARGIN_PX = 24
const MERMAID_EXPAND_THRESHOLD_PX = 80

const createGithubMermaidConfig = (scheme: "dark" | "light") => {
  const isDark = scheme === "dark"

  return {
    theme: "base" as const,
    darkMode: isDark,
    themeVariables: isDark
      ? {
          darkMode: true,
          background: "#0d1117",
          primaryColor: "#161b22",
          primaryTextColor: "#f0f6fc",
          primaryBorderColor: "#30363d",
          secondaryColor: "#161b22",
          secondaryTextColor: "#f0f6fc",
          secondaryBorderColor: "#30363d",
          tertiaryColor: "#1f2937",
          tertiaryTextColor: "#f0f6fc",
          tertiaryBorderColor: "#30363d",
          lineColor: "#8b949e",
          textColor: "#f0f6fc",
          nodeBkg: "#161b22",
          nodeBorder: "#30363d",
          mainBkg: "#161b22",
          clusterBkg: "#0d1117",
          clusterBorder: "#30363d",
          edgeLabelBackground: "#161b22",
          defaultLinkColor: "#8b949e",
          actorBkg: "#161b22",
          actorBorder: "#30363d",
          actorTextColor: "#f0f6fc",
          fontFamily: GITHUB_MERMAID_FONT_STACK,
        }
      : {
          darkMode: false,
          background: "#ffffff",
          primaryColor: "#f6f8fa",
          primaryTextColor: "#24292f",
          primaryBorderColor: "#d0d7de",
          secondaryColor: "#ffffff",
          secondaryTextColor: "#24292f",
          secondaryBorderColor: "#d0d7de",
          tertiaryColor: "#f6f8fa",
          tertiaryTextColor: "#24292f",
          tertiaryBorderColor: "#d0d7de",
          lineColor: "#57606a",
          textColor: "#24292f",
          nodeBkg: "#f6f8fa",
          nodeBorder: "#d0d7de",
          mainBkg: "#f6f8fa",
          clusterBkg: "#f6f8fa",
          clusterBorder: "#d0d7de",
          edgeLabelBackground: "#ffffff",
          defaultLinkColor: "#57606a",
          actorBkg: "#f6f8fa",
          actorBorder: "#d0d7de",
          actorTextColor: "#24292f",
          fontFamily: GITHUB_MERMAID_FONT_STACK,
        },
    securityLevel: "strict" as const,
    suppressErrorRendering: true,
    htmlLabels: false,
    flowchart: {
      curve: "linear" as const,
      useMaxWidth: true,
    },
  }
}

const createServiceMermaidConfig = (scheme: "dark" | "light") => ({
  theme: scheme === "dark" ? ("dark" as const) : ("neutral" as const),
  securityLevel: "strict" as const,
  suppressErrorRendering: true,
  htmlLabels: false,
  flowchart: {
    curve: "linear" as const,
    useMaxWidth: true,
  },
})

const resolveMermaidPreset = (scheme: "dark" | "light") => {
  if (MERMAID_VISUAL_PRESET === "github") {
    return {
      mode: "github" as const,
      themeKey: `github-${scheme}`,
      config: createGithubMermaidConfig(scheme),
    }
  }

  return {
    mode: "service" as const,
    themeKey: `service-${scheme}`,
    config: createServiceMermaidConfig(scheme),
  }
}

const useMermaidEffect = (
  rootRef?: RefObject<HTMLElement>,
  contentKey?: string,
  enabled = true
) => {
  const [scheme] = useScheme()

  useEffect(() => {
    if (!enabled) return
    const root = rootRef?.current
    if (!root) return

    let disposed = false
    let running = false
    let rerunRequested = false
    let mutationObserver: MutationObserver | null = null
    const retryTimers = new Set<number>()
    const loggedErrorSignatures = new Set<string>()
    let scheduledRunFrame: number | null = null
    let runRetryCount = 0
    const maxRetryCount = 6
    const retryBaseDelayMs = 150
    const maxRunRetryCount = 3

    const stripRiskyFlowchartDirectives = (source: string) =>
      source
        .split("\n")
        .filter((line) => !/^\s*(style|linkStyle|classDef)\b/i.test(line))
        .join("\n")

    const isNegativeRectWidthError = (error: unknown) => {
      const message = String(error)
      return message.includes("attribute width") && message.includes("negative value")
    }

    let mermaidOverlayCleanup: (() => void) | null = null

    const openMermaidOverlay = (svgMarkup: string) => {
      if (typeof document === "undefined") return

      mermaidOverlayCleanup?.()

      const overlay = document.createElement("div")
      overlay.setAttribute("data-aq-mermaid-overlay", "true")
      overlay.style.position = "fixed"
      overlay.style.inset = "0"
      overlay.style.zIndex = "180"
      overlay.style.background = "rgba(2, 6, 23, 0.7)"
      overlay.style.display = "grid"
      overlay.style.alignItems = "center"
      overlay.style.justifyItems = "center"
      overlay.style.padding = "max(0.9rem, env(safe-area-inset-top, 0px)) max(0.9rem, env(safe-area-inset-right, 0px)) max(0.9rem, env(safe-area-inset-bottom, 0px)) max(0.9rem, env(safe-area-inset-left, 0px))"

      const panel = document.createElement("div")
      panel.style.width = "min(96vw, 1280px)"
      panel.style.maxHeight = "min(90dvh, 820px)"
      panel.style.overflow = "auto"
      panel.style.borderRadius = "14px"
      panel.style.border = "1px solid rgba(255, 255, 255, 0.14)"
      panel.style.background = "rgba(11, 16, 23, 0.98)"
      panel.style.padding = "0.75rem"

      const closeButton = document.createElement("button")
      closeButton.type = "button"
      closeButton.textContent = "닫기"
      closeButton.style.display = "inline-flex"
      closeButton.style.alignItems = "center"
      closeButton.style.justifyContent = "center"
      closeButton.style.minHeight = "34px"
      closeButton.style.padding = "0 0.8rem"
      closeButton.style.borderRadius = "999px"
      closeButton.style.border = "1px solid rgba(255, 255, 255, 0.2)"
      closeButton.style.background = "rgba(15, 23, 42, 0.7)"
      closeButton.style.color = "#f3f4f6"
      closeButton.style.fontSize = "0.82rem"
      closeButton.style.fontWeight = "700"
      closeButton.style.marginLeft = "auto"
      closeButton.style.marginBottom = "0.56rem"
      closeButton.style.cursor = "pointer"

      const stage = document.createElement("div")
      stage.style.overflow = "auto"
      stage.style.setProperty("-webkit-overflow-scrolling", "touch")
      stage.innerHTML = svgMarkup
      const stageSvg = stage.querySelector("svg")
      if (stageSvg) {
        stageSvg.removeAttribute("width")
        stageSvg.removeAttribute("height")
        stageSvg.style.maxWidth = "none"
        stageSvg.style.width = "max-content"
        stageSvg.style.height = "auto"
        stageSvg.style.display = "block"
      }

      panel.appendChild(closeButton)
      panel.appendChild(stage)
      overlay.appendChild(panel)
      document.body.appendChild(overlay)

      const releaseBodyScrollLock = acquireBodyScrollLock()

      const closeOverlay = () => {
        releaseBodyScrollLock()
        overlay.remove()
        document.removeEventListener("keydown", handleEscape)
        mermaidOverlayCleanup = null
      }

      const handleEscape = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          event.preventDefault()
          closeOverlay()
        }
      }

      overlay.addEventListener("click", (event) => {
        if (event.target === overlay) {
          closeOverlay()
        }
      })
      closeButton.addEventListener("click", closeOverlay)
      document.addEventListener("keydown", handleEscape)

      mermaidOverlayCleanup = closeOverlay
    }

    const renderMermaidBlocks = async () => {
      const codeBlocks = Array.from(
        root.querySelectorAll<HTMLElement>(
          [
            "pre > code.language-mermaid",
            "pre.aq-mermaid > code.language-mermaid",
            "pre > code[data-language='mermaid']",
            "pre[data-language='mermaid'] > code",
            // language 힌트가 유실된 일반 pre/code 경로도 머메이드 소스 판별 대상으로 포함한다.
            "pre > code",
          ].join(", ")
        )
      )

      const preBlocks = Array.from(
        root.querySelectorAll<HTMLElement>(
          [
            "pre.aq-mermaid",
            "pre[data-aq-mermaid='true']",
            "pre[data-language='mermaid']",
            // rehype-pretty-code 경로에서 language 힌트가 유실된 경우를 대비한 fallback 대상
            "figure[data-rehype-pretty-code-figure] pre",
            // SSR/HTML 경로에서 class/data-language 힌트 없이 내려오는 pre도 탐지한다.
            "pre",
          ].join(", ")
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

      const mermaid = (await import("mermaid")).default
      const preset = resolveMermaidPreset(scheme === "dark" ? "dark" : "light")

      // Mermaid 기본 parseError 핸들러가 브라우저 알림을 띄우는 환경이 있어
      // 렌더 에러를 훅 내부 catch 경로로 모아 조용히 처리한다.
      ;(
        mermaid as unknown as {
          parseError?: (error: unknown, hash: unknown) => void
        }
      ).parseError = (error) => {
        throw new Error(String(error))
      }

      mermaid.initialize({
        startOnLoad: false,
        ...preset.config,
      })

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

      const normalizeMermaidSource = (raw: string) => {
        return extractNormalizedMermaidSource(raw)
      }

      const renderSingleBlock = async (i: number) => {
        if (disposed) return
        const block = blocks[i]
        if (!block) return
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
        const source = normalizeMermaidSource(
          block.getAttribute("data-mermaid-source") ||
            block.dataset.mermaidSource ||
            codeBlock?.textContent ||
            block.textContent ||
            ""
        )
        if (!source) return
        const looksLikeMermaid = isMermaidSource(source)
        if (!hasMermaidHint && !looksLikeMermaid) return
        if (!block.dataset.mermaidRendered) {
          block.dataset.mermaidRendered = "pending"
          block.dataset.mermaidPreset = preset.mode
        }

        const alreadyRendered =
          (block.dataset.mermaidRendered === "true" ||
            block.dataset.mermaidRendered === "error") &&
          block.dataset.mermaidSource === source &&
          block.dataset.mermaidTheme === preset.themeKey
        if (alreadyRendered) return

        const blockRect = block.getBoundingClientRect()
        const visibleWidth = Math.floor(blockRect.width)
        if (visibleWidth <= 0) {
          if (scheduleRetry(i, block)) return
          block.dataset.mermaidRendered = "error"
          block.classList.add("aq-mermaid-error")
          block.innerHTML = `
            <div style="color:#b42318;font-weight:600;margin-bottom:0.5rem;">
              Mermaid 렌더링 실패: 다이어그램 영역 너비를 계산할 수 없습니다.
            </div>
            <code style="white-space:pre-wrap;display:block;">${source
              .replaceAll("&", "&amp;")
              .replaceAll("<", "&lt;")
              .replaceAll(">", "&gt;")}</code>
          `
          return
        }

        const renderSourceIntoBlock = async (sourceToRender: string) => {
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

          const renderId = `aq-mermaid-${i}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
          const { svg, bindFunctions } = await mermaid.render(renderId, sourceToRender)
          if (disposed) return

          stage.innerHTML = svg
          bindFunctions?.(stage)

          const svgElement = stage.querySelector("svg")
          if (!svgElement) throw new Error("Mermaid SVG 생성 실패")

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
          const needsExpandAction = intrinsicWidth > containerWidth + MERMAID_EXPAND_THRESHOLD_PX
          let maxDisplayWidth = containerWidth
          let wideBleedLeft = 0
          let wideBleedRight = 0

          if (isDesktopViewport && needsExpandAction) {
            const detailLayout = block.closest<HTMLElement>(".detailLayout")
            const leftRail = detailLayout?.querySelector<HTMLElement>(".leftRail")
            const rightRail = detailLayout?.querySelector<HTMLElement>(".rightRail")
            const liveBlockRect = block.getBoundingClientRect()
            const leftBound =
              leftRail && leftRail.offsetParent !== null
                ? leftRail.getBoundingClientRect().right + MERMAID_DESKTOP_SAFE_MARGIN_PX
                : MERMAID_DESKTOP_SAFE_MARGIN_PX
            const rightBound =
              rightRail && rightRail.offsetParent !== null
                ? rightRail.getBoundingClientRect().left - MERMAID_DESKTOP_SAFE_MARGIN_PX
                : window.innerWidth - MERMAID_DESKTOP_SAFE_MARGIN_PX
            const safeLaneWidth = Math.max(containerWidth, Math.round(rightBound - leftBound))
            const desiredWideWidth = Math.max(
              containerWidth,
              Math.min(intrinsicWidth, MERMAID_DESKTOP_WIDE_MAX_PX, safeLaneWidth)
            )
            const desiredExtra = Math.max(0, desiredWideWidth - containerWidth)

            if (desiredExtra > 24) {
              const leftAllowance = Math.max(0, Math.round(liveBlockRect.left - leftBound))
              const rightAllowance = Math.max(0, Math.round(rightBound - liveBlockRect.right))
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

          const maxReadableHeight = Math.min(520, Math.floor(window.innerHeight * 0.68))
          const usesDesktopWideLane = maxDisplayWidth > containerWidth + 24

          let scale = 1
          if (intrinsicWidth > maxDisplayWidth) {
            scale = Math.min(scale, maxDisplayWidth / intrinsicWidth)
          }
          if (isMobileViewport && intrinsicHeight * scale > maxReadableHeight) {
            scale = Math.min(scale, maxReadableHeight / intrinsicHeight)
          }

          const targetWidth = intrinsicWidth * scale
          const targetHeight = intrinsicHeight * scale

          const roundedWidth = Math.max(1, Math.round(targetWidth))
          const roundedHeight = Math.max(1, Math.round(targetHeight))
          const stageWidth = usesDesktopWideLane ? maxDisplayWidth : containerWidth
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
          svgElement.removeAttribute("width")
          svgElement.removeAttribute("height")

          if (needsExpandAction) {
            const expandButton = document.createElement("button")
            expandButton.type = "button"
            expandButton.className = "aq-mermaid-expand-btn"
            expandButton.textContent = "확대 보기"
            expandButton.addEventListener("click", () => {
              openMermaidOverlay(svg)
            })
            block.appendChild(expandButton)
          }

          // 렌더 완료 이후에만 높이 고정을 해제해 새로고침 시 레이아웃 점프를 줄인다.
          block.style.minHeight = ""
          stage.style.minHeight = ""
        }

        try {
          await renderSourceIntoBlock(source)

          block.dataset.mermaidSource = source
          block.dataset.mermaidTheme = preset.themeKey
          block.dataset.mermaidPreset = preset.mode
          block.dataset.mermaidRendered = "true"
          block.dataset.mermaidRetryCount = "0"
          block.classList.remove("aq-mermaid-error")
        } catch (error) {
          if (isNegativeRectWidthError(error) && scheduleRetry(i, block)) {
            return
          }

          const fallbackSource = stripRiskyFlowchartDirectives(source).trim()
          if (fallbackSource && fallbackSource !== source) {
            try {
              await renderSourceIntoBlock(fallbackSource)
              block.dataset.mermaidSource = fallbackSource
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
                console.warn("[mermaid] fallback render failed", fallbackError)
              }
              if (scheduleRetry(i, block)) return
            }
          }

          if (scheduleRetry(i, block)) return

          const escapedSource = source
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")

          block.dataset.mermaidSource = source
          block.dataset.mermaidTheme = preset.themeKey
          block.dataset.mermaidPreset = preset.mode
          block.dataset.mermaidRendered = "error"
          block.classList.add("aq-mermaid-error")
          block.style.minHeight = ""
          block.innerHTML = `
            <div class="aq-mermaid-error-state">
              <div class="aq-mermaid-error-title">Mermaid를 렌더하지 못했습니다.</div>
              <code class="aq-mermaid-error-code">${escapedSource}</code>
            </div>
          `
          const signature = `${source}:${String(error)}`
          if (!loggedErrorSignatures.has(signature)) {
            loggedErrorSignatures.add(signature)
            console.warn("[mermaid] render failed", error)
          }
        }
      }

      enqueueRender = (index: number) => {
        if (!Number.isFinite(index)) return
        if (renderingIndices.has(index)) return
        renderingIndices.add(index)
        renderQueue = renderQueue
          .then(async () => {
            await renderSingleBlock(index)
          })
          .catch((error) => {
            console.warn("[mermaid] queued render failed", error)
          })
          .finally(() => {
            renderingIndices.delete(index)
          })
      }

      // 미리보기/상세에서 "가끔 안 나옴"을 제거하기 위해 viewport 관찰 의존을 없애고 즉시 렌더한다.
      // 다이어그램 수가 많은 글에서도 renderQueue(직렬)로 스파이크를 제어한다.
      for (let i = 0; i < blocks.length; i += 1) {
        enqueueRender(i)
      }
      await renderQueue
    }

    const run = async () => {
      if (disposed) return
      if (running) {
        rerunRequested = true
        return
      }

      running = true

      try {
        do {
          rerunRequested = false
          try {
            await renderMermaidBlocks()
            runRetryCount = 0
          } catch (error) {
            console.warn(error)
            if (!disposed && runRetryCount < maxRunRetryCount) {
              runRetryCount += 1
              const delay = 220 * runRetryCount
              const timerId = window.setTimeout(() => {
                retryTimers.delete(timerId)
                scheduleRun()
              }, delay)
              retryTimers.add(timerId)
            }
          }
        } while (!disposed && rerunRequested)
      } finally {
        running = false
      }
    }

    const scheduleRun = () => {
      if (disposed || scheduledRunFrame !== null) return
      scheduledRunFrame = window.requestAnimationFrame(() => {
        scheduledRunFrame = null
        void run()
      })
    }

    scheduleRun()
    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(scheduleRun) : null
    resizeObserver?.observe(root)
    mutationObserver =
      typeof MutationObserver !== "undefined"
        ? new MutationObserver(scheduleRun)
        : null
    mutationObserver?.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
    })

    return () => {
      disposed = true
      mermaidOverlayCleanup?.()
      resizeObserver?.disconnect()
      mutationObserver?.disconnect()
      retryTimers.forEach((timerId) => window.clearTimeout(timerId))
      retryTimers.clear()
      if (scheduledRunFrame !== null) {
        window.cancelAnimationFrame(scheduledRunFrame)
        scheduledRunFrame = null
      }
    }
  }, [contentKey, enabled, rootRef, scheme])

  return
}

export default useMermaidEffect
