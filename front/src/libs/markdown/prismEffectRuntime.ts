import {
  inferPrismLanguageFromSource,
  highlightCodeToHtml,
  renderImmediateCodeToHtml,
} from "src/libs/markdown/prismRuntime"

export const PRISM_DEFAULT_MUTATION_DEBOUNCE_MS = 72
export const PRISM_INITIAL_HYDRATION_TIMEOUT_MS = 1200

type PrismScheduleRun = (options?: { fullRescan?: boolean; block?: HTMLElement }) => void

const extractLanguageFromClassList = (block: HTMLElement) =>
  Array.from(block.classList)
    .find((className) => className.startsWith("language-"))
    ?.replace("language-", "")
    .trim()
    .toLowerCase() || ""

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

const blockHasSyntaxMarkup = (block: HTMLElement) =>
  Boolean(
    block.querySelector("span.token") ||
      block.querySelector("span[style]") ||
      block.querySelector("span[data-token-type]")
  )

const extractCodeSource = (block: HTMLElement) =>
  block.getAttribute("data-raw-code") || block.dataset.prismSource || block.textContent || ""

const ensureLineWrappedHtml = ({
  html,
  language,
  source,
}: {
  html: string
  language: string
  source: string
}) => {
  if (html.includes("data-line=")) return html
  return renderImmediateCodeToHtml({ source, language }).html
}

const resolveElementFromNode = (node: Node | null): Element | null => {
  if (!node) return null
  if (node instanceof Element) return node
  if (node.nodeType === Node.TEXT_NODE) return node.parentElement
  return null
}

const resolveCodeBlockFromNode = (node: Node | null, root: HTMLElement) => {
  const element = resolveElementFromNode(node)
  if (!element) return null
  const codeBlock = element.matches("pre > code") ? element : element.closest("pre > code")
  if (!(codeBlock instanceof HTMLElement)) return null
  if (!root.contains(codeBlock)) return null
  return codeBlock
}

const isPrismTokenNode = (node: Node | null) => {
  const element = resolveElementFromNode(node)
  if (!element) return false
  return Boolean(element.matches("span.token") || element.closest("span.token"))
}

export const createPrismEffectRuntime = ({
  root,
  isDisposed,
}: {
  root: HTMLElement
  isDisposed: () => boolean
}) => {
  let fullRescanRequested = true
  const pendingBlocks = new Set<HTMLElement>()

  const requestFullRescan = () => {
    fullRescanRequested = true
  }

  const queueBlock = (block: HTMLElement) => {
    pendingBlocks.add(block)
  }

  const collectTargetBlocks = () => {
    if (fullRescanRequested) {
      fullRescanRequested = false
      pendingBlocks.clear()
      return Array.from(root.querySelectorAll<HTMLElement>("pre > code"))
    }

    const targets = Array.from(pendingBlocks).filter((block) => block.isConnected && root.contains(block))
    pendingBlocks.clear()
    return targets
  }

  const hasCodeBlockMissingLineWrappers = () =>
    Array.from(root.querySelectorAll<HTMLElement>("pre > code")).some(
      (block) => !block.querySelector("[data-line]")
    )

  const highlightCodeBlocks = async (codeBlocks: HTMLElement[]) => {
    if (!codeBlocks.length) return

    const languageByBlock = codeBlocks
      .map((block) => ({
        block,
        rawLanguage: extractLanguage(block),
        source: extractCodeSource(block),
      }))
      .map((entry) => {
        const inferred = isGenericLanguage(entry.rawLanguage)
          ? inferPrismLanguageFromSource(entry.source)
          : entry.rawLanguage
        const hasSyntaxMarkup = blockHasSyntaxMarkup(entry.block)
        const hasLineWrappers = Boolean(entry.block.querySelector("[data-line]"))

        return {
          ...entry,
          language: inferred,
          shouldHighlight:
            inferred.length > 0 &&
            inferred !== "mermaid" &&
            (!hasSyntaxMarkup || !hasLineWrappers),
          alreadyHighlighted:
            entry.block.dataset.prismLanguage === inferred &&
            entry.block.dataset.prismSource === entry.source &&
            hasLineWrappers,
        }
      })
      .filter((entry) => entry.shouldHighlight && !entry.alreadyHighlighted)

    if (!languageByBlock.length) return

    languageByBlock.forEach(({ block, language, source }) => {
      const immediate = renderImmediateCodeToHtml({
        source,
        language,
      })
      Array.from(block.classList)
        .filter((className) => className.startsWith("language-"))
        .forEach((className) => block.classList.remove(className))
      block.classList.add(`language-${immediate.language}`)
      block.innerHTML = ensureLineWrappedHtml({
        html: immediate.html,
        language: immediate.language,
        source,
      })
      block.dataset.prismLanguage = immediate.language
      block.dataset.prismSource = source
      block.setAttribute("data-language", immediate.language)
      block.setAttribute("data-raw-code", source)
    })

    const highlightedBlocks = await Promise.all(
      languageByBlock.map(async ({ block, language, source }) => ({
        block,
        source,
        result: await highlightCodeToHtml({
          source,
          language,
        }),
      }))
    )
    if (isDisposed()) return

    highlightedBlocks.forEach(({ block, source, result }) => {
      if (!block.isConnected || !root.contains(block)) return
      const language = result.language
      Array.from(block.classList)
        .filter((className) => className.startsWith("language-"))
        .forEach((className) => block.classList.remove(className))
      block.classList.add(`language-${language}`)
      block.innerHTML = ensureLineWrappedHtml({
        html: result.html,
        language,
        source,
      })
      block.dataset.prismLanguage = language
      block.dataset.prismSource = source
      block.setAttribute("data-language", language)
      block.setAttribute("data-raw-code", source)
    })
  }

  const handleMutationRecords = (mutations: MutationRecord[], scheduleRun: PrismScheduleRun) => {
    let hasRelevantMutation = false
    for (const mutation of mutations) {
      if (mutation.type === "characterData") {
        if (isPrismTokenNode(mutation.target)) continue
        const block = resolveCodeBlockFromNode(mutation.target, root)
        if (!block) continue
        hasRelevantMutation = true
        scheduleRun({ block })
        continue
      }

      if (mutation.type === "attributes") {
        const block = resolveCodeBlockFromNode(mutation.target, root)
        if (!block) continue
        hasRelevantMutation = true
        scheduleRun({ block })
        continue
      }

      const targetBlock = resolveCodeBlockFromNode(mutation.target, root)
      if (targetBlock && !isPrismTokenNode(mutation.target)) {
        hasRelevantMutation = true
        scheduleRun({ block: targetBlock })
      }

      for (const node of Array.from(mutation.addedNodes)) {
        if (isPrismTokenNode(node)) continue
        const addedBlock = resolveCodeBlockFromNode(node, root)
        if (!addedBlock) continue
        hasRelevantMutation = true
        scheduleRun({ block: addedBlock })
      }

      for (const node of Array.from(mutation.removedNodes)) {
        if (!(node instanceof Element)) continue
        if (!node.matches("pre,code") && !node.querySelector("pre > code")) continue
        hasRelevantMutation = true
        scheduleRun({ fullRescan: true })
        break
      }
    }

    return hasRelevantMutation
  }

  return {
    requestFullRescan,
    queueBlock,
    collectTargetBlocks,
    hasCodeBlockMissingLineWrappers,
    highlightCodeBlocks,
    handleMutationRecords,
  }
}
