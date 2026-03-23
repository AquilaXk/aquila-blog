import { RefObject, useEffect } from "react"

type PrismLike = {
  languages?: Record<string, unknown>
  highlightAllUnder: (container: Element) => void
  highlightElement: (element: Element) => void
}

let prismLoader: Promise<PrismLike> | null = null
const loadedLoaders = new Set<string>()
const failedLoaders = new Set<string>()

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

const normalizeLanguage = (className: string) => className.replace("language-", "").trim().toLowerCase()

const extractLanguageFromClassList = (block: HTMLElement) =>
  Array.from(block.classList)
    .find((className) => className.startsWith("language-"))
    ?.replace("language-", "")
    .trim()
    .toLowerCase() || ""

const inferLanguageFromSource = (source: string): string => {
  const sample = source.trim()
  if (!sample) return "text"

  if (/^\s*[{[][\s\S]*[}\]]\s*$/.test(sample) && /"\s*:/.test(sample)) return "json"
  if (/(^|\n)\s*(fun|val|var|data class|object|companion object)\b/.test(sample)) return "kotlin"
  if (/(^|\n)\s*(public|private|protected)\s+(class|interface|enum)\b/.test(sample)) return "java"
  if (/(^|\n)\s*(interface|type)\s+\w+/.test(sample) || /:\s*(string|number|boolean|unknown|any)\b/.test(sample)) return "typescript"
  if (/(^|\n)\s*(const|let|var)\s+\w+\s*=/.test(sample) || /=>/.test(sample)) return "javascript"
  if (/(^|\n)\s*def\s+\w+\(/.test(sample) || /(^|\n)\s*class\s+\w+\s*:\s*$/.test(sample)) return "python"
  if (/(^|\n)\s*(SELECT|INSERT|UPDATE|DELETE|WITH)\b/i.test(sample)) return "sql"
  if (/^#!/.test(sample) || /(^|\n)\s*(echo|grep|awk|sed|curl|export)\b/.test(sample)) return "bash"
  if (/(^|\n)\s*<([A-Za-z][\w:-]*)(\s|>)/.test(sample) && /<\/[A-Za-z][\w:-]*>/.test(sample)) return "markup"
  if (/(^|\n)\s*[-\w]+\s*:\s*.+/.test(sample) && !/[;{}()]/.test(sample)) return "yaml"

  return "text"
}

const extractLanguage = (block: HTMLElement): string => {
  const classLanguage = extractLanguageFromClassList(block)
  if (classLanguage) return classLanguage

  const dataLanguage =
    block.getAttribute("data-language")?.trim().toLowerCase() ||
    block.closest("pre")?.getAttribute("data-language")?.trim().toLowerCase() ||
    ""
  if (dataLanguage) return dataLanguage

  return ""
}

const isGenericLanguage = (language: string) =>
  ["", "text", "plain", "plaintext", "txt"].includes(language)

const loadPrismCore = async () => {
  if (!prismLoader) {
    prismLoader = import("prismjs").then((prismModule) => {
      const prism = (prismModule.default || prismModule) as PrismLike
      ;(globalThis as { Prism?: PrismLike }).Prism = prism
      return prism
    })
  }

  return prismLoader
}

const ensurePrismLanguages = async (languages: string[]) => {
  const uniqueLanguages = Array.from(new Set(languages.map(normalizeLanguage)))

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

const usePrismEffect = (rootRef: RefObject<HTMLElement>, contentKey: string, enabled = true) => {
  useEffect(() => {
    if (!enabled) return

    let disposed = false
    let running = false
    const root = rootRef.current
    if (!root) return

    const run = async () => {
      if (disposed || running) return
      running = true
      try {
        const codeBlocks = Array.from(root.querySelectorAll<HTMLElement>("pre > code"))
        if (!codeBlocks.length) return

        const languageByBlock = codeBlocks
          .map((block) => ({
            block,
            rawLanguage: extractLanguage(block),
            source: block.textContent || "",
          }))
          .map((entry) => {
            const inferred = isGenericLanguage(entry.rawLanguage)
              ? inferLanguageFromSource(entry.source)
              : entry.rawLanguage

            return {
              ...entry,
              language: inferred,
              shouldHighlight:
                inferred.length > 0 &&
                inferred !== "mermaid" &&
                (!blockHasShikiTheme(entry.block) || isGenericLanguage(entry.rawLanguage)),
            }
          })
          .filter((entry) => entry.shouldHighlight)

        const languages = languageByBlock
          .map((entry) => entry.language)
          .filter((language) => language !== "mermaid" && language !== "text")

        if (!languages.length) return

        const Prism = await loadPrismCore()
        await ensurePrismLanguages(languages)
        if (disposed) return

        languageByBlock.forEach(({ block, language, source }) => {
          if (language === "mermaid" || language === "text") return

          const alreadyHighlighted =
            block.dataset.prismLanguage === language &&
            block.dataset.prismSource === source
          if (alreadyHighlighted) return

          const hasGrammar = Boolean(Prism.languages?.[language])
          if (!hasGrammar) {
            block.dataset.prismLanguage = language
            block.dataset.prismSource = source
            block.setAttribute("data-language", language)
            return
          }

          Array.from(block.classList)
            .filter((className) => className.startsWith("language-"))
            .forEach((className) => block.classList.remove(className))
          block.classList.add(`language-${language}`)

          Prism.highlightElement(block)
          block.dataset.prismLanguage = language
          block.dataset.prismSource = source
          block.setAttribute("data-language", language)
        })
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

    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
    })

    return () => {
      disposed = true
      observer.disconnect()
    }
  }, [contentKey, enabled, rootRef])
}

const blockHasShikiTheme = (block: HTMLElement) =>
  Boolean(block.getAttribute("data-theme") || block.closest("pre")?.getAttribute("data-theme"))

export default usePrismEffect
