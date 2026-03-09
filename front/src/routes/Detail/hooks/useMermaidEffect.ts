import { RefObject, useEffect } from "react"
import useScheme from "src/hooks/useScheme"

const useMermaidEffect = (rootRef?: RefObject<HTMLElement>) => {
  const [scheme] = useScheme()

  useEffect(() => {
    const root = rootRef?.current
    if (!root) return

    let disposed = false
    let running = false

    const renderMermaidBlocks = async () => {
      const codeBlocks = Array.from(
        root.querySelectorAll<HTMLElement>("pre.notion-code > code.language-mermaid")
      )
      if (!codeBlocks.length) return

      const mermaid = (await import("mermaid")).default
      const theme = scheme === "dark" ? "dark" : "default"

      mermaid.initialize({
        startOnLoad: false,
        theme,
        themeCSS: `
          .node rect {
            rx: 12px;
            ry: 12px;
          }
          .edgeLabel rect {
            fill: transparent !important;
            stroke: none !important;
          }
          .node polygon {
            stroke-width: 1.5px;
          }
          .label foreignObject div {
            line-height: 1.35;
            font-size: 15px;
          }
          .edgePath path {
            stroke-width: 1.5px;
          }
          .node rect,
          .node polygon {
            stroke-width: 1.5px;
          }
        `,
      })

      for (let i = 0; i < codeBlocks.length; i += 1) {
        if (disposed) return
        const codeBlock = codeBlocks[i]
        const block = codeBlock.closest<HTMLElement>("pre.notion-code")
        if (!block) continue
        const source =
          block.dataset.mermaidSource || codeBlock.textContent?.trim() || ""
        if (!source) continue

        const alreadyRendered =
          block.dataset.mermaidRendered === "true" &&
          block.dataset.mermaidSource === source &&
          block.dataset.mermaidTheme === theme
        if (alreadyRendered) continue

        const id = `mermaid-${i}-${Math.random().toString(36).slice(2)}`
        const { svg } = await mermaid.render(id, source)
        if (disposed) return

        block.dataset.mermaidSource = source
        block.dataset.mermaidTheme = theme
        block.dataset.mermaidRendered = "true"
        block.innerHTML = svg
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
  }, [rootRef, scheme])

  return
}

export default useMermaidEffect
