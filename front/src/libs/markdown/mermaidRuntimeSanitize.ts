import {
  MERMAID_FLOWCHART_HEADER_PATTERN,
  MERMAID_INIT_DIRECTIVE_PATTERN,
  MERMAID_RENDER_TIMEOUT_MS,
  MERMAID_RISKY_INIT_KEY_PATTERN,
  MERMAID_RISKY_STYLE_DIRECTIVE_PATTERN,
} from "src/libs/markdown/mermaidRuntimeConfig"

export const stripRiskyFlowchartDirectives = (source: string) =>
  source
    .split("\n")
    .filter((line) => !MERMAID_RISKY_STYLE_DIRECTIVE_PATTERN.test(line))
    .join("\n")

const stripLeadingMermaidInitDirective = (source: string) => {
  const directiveMatch = source.match(MERMAID_INIT_DIRECTIVE_PATTERN)
  if (!directiveMatch) return source
  return source.slice(directiveMatch[0].length).trimStart()
}

const splitMermaidTopLevelEntries = (value: string) => {
  const entries: string[] = []
  let current = ""
  let quote: "'" | '"' | null = null
  let escaped = false
  let depth = 0

  for (const char of value) {
    if (quote) {
      current += char
      if (escaped) {
        escaped = false
        continue
      }
      if (char === "\\") {
        escaped = true
        continue
      }
      if (char === quote) {
        quote = null
      }
      continue
    }

    if (char === "'" || char === '"') {
      quote = char
      current += char
      continue
    }

    if (char === "{" || char === "[" || char === "(") {
      depth += 1
      current += char
      continue
    }

    if (char === "}" || char === "]" || char === ")") {
      depth = Math.max(0, depth - 1)
      current += char
      continue
    }

    if (char === "," && depth === 0) {
      const trimmed = current.trim()
      if (trimmed) entries.push(trimmed)
      current = ""
      continue
    }

    current += char
  }

  const trimmed = current.trim()
  if (trimmed) entries.push(trimmed)
  return entries
}

const extractMermaidInitEntryKey = (entry: string) => {
  const match = entry
    .trim()
    .match(/^(?:"([^"]+)"|'([^']+)'|([A-Za-z_$][\w$-]*))\s*:/)
  return match?.[1] || match?.[2] || match?.[3] || null
}

const stripRiskyFlowchartInitDirective = (source: string) => {
  const directiveMatch = source.match(MERMAID_INIT_DIRECTIVE_PATTERN)
  if (!directiveMatch) return source

  const [directive, directiveKind, rawConfigLiteral] = directiveMatch
  const remainder = source.slice(directive.length)
  const trimmedConfigLiteral = rawConfigLiteral.trim()
  const referencesVisualOverride =
    /\b(?:themeVariables|themeCSS|theme|darkMode)\b/i.test(trimmedConfigLiteral)
  if (!referencesVisualOverride) return source

  if (!trimmedConfigLiteral.startsWith("{") || !trimmedConfigLiteral.endsWith("}")) {
    return remainder
  }

  const innerLiteral = trimmedConfigLiteral.slice(1, -1)
  const entries = splitMermaidTopLevelEntries(innerLiteral)
  if (!entries.length) return remainder

  const safeEntries: string[] = []
  for (const entry of entries) {
    const key = extractMermaidInitEntryKey(entry)
    if (!key) {
      return remainder
    }
    if (MERMAID_RISKY_INIT_KEY_PATTERN.test(key)) continue
    safeEntries.push(entry.trim())
  }

  if (!safeEntries.length) return remainder

  const sanitizedDirective = `%%{${directiveKind}: { ${safeEntries.join(", ")} }}%%`
  return remainder.trim()
    ? `${sanitizedDirective}\n${remainder.trimStart()}`
    : sanitizedDirective
}

