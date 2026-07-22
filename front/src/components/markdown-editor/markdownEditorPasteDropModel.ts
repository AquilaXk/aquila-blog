import type { PlannedTextMutation } from "./markdownEditorTextMutation"

/** GitHub-style uploading image placeholder (Korean label). */
export const buildUploadingImagePlaceholder = (fileName: string): string =>
  `![업로드 중: ${fileName}…]()`

/** Uploading attachment placeholder aligned with image paste/drop UX. */
export const buildUploadingAttachmentPlaceholder = (fileName: string): string =>
  `[업로드 중: ${fileName}…]()`

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

export const planLinkifySelectionWithUrl = (
  selectionStart: number,
  selectionEnd: number,
  selectedText: string,
  url: string
): PlannedTextMutation => {
  const replacement = `[${selectedText}](${url})`
  const cursor = selectionStart + replacement.length
  return {
    rangeStart: selectionStart,
    rangeEnd: selectionEnd,
    replacement,
    selectionStart: cursor,
    selectionEnd: cursor,
  }
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

export const planAppendAtEnd = (value: string, markdown: string): PlannedTextMutation => {
  const end = value.length
  const cursor = end + markdown.length
  return {
    rangeStart: end,
    rangeEnd: end,
    replacement: markdown,
    selectionStart: cursor,
    selectionEnd: cursor,
  }
}

/** Strip leading/trailing newlines from toolbar-style embed/link markdown for in-place placeholder swap. */
export const toInlineMarkdownSnippet = (markdown: string): string =>
  markdown.replace(/^\n+/, "").replace(/\n+$/, "")
