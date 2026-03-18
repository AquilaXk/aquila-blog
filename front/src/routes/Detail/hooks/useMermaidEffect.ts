import { RefObject, useEffect } from "react"
import useScheme from "src/hooks/useScheme"
import { extractNormalizedMermaidSource } from "src/libs/markdown/mermaid"

const MERMAID_SOURCE_PATTERN =
  /^(%%\{|\s*(?:flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie|mindmap|timeline|gitGraph|quadrantChart|requirementDiagram|c4Context|C4Context|xychart-beta)\b)/

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

const useMermaidEffect = (rootRef?: RefObject<HTMLElement>, contentKey?: string) => {
  const [scheme] = useScheme()

  useEffect(() => {
    const root = rootRef?.current
    if (!root) return

    let disposed = false
    let running = false
    let observer: IntersectionObserver | null = null
    let rerunRequested = false
    let mutationObserver: MutationObserver | null = null
    const retryTimers = new Set<number>()
    const loggedErrorSignatures = new Set<string>()
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
      const theme = scheme === "dark" ? "dark" : "neutral"

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
        theme,
        securityLevel: "strict",
        flowchart: {
          // GitHub 스타일과 동일하게 SVG label 기반으로 고정한다.
          htmlLabels: false,
          curve: "linear",
          useMaxWidth: true,
        },
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

        const alreadyRendered =
          (block.dataset.mermaidRendered === "true" ||
            block.dataset.mermaidRendered === "error") &&
          block.dataset.mermaidSource === source &&
          block.dataset.mermaidTheme === theme
        if (alreadyRendered) return

        const rect = block.getBoundingClientRect()

        const renderSourceIntoBlock = async (sourceToRender: string) => {
          const isMobileViewport = window.matchMedia("(max-width: 768px)").matches
          const containerWidth = Math.max(280, Math.floor(rect.width))
          const reserveHeight = Math.max(120, Math.ceil(block.getBoundingClientRect().height))

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
          const fallbackRect = svgElement.getBoundingClientRect()
          const intrinsicWidth =
            Number.isFinite(viewBoxWidth) && viewBoxWidth > 0 ? viewBoxWidth : Math.max(1, fallbackRect.width)
          const intrinsicHeight =
            Number.isFinite(viewBoxHeight) && viewBoxHeight > 0
              ? viewBoxHeight
              : Math.max(1, fallbackRect.height)

          const minReadableHeight = isMobileViewport ? 120 : 170
          const maxReadableHeight = isMobileViewport
            ? Math.min(460, Math.floor(window.innerHeight * 0.56))
            : Math.min(760, Math.floor(window.innerHeight * 0.72))
          const maxScrollableWidth = isMobileViewport
            ? Math.max(containerWidth * 2.2, 1200)
            : Math.max(containerWidth * 3, 2400)

          let targetWidth = intrinsicWidth
          let targetHeight = intrinsicHeight

          if (targetHeight < minReadableHeight) {
            const scaleUp = minReadableHeight / targetHeight
            targetWidth *= scaleUp
            targetHeight *= scaleUp
          }

          if (targetHeight > maxReadableHeight) {
            const scaleDown = maxReadableHeight / targetHeight
            targetWidth *= scaleDown
            targetHeight *= scaleDown
          }

          if (targetWidth > maxScrollableWidth) {
            const scaleDownByWidth = maxScrollableWidth / targetWidth
            targetWidth *= scaleDownByWidth
            targetHeight *= scaleDownByWidth
          }

          const roundedWidth = Math.max(1, Math.round(targetWidth))
          const roundedHeight = Math.max(1, Math.round(targetHeight))
          const shouldCenterWithinBlock = roundedWidth <= containerWidth

          stage.style.width = `${shouldCenterWithinBlock ? containerWidth : roundedWidth}px`
          stage.style.minHeight = `${roundedHeight}px`
          stage.style.display = shouldCenterWithinBlock ? "flex" : "block"
          stage.style.justifyContent = shouldCenterWithinBlock ? "center" : "initial"

          svgElement.setAttribute("preserveAspectRatio", shouldCenterWithinBlock ? "xMidYMin meet" : "xMinYMin meet")
          svgElement.style.width = `${roundedWidth}px`
          svgElement.style.height = `${roundedHeight}px`
          svgElement.style.maxWidth = "none"
          svgElement.style.maxHeight = "none"
          svgElement.style.minHeight = "0"
          svgElement.style.objectFit = "contain"
          svgElement.style.margin = shouldCenterWithinBlock ? "0 auto" : "0"
          svgElement.removeAttribute("width")
          svgElement.removeAttribute("height")

          // 렌더 완료 이후에만 높이 고정을 해제해 새로고침 시 레이아웃 점프를 줄인다.
          block.style.minHeight = ""
          stage.style.minHeight = ""
        }

        try {
          await renderSourceIntoBlock(source)

          block.dataset.mermaidSource = source
          block.dataset.mermaidTheme = theme
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
              block.dataset.mermaidTheme = theme
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
          block.dataset.mermaidTheme = theme
          block.dataset.mermaidRendered = "error"
          block.classList.add("aq-mermaid-error")
          block.style.minHeight = ""
          block.innerHTML = `
            <div style="color:#b42318;font-weight:600;margin-bottom:0.5rem;">
              Mermaid 렌더링 실패: 문법 또는 다이어그램 코드를 확인하세요.
            </div>
            <code style="white-space:pre-wrap;display:block;">${escapedSource}</code>
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

      if (observer) {
        observer.disconnect()
        observer = null
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
                void run()
              }, delay)
              retryTimers.add(timerId)
            }
          }
        } while (!disposed && rerunRequested)
      } finally {
        running = false
      }
    }

    void run()
    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => void run()) : null
    resizeObserver?.observe(root)
    mutationObserver =
      typeof MutationObserver !== "undefined"
        ? new MutationObserver(() => {
            void run()
          })
        : null
    mutationObserver?.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
    })

    return () => {
      disposed = true
      observer?.disconnect()
      resizeObserver?.disconnect()
      mutationObserver?.disconnect()
      retryTimers.forEach((timerId) => window.clearTimeout(timerId))
      retryTimers.clear()
    }
  }, [contentKey, rootRef, scheme])

  return
}

export default useMermaidEffect
