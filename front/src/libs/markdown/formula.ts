type RenderFormulaOptions = {
  displayMode?: boolean
}

const FALLBACK_PREFIX = "aq-formula-fallback"

type KatexModule = typeof import("katex")

let katexPromise: Promise<KatexModule["default"]> | null = null

const loadKatex = () => {
  if (!katexPromise) {
    katexPromise = import("katex").then((module) => module.default)
  }

  return katexPromise
}

export const renderFormulaFallbackHtml = (
  formula: string,
  { displayMode = true }: RenderFormulaOptions = {}
) => {
  const normalized = String(formula || "").trim()
  if (!normalized) return ""

  return displayMode
    ? `<code class="${FALLBACK_PREFIX}">${escapeFormulaHtml(normalized)}</code>`
    : `<span class="${FALLBACK_PREFIX}">${escapeFormulaHtml(normalized)}</span>`
}

const escapeFormulaHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;")

export const renderFormulaToHtml = async (
  formula: string,
  { displayMode = true }: RenderFormulaOptions = {}
) => {
  const normalized = String(formula || "").trim()
  if (!normalized) return ""

  try {
    const katex = await loadKatex()
    return katex.renderToString(normalized, {
      displayMode,
      throwOnError: false,
      strict: "ignore",
      output: "html",
      trust: false,
    })
  } catch {
    return renderFormulaFallbackHtml(normalized, { displayMode })
  }
}
