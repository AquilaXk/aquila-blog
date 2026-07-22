import type { PlannedTextMutation } from "./markdownEditorTextMutation"
import {
  escapeMarkdownLinkLabel,
  validateMarkdownAttachmentSize,
} from "./markdownEditorUploadModel"

/** Stable per-upload token so concurrent same-name placeholders never collide. */
export const createUploadPlaceholderId = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** GitHub-style uploading image placeholder (Korean label + unique upload id). */
export const buildUploadingImagePlaceholder = (fileName: string, uploadId: string): string =>
  `![업로드 중: ${fileName} · ${uploadId}…]()`

/** Uploading attachment placeholder aligned with image paste/drop UX. */
export const buildUploadingAttachmentPlaceholder = (fileName: string, uploadId: string): string =>
  `[업로드 중: ${fileName} · ${uploadId}…]()`

export const isImageFile = (file: File): boolean => file.type.startsWith("image/")

export const extractImageFileFromClipboard = (clipboardData: DataTransfer | null): File | null => {
  if (!clipboardData) return null

  const directFile = Array.from(clipboardData.files || []).find((file) => isImageFile(file))
  if (directFile) return directFile

  const clipboardItem = Array.from(clipboardData.items || []).find(
    (item) => item.kind === "file" && item.type.startsWith("image/")
  )
  if (!clipboardItem) return null

  const pastedFile = clipboardItem.getAsFile()
  if (!pastedFile || !isImageFile(pastedFile)) return null
  return pastedFile
}

export const listFilesFromDataTransfer = (dataTransfer: DataTransfer | null): File[] => {
  if (!dataTransfer) return []
  return Array.from(dataTransfer.files || [])
}

export const partitionUploadFiles = (files: readonly File[]): { images: File[]; attachments: File[] } => {
  const images: File[] = []
  const attachments: File[] = []
  for (const file of files) {
    if (isImageFile(file)) images.push(file)
    else attachments.push(file)
  }
  return { images, attachments }
}

export type PasteMediaRoute =
  | { kind: "transfer-files"; files: File[] }
  | { kind: "clipboard-image"; file: File }
  | { kind: "none" }

export type ReservedTransferJob =
  | { kind: "image"; file: File; placeholder: string }
  | { kind: "attachment"; file: File; placeholder: string }

/** Plan placeholders/errors for a multi-file paste/drop without awaiting uploads. */
export const planTransferFileReservations = (
  files: readonly File[],
  options: {
    canUploadImage: boolean
    canUploadFile: boolean
    createId?: () => string
  }
): { jobs: ReservedTransferJob[]; errors: string[] } => {
  const createId = options.createId ?? createUploadPlaceholderId
  const jobs: ReservedTransferJob[] = []
  const errors: string[] = []

  for (const file of files) {
    if (isImageFile(file)) {
      if (!options.canUploadImage) continue
      jobs.push({
        kind: "image",
        file,
        placeholder: buildUploadingImagePlaceholder(file.name || "image", createId()),
      })
      continue
    }

    if (!options.canUploadFile) continue
    const sizeError = validateMarkdownAttachmentSize(file)
    if (sizeError) {
      errors.push(sizeError)
      continue
    }
    jobs.push({
      kind: "attachment",
      file,
      placeholder: buildUploadingAttachmentPlaceholder(file.name || "file", createId()),
    })
  }

  return { jobs, errors }
}

/**
 * Prefer the full clipboard `files` collection for multi-file paste.
 * Fall back to item-based image extraction only when `files` is empty.
 */
export const resolvePasteMediaRoute = (
  clipboardData: DataTransfer | null,
  options: { canUploadImage: boolean; canUploadFile: boolean }
): PasteMediaRoute => {
  const files = listFilesFromDataTransfer(clipboardData)
  if (files.length > 0) {
    const { images, attachments } = partitionUploadFiles(files)
    const hasHandledImage = Boolean(options.canUploadImage && images.length > 0)
    const hasHandledAttachment = Boolean(options.canUploadFile && attachments.length > 0)
    if (hasHandledImage || hasHandledAttachment) {
      return { kind: "transfer-files", files }
    }
    return { kind: "none" }
  }

  if (options.canUploadImage) {
    const imageFile = extractImageFileFromClipboard(clipboardData)
    if (imageFile) return { kind: "clipboard-image", file: imageFile }
  }

  return { kind: "none" }
}

export const readClipboardPlainText = (clipboardData: DataTransfer | null): string => {
  if (!clipboardData) return ""
  return String(clipboardData.getData("text/plain") || "")
}

/** True when clipboard text is a single http(s) URL with no surrounding whitespace tokens. */
export const parseSingleHttpUrl = (text: string): string | null => {
  const trimmed = text.trim()
  if (!trimmed || /\s/.test(trimmed)) return null
  try {
    const url = new URL(trimmed)
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    return trimmed
  } catch {
    return null
  }
}

/** Escape characters that break Markdown inline link destinations. */
export const escapeMarkdownLinkDestination = (url: string): string =>
  url.replace(/[\\()]/g, "\\$&")

export const planLinkifySelectionWithUrl = (
  selectionStart: number,
  selectionEnd: number,
  selectedText: string,
  url: string
): PlannedTextMutation => {
  const replacement = `[${escapeMarkdownLinkLabel(selectedText)}](${escapeMarkdownLinkDestination(url)})`
  const cursor = selectionStart + replacement.length
  return {
    rangeStart: selectionStart,
    rangeEnd: selectionEnd,
    replacement,
    selectionStart: cursor,
    selectionEnd: cursor,
  }
}

export const findExactSubstringIndex = (value: string, exact: string): number => {
  if (!exact) return -1
  return value.indexOf(exact)
}

export const planReplaceExactSubstring = (
  value: string,
  exact: string,
  replacement: string,
  selectionFrom: number,
  selectionTo: number
): PlannedTextMutation | null => {
  const index = findExactSubstringIndex(value, exact)
  if (index === -1) return null

  const delta = replacement.length - exact.length
  const adjust = (pos: number) => {
    if (pos <= index) return pos
    if (pos >= index + exact.length) return pos + delta
    return index + replacement.length
  }

  return {
    rangeStart: index,
    rangeEnd: index + exact.length,
    replacement,
    selectionStart: adjust(selectionFrom),
    selectionEnd: adjust(selectionTo),
  }
}

/** Append markdown at EOF while preserving the caller's current caret/selection. */
export const planAppendAtEnd = (
  value: string,
  markdown: string,
  selectionFrom: number,
  selectionTo: number
): PlannedTextMutation => {
  const end = value.length
  return {
    rangeStart: end,
    rangeEnd: end,
    replacement: markdown,
    selectionStart: selectionFrom,
    selectionEnd: selectionTo,
  }
}

/** Strip leading/trailing newlines from toolbar-style embed/link markdown for in-place placeholder swap. */
export const toInlineMarkdownSnippet = (markdown: string): string =>
  markdown.replace(/^\n+/, "").replace(/\n+$/, "")
