import {
  type ClipboardEvent as ReactClipboardEvent,
  type DragEvent as ReactDragEvent,
  type MutableRefObject,
  useCallback,
} from "react"
import { planReplaceSelection, type PlannedTextMutation } from "./markdownEditorTextMutation"
import {
  buildUploadingAttachmentPlaceholder,
  buildUploadingImagePlaceholder,
  extractImageFileFromClipboard,
  listFilesFromDataTransfer,
  parseSingleHttpUrl,
  partitionUploadFiles,
  planAppendAtEnd,
  planLinkifySelectionWithUrl,
  planReplaceExactSubstring,
  readClipboardPlainText,
  toInlineMarkdownSnippet,
} from "./markdownEditorPasteDropModel"
import {
  MARKDOWN_ATTACHMENT_UPLOAD_FAILED_MESSAGE,
  MARKDOWN_IMAGE_UPLOAD_FAILED_MESSAGE,
  resolveMarkdownAttachmentLink,
  resolveMarkdownImageEmbed,
  validateMarkdownAttachmentSize,
  type MarkdownFileUploadResult,
  type MarkdownImageUploadResult,
} from "./markdownEditorUploadModel"

type TextareaSelection = {
  from: number
  to: number
}

type UseMarkdownEditorMediaTransfersArgs = {
  disabled: boolean
  valueRef: MutableRefObject<string>
  selectionRef: MutableRefObject<TextareaSelection>
  onUploadImage?: (file: File) => Promise<MarkdownImageUploadResult>
  onUploadFile?: (file: File) => Promise<MarkdownFileUploadResult>
  applyPlannedMarkdownMutation: (plan: PlannedTextMutation) => boolean
  resolveActiveSelection: () => TextareaSelection
  setUploadInFlight: (delta: number) => void
  setUploadError: (message: string) => void
  insertUploadedMarkdown: (markdown: string) => void
}

