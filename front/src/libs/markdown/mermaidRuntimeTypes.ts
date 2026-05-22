export type MermaidVisualPreset = "service" | "github"

export type MermaidComplexityLevel = "normal" | "high"

export type MermaidComplexitySummary = {
  level: MermaidComplexityLevel
  edgeCount: number
  nodeCount: number
}

export type MermaidRenderCacheEntry = {
  svg: string
  complexity: MermaidComplexityLevel
}

export type MermaidRuntimePreset = {
  mode: MermaidVisualPreset
  themeKey: string
  config: Record<string, unknown>
}

export type DesktopWideLaneBounds = {
  leftBound: number
  rightBound: number
}

export type MermaidRenderResult = {
  svg: string
}

export type MermaidRuntimeInstance = {
  initialize: (config: Record<string, unknown>) => void
  render: (id: string, source: string) => MermaidRenderResult | Promise<MermaidRenderResult>
  parseError?: (error: unknown, hash: unknown) => void
}
