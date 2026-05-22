export const isMermaidMutationTarget = (node: Node | null): boolean => {
  if (!node) return false
  if (node.nodeType === Node.TEXT_NODE) {
    return isMermaidMutationTarget(node.parentElement)
  }
  if (!(node instanceof Element)) return false
  return Boolean(
    node.closest(
      "pre.aq-mermaid, pre[data-aq-mermaid='true'], pre[data-language='mermaid'], pre > code.language-mermaid, pre > code[data-language='mermaid']"
    )
  )
}

const isInternalMermaidRenderNode = (node: Node | null) => {
  if (!node) return false
  const element =
    node instanceof Element ? node : node.nodeType === Node.TEXT_NODE ? node.parentElement : null
  if (!element) return false
  return Boolean(
    element.closest(".aq-mermaid-stage, .aq-mermaid-expand-btn, [data-aq-mermaid-overlay='true']")
  )
}

export const shouldScheduleFromMermaidMutations = (mutations: MutationRecord[]) => {
  for (const mutation of mutations) {
    if (mutation.type === "characterData") {
      if (isInternalMermaidRenderNode(mutation.target)) continue
      if (isMermaidMutationTarget(mutation.target)) return true
      continue
    }

    if (isInternalMermaidRenderNode(mutation.target)) continue
    if (isMermaidMutationTarget(mutation.target)) return true

    for (const node of Array.from(mutation.addedNodes)) {
      if (isInternalMermaidRenderNode(node)) continue
      if (isMermaidMutationTarget(node)) return true
    }
    for (const node of Array.from(mutation.removedNodes)) {
      if (isInternalMermaidRenderNode(node)) continue
      if (isMermaidMutationTarget(node)) return true
    }
  }
  return false
}