export const useMarkdownEditorMediaTransfers = ({
  disabled,
  valueRef,
  selectionRef,
  onUploadImage,
  onUploadFile,
  applyPlannedMarkdownMutation,
  resolveActiveSelection,
  setUploadInFlight,
  setUploadError,
  insertUploadedMarkdown,
}: UseMarkdownEditorMediaTransfersArgs) => {
  const insertAtActiveSelection = useCallback(
    (text: string) => {
      const { from, to } = resolveActiveSelection()
      applyPlannedMarkdownMutation(planReplaceSelection(from, to, text))
    },
    [applyPlannedMarkdownMutation, resolveActiveSelection]
  )

  const replaceExactOrAppend = useCallback(
    (exact: string, inlineReplacement: string, appendMarkdown: string) => {
      const plan = planReplaceExactSubstring(
        valueRef.current,
        exact,
        inlineReplacement,
        selectionRef.current.from,
        selectionRef.current.to
      )
      if (plan) {
        applyPlannedMarkdownMutation(plan)
        return
      }
      applyPlannedMarkdownMutation(planAppendAtEnd(valueRef.current, appendMarkdown))
    },
    [applyPlannedMarkdownMutation, selectionRef, valueRef]
  )

  const removeExactPlaceholder = useCallback(
    (exact: string) => {
      const plan = planReplaceExactSubstring(
        valueRef.current,
        exact,
        "",
        selectionRef.current.from,
        selectionRef.current.to
      )
      if (plan) applyPlannedMarkdownMutation(plan)
    },
    [applyPlannedMarkdownMutation, selectionRef, valueRef]
  )

  const uploadImageWithPlaceholder = useCallback(
    async (file: File) => {
      if (!onUploadImage) return

      const placeholder = buildUploadingImagePlaceholder(file.name || "image")
      insertAtActiveSelection(placeholder)
      setUploadInFlight(1)
      let uploaded: MarkdownImageUploadResult
      try {
        uploaded = await onUploadImage(file)
      } catch {
        removeExactPlaceholder(placeholder)
        setUploadError(MARKDOWN_IMAGE_UPLOAD_FAILED_MESSAGE)
        return
      } finally {
        setUploadInFlight(-1)
      }

      const resolved = resolveMarkdownImageEmbed(uploaded, file.name)
      if ("error" in resolved) {
        removeExactPlaceholder(placeholder)
        setUploadError(resolved.error)
        return
      }

      replaceExactOrAppend(placeholder, toInlineMarkdownSnippet(resolved.markdown), resolved.markdown)
    },
    [
      insertAtActiveSelection,
      onUploadImage,
      removeExactPlaceholder,
      replaceExactOrAppend,
      setUploadError,
      setUploadInFlight,
    ]
  )

  const uploadAttachmentWithPlaceholder = useCallback(
    async (file: File) => {
      if (!onUploadFile) return

      const sizeError = validateMarkdownAttachmentSize(file)
      if (sizeError) {
        setUploadError(sizeError)
        return
      }

      const placeholder = buildUploadingAttachmentPlaceholder(file.name || "file")
      insertAtActiveSelection(placeholder)
      setUploadInFlight(1)
      let uploaded: MarkdownFileUploadResult
      try {
        uploaded = await onUploadFile(file)
      } catch {
        removeExactPlaceholder(placeholder)
        setUploadError(MARKDOWN_ATTACHMENT_UPLOAD_FAILED_MESSAGE)
        return
      } finally {
        setUploadInFlight(-1)
      }

      const resolved = resolveMarkdownAttachmentLink(uploaded, file.name)
      if ("error" in resolved) {
        removeExactPlaceholder(placeholder)
        setUploadError(resolved.error)
        return
      }

      replaceExactOrAppend(placeholder, toInlineMarkdownSnippet(resolved.markdown), resolved.markdown)
    },
    [
      insertAtActiveSelection,
      onUploadFile,
      removeExactPlaceholder,
      replaceExactOrAppend,
      setUploadError,
      setUploadInFlight,
    ]
  )

  const handleImageInput = useCallback(
    async (file: File | null) => {
      if (!file || !onUploadImage) return
      setUploadInFlight(1)
      let uploaded: MarkdownImageUploadResult
      try {
        uploaded = await onUploadImage(file)
      } catch {
        setUploadError(MARKDOWN_IMAGE_UPLOAD_FAILED_MESSAGE)
        return
      } finally {
        setUploadInFlight(-1)
      }
      const resolved = resolveMarkdownImageEmbed(uploaded, file.name)
      if ("error" in resolved) {
        setUploadError(resolved.error)
        return
      }
      insertUploadedMarkdown(resolved.markdown)
    },
    [insertUploadedMarkdown, onUploadImage, setUploadError, setUploadInFlight]
  )

  const handleFileInput = useCallback(
    async (file: File | null) => {
      if (!file || !onUploadFile) return
      const sizeError = validateMarkdownAttachmentSize(file)
      if (sizeError) {
        setUploadError(sizeError)
        return
      }

      setUploadInFlight(1)
      let uploaded: MarkdownFileUploadResult
      try {
        uploaded = await onUploadFile(file)
      } catch {
        setUploadError(MARKDOWN_ATTACHMENT_UPLOAD_FAILED_MESSAGE)
        return
      } finally {
        setUploadInFlight(-1)
      }

      const resolved = resolveMarkdownAttachmentLink(uploaded, file.name)
      if ("error" in resolved) {
        setUploadError(resolved.error)
        return
      }
      insertUploadedMarkdown(resolved.markdown)
    },
    [insertUploadedMarkdown, onUploadFile, setUploadError, setUploadInFlight]
  )

  const processTransferFiles = useCallback(
    async (files: readonly File[]) => {
      const { images, attachments } = partitionUploadFiles(files)
      if (onUploadImage) {
        for (const image of images) {
          await uploadImageWithPlaceholder(image)
        }
      }
      if (onUploadFile) {
        for (const attachment of attachments) {
          await uploadAttachmentWithPlaceholder(attachment)
        }
      }
    },
    [onUploadFile, onUploadImage, uploadAttachmentWithPlaceholder, uploadImageWithPlaceholder]
  )

  const handlePaste = useCallback(
    (event: ReactClipboardEvent<HTMLTextAreaElement>) => {
      if (disabled) return

      const imageFile = extractImageFileFromClipboard(event.clipboardData)
      if (imageFile && onUploadImage) {
        event.preventDefault()
        void uploadImageWithPlaceholder(imageFile)
        return
      }

      const clipboardFiles = listFilesFromDataTransfer(event.clipboardData)
      if (clipboardFiles.length > 0 && (onUploadImage || onUploadFile)) {
        const { images, attachments } = partitionUploadFiles(clipboardFiles)
        const hasHandledImage = Boolean(onUploadImage && images.length > 0)
        const hasHandledAttachment = Boolean(onUploadFile && attachments.length > 0)
        if (hasHandledImage || hasHandledAttachment) {
          event.preventDefault()
          void processTransferFiles(clipboardFiles)
          return
        }
      }

      const { from, to } = resolveActiveSelection()
      if (from === to) return

      const url = parseSingleHttpUrl(readClipboardPlainText(event.clipboardData))
      if (!url) return

      event.preventDefault()
      const selectedText = valueRef.current.slice(from, to)
      applyPlannedMarkdownMutation(planLinkifySelectionWithUrl(from, to, selectedText, url))
    },
    [
      applyPlannedMarkdownMutation,
      disabled,
      onUploadFile,
      onUploadImage,
      processTransferFiles,
      resolveActiveSelection,
      uploadImageWithPlaceholder,
      valueRef,
    ]
  )

  const handleDragOver = useCallback(
    (event: ReactDragEvent<HTMLTextAreaElement>) => {
      if (disabled || (!onUploadImage && !onUploadFile)) return
      if (!event.dataTransfer?.types?.includes("Files")) return
      event.preventDefault()
      event.dataTransfer.dropEffect = "copy"
    },
    [disabled, onUploadFile, onUploadImage]
  )

  const handleDrop = useCallback(
    (event: ReactDragEvent<HTMLTextAreaElement>) => {
      if (disabled || (!onUploadImage && !onUploadFile)) return
      const files = listFilesFromDataTransfer(event.dataTransfer)
      if (files.length === 0) return
      event.preventDefault()
      void processTransferFiles(files)
    },
    [disabled, onUploadFile, onUploadImage, processTransferFiles]
  )

  return {
    handleImageInput,
    handleFileInput,
    handlePaste,
    handleDragOver,
    handleDrop,
  }
}
