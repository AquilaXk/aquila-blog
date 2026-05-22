export type CodeLanguageOption = {
  value: string
  label: string
  keywords?: string[]
}

const CODE_LANGUAGE_STORAGE_KEY = "aq.editor.preferredCodeLanguage"
let preferredCodeLanguage = "text"

const CODE_LANGUAGE_OPTIONS: CodeLanguageOption[] = [
  { value: "text", label: "TXT", keywords: ["plain text", "plaintext", "txt"] },
  { value: "bash", label: "Bash", keywords: ["shell", "sh"] },
  { value: "shell", label: "Shell", keywords: ["bash", "sh"] },
  { value: "javascript", label: "JavaScript", keywords: ["js"] },
  { value: "typescript", label: "TypeScript", keywords: ["ts"] },
  { value: "jsx", label: "JSX" },
  { value: "tsx", label: "TSX" },
  { value: "json", label: "JSON" },
  { value: "yaml", label: "YAML", keywords: ["yml"] },
  { value: "markdown", label: "Markdown", keywords: ["md"] },
  { value: "html", label: "HTML" },
  { value: "css", label: "CSS" },
  { value: "sql", label: "SQL" },
  { value: "python", label: "Python", keywords: ["py"] },
  { value: "java", label: "Java" },
  { value: "kotlin", label: "Kotlin", keywords: ["kt"] },
  { value: "go", label: "Go" },
  { value: "rust", label: "Rust", keywords: ["rs"] },
  { value: "php", label: "PHP" },
  { value: "ruby", label: "Ruby", keywords: ["rb"] },
  { value: "swift", label: "Swift" },
  { value: "objectivec", label: "Objective-C", keywords: ["objc"] },
  { value: "c", label: "C" },
  { value: "cpp", label: "C++" },
  { value: "csharp", label: "C#", keywords: ["cs"] },
  { value: "matlab", label: "MATLAB" },
  { value: "powershell", label: "PowerShell", keywords: ["ps1"] },
  { value: "nix", label: "Nix" },
  { value: "dockerfile", label: "Dockerfile", keywords: ["docker"] },
  { value: "mermaid", label: "Mermaid" },
]

const CODE_LANGUAGE_ALIASES: Record<string, string> = {
  txt: "text",
  plaintext: "text",
  "plain-text": "text",
  "plain text": "text",
  md: "markdown",
  yml: "yaml",
  sh: "shell",
  kt: "kotlin",
  py: "python",
  ts: "typescript",
  js: "javascript",
}

export const normalizeCodeLanguage = (value?: string | null) => {
  const normalized = value?.trim().toLowerCase() || "text"
  return CODE_LANGUAGE_ALIASES[normalized] || normalized
}

export const getPreferredCodeLanguage = () => {
  if (typeof window !== "undefined") {
    const stored = window.localStorage.getItem(CODE_LANGUAGE_STORAGE_KEY)
    if (stored?.trim()) {
      preferredCodeLanguage = normalizeCodeLanguage(stored)
    }
  }
  return preferredCodeLanguage
}

export const rememberPreferredCodeLanguage = (value?: string | null) => {
  preferredCodeLanguage = normalizeCodeLanguage(value)
  if (typeof window !== "undefined") {
    window.localStorage.setItem(CODE_LANGUAGE_STORAGE_KEY, preferredCodeLanguage)
  }
}

export const filterCodeLanguageOptions = (search: string) => {
  const keyword = search.trim().toLowerCase()
  if (!keyword) return CODE_LANGUAGE_OPTIONS

  return CODE_LANGUAGE_OPTIONS.filter((option) => {
    const haystacks = [option.value, option.label, ...(option.keywords || [])]
    return haystacks.some((candidate) => candidate.toLowerCase().includes(keyword))
  })
}

export const hasExactCodeLanguageSearchMatch = (
  options: CodeLanguageOption[],
  search: string
) => options.some((option) => option.value === search.trim().toLowerCase())
