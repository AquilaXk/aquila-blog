import { RefObject, useEffect } from "react"
import {
  inferPrismLanguageFromSource,
  highlightCodeToHtml,
  renderImmediateCodeToHtml,
} from "src/libs/markdown/prismRuntime"

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

type PrismEffectOptions = {
  observeMutations?: boolean
  mutationDebounceMs?: number
}

const PRISM_DEFAULT_MUTATION_DEBOUNCE_MS = 72

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

const usePrismEffect = (
  rootRef: RefObject<HTMLElement>,
  contentKey: string,
  enabled = true,
  options?: PrismEffectOptions
) => {
  const observeMutations = options?.observeMutations ?? true
  const mutationDebounceMs =
    typeof options?.mutationDebounceMs === "number"
      ? Math.max(16, options.mutationDebounceMs)
      : PRISM_DEFAULT_MUTATION_DEBOUNCE_MS

  useEffect(() => {
    if (!enabled) return

    let disposed = false
    let running = false
    let rerunRequested = false
    let scheduledRunTimer: number | null = null
    let fullRescanRequested = true
    const pendingBlocks = new Set<HTMLElement>()
    const root = rootRef.current
    if (!root) return

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

    const highlightBlocks = async (codeBlocks: HTMLElement[]) => {
      if (!codeBlocks.length) return

      const languageByBlock = codeBlocks
        .map((block) => ({
          block,
          rawLanguage: extractLanguage(block),
          source: block.textContent || "",
        }))
        .map((entry) => {
          const inferred = isGenericLanguage(entry.rawLanguage)
            ? inferPrismLanguageFromSource(entry.source)
            : entry.rawLanguage
          const hasSyntaxMarkup = blockHasSyntaxMarkup(entry.block)

          return {
            ...entry,
            language: inferred,
            shouldHighlight:
              inferred.length > 0 &&
              inferred !== "mermaid" &&
              !hasSyntaxMarkup,
            alreadyHighlighted:
              entry.block.dataset.prismLanguage === inferred &&
              entry.block.dataset.prismSource === entry.source,
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
        block.innerHTML = immediate.html
        block.dataset.prismLanguage = immediate.language
        block.dataset.prismSource = source
        block.setAttribute("data-language", immediate.language)
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
      if (disposed) return

      highlightedBlocks.forEach(({ block, source, result }) => {
        if (!block.isConnected || !root.contains(block)) return
        const language = result.language
        Array.from(block.classList)
          .filter((className) => className.startsWith("language-"))
          .forEach((className) => block.classList.remove(className))
        block.classList.add(`language-${language}`)
        block.innerHTML = result.html
        block.dataset.prismLanguage = language
        block.dataset.prismSource = source
        block.setAttribute("data-language", language)
      })
    }

    const run = async () => {
      if (disposed) return
      if (running) {
        rerunRequested = true
        return
      }
      running = true
      try {
        do {
          rerunRequested = false
          const targets = collectTargetBlocks()
          if (!targets.length) continue
          await highlightBlocks(targets)
        } while (!disposed && rerunRequested)
      } catch (error) {
        console.warn(error)
      } finally {
        running = false
      }
    }

    const scheduleRun = ({ fullRescan = false, block }: { fullRescan?: boolean; block?: HTMLElement } = {}) => {
      if (disposed) return
      if (fullRescan) {
        fullRescanRequested = true
      }
      if (block) {
        pendingBlocks.add(block)
      }
      if (scheduledRunTimer !== null) return
      scheduledRunTimer = window.setTimeout(() => {
        scheduledRunTimer = null
        void run()
      }, mutationDebounceMs)
    }

    scheduleRun({ fullRescan: true })

    const observer =
      observeMutations && typeof MutationObserver !== "undefined"
        ? new MutationObserver((mutations) => {
            if (disposed) return

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

            if (!hasRelevantMutation) return
          })
        : null

    observer?.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "data-language", "data-theme"],
    })

    return () => {
      disposed = true
      if (scheduledRunTimer !== null) {
        window.clearTimeout(scheduledRunTimer)
        scheduledRunTimer = null
      }
      observer?.disconnect()
    }
  }, [contentKey, enabled, mutationDebounceMs, observeMutations, rootRef])
}
export default usePrismEffect