export const sanitizeRenderableMermaidSource = (source: string) => {
  const trimmed = source.trim()
  const flowchartCandidate = stripLeadingMermaidInitDirective(trimmed)
  if (!MERMAID_FLOWCHART_HEADER_PATTERN.test(flowchartCandidate)) return trimmed

  const withoutRiskyInitDirective = stripRiskyFlowchartInitDirective(trimmed)
  const sanitized = stripRiskyFlowchartDirectives(withoutRiskyInitDirective).trim()
  return sanitized || withoutRiskyInitDirective || trimmed
}

export const stabilizeMermaidSvgLabels = (svgElement: SVGSVGElement) => {
  svgElement
    .querySelectorAll<HTMLElement>(
      ".nodeLabel p, .edgeLabel p, .nodeLabel div, .edgeLabel div, .nodeLabel span, .edgeLabel span"
    )
    .forEach((labelElement) => {
      labelElement.style.margin = "0"
      labelElement.style.lineHeight = "1.18"
      labelElement.style.display = "inline-block"
      labelElement.style.boxSizing = "border-box"
      labelElement.style.paddingTop = "0.08em"
      labelElement.style.paddingBottom = "0.18em"
    })

  svgElement
    .querySelectorAll<SVGElement>("foreignObject, .nodeLabel, .edgeLabel")
    .forEach((labelContainer) => {
      labelContainer.style.overflow = "visible"
    })
}

const escapeMermaidHtml = (value: string) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")

export const isMermaidRenderTimeoutError = (error: unknown) =>
  String(error || "").includes("MERMAID_RENDER_TIMEOUT")

const toMermaidErrorMessage = (error: unknown) => {
  const normalized = String(error || "")
    .replace(/\s+/g, " ")
    .trim()
  const lineMatch = normalized.match(/line\s+(\d+)/i)
  if (lineMatch) {
    return `${lineMatch[1]}번째 줄 근처 문법을 확인해 주세요.`
  }
  if (isMermaidRenderTimeoutError(error)) {
    return "다이어그램이 복잡해 렌더 시간이 초과되었습니다. 노드/연결을 나누거나 확대 보기로 확인해 주세요."
  }
  if (normalized.toLowerCase().includes("parse error")) {
    return "문법을 해석하지 못했습니다. 블록 문법을 다시 확인해 주세요."
  }
  return "문법 또는 블록 구조를 확인해 주세요."
}

export const renderMermaidErrorState = ({ source, error }: { source: string; error: unknown }) => {
  const escapedSource = escapeMermaidHtml(source)
  const escapedError = escapeMermaidHtml(String(error || "알 수 없는 오류"))
  const guidance = toMermaidErrorMessage(error)
  return `
    <div class="aq-mermaid-error-state" role="status" aria-live="polite">
      <div class="aq-mermaid-error-title">Mermaid를 렌더하지 못했습니다.</div>
      <p class="aq-mermaid-error-description">${guidance}</p>
      <p class="aq-mermaid-error-guidance">특수문자나 긴 라벨은 따옴표로 감싸고, 블록/화살표 문법이 줄 단위로 닫혔는지 먼저 확인해 주세요.</p>
      <details class="aq-mermaid-error-details">
        <summary>Mermaid 코드 보기</summary>
        <code class="aq-mermaid-error-code">${escapedSource}</code>
      </details>
      <details class="aq-mermaid-error-details">
        <summary>상세 오류 보기</summary>
        <code class="aq-mermaid-error-code">${escapedError}</code>
      </details>
    </div>
  `
}

export const isNegativeRectWidthError = (error: unknown) => {
  const message = String(error)
  return message.includes("attribute width") && message.includes("negative value")
}

export const isMermaidSyntaxError = (error: unknown) => {
  const normalized = String(error || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
  if (!normalized) return false

  return (
    normalized.includes("parse error") ||
    normalized.includes("syntax error") ||
    normalized.includes("lexical error") ||
    normalized.includes("expecting") ||
    normalized.includes("unknown diagram")
  )
}

export const createMermaidRenderTimeoutError = () =>
  new Error(`MERMAID_RENDER_TIMEOUT:${MERMAID_RENDER_TIMEOUT_MS}`)
