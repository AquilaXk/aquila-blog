const INVISIBLE_CODE_PLACEHOLDER_REGEX = /[\u00A0\u200B-\u200D\u2060\uFEFF]/g

type ParsedFencedCodeBlock = {
  startLine: number
  endLine: number
  lines: string[]
  body: string
}

const isCodeFenceBodyVisiblyEmpty = (value: string) =>
  value.replace(INVISIBLE_CODE_PLACEHOLDER_REGEX, "").trim().length === 0

const parseFencedCodeBlocks = (content: string): ParsedFencedCodeBlock[] => {
  const lines = content.replace(/\r\n?/g, "\n").split("\n")
  const blocks: ParsedFencedCodeBlock[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index] || ""
    const opening = line.trim().match(/^([`~]{3,})(.*)$/)
    if (!opening) {
      index += 1
      continue
    }

    const fence = opening[1]
    const marker = fence[0]
    const closePattern = new RegExp(`^\\s*${marker}{${fence.length},}\\s*$`)
    let pointer = index + 1

    while (pointer < lines.length && !closePattern.test(lines[pointer] || "")) {
      pointer += 1
    }

    if (pointer >= lines.length) {
      index += 1
      continue
    }

    const blockLines = lines.slice(index, pointer + 1)
    blocks.push({
      startLine: index,
      endLine: pointer,
      lines: blockLines,
      body: lines.slice(index + 1, pointer).join("\n"),
    })
    index = pointer + 1
  }

  return blocks
}

export const restoreEmptyFencedCodeBlocks = (content: string, recoveredContent: string) => {
  const recoveredBlocks = parseFencedCodeBlocks(recoveredContent.replace(/\r\n?/g, "\n"))
  if (!recoveredBlocks.some((block) => !isCodeFenceBodyVisiblyEmpty(block.body))) return content

  const normalized = content.replace(/\r\n?/g, "\n")
  const lines = normalized.split("\n")
  const targetBlocks = parseFencedCodeBlocks(normalized)
  let lineOffset = 0

  for (const [blockIndex, block] of targetBlocks.entries()) {
    if (!isCodeFenceBodyVisiblyEmpty(block.body)) continue

    const recoveredBlock = recoveredBlocks[blockIndex]
    if (!recoveredBlock || isCodeFenceBodyVisiblyEmpty(recoveredBlock.body)) continue

    const replacementLines = recoveredBlock.lines
    const startLine = block.startLine + lineOffset
    const deleteCount = block.endLine - block.startLine + 1
    lines.splice(startLine, deleteCount, ...replacementLines)
    lineOffset += replacementLines.length - deleteCount
  }

  return lines.join("\n")
}

export const hasEmptyFencedCodeBlockBody = (content: string) =>
  parseFencedCodeBlocks(content.replace(/\r\n?/g, "\n")).some((block) =>
    isCodeFenceBodyVisiblyEmpty(block.body)
  )

export const adminContentNeedsCodeFenceRecovery = (content: string) =>
  content.trim().length === 0 || hasEmptyFencedCodeBlockBody(content)

export const adminContentHadEmptyFenceForTelemetry = (content: string) =>
  adminContentNeedsCodeFenceRecovery(content)

/** HTML/public recovery is complete only with non-empty content and no empty fences. */
export const isCodeFenceRecoveryComplete = (content: string) =>
  content.trim().length > 0 && !hasEmptyFencedCodeBlockBody(content)

export type CodeFenceRecoverySource = "contentHtml" | "publicApi" | "unrecovered" | "none"

export type CodeFenceRecoveryReport = {
  postId: string
  source: CodeFenceRecoverySource
  hadEmptyFence: boolean
  recovered: boolean
}

export type CodeFenceRecoveryAttempt = {
  content: string
  contentHtml?: string | null
  recovered: boolean
  source: CodeFenceRecoverySource
}

declare global {
  interface Window {
    __AQUILA_CODE_FENCE_RECOVERY__?: Array<CodeFenceRecoveryReport & { at: string; path: string }>
  }
}

export const reportCodeFenceRecovery = (report: CodeFenceRecoveryReport) => {
  if (typeof window === "undefined") return

  const entry = {
    ...report,
    at: new Date().toISOString(),
    path: window.location.pathname,
  }
  window.__AQUILA_CODE_FENCE_RECOVERY__ = [...(window.__AQUILA_CODE_FENCE_RECOVERY__ || []), entry]

  if (process.env.NODE_ENV !== "production") {
    console.info("[editor-code-fence-recovery]", entry)
  }
}

const fenceOpeningMetadataScore = (openingLine: string) => {
  const match = openingLine.trim().match(/^([`~]{3,})(.*)$/)
  if (!match) return 0

  const delimiter = match[1]
  const info = match[2].trim()
  let score = info.length
  if (delimiter[0] === "~") score += 100
  return score
}

