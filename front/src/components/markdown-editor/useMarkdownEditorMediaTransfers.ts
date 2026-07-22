import {
  type ClipboardEvent as ReactClipboardEvent,
  type DragEvent as ReactDragEvent,
  type MutableRefObject,
  useCallback,
  useRef,
} from "react"
import { planReplaceSelection, type PlannedTextMutation } from "./markdownEditorTextMutation"
import {
  buildUploadingImagePlaceholder,
  createUploadPlaceholderId,
  listFilesFromDataTransfer,
  parseSingleHttpUrl,
  planAppendAtEnd,
  planLinkifySelectionWithUrl,
  planReplaceExactSubstring,
  planTransferFileReservations,
  readClipboardPlainText,
  resolvePasteMediaRoute,
  toInlineMarkdownSnippet,
  type ReservedTransferJob,
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

type MarkdownMutationOptions = {
  clearUploadError?: boolean
}

type UseMarkdownEditorMediaTransfersArgs = {
  disabled: boolean
  valueRef: MutableRefObject<string>
  selectionRef: MutableRefObject<TextareaSelection>
  onUploadImage?: (file: File) => Promise<MarkdownImageUploadResult>
  onUploadFile?: (file: File) => Promise<MarkdownFileUploadResult>
  applyPlannedMarkdownMutation: (plan: PlannedTextMutation, options?: MarkdownMutationOptions) => boolean
  /** Placeholder replace/remove after async upload — must not steal focus from other controls. */
  applyBackgroundMarkdownMutation: (plan: PlannedTextMutation) => boolean
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
  applyBackgroundMarkdownMutation,
  resolveActiveSelection,
  setUploadInFlight,
  setUploadError,
  insertUploadedMarkdown,
}: UseMarkdownEditorMediaTransfersArgs) => {
  const retainedUploadErrorRef = useRef("")

  const clearUploadError = useCallback(() => {
    retainedUploadErrorRef.current = ""
    setUploadError("")
  }, [setUploadError])

  const reportUploadError = useCallback(
    (message: string) => {
      if (retainedUploadErrorRef.current) return
      retainedUploadErrorRef.current = message
      setUploadError(message)
    },
    [setUploadError]
  )

  const insertAtActiveSelection = useCallback(
    (text: string, options?: MarkdownMutationOptions) => {
      const { from, to } = resolveActiveSelection()
      applyPlannedMarkdownMutation(planReplaceSelection(from, to, text), options)
    },
    [applyPlannedMarkdownMutation, resolveActiveSelection]
  )

  const replaceExactOrAppend = useCallback(
    (exact: string, inlineReplacement: string, appendMarkdown: string) => {
      const selectionFrom = selectionRef.current.from
      const selectionTo = selectionRef.current.to
      const plan = planReplaceExactSubstring(
        valueRef.current,
        exact,
        inlineReplacement,
        selectionFrom,
        selectionTo
      )
      if (plan) {
        applyBackgroundMarkdownMutation(plan)
        return
      }
      applyBackgroundMarkdownMutation(
        planAppendAtEnd(valueRef.current, appendMarkdown, selectionFrom, selectionTo)
      )
    },
    [applyBackgroundMarkdownMutation, selectionRef, valueRef]
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
      if (plan) applyBackgroundMarkdownMutation(plan)
    },
    [applyBackgroundMarkdownMutation, selectionRef, valueRef]
  )

  const completeReservedImageUpload = useCallback(
    async (file: File, placeholder: string) => {
      if (!onUploadImage) return
      setUploadInFlight(1)
      let uploaded: MarkdownImageUploadResult
      try {
        uploaded = await onUploadImage(file)
      } catch {
        removeExactPlaceholder(placeholder)
        reportUploadError(MARKDOWN_IMAGE_UPLOAD_FAILED_MESSAGE)
        return
      } finally {
        setUploadInFlight(-1)
      }

      const resolved = resolveMarkdownImageEmbed(uploaded, file.name)
      if ("error" in resolved) {
        removeExactPlaceholder(placeholder)
        reportUploadError(resolved.error)
        return
      }

      replaceExactOrAppend(placeholder, toInlineMarkdownSnippet(resolved.markdown), resolved.markdown)
    },
    [onUploadImage, removeExactPlaceholder, replaceExactOrAppend, reportUploadError, setUploadInFlight]
  )

  const completeReservedAttachmentUpload = useCallback(
    async (file: File, placeholder: string) => {
      if (!onUploadFile) return
      setUploadInFlight(1)
      let uploaded: MarkdownFileUploadResult
      try {
        uploaded = await onUploadFile(file)
      } catch {
        removeExactPlaceholder(placeholder)
        reportUploadError(MARKDOWN_ATTACHMENT_UPLOAD_FAILED_MESSAGE)
        return
      } finally {
        setUploadInFlight(-1)
      }

      const resolved = resolveMarkdownAttachmentLink(uploaded, file.name)
      if ("error" in resolved) {
        removeExactPlaceholder(placeholder)
        reportUploadError(resolved.error)
        return
      }

      replaceExactOrAppend(placeholder, toInlineMarkdownSnippet(resolved.markdown), resolved.markdown)
    },
    [onUploadFile, removeExactPlaceholder, replaceExactOrAppend, reportUploadError, setUploadInFlight]
  )

  const completeReservedJob = useCallback(
    async (job: ReservedTransferJob) => {
      if (job.kind === "image") {
        await completeReservedImageUpload(job.file, job.placeholder)
        return
      }
      await completeReservedAttachmentUpload(job.file, job.placeholder)
    },
    [completeReservedAttachmentUpload, completeReservedImageUpload]
  )

  const uploadImageWithPlaceholder = useCallback(
    async (file: File) => {
      if (!onUploadImage) return
      clearUploadError()
      const placeholder = buildUploadingImagePlaceholder(file.name || "image", createUploadPlaceholderId())
      insertAtActiveSelection(placeholder)
      await completeReservedImageUpload(file, placeholder)
    },
    [clearUploadError, completeReservedImageUpload, insertAtActiveSelection, onUploadImage]
  )

  const handleImageInput = useCallback(
    async (file: File | null) => {
      if (!file || !onUploadImage) return
      clearUploadError()
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
    [clearUploadError, insertUploadedMarkdown, onUploadImage, setUploadError, setUploadInFlight]
  )

  const handleFileInput = useCallback(
    async (file: File | null) => {
      if (!file || !onUploadFile) return
      clearUploadError()
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
    [clearUploadError, insertUploadedMarkdown, onUploadFile, setUploadError, setUploadInFlight]
  )

  const processTransferFiles = useCallback(
    async (files: readonly File[]) => {
      clearUploadError()

      const { jobs, errors } = planTransferFileReservations(files, {
        canUploadImage: Boolean(onUploadImage),
        canUploadFile: Boolean(onUploadFile),
      })

      if (jobs.length > 0) {
        // Reserve every placeholder at the original caret before any upload await.
        insertAtActiveSelection(
          jobs.map((job) => job.placeholder).join(""),
          { clearUploadError: false }
        )
      }

      if (errors[0]) {
        reportUploadError(errors[0])
      }

      for (const job of jobs) {
        await completeReservedJob(job)
      }
    },
    [
      clearUploadError,
      completeReservedJob,
      insertAtActiveSelection,
      onUploadFile,
      onUploadImage,
      reportUploadError,
    ]
  )

  const handlePaste = useCallback(
    (event: ReactClipboardEvent<HTMLTextAreaElement>) => {
      if (disabled) return

      const mediaRoute = resolvePasteMediaRoute(event.clipboardData, {
        canUploadImage: Boolean(onUploadImage),
        canUploadFile: Boolean(onUploadFile),
      })
      if (mediaRoute.kind === "transfer-files") {
        event.preventDefault()
        void processTransferFiles(mediaRoute.files)
        return
      }
      if (mediaRoute.kind === "clipboard-image") {
        event.preventDefault()
        void uploadImageWithPlaceholder(mediaRoute.file)
        return
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
