import { RefObject, useEffect } from "react"

const INLINE_COLOR_TOKEN_REGEX = /\{\{\s*color\s*:\s*([^|{}]+?)\s*\|\s*([^{}]+?)\s*\}\}/gi
const HEX_COLOR_REGEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/

const NAMED_COLORS: Record<string, string> = {
  sky: "#60a5fa",
  violet: "#a78bfa",
  green: "#34d399",
  orange: "#fb923c",
  rose: "#f472b6",
  yellow: "#facc15",
  slate: "#94a3b8",
}

const toCssColor = (raw: string) => {
  const value = raw.trim().toLowerCase()
  if (HEX_COLOR_REGEX.test(value)) return value
  return NAMED_COLORS[value] || null
}

const useInlineColorEffect = (rootRef: RefObject<HTMLElement>, contentKey: string) => {
  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    let rafId: number | null = null
    let destroyed = false

    const applyInlineColor = () => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      const textNodes: Text[] = []

      while (walker.nextNode()) {
        const node = walker.currentNode as Text
        const parent = node.parentElement
        if (!parent) continue
        if (parent.closest("pre, code, textarea, script, style, .aq-inline-color")) continue
        if (!node.nodeValue || !node.nodeValue.includes("{{")) continue
        textNodes.push(node)
      }

      textNodes.forEach((textNode) => {
        const original = textNode.nodeValue || ""
        INLINE_COLOR_TOKEN_REGEX.lastIndex = 0
        let matched = false
        let cursor = 0
        const fragment = document.createDocumentFragment()

        for (const match of original.matchAll(INLINE_COLOR_TOKEN_REGEX)) {
          const full = match[0]
          const colorToken = match[1]
          const content = match[2].trim()
          const start = match.index ?? 0
          const cssColor = toCssColor(colorToken)

          if (start > cursor) {
            fragment.appendChild(document.createTextNode(original.slice(cursor, start)))
          }

          if (!cssColor || !content) {
            fragment.appendChild(document.createTextNode(full))
          } else {
            const span = document.createElement("span")
            span.className = "aq-inline-color"
            span.style.setProperty("--aq-inline-color", cssColor)
            span.textContent = content
            fragment.appendChild(span)
            matched = true
          }

          cursor = start + full.length
        }

        if (!matched) return

        if (cursor < original.length) {
          fragment.appendChild(document.createTextNode(original.slice(cursor)))
        }

        textNode.parentNode?.replaceChild(fragment, textNode)
      })
    }

    const scheduleApply = () => {
      if (destroyed) return
      if (rafId !== null) return
      rafId = window.requestAnimationFrame(() => {
        rafId = null
        applyInlineColor()
      })
    }

    applyInlineColor()

    const observer = new MutationObserver(() => {
      scheduleApply()
    })

    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
    })

    return () => {
      destroyed = true
      observer.disconnect()
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId)
      }
    }
  }, [contentKey, rootRef])
}

export default useInlineColorEffect
