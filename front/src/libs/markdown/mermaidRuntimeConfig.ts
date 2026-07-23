import type {
  MermaidComplexityLevel,
  MermaidComplexitySummary,
  MermaidRenderCacheEntry,
  MermaidRuntimePreset,
  MermaidVisualPreset,
} from "src/libs/markdown/mermaidRuntimeTypes"

export const MERMAID_SOURCE_PATTERN =
  /^(%%\{|\s*(?:info|flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie|mindmap|timeline|gitGraph|quadrantChart|requirementDiagram|c4Context|C4Context|xychart-beta)\b)/
export const MERMAID_FLOWCHART_HEADER_PATTERN = /^\s*(?:flowchart|graph)\b/i
export const MERMAID_RISKY_STYLE_DIRECTIVE_PATTERN = /^\s*(style|linkStyle|classDef)\b/i
export const MERMAID_INIT_DIRECTIVE_PATTERN = /^\s*%%\{\s*(init|initialize)\s*:\s*([\s\S]*?)\}\s*%%(?:\r?\n)?/i
export const MERMAID_RISKY_INIT_KEY_PATTERN = /^(theme|themeVariables|themeCSS|darkMode)$/i

export const DESKTOP_MERMAID_MIN_VIEWPORT_PX = 1201
export const MERMAID_DESKTOP_WIDE_MAX_PX = 980
export const MERMAID_DESKTOP_SAFE_MARGIN_PX = 24
export const MERMAID_EXPAND_THRESHOLD_PX = 80
export const MERMAID_VIEWPORT_ROOT_MARGIN = "360px 0px"
export const MERMAID_RENDER_TIMEOUT_MS = 6000
export const MERMAID_COMPLEX_SCALE_CAP = 0.88

const MERMAID_VISUAL_PRESET: MermaidVisualPreset = "github"
const GITHUB_MERMAID_FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji"'
const MERMAID_COMPLEX_EDGE_THRESHOLD = 80
const MERMAID_COMPLEX_NODE_THRESHOLD = 72
const MERMAID_COMPLEX_SOURCE_THRESHOLD = 16000
const MERMAID_CACHE_MAX_ENTRIES = 120
const MERMAID_EDGE_TOKENS = [
  "<-->",
  "-.->",
  "==>",
  "-->",
  "--x",
  "x--",
  "o--",
  "--o",
  "<--",
  "<->",
  "=>",
  "<=",
  "==",
] as const
const MERMAID_EDGE_TOKENS_BY_LENGTH = [...MERMAID_EDGE_TOKENS].sort(
  (left, right) => right.length - left.length
)
const mermaidRenderCache = new Map<string, MermaidRenderCacheEntry>()

export const isMermaidSource = (rawCode: string) => {
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

export const buildMermaidCacheKey = (source: string, themeKey: string, wideLane: boolean) =>
  `${themeKey}:${wideLane ? "wide" : "contained"}:${source}`

export const readMermaidCache = (cacheKey: string) => {
  const cached = mermaidRenderCache.get(cacheKey)
  if (!cached) return null
  mermaidRenderCache.delete(cacheKey)
  mermaidRenderCache.set(cacheKey, cached)
  return cached
}

export const writeMermaidCache = (cacheKey: string, value: MermaidRenderCacheEntry) => {
  if (mermaidRenderCache.has(cacheKey)) {
    mermaidRenderCache.delete(cacheKey)
  }
  mermaidRenderCache.set(cacheKey, value)
  if (mermaidRenderCache.size <= MERMAID_CACHE_MAX_ENTRIES) return
  const oldestKey = mermaidRenderCache.keys().next().value
  if (oldestKey) {
    mermaidRenderCache.delete(oldestKey)
  }
}

const countMermaidEdgeTokens = (source: string) => {
  let count = 0
  let index = 0

  while (index < source.length) {
    let matched = false
    for (const token of MERMAID_EDGE_TOKENS_BY_LENGTH) {
      if (!source.startsWith(token, index)) continue
      count += 1
      index += token.length
      matched = true
      break
    }
    if (!matched) {
      index += 1
    }
  }

  return count
}

export const estimateMermaidComplexity = (source: string): MermaidComplexitySummary => {
  const edgeCount = countMermaidEdgeTokens(source)
  const nodeCount = (source.match(/(?:\[[^\]\n]+\]|\{[^}\n]+\}|\(\([^\)\n]+\)\)|\([^\)\n]+\))/g) || []).length
  const level: MermaidComplexityLevel =
    source.length >= MERMAID_COMPLEX_SOURCE_THRESHOLD ||
    edgeCount >= MERMAID_COMPLEX_EDGE_THRESHOLD ||
    nodeCount >= MERMAID_COMPLEX_NODE_THRESHOLD
      ? "high"
      : "normal"
  return {
    level,
    edgeCount,
    nodeCount,
  }
}

const createGithubMermaidConfig = (scheme: "dark" | "light") => {
  const isDark = scheme === "dark"

  return {
    theme: "base" as const,
    darkMode: isDark,
    themeVariables: isDark
      ? {
          darkMode: true,
          background: "transparent",
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
          mainBkg: "transparent",
          clusterBkg: "transparent",
          clusterBorder: "#30363d",
          edgeLabelBackground: "transparent",
          defaultLinkColor: "#8b949e",
          actorBkg: "#161b22",
          actorBorder: "#30363d",
          actorTextColor: "#f0f6fc",
          fontFamily: GITHUB_MERMAID_FONT_STACK,
          fontSize: "14px",
        }
      : {
          darkMode: false,
          background: "transparent",
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
          mainBkg: "transparent",
          clusterBkg: "transparent",
          clusterBorder: "#d0d7de",
          edgeLabelBackground: "transparent",
          defaultLinkColor: "#57606a",
          actorBkg: "#f6f8fa",
          actorBorder: "#d0d7de",
          actorTextColor: "#24292f",
          fontFamily: GITHUB_MERMAID_FONT_STACK,
          fontSize: "14px",
        },
    securityLevel: "strict" as const,
    suppressErrorRendering: true,
    htmlLabels: true,
    flowchart: {
      curve: "linear" as const,
      useMaxWidth: true,
      padding: 20,
    },
  }
}

const createServiceMermaidConfig = (scheme: "dark" | "light") => ({
  theme: scheme === "dark" ? ("dark" as const) : ("neutral" as const),
  securityLevel: "strict" as const,
  suppressErrorRendering: true,
  htmlLabels: true,
  flowchart: {
    curve: "linear" as const,
    useMaxWidth: true,
    padding: 20,
  },
})

export const resolveMermaidPreset = (scheme: "dark" | "light"): MermaidRuntimePreset => {
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
