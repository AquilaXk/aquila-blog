import { type ReactElement, type ReactNode, isValidElement } from "react"

const LANGUAGE_LABEL_MAP: Record<string, string> = {
  text: "TXT",
  js: "JavaScript",
  javascript: "JavaScript",
  ts: "TypeScript",
  typescript: "TypeScript",
  tsx: "TSX",
  jsx: "JSX",
  java: "Java",
  kt: "Kotlin",
  kotlin: "Kotlin",
  py: "Python",
  python: "Python",
  sh: "Shell",
  shell: "Shell",
  bash: "Bash",
  md: "Markdown",
  markdown: "Markdown",
  yml: "YAML",
  yaml: "YAML",
  sql: "SQL",
  json: "JSON",
  html: "HTML",
  xml: "XML",
  css: "CSS",
  scss: "SCSS",
  go: "Go",
  rust: "Rust",
  rs: "Rust",
  mermaid: "Mermaid",
}

const extractTextFromNode = (node: ReactNode): string => {
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(extractTextFromNode).join("\n")
  if (!isValidElement(node)) return ""
  return extractTextFromNode((node.props as { children?: ReactNode }).children)
}

export const extractTextFromCodeAst = (node: unknown): string => {
  if (!node || typeof node !== "object") return ""

  const textValue = (node as { value?: unknown }).value
  if (typeof textValue === "string" || typeof textValue === "number") {
    return String(textValue)
  }

  const children = (node as { children?: unknown }).children
  if (!Array.isArray(children)) return ""
  return children.map(extractTextFromCodeAst).join("")
}

export const extractCodeMetaFromPreChildren = (children: ReactNode) => {
  const list = Array.isArray(children) ? children : [children]
  const codeElement = list.find(
    (child): child is ReactElement<Record<string, unknown>> =>
      isValidElement(child) && typeof child.type === "string" && child.type.toLowerCase() === "code"
  )

  const codeClassName =
    typeof codeElement?.props.className === "string" ? codeElement.props.className : ""
  const classLanguage =
    codeClassName
      .split(" ")
      .map((token) => token.trim())
      .find((token) => token.startsWith("language-"))
      ?.replace("language-", "")
      .toLowerCase() || ""

  const dataLanguage =
    typeof codeElement?.props["data-language"] === "string"
      ? String(codeElement.props["data-language"]).toLowerCase()
      : ""
  const dataRawCode =
    typeof codeElement?.props["data-raw-code"] === "string"
      ? String(codeElement.props["data-raw-code"])
      : ""

  const codeChildren = (codeElement?.props.children as ReactNode | undefined) ?? children
  const rawCodeFromChildren = extractTextFromNode(codeChildren)
  const rawCodeFromAst = extractTextFromCodeAst(codeElement?.props.node)
  const rawCode = (dataRawCode || rawCodeFromChildren || rawCodeFromAst).replace(/\n$/, "")

  return {
    language: dataLanguage || classLanguage || "text",
    rawCode,
  }
}

export const toLanguageLabel = (lang: string) => {
  const normalized = lang.trim().toLowerCase()
  if (!normalized) return "TXT"
  return LANGUAGE_LABEL_MAP[normalized] || normalized.toUpperCase()
}

export const hashString = (value: string) => {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}
