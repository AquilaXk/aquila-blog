import { RefObject, useEffect } from "react"
import useScheme from "src/hooks/useScheme"

const MERMAID_SOURCE_PATTERN =
  /^(%%\{|\s*(?:flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie|mindmap|timeline|gitGraph|quadrantChart|requirementDiagram|c4Context|C4Context|xychart-beta)\b)/

const MERMAID_EDGE_PATTERN = /-->|==>|-.->|:::|subgraph\b|classDef\b|style\b/i

const parseDimension = (value: string | null) => {
  if (!value) return 0
  const parsed = Number.parseFloat(value.replace(/[^\d.\-]/g, ""))
  return Number.isFinite(parsed) ? parsed : 0
}

const parseViewBox = (value: string | null) => {
  if (!value) return null
  const parts = value
    .trim()
    .split(/[\s,]+/)
    .map((entry) => Number.parseFloat(entry))
    .filter((entry) => Number.isFinite(entry))
  if (parts.length !== 4) return null
  const [x, y, width, height] = parts
  if (width <= 0 || height <= 0) return null
  return { x, y, width, height }
}

const hasValidBounds = (bounds: { x: number; y: number; width: number; height: number }) =>
  Number.isFinite(bounds.x) &&
  Number.isFinite(bounds.y) &&
  Number.isFinite(bounds.width) &&
  Number.isFinite(bounds.height) &&
  bounds.width > 0 &&
  bounds.height > 0

const mergeBounds = (
  current: { x: number; y: number; width: number; height: number } | null,
  next: { x: number; y: number; width: number; height: number }
) => {
  if (!current) return next
  const minX = Math.min(current.x, next.x)
  const minY = Math.min(current.y, next.y)
  const maxX = Math.max(current.x + current.width, next.x + next.width)
  const maxY = Math.max(current.y + current.height, next.y + next.height)
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

const isMermaidSource = (rawCode: string) => {
  const normalized = rawCode.trim()
  if (!normalized) return false

  const fenced = normalized.match(/^`{3,}\s*mermaid\b[\t ]*\n([\s\S]*?)\n`{3,}\s*$/i)
  const body = (fenced?.[1] || normalized).trim()
  if (!body) return false

  const lines = body.split("\n").map((line) => line.trim()).filter(Boolean)
  if (!lines.length) return false

  const firstLine = lines[0].replace(/^\d+\s+/, "")
  if (MERMAID_SOURCE_PATTERN.test(firstLine)) return true

  return MERMAID_EDGE_PATTERN.test(body)
}

const getMeasurementBounds = (svg: SVGSVGElement, rawWidth: number, rawHeight: number) => {
  if (typeof document === "undefined") return null

  const host = document.createElement("div")
  host.style.position = "fixed"
  host.style.left = "-100000px"
  host.style.top = "-100000px"
  host.style.width = "0"
  host.style.height = "0"
  host.style.opacity = "0"
  host.style.pointerEvents = "none"
  host.style.overflow = "hidden"

  const sample = svg.cloneNode(true) as SVGSVGElement
  const fallbackWidth = rawWidth > 0 ? rawWidth : 1200
  const fallbackHeight = rawHeight > 0 ? rawHeight : 900
  sample.setAttribute("width", String(fallbackWidth))
  sample.setAttribute("height", String(fallbackHeight))
  sample.style.width = `${fallbackWidth}px`
  sample.style.height = `${fallbackHeight}px`

  host.appendChild(sample)
  document.body.appendChild(host)

  try {
    const measurableParts = [
      ...Array.from(sample.querySelectorAll<SVGGraphicsElement>(".clusters > *")),
      ...Array.from(sample.querySelectorAll<SVGGraphicsElement>(".edgePaths > *")),
      ...Array.from(sample.querySelectorAll<SVGGraphicsElement>(".nodes > *")),
      ...Array.from(sample.querySelectorAll<SVGGraphicsElement>(".edgeLabels > *")),
      ...Array.from(sample.querySelectorAll<SVGGraphicsElement>(".nodeLabel")),
      ...Array.from(sample.querySelectorAll<SVGGraphicsElement>(".edgeLabel")),
    ]

    let mergedBounds: { x: number; y: number; width: number; height: number } | null = null
    for (const part of measurableParts) {
      const bounds = part.getBBox()
      if (!hasValidBounds(bounds)) continue
      mergedBounds = mergeBounds(mergedBounds, bounds)
    }

    if (mergedBounds && hasValidBounds(mergedBounds)) {
      return mergedBounds
    }

    const candidates = [
      sample.querySelector<SVGGraphicsElement>("g.output"),
      sample.querySelector<SVGGraphicsElement>("g.graph"),
      sample.querySelector<SVGGraphicsElement>(".root"),
      sample.querySelector<SVGGraphicsElement>(":scope > g:last-of-type"),
      sample.querySelector<SVGGraphicsElement>(":scope > g"),
    ].filter((node): node is SVGGraphicsElement => !!node)

    for (const candidate of candidates) {
      const bounds = candidate.getBBox()
      if (hasValidBounds(bounds)) {
        return bounds
      }
    }
  } catch {
    return null
  } finally {
    host.remove()
  }

  return null
}

const useMermaidEffect = (rootRef?: RefObject<HTMLElement>, contentKey?: string) => {
  const [scheme] = useScheme()

  useEffect(() => {
    const root = rootRef?.current
    if (!root) return

    let disposed = false
    let running = false
    let observer: IntersectionObserver | null = null
    const retryTimers = new Set<number>()

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
      mermaid.initialize({
        startOnLoad: false,
        theme,
        securityLevel: "strict",
        flowchart: {
          // htmlLabels=true 에서 일부 다이어그램이 음수 rect width 오류를 내는 케이스가 있어 안정성 우선으로 고정한다.
          htmlLabels: false,
          curve: "linear",
          useMaxWidth: false,
        },
      })

      let renderQueue = Promise.resolve()
      const renderingIndices = new Set<number>()
      let enqueueRender: (index: number) => void = () => {}

      const scheduleRetry = (index: number, block: HTMLElement) => {
        const retryCount = Number.parseInt(block.dataset.mermaidRetryCount || "0", 10)
        if (retryCount >= 4) return
        block.dataset.mermaidRetryCount = String(retryCount + 1)
        const timerId = window.setTimeout(() => {
          retryTimers.delete(timerId)
          enqueueRender(index)
        }, 120 * (retryCount + 1))
        retryTimers.add(timerId)
      }

      const normalizeMermaidSource = (raw: string) => {
        const normalized = raw.trim()
        if (!normalized) return ""

        const fenced = normalized.match(/^`{3,}\s*mermaid\b[\t ]*\n([\s\S]*?)\n`{3,}\s*$/i)
        return (fenced?.[1] || normalized).trim()
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
        if (!hasMermaidHint && !isMermaidSource(source)) return

        const alreadyRendered =
          (block.dataset.mermaidRendered === "true" ||
            block.dataset.mermaidRendered === "error") &&
          block.dataset.mermaidSource === source &&
          block.dataset.mermaidTheme === theme
        if (alreadyRendered) return

        const rect = block.getBoundingClientRect()
        if (rect.width <= 16 || rect.height <= 8) {
          scheduleRetry(i, block)
          return
        }

        try {
          const id = `mermaid-${i}-${Math.random().toString(36).slice(2)}`
          let svg = (await mermaid.render(id, source)).svg
          let usedSource = source
          if (disposed) return

          const parser = new DOMParser()
          const svgDocument = parser.parseFromString(svg, "text/html")
          const renderedSvg = svgDocument.querySelector("svg")
          if (!renderedSvg) {
            throw new Error("Mermaid SVG 파싱 실패")
          }
          const rawWidth = parseDimension(renderedSvg.getAttribute("width"))
          const rawHeight = parseDimension(renderedSvg.getAttribute("height"))
          const viewBox = parseViewBox(renderedSvg.getAttribute("viewBox"))
          const fallbackWidth = rawWidth > 0 ? rawWidth : viewBox?.width || 1200
          const fallbackHeight = rawHeight > 0 ? rawHeight : viewBox?.height || 900

          const measuredBounds = getMeasurementBounds(renderedSvg, fallbackWidth, fallbackHeight)
          if (measuredBounds) {
            const padX = Math.max(10, measuredBounds.width * 0.022)
            const padY = Math.max(10, measuredBounds.height * 0.03)
            const viewX = measuredBounds.x - padX
            const viewY = measuredBounds.y - padY
            const viewWidth = measuredBounds.width + padX * 2
            const viewHeight = measuredBounds.height + padY * 2
            renderedSvg.setAttribute("viewBox", `${viewX} ${viewY} ${viewWidth} ${viewHeight}`)
          } else if (!renderedSvg.getAttribute("viewBox") && fallbackWidth > 0 && fallbackHeight > 0) {
            renderedSvg.setAttribute("viewBox", `0 0 ${fallbackWidth} ${fallbackHeight}`)
          }

          renderedSvg.setAttribute("preserveAspectRatio", "xMidYMin meet")
          renderedSvg.removeAttribute("width")
          renderedSvg.removeAttribute("height")

          const wrappedSvg = `<div class="aq-mermaid-stage">${renderedSvg.outerHTML}</div>`

          block.dataset.mermaidSource = usedSource
          block.dataset.mermaidTheme = theme
          block.dataset.mermaidRendered = "true"
          block.dataset.mermaidRetryCount = "0"
          block.innerHTML = wrappedSvg
        } catch (error) {
          if (isNegativeRectWidthError(error)) {
            const retryCount = Number.parseInt(block.dataset.mermaidRetryCount || "0", 10)

            if (retryCount >= 4) {
              const fallbackSource = stripRiskyFlowchartDirectives(source).trim()
              if (fallbackSource && fallbackSource !== source) {
                try {
                  const fallbackId = `mermaid-fallback-${i}-${Math.random().toString(36).slice(2)}`
                  const fallbackSvg = (await mermaid.render(fallbackId, fallbackSource)).svg
                  if (disposed) return

                  const parser = new DOMParser()
                  const fallbackDocument = parser.parseFromString(fallbackSvg, "text/html")
                  const fallbackRenderedSvg = fallbackDocument.querySelector("svg")
                  if (fallbackRenderedSvg) {
                    fallbackRenderedSvg.setAttribute("preserveAspectRatio", "xMidYMin meet")
                    fallbackRenderedSvg.removeAttribute("width")
                    fallbackRenderedSvg.removeAttribute("height")
                    block.innerHTML = `<div class="aq-mermaid-stage">${fallbackRenderedSvg.outerHTML}</div>`
                    block.dataset.mermaidSource = fallbackSource
                    block.dataset.mermaidTheme = theme
                    block.dataset.mermaidRendered = "true"
                    block.dataset.mermaidRetryCount = "0"
                    return
                  }
                } catch (fallbackError) {
                  console.warn("[mermaid] fallback render failed", fallbackError)
                }
              }
            } else {
              scheduleRetry(i, block)
              return
            }
          }

          const escapedSource = source
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")

          block.dataset.mermaidSource = source
          block.dataset.mermaidTheme = theme
          block.dataset.mermaidRendered = "error"
          block.innerHTML = `
            <div style="color:#b42318;font-weight:600;margin-bottom:0.5rem;">
              Mermaid 렌더링 실패: 문법 또는 다이어그램 코드를 확인하세요.
            </div>
            <code style="white-space:pre-wrap;display:block;">${escapedSource}</code>
          `
          console.warn("[mermaid] render failed", error)
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

      if ("IntersectionObserver" in window) {
        const viewportHeight = window.innerHeight || 0
        observer = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (!entry.isIntersecting) return
              const block = entry.target as HTMLElement
              const rect = block.getBoundingClientRect()
              if (rect.width <= 16 || rect.height <= 8) return
              observer?.unobserve(block)
              const index = Number.parseInt(block.dataset.mermaidIndex || "", 10)
              if (!Number.isFinite(index)) return
              enqueueRender(index)
            })
          },
          {
            root: null,
            // 화면 진입 전 미리 렌더링해 스크롤 진입 시 체감 지연을 줄인다.
            rootMargin: "320px 0px 320px 0px",
            threshold: 0.01,
          }
        )

        blocks.forEach((block, index) => {
          block.dataset.mermaidIndex = String(index)
          observer?.observe(block)

          // 일부 브라우저/레이아웃 조합에서 초기 Intersection callback 이 누락되는 경우가 있어,
          // 최초 1회는 viewport 인접 블록을 즉시 렌더 큐에 올린다.
          const rect = block.getBoundingClientRect()
          const isNearViewport = rect.bottom >= -320 && rect.top <= viewportHeight + 320
          if (isNearViewport) {
            enqueueRender(index)
          }
        })
        return
      }

      for (let i = 0; i < blocks.length; i += 1) {
        enqueueRender(i)
      }
      await renderQueue
    }

    const run = async () => {
      if (running || disposed) return
      running = true
      try {
        await renderMermaidBlocks()
      } catch (error) {
        console.warn(error)
      } finally {
        running = false
      }
    }

    void run()
    const rafId = window.requestAnimationFrame(() => {
      void run()
    })
    const timerId = window.setTimeout(() => {
      void run()
    }, 120)

    return () => {
      disposed = true
      observer?.disconnect()
      retryTimers.forEach((timerId) => window.clearTimeout(timerId))
      retryTimers.clear()
      window.cancelAnimationFrame(rafId)
      window.clearTimeout(timerId)
    }
  }, [contentKey, rootRef, scheme])

  return
}

export default useMermaidEffect
