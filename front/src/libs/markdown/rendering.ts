import { extractMarkdownTableLayouts } from "src/libs/markdown/tableMetadata"
import { hashString } from "src/libs/markdown/renderingCodeModel"
import { normalizeContentHtmlForMermaid } from "src/libs/markdown/renderingHtmlModel"
import { normalizeMarkdownForRender, parseMarkdownSegments } from "src/libs/markdown/renderingMarkdownModel"
import type { MarkdownRenderModel } from "src/libs/markdown/renderingTypes"

export type {
  CalloutKind,
  MarkdownRenderModel,
  MarkdownSegment,
} from "src/libs/markdown/renderingTypes"
export { markdownGuide } from "src/libs/markdown/renderingTypes"
export {
  extractCodeMetaFromPreChildren,
  extractTextFromCodeAst,
  hashString,
  toLanguageLabel,
} from "src/libs/markdown/renderingCodeModel"
export {
  isMermaidSource,
  normalizeContentHtmlForMermaid,
  shouldPreferMarkdownPipeline,
} from "src/libs/markdown/renderingHtmlModel"
export {
  clampImageWidthPx,
  normalizeImageAlign,
  parseStandaloneMarkdownImageLine,
  serializeStandaloneMarkdownImageLine,
  type ParsedStandaloneMarkdownImage,
} from "src/libs/markdown/renderingImageModel"
export {
  normalizeMarkdownForRender,
  parseMarkdownSegments,
} from "src/libs/markdown/renderingMarkdownModel"

export const resolveMarkdownRenderModel = ({
  content,
  contentHtml,
}: {
  content?: string
  contentHtml?: string
}): MarkdownRenderModel => {
  const normalizedContent = normalizeMarkdownForRender(content || "")
  const { cleanedMarkdown, layouts: tableLayouts } = extractMarkdownTableLayouts(normalizedContent)
  const normalizedContentHtml = contentHtml?.trim() || ""
  const sanitizedContentHtml = normalizeContentHtmlForMermaid(normalizedContentHtml)

  // 원문 markdown이 있으면 interactive block 책임은 항상 클라이언트 markdown 파이프라인에 둔다.
  const resolvedContentHtml = normalizedContent ? "" : sanitizedContentHtml
  const segments = resolvedContentHtml ? [] : parseMarkdownSegments(cleanedMarkdown)
  const renderKeySeed = resolvedContentHtml
    ? `html:${resolvedContentHtml}`
    : `md:${cleanedMarkdown}::table:${JSON.stringify(tableLayouts)}`

  return {
    normalizedContent: cleanedMarkdown,
    resolvedContentHtml,
    renderKey: `${renderKeySeed.length}:${hashString(renderKeySeed)}`,
    segments,
    tableLayouts,
  }
}
