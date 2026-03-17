import { RefObject, useEffect } from "react"
import useScheme from "src/hooks/useScheme"
import { extractNormalizedMermaidSource } from "src/libs/markdown/mermaid"

const MERMAID_SOURCE_PATTERN =
  /^(%%\{|\s*(?:flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie|mindmap|timeline|gitGraph|quadrantChart|requirementDiagram|c4Context|C4Context|xychart-beta)\b)/

const MERMAID_EDGE_PATTERN = /-->|==>|-.->|:::|subgraph\b|classDef\b|style\b/i

const isMermaidSource = (rawCode: string) => {
  const normalized = rawCode.trim()
  if (!normalized) return false

  const fenced = normalized.match(/^[`~]{3,}\s*mermaid\b[\t ]*\n([\s\S]*?)\n[`~]{3,}\s*$/i)
  const body = (fenced?.[1] || normalized).trim()
  if (!body) return false

  const lines = body.split("\n").map((line) => line.trim()).filter(Boolean)
  if (!lines.length) return false

  const firstLine = lines[0].replace(/^\d+\s+/, "")
  if (MERMAID_SOURCE_PATTERN.test(firstLine)) return true

  return MERMAID_EDGE_PATTERN.test(body)
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
    const loggedErrorSignatures = new Set<string>()

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
        if (retryCount >= 4) return
        block.dataset.mermaidRetryCount = String(retryCount + 1)
        const timerId = window.setTimeout(() => {
          retryTimers.delete(timerId)
          enqueueRender(index)
        }, 120 * (retryCount + 1))
        retryTimers.add(timerId)
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
        // GitHub와 동일하게 명시적 mermaid fence(힌트)에서만 렌더한다.
        if (!hasMermaidHint) return

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
            const stage = document.createElement("div")
            stage.className = "aq-mermaid-stage mermaid"
            stage.textContent = source
            block.innerHTML = ""
            block.appendChild(stage)

            // Mermaid 공식 렌더 경로(run)를 사용해 GitHub 동작과 최대한 동일하게 맞춘다.
            await mermaid.run({
              nodes: [stage],
              suppressErrors: false,
            })
            if (disposed) return

            if (!stage.querySelector("svg")) {
              throw new Error("Mermaid SVG 생성 실패")
            }

            block.dataset.mermaidSource = source
            block.dataset.mermaidTheme = theme
            block.dataset.mermaidRendered = "true"
            block.dataset.mermaidRetryCount = "0"
            block.classList.remove("aq-mermaid-error")
          } catch (error) {
            if (isNegativeRectWidthError(error)) {
              const retryCount = Number.parseInt(block.dataset.mermaidRetryCount || "0", 10)

              if (retryCount >= 2) {
                const fallbackSource = stripRiskyFlowchartDirectives(source).trim()
                if (fallbackSource && fallbackSource !== source) {
                  try {
                    const fallbackStage = document.createElement("div")
                    fallbackStage.className = "aq-mermaid-stage mermaid"
                    fallbackStage.textContent = fallbackSource
                    block.innerHTML = ""
                    block.appendChild(fallbackStage)

                    await mermaid.run({
                      nodes: [fallbackStage],
                      suppressErrors: false,
                    })
                    if (disposed) return

                    if (fallbackStage.querySelector("svg")) {
                    block.dataset.mermaidSource = fallbackSource
                    block.dataset.mermaidTheme = theme
                    block.dataset.mermaidRendered = "true"
                    block.dataset.mermaidRetryCount = "0"
                      block.classList.remove("aq-mermaid-error")
                      return
                    }
                  } catch (fallbackError) {
                    const signature = `fallback:${fallbackSource}:${String(fallbackError)}`
                    if (!loggedErrorSignatures.has(signature)) {
                      loggedErrorSignatures.add(signature)
                      console.warn("[mermaid] fallback render failed", fallbackError)
                    }
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
          block.classList.add("aq-mermaid-error")
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
    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => void run()) : null
    resizeObserver?.observe(root)

    return () => {
      disposed = true
      observer?.disconnect()
      resizeObserver?.disconnect()
      retryTimers.forEach((timerId) => window.clearTimeout(timerId))
      retryTimers.clear()
      window.cancelAnimationFrame(rafId)
      window.clearTimeout(timerId)
    }
  }, [contentKey, rootRef, scheme])

  return
}

export default useMermaidEffect
