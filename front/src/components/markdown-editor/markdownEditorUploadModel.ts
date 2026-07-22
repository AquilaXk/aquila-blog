export const MARKDOWN_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024

export const MARKDOWN_ATTACHMENT_TOO_LARGE_MESSAGE = "첨부 파일은 10MB 이하여야 합니다."
export const MARKDOWN_ATTACHMENT_UPLOAD_FAILED_MESSAGE = "첨부 파일 업로드에 실패했습니다."
export const MARKDOWN_ATTACHMENT_URL_MISSING_MESSAGE = "첨부 파일 업로드 결과 URL을 확인할 수 없습니다."
export const MARKDOWN_IMAGE_UPLOAD_FAILED_MESSAGE = "이미지 업로드에 실패했습니다."
export const MARKDOWN_IMAGE_URL_MISSING_MESSAGE = "이미지 업로드 결과 URL을 확인할 수 없습니다."

export type MarkdownFileUploadResult = {
  url?: string
  name?: string
  mimeType?: string
  sizeBytes?: number
  description?: string
}

export type MarkdownImageUploadResult = {
  alt?: string
  title?: string
  url?: string
  src?: string
}

export const validateMarkdownAttachmentSize = (file: File): string | null => {
  if (file.size > MARKDOWN_ATTACHMENT_MAX_BYTES) {
    return MARKDOWN_ATTACHMENT_TOO_LARGE_MESSAGE
  }
  return null
}

export const resolveMarkdownAttachmentLink = (
  uploaded: MarkdownFileUploadResult,
  fallbackName: string
): { markdown: string } | { error: string } => {
  const url = String(uploaded.url || "").trim()
  if (!url) {
    return { error: MARKDOWN_ATTACHMENT_URL_MISSING_MESSAGE }
  }

  const name = String(uploaded.name || fallbackName).trim() || fallbackName
  return {
    markdown: `\n\n[${name}](${url})\n`,
  }
}

export const resolveMarkdownImageEmbed = (
  uploaded: MarkdownImageUploadResult,
  fallbackName: string
): { markdown: string } | { error: string } => {
  const src = String(uploaded.url || uploaded.src || "").trim()
  if (!src) {
    return { error: MARKDOWN_IMAGE_URL_MISSING_MESSAGE }
  }

  const alt = String(uploaded.alt || uploaded.title || fallbackName).trim() || fallbackName
  return {
    markdown: `\n\n![${alt}](${src})\n`,
  }
}
