import { RefObject, useEffect } from "react"
import useScheme from "src/hooks/useScheme"

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
    const renderMermaidBlocks = async () => {
      const codeBlocks = Array.from(
        root.querySelectorAll<HTMLElement>(
          "pre > code.language-mermaid, pre.aq-mermaid > code.language-mermaid"
        )
      )
      if (!codeBlocks.length) return

      const mermaid = (await import("mermaid")).default
      const theme = scheme === "dark" ? "dark" : "neutral"

      mermaid.initialize({
        startOnLoad: false,
        theme,
        flowchart: {
          htmlLabels: true,
          curve: "linear",
          useMaxWidth: true,
        },
      })

      for (let i = 0; i < codeBlocks.length; i += 1) {
        if (disposed) return
        const codeBlock = codeBlocks[i]
        const block = codeBlock.closest<HTMLElement>("pre")
        if (!block) continue
        const source =
          block.dataset.mermaidSource || codeBlock.textContent?.trim() || ""
        if (!source) continue

        const alreadyRendered =
          (block.dataset.mermaidRendered === "true" ||
            block.dataset.mermaidRendered === "error") &&
          block.dataset.mermaidSource === source &&
          block.dataset.mermaidTheme === theme
        if (alreadyRendered) continue

        try {
          const id = `mermaid-${i}-${Math.random().toString(36).slice(2)}`
          const { svg } = await mermaid.render(id, source)
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

          block.dataset.mermaidSource = source
          block.dataset.mermaidTheme = theme
          block.dataset.mermaidRendered = "true"
          block.innerHTML = wrappedSvg
        } catch (error) {
          const escapedSource = source
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")

          block.dataset.mermaidSource = source
          block.dataset.mermaidTheme = theme
          block.dataset.mermaidRendered = "error"
          block.innerHTML = `
            <div style="color:#b42318;font-weight:600;margin-bottom:0.5rem;">
              Mermaid 문법 오류: 다이어그램 코드를 확인하세요.
            </div>
            <code style="white-space:pre-wrap;display:block;">${escapedSource}</code>
          `
          console.warn("[mermaid] render failed", error)
        }
      }
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

    run()

    const observer = new MutationObserver(() => {
      if (disposed) return
      run()
    })

    observer.observe(root, { childList: true, subtree: true })

    return () => {
      disposed = true
      observer.disconnect()
    }
  }, [contentKey, rootRef, scheme])

  return
}

export default useMermaidEffect