export const publicContentHasRicherFenceMetadata = (
  reconstructedContent: string,
  publicMarkdown: string
) => {
  const reconBlocks = parseFencedCodeBlocks(reconstructedContent.replace(/\r\n?/g, "\n"))
  const publicBlocks = parseFencedCodeBlocks(publicMarkdown.replace(/\r\n?/g, "\n"))
  if (publicBlocks.length === 0) return false

  const compareCount = Math.min(reconBlocks.length, publicBlocks.length)
  for (let index = 0; index < compareCount; index += 1) {
    const reconOpening = reconBlocks[index]?.lines[0] ?? ""
    const publicOpening = publicBlocks[index]?.lines[0] ?? ""
    if (fenceOpeningMetadataScore(publicOpening) > fenceOpeningMetadataScore(reconOpening)) {
      return true
    }
  }

  return false
}

const mergeFaithfulPublicFencedBlocks = (content: string, publicContent: string) => {
  const publicBlocks = parseFencedCodeBlocks(publicContent.replace(/\r\n?/g, "\n"))
  if (!publicBlocks.some((block) => !isCodeFenceBodyVisiblyEmpty(block.body))) return content

  const normalized = content.replace(/\r\n?/g, "\n")
  const lines = normalized.split("\n")
  const targetBlocks = parseFencedCodeBlocks(normalized)
  let lineOffset = 0

  for (const [blockIndex, block] of targetBlocks.entries()) {
    const publicBlock = publicBlocks[blockIndex]
    if (!publicBlock || isCodeFenceBodyVisiblyEmpty(publicBlock.body)) continue

    const publicOpening = publicBlock.lines[0] ?? ""
    const blockOpening = block.lines[0] ?? ""
    const shouldReplaceWholeBlock =
      isCodeFenceBodyVisiblyEmpty(block.body) ||
      fenceOpeningMetadataScore(publicOpening) > fenceOpeningMetadataScore(blockOpening)

    if (!shouldReplaceWholeBlock) continue

    const replacementLines = publicBlock.lines
    const startLine = block.startLine + lineOffset
    const deleteCount = block.endLine - block.startLine + 1
    lines.splice(startLine, deleteCount, ...replacementLines)
    lineOffset += replacementLines.length - deleteCount
  }

  return lines.join("\n")
}

export const applyCandidateCodeFenceRecovery = (
  content: string,
  candidateContent: string
): { content: string; recovered: boolean } => {
  if (!hasEmptyFencedCodeBlockBody(content) && content.trim().length > 0) {
    return { content, recovered: false }
  }

  const normalizedCandidate = candidateContent.replace(/\r\n?/g, "\n")
  if (!normalizedCandidate.trim()) {
    return { content, recovered: false }
  }

  if (content.trim().length === 0) {
    return {
      content: normalizedCandidate,
      recovered: normalizedCandidate.trim().length > 0,
    }
  }

  const restored = restoreEmptyFencedCodeBlocks(content, normalizedCandidate)
  return {
    content: restored,
    recovered: restored !== content,
  }
}

const applyPublicCodeFenceRecovery = (
  adminContent: string,
  publicContent: string
): { content: string; recovered: boolean } => {
  if (adminContent.trim().length > 0 && publicContent.trim().length > 0) {
    return applyCandidateCodeFenceRecovery(adminContent, publicContent)
  }

  return {
    content: publicContent || adminContent,
    recovered:
      (publicContent || "").trim().length > 0 && !hasEmptyFencedCodeBlockBody(publicContent || ""),
  }
}

