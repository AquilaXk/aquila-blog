import Prism from "prismjs"
import "prismjs/components/prism-markup.js"
import "prismjs/components/prism-markup-templating.js"
import "prismjs/components/prism-clike.js"
import "prismjs/components/prism-css.js"
import "prismjs/components/prism-javascript.js"
import "prismjs/components/prism-jsx.js"
import "prismjs/components/prism-typescript.js"
import "prismjs/components/prism-tsx.js"
import "prismjs/components/prism-bash.js"
import "prismjs/components/prism-json.js"
import "prismjs/components/prism-yaml.js"
import "prismjs/components/prism-markdown.js"
import "prismjs/components/prism-sql.js"
import "prismjs/components/prism-python.js"
import "prismjs/components/prism-java.js"
import "prismjs/components/prism-kotlin.js"

export type PrismLike = {
  languages?: Record<string, unknown>
  highlightElement: (element: Element) => void
  highlight?: (text: string, grammar: unknown, language: string) => string
}

;(globalThis as { Prism?: PrismLike }).Prism = Prism as PrismLike

let prismLoader: Promise<PrismLike> | null = null
const loadedLoaders = new Set<string>()
const failedLoaders = new Set<string>()
const loadedSyncLoaders = new Set<string>()
const failedSyncLoaders = new Set<string>()

const syncRequire = (specifier: string) => require(specifier)

const prismGrammarAliases: Record<string, string[]> = {
  html: ["markup"],
  xml: ["markup"],
  svg: ["markup"],
  js: ["javascript"],
  ts: ["typescript"],
  sh: ["bash"],
  shell: ["bash"],
  yml: ["yaml"],
  kt: ["kotlin"],
}

const prismImmediateLanguageLoaders: Record<string, (() => unknown)[]> = {
  markup: [() => syncRequire("prismjs/components/prism-markup.js")],
  html: [() => syncRequire("prismjs/components/prism-markup.js")],
  xml: [() => syncRequire("prismjs/components/prism-markup.js")],
  svg: [() => syncRequire("prismjs/components/prism-markup.js")],
  javascript: [
    () => syncRequire("prismjs/components/prism-markup-templating.js"),
    () => syncRequire("prismjs/components/prism-javascript.js"),
  ],
  js: [
    () => syncRequire("prismjs/components/prism-markup-templating.js"),
    () => syncRequire("prismjs/components/prism-javascript.js"),
  ],
  jsx: [
    () => syncRequire("prismjs/components/prism-markup.js"),
    () => syncRequire("prismjs/components/prism-markup-templating.js"),
    () => syncRequire("prismjs/components/prism-javascript.js"),
    () => syncRequire("prismjs/components/prism-jsx.js"),
  ],
  typescript: [
    () => syncRequire("prismjs/components/prism-markup-templating.js"),
    () => syncRequire("prismjs/components/prism-javascript.js"),
    () => syncRequire("prismjs/components/prism-typescript.js"),
  ],
  ts: [
    () => syncRequire("prismjs/components/prism-markup-templating.js"),
    () => syncRequire("prismjs/components/prism-javascript.js"),
    () => syncRequire("prismjs/components/prism-typescript.js"),
  ],
  bash: [() => syncRequire("prismjs/components/prism-bash.js")],
  shell: [() => syncRequire("prismjs/components/prism-bash.js")],
  sh: [() => syncRequire("prismjs/components/prism-bash.js")],
  json: [() => syncRequire("prismjs/components/prism-json.js")],
  yaml: [() => syncRequire("prismjs/components/prism-yaml.js")],
  yml: [() => syncRequire("prismjs/components/prism-yaml.js")],
  markdown: [() => syncRequire("prismjs/components/prism-markdown.js")],
  md: [() => syncRequire("prismjs/components/prism-markdown.js")],
  sql: [() => syncRequire("prismjs/components/prism-sql.js")],
  python: [() => syncRequire("prismjs/components/prism-python.js")],
  py: [() => syncRequire("prismjs/components/prism-python.js")],
  java: [
    () => syncRequire("prismjs/components/prism-clike.js"),
    () => syncRequire("prismjs/components/prism-java.js"),
  ],
  kotlin: [
    () => syncRequire("prismjs/components/prism-clike.js"),
    () => syncRequire("prismjs/components/prism-kotlin.js"),
  ],
  kt: [
    () => syncRequire("prismjs/components/prism-clike.js"),
    () => syncRequire("prismjs/components/prism-kotlin.js"),
  ],
}

const prismLanguageLoaders: Record<string, (() => Promise<unknown>)[]> = {
  markup: [() => import("prismjs/components/prism-markup.js")],
  html: [() => import("prismjs/components/prism-markup.js")],
  xml: [() => import("prismjs/components/prism-markup.js")],
  svg: [() => import("prismjs/components/prism-markup.js")],
  javascript: [
    () => import("prismjs/components/prism-markup-templating.js"),
    () => import("prismjs/components/prism-javascript.js"),
  ],
  js: [
    () => import("prismjs/components/prism-markup-templating.js"),
    () => import("prismjs/components/prism-javascript.js"),
  ],
  jsx: [
    () => import("prismjs/components/prism-markup.js"),
    () => import("prismjs/components/prism-markup-templating.js"),
    () => import("prismjs/components/prism-javascript.js"),
    () => import("prismjs/components/prism-jsx.js"),
  ],
  typescript: [
    () => import("prismjs/components/prism-markup-templating.js"),
    () => import("prismjs/components/prism-javascript.js"),
    () => import("prismjs/components/prism-typescript.js"),
  ],
  ts: [
    () => import("prismjs/components/prism-markup-templating.js"),
    () => import("prismjs/components/prism-javascript.js"),
    () => import("prismjs/components/prism-typescript.js"),
  ],
  tsx: [
    () => import("prismjs/components/prism-markup.js"),
    () => import("prismjs/components/prism-markup-templating.js"),
    () => import("prismjs/components/prism-javascript.js"),
    () => import("prismjs/components/prism-typescript.js"),
    () => import("prismjs/components/prism-jsx.js"),
    () => import("prismjs/components/prism-tsx.js"),
  ],
  bash: [() => import("prismjs/components/prism-bash.js")],
  shell: [() => import("prismjs/components/prism-bash.js")],
  sh: [() => import("prismjs/components/prism-bash.js")],
  c: [() => import("prismjs/components/prism-clike.js"), () => import("prismjs/components/prism-c.js")],
  cpp: [() => import("prismjs/components/prism-clike.js"), () => import("prismjs/components/prism-cpp.js")],
  "c++": [() => import("prismjs/components/prism-clike.js"), () => import("prismjs/components/prism-cpp.js")],
  csharp: [() => import("prismjs/components/prism-clike.js"), () => import("prismjs/components/prism-csharp.js")],
  cs: [() => import("prismjs/components/prism-clike.js"), () => import("prismjs/components/prism-csharp.js")],
  diff: [() => import("prismjs/components/prism-diff.js")],
  docker: [() => import("prismjs/components/prism-docker.js")],
  dockerfile: [() => import("prismjs/components/prism-docker.js")],
  git: [() => import("prismjs/components/prism-git.js")],
  go: [() => import("prismjs/components/prism-go.js")],
  groovy: [() => import("prismjs/components/prism-groovy.js")],
  gradle: [() => import("prismjs/components/prism-gradle.js")],
  graphql: [() => import("prismjs/components/prism-graphql.js")],
  handlebars: [
    () => import("prismjs/components/prism-markup-templating.js"),
    () => import("prismjs/components/prism-handlebars.js"),
  ],
  java: [() => import("prismjs/components/prism-clike.js"), () => import("prismjs/components/prism-java.js")],
  kotlin: [() => import("prismjs/components/prism-clike.js"), () => import("prismjs/components/prism-kotlin.js")],
  kt: [() => import("prismjs/components/prism-clike.js"), () => import("prismjs/components/prism-kotlin.js")],
  less: [() => import("prismjs/components/prism-less.js")],
  makefile: [() => import("prismjs/components/prism-makefile.js")],
  markdown: [() => import("prismjs/components/prism-markdown.js")],
  md: [() => import("prismjs/components/prism-markdown.js")],
  objectivec: [() => import("prismjs/components/prism-objectivec.js")],
  objc: [() => import("prismjs/components/prism-objectivec.js")],
  ocaml: [() => import("prismjs/components/prism-ocaml.js")],
  python: [() => import("prismjs/components/prism-python.js")],
  py: [() => import("prismjs/components/prism-python.js")],
  reason: [() => import("prismjs/components/prism-reason.js")],
  rust: [() => import("prismjs/components/prism-rust.js")],
  rs: [() => import("prismjs/components/prism-rust.js")],
  sass: [() => import("prismjs/components/prism-sass.js")],
  scss: [() => import("prismjs/components/prism-scss.js")],
  solidity: [() => import("prismjs/components/prism-solidity.js")],
  sol: [() => import("prismjs/components/prism-solidity.js")],
  sql: [() => import("prismjs/components/prism-sql.js")],
  stylus: [() => import("prismjs/components/prism-stylus.js")],
  swift: [() => import("prismjs/components/prism-swift.js")],
  wasm: [() => import("prismjs/components/prism-wasm.js")],
  yaml: [() => import("prismjs/components/prism-yaml.js")],
  yml: [() => import("prismjs/components/prism-yaml.js")],
}