export const resolveEditorCodeFenceRecovery = ({
  adminContent,
  contentHtmlBodyCandidate,
  publicContent,
  publicFallbackSucceeded,
}: {
  adminContent: string
  contentHtmlBodyCandidate: string
  publicContent?: string
  publicFallbackSucceeded: boolean
}): CodeFenceRecoveryAttempt => {
  const needsRecovery = adminContentNeedsCodeFenceRecovery(adminContent)
  const adminWasEmpty = adminContent.trim().length === 0

  if (!needsRecovery) {
    return {
      content: adminContent,
      contentHtml: undefined,
      recovered: false,
      source: "none",
    }
  }

  const fromHtml = applyCandidateCodeFenceRecovery(adminContent, contentHtmlBodyCandidate)

  if (publicFallbackSucceeded && typeof publicContent === "string") {
    const metadataMergeBase = isCodeFenceRecoveryComplete(fromHtml.content)
      ? fromHtml.content
      : adminContent
    const metadataMerged = mergeFaithfulPublicFencedBlocks(metadataMergeBase, publicContent)

    if (
      isCodeFenceRecoveryComplete(metadataMerged) &&
      publicContentHasRicherFenceMetadata(fromHtml.content, publicContent)
    ) {
      return {
        content: metadataMerged,
        recovered: true,
        source: "publicApi",
      }
    }
  }

  if (
    fromHtml.recovered &&
    isCodeFenceRecoveryComplete(fromHtml.content) &&
    !adminWasEmpty &&
    !(
      publicFallbackSucceeded &&
      typeof publicContent === "string" &&
      publicContentHasRicherFenceMetadata(fromHtml.content, publicContent)
    )
  ) {
    return {
      content: fromHtml.content,
      recovered: true,
      source: "contentHtml",
    }
  }

  if (publicFallbackSucceeded && typeof publicContent === "string") {
    const fromPublic = applyPublicCodeFenceRecovery(adminContent, publicContent)

    if (
      (fromPublic.recovered || fromPublic.content !== adminContent) &&
      isCodeFenceRecoveryComplete(fromPublic.content)
    ) {
      return {
        content: fromPublic.content,
        recovered: true,
        source: "publicApi",
      }
    }
  }

  if (publicFallbackSucceeded && typeof publicContent === "string") {
    const fromPublic = applyPublicCodeFenceRecovery(adminContent, publicContent)
    const sequentialContent = applyPublicCodeFenceRecovery(fromHtml.content, publicContent).content

    const candidates = [
      { content: sequentialContent, source: "publicApi" as const },
      { content: fromHtml.content, source: "contentHtml" as const },
      { content: fromPublic.content, source: "publicApi" as const },
    ].filter((candidate) => candidate.content !== adminContent)

    const bestCandidate = candidates.reduce<(typeof candidates)[number] | null>(
      (best, candidate) => {
        if (!best) return candidate

        const bestEmptyCount = parseFencedCodeBlocks(best.content).filter((block) =>
          isCodeFenceBodyVisiblyEmpty(block.body)
        ).length
        const candidateEmptyCount = parseFencedCodeBlocks(candidate.content).filter((block) =>
          isCodeFenceBodyVisiblyEmpty(block.body)
        ).length

        if (candidateEmptyCount < bestEmptyCount) return candidate
        if (candidateEmptyCount > bestEmptyCount) return best
        if (candidate.content === sequentialContent) return candidate
        return best
      },
      null
    )

    if (bestCandidate) {
      return {
        content: bestCandidate.content,
        recovered: isCodeFenceRecoveryComplete(bestCandidate.content),
        source: bestCandidate.source,
      }
    }
  }

  if (fromHtml.recovered || fromHtml.content !== adminContent) {
    return {
      content: fromHtml.content,
      recovered: isCodeFenceRecoveryComplete(fromHtml.content),
      source: "contentHtml",
    }
  }

  return {
    content: fromHtml.content,
    recovered: false,
    source: "unrecovered",
  }
}