export const normalizePrismLanguage = (className: string) =>
  className.replace("language-", "").trim().toLowerCase()

const resolvePrismLanguage = (source: string, language?: string | null) => {
  const normalizedLanguage = normalizePrismLanguage(language || "")
  return isGenericLanguage(normalizedLanguage)
    ? inferPrismLanguageFromSource(source)
    : normalizedLanguage
}

export const inferPrismLanguageFromSource = (source: string): string => {
  const sample = source.trim()
  if (!sample) return "text"

  if (/^\s*[{[][\s\S]*[}\]]\s*$/.test(sample) && /"\s*:/.test(sample)) return "json"
  if (/(^|\n)\s*(fun|val|var|data class|object|companion object)\b/.test(sample)) return "kotlin"
  if (/(^|\n)\s*(public|private|protected)\s+(class|interface|enum)\b/.test(sample)) return "java"
  if (/(^|\n)\s*(interface|type)\s+\w+/.test(sample) || /:\s*(string|number|boolean|unknown|any)\b/.test(sample))
    return "typescript"
  if (/(^|\n)\s*(const|let|var)\s+\w+\s*=/.test(sample) || /=>/.test(sample)) return "javascript"
  if (/(^|\n)\s*def\s+\w+\(/.test(sample) || /(^|\n)\s*class\s+\w+\s*:\s*$/.test(sample)) return "python"
  if (/(^|\n)\s*(SELECT|INSERT|UPDATE|DELETE|WITH)\b/i.test(sample)) return "sql"
  if (/^#!/.test(sample) || /(^|\n)\s*(echo|grep|awk|sed|curl|export)\b/.test(sample)) return "bash"
  if (/(^|\n)\s*<([A-Za-z][\w:-]*)(\s|>)/.test(sample) && /<\/[A-Za-z][\w:-]*>/.test(sample)) return "markup"
  if (/(^|\n)\s*[-\w]+\s*:\s*.+/.test(sample) && !/[;{}()]/.test(sample)) return "yaml"

  return "text"
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;")

const renderLineWrappedHtml = (source: string) =>
  source
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => `<span class="line" data-line="true">${line.length > 0 ? line : "<br />"}</span>`)
    .join("")

export const renderPlainCodeToHtml = (source: string) => renderLineWrappedHtml(escapeHtml(source))

export const loadPrismCore = async () => {
  if (!prismLoader) {
    prismLoader = Promise.resolve(Prism as PrismLike)
  }

  return prismLoader
}

export const ensurePrismLanguages = async (languages: string[]) => {
  const uniqueLanguages = Array.from(new Set(languages.map(normalizePrismLanguage)))

  for (const language of uniqueLanguages) {
    const loaders = prismLanguageLoaders[language] || []

    for (const load of loaders) {
      const cacheKey = `${language}:${load.toString()}`
      if (loadedLoaders.has(cacheKey)) continue
      if (failedLoaders.has(cacheKey)) continue
      try {
        await load()
        loadedLoaders.add(cacheKey)
      } catch (error) {
        failedLoaders.add(cacheKey)
        console.warn(`[prism] language loader failed: ${language}`, error)
      }
    }
  }
}

const isGenericLanguage = (language: string) => ["", "text", "plain", "plaintext", "txt"].includes(language)

const ensureImmediatePrismLanguages = (language: string) => {
  const loaders = prismImmediateLanguageLoaders[language] || []

  for (const load of loaders) {
    const cacheKey = `${language}:${load.toString()}`
    if (loadedSyncLoaders.has(cacheKey)) continue
    if (failedSyncLoaders.has(cacheKey)) continue
    try {
      load()
      loadedSyncLoaders.add(cacheKey)
    } catch (error) {
      failedSyncLoaders.add(cacheKey)
      console.warn(`[prism] immediate language loader failed: ${language}`, error)
    }
  }
}

const resolvePrismGrammar = (language: string) => {
  const prismLanguages = (Prism as PrismLike).languages || {}
  const candidates = [language, ...(prismGrammarAliases[language] || [])]

  for (const candidate of candidates) {
    const grammar = prismLanguages[candidate]
    if (grammar) return grammar
  }

  ensureImmediatePrismLanguages(language)

  for (const candidate of candidates) {
    const grammar = prismLanguages[candidate]
    if (grammar) return grammar
  }

  return null
}

const highlightWithPrism = (source: string, language: string) => {
  const grammar = resolvePrismGrammar(language)
  if (!grammar || typeof (Prism as PrismLike).highlight !== "function") return null
  return renderLineWrappedHtml((Prism as PrismLike).highlight!(source, grammar, language))
}

export const renderImmediateCodeToHtml = ({
  source,
  language,
}: {
  source: string
  language?: string | null
}) => {
  const resolvedLanguage = resolvePrismLanguage(source, language)

  if (resolvedLanguage === "mermaid" || resolvedLanguage === "text") {
    return {
      language: resolvedLanguage,
      highlighted: false,
      html: renderPlainCodeToHtml(source),
    }
  }

  const html = highlightWithPrism(source, resolvedLanguage)
  if (!html) {
    return {
      language: resolvedLanguage,
      highlighted: false,
      html: renderPlainCodeToHtml(source),
    }
  }

  return {
    language: resolvedLanguage,
    highlighted: true,
    html,
  }
}

export const highlightCodeToHtml = async ({
  source,
  language,
}: {
  source: string
  language?: string | null
}) => {
  const resolvedLanguage = resolvePrismLanguage(source, language)

  if (resolvedLanguage === "mermaid" || resolvedLanguage === "text") {
    return {
      language: resolvedLanguage,
      highlighted: false,
      html: renderPlainCodeToHtml(source),
    }
  }

  const immediateResult = renderImmediateCodeToHtml({ source, language: resolvedLanguage })
  if (immediateResult.highlighted) {
    return immediateResult
  }

  const loadedPrism = await loadPrismCore()
  await ensurePrismLanguages([resolvedLanguage])

  const grammar = loadedPrism.languages?.[resolvedLanguage]
  if (!grammar || typeof loadedPrism.highlight !== "function") {
    return {
      language: resolvedLanguage,
      highlighted: false,
      html: renderPlainCodeToHtml(source),
    }
  }

  return {
    language: resolvedLanguage,
    highlighted: true,
    html: renderLineWrappedHtml(loadedPrism.highlight(source, grammar, resolvedLanguage)),
  }
}
