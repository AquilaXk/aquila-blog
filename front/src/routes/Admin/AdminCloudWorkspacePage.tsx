/* eslint-disable @next/next/no-img-element -- private cloud content needs browser-owned auth cookies. */
import { useQuery, useQueryClient } from "@tanstack/react-query"
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from "pdfjs-dist"
import {
  type ChangeEvent,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  deleteCloudFile,
  getCloudFileContentUrl,
  listCloudFiles,
  uploadCloudFile,
  type CloudFile,
  type CloudMediaKind,
} from "src/apis/backend/cloud"
import AppIcon from "src/components/icons/AppIcon"
import {
  CLOUD_FILTERS,
  PLAYBACK_SPEEDS,
  doesCloudFileMatchFilters,
  formatCloudDate,
  formatCloudFileSize,
  getCloudFilenameParts,
  getCloudKindBadge,
  getCloudKindIconLabel,
  getCloudKindLabel,
  isUploadActive,
  mergeCloudFiles,
  resolveCloudSearchParams,
  type CloudMediaFilter,
  type UploadQueueItem,
} from "./AdminCloudWorkspaceModel"
import AdminCloudUploadQueue from "./AdminCloudUploadQueue"
import {
  ActionBar,
  ActionGroup,
  CloudContent,
  CloudMain,
  CloudSearchField,
  CloudTitleBar,
  CloudWorkspace,
  ConfirmBackdrop,
  ConfirmDialog,
  DetailHeader,
  DetailMetaList,
  DetailPanel,
  DetailPreviewBox,
  DetailScrim,
  DetailSummary,
  DetailTab,
  DetailTabs,
  DocumentFallbackBox,
  EmptyState,
  EmptyTableState,
  FavoriteButton,
  FileIdentity,
  FileMetaLine,
  FileNameButton,
  FileNameStack,
  FileTable,
  FileTableScroll,
  FileThumbnailFrame,
  FileTypeIcon,
  FilterGroup,
  GhostButton,
  IconButton,
  InlineList,
  LoadingTableStatus,
  Notice,
  PdfCanvas,
  PhotoFallback,
  PhotoFrame,
  PlayerBar,
  PreviewHeader,
  PreviewStage,
  PrimaryButton,
  RowCheckbox,
  SearchDetail,
  SearchInput,
  SecondaryButton,
  SelectBoxCell,
  SkeletonRow,
  SkeletonRows,
  ToastViewport,
  UploadZone,
  UploadInput,
  ViewModeButton,
  VideoFrame,
} from "./AdminCloudWorkspace.styles"

const CLOUD_QUERY_KEY = "admin-cloud-files"
const EMPTY_CLOUD_FILES: CloudFile[] = []
const PDF_STANDARD_FONT_DATA_URL = "/pdfjs/standard_fonts/"
const PDF_LOADED_TASK_DESTROY_DELAY_MS = 3000
const mediaKindFromFilter = (filter: CloudMediaFilter): CloudMediaKind | undefined =>
  filter === "ALL" ? undefined : filter

const isCloudMediaFilter = (value: unknown): value is CloudMediaFilter =>
  CLOUD_FILTERS.some((item) => item.value === value)

const getCachedCloudQueryFilters = (queryKey: readonly unknown[]) => ({
  filter: isCloudMediaFilter(queryKey[1]) ? queryKey[1] : ("ALL" as CloudMediaFilter),
  keyword: typeof queryKey[2] === "string" ? queryKey[2] : "",
})

const createUploadQueueItem = (file: File): UploadQueueItem => ({
  id: `${Date.now()}-${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
  file,
  name: file.name,
  byteSize: file.size,
  status: "queued",
  progress: 0,
  message: "업로드 대기 중",
})

const sanitizeClientFilenameForDisplayFallback = (filename: string) => {
  const normalized = filename
    .replace(/[\r\n\t]/g, " ")
    .replace(/[\\/]/g, "_")
    .replace(/[\p{Cc}\p{Cf}\p{Cs}]/gu, "")
    .replace(/\s+/g, " ")
    .trim()

  return Array.from(normalized).slice(0, 255).join("")
}

const preferClientFilenameForUploadedFile = (uploaded: CloudFile, clientFilename: string): CloudFile => {
  const normalizedClientFilename = sanitizeClientFilenameForDisplayFallback(clientFilename)
  if (!normalizedClientFilename) return uploaded
  const serverFilename = uploaded.originalFilename.trim()
  if (normalizedClientFilename === serverFilename) return uploaded

  const clientHasReadableUnicode = /[^\x00-\x7F]/u.test(normalizedClientFilename)
  const serverLostReadableUnicode = !/[^\x00-\x7F]/u.test(serverFilename)
  const serverLooksLikePlaceholder = /_{4,}/.test(serverFilename)
  if (!clientHasReadableUnicode || !serverLostReadableUnicode || !serverLooksLikePlaceholder) return uploaded

  return {
    ...uploaded,
    originalFilename: normalizedClientFilename,
  }
}

const isAbortLikeError = (error: unknown) =>
  error instanceof DOMException && (error.name === "AbortError" || error.name === "TimeoutError")

const isPdfDocumentFile = (file: CloudFile) => file.contentType.toLowerCase() === "application/pdf"

const resolveCloudErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message.trim()) return error.message.trim()
  return "요청 처리 중 오류가 발생했습니다."
}

const installPdfWorkerTerminationRejectionHandler = () => {
  const shouldIgnorePdfWorkerTermination = (error: unknown) => {
    if (error instanceof Error) return error.message.includes("Worker was terminated")
    if (typeof error === "string") return error.includes("Worker was terminated")

    return false
  }

  const handleCleanupRejection = (event: PromiseRejectionEvent) => {
    if (!shouldIgnorePdfWorkerTermination(event.reason)) return

    event.preventDefault()
  }

  const handleCleanupError = (event: ErrorEvent) => {
    if (!shouldIgnorePdfWorkerTermination(event.error) && !shouldIgnorePdfWorkerTermination(event.message)) return

    event.preventDefault()
  }

  window.addEventListener("unhandledrejection", handleCleanupRejection)
  window.addEventListener("error", handleCleanupError)
  return (delayMs = 0) => {
    window.setTimeout(() => {
      window.removeEventListener("unhandledrejection", handleCleanupRejection)
      window.removeEventListener("error", handleCleanupError)
    }, delayMs)
  }
}

const ignorePdfPreviewTeardownRejection = (
  loadingTask: PDFDocumentLoadingTask | null,
  pdfDocument: PDFDocumentProxy | null,
  renderTask: RenderTask | null
) => {
  const renderSettled = renderTask?.promise.catch(() => undefined) ?? Promise.resolve()

  void loadingTask?.promise.catch(() => {
    // teardown 중 늦게 도착한 loading reject도 pageerror로 노출하지 않는다.
  })

  if (pdfDocument) {
    void renderSettled.then(async () => {
      await pdfDocument.cleanup().catch(() => {
        // 이미 해제된 문서 리소스 정리는 사용자에게 노출하지 않는다.
      })

      window.setTimeout(() => {
        void loadingTask?.destroy().catch(() => {
          // 로드 완료 후 worker 종료 reject도 미리보기 teardown 결과로 흡수한다.
        })
      }, PDF_LOADED_TASK_DESTROY_DELAY_MS)
    })
    return
  }

  if (!loadingTask) return

  void renderSettled.finally(() => {
    void loadingTask.destroy().catch(() => {
      // cleanup에서 PDF.js worker/download를 종료할 때 발생하는 reject도 사용자에게 노출하지 않는다.
    })
  })
}

type PdfPreviewProps = {
  file: CloudFile
  contentUrl: string
}

const PdfPreview = ({ file, contentUrl }: PdfPreviewProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [pageCount, setPageCount] = useState(0)
  const [renderState, setRenderState] = useState("미리보기 준비")

  useEffect(() => {
    if (file.mediaKind !== "DOCUMENT") return
    let cancelled = false
    let loadingTask: PDFDocumentLoadingTask | null = null
    let pdfDocument: PDFDocumentProxy | null = null
    let renderTask: RenderTask | null = null
    const releasePdfWorkerTerminationHandler = installPdfWorkerTerminationRejectionHandler()

    const render = async () => {
      try {
        const pdfjs = await import("pdfjs-dist")
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"
        loadingTask = pdfjs.getDocument({
          url: contentUrl,
          standardFontDataUrl: PDF_STANDARD_FONT_DATA_URL,
          withCredentials: true,
        })
        void loadingTask.promise.catch(() => {
          // cleanup이 먼저 실행된 경우 await 경로 밖에서도 worker 종료 reject를 소비한다.
        })
        const pdf = await loadingTask.promise
        pdfDocument = pdf
        if (cancelled) return
        setPageCount(pdf.numPages)
        const page = await pdf.getPage(1)
        const viewport = page.getViewport({ scale: 1.1 })
        const canvas = canvasRef.current
        const context = canvas?.getContext("2d")
        if (!canvas || !context) return

        const outputScale = window.devicePixelRatio || 1
        canvas.width = Math.floor(viewport.width * outputScale)
        canvas.height = Math.floor(viewport.height * outputScale)
        canvas.style.width = "100%"
        canvas.style.height = "auto"
        renderTask = page.render({
          canvas,
          canvasContext: context,
          viewport,
          transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined,
        })
        void renderTask.promise.catch(() => {
          // 파일 전환/패널 닫기 중 render task 취소가 pageerror로 번지는 것을 막는다.
        })
        await renderTask.promise
        if (!cancelled) setRenderState("미리보기 완료")
      } catch {
        if (!cancelled) setRenderState("미리보기 대기")
      }
    }

    void render()

    return () => {
      cancelled = true
      try {
        renderTask?.cancel()
      } catch {
        // loading task 종료가 먼저 끝난 경우 render task도 이미 취소 상태일 수 있다.
      }
      ignorePdfPreviewTeardownRejection(loadingTask, pdfDocument, renderTask)
      releasePdfWorkerTerminationHandler(10000)
    }
  }, [contentUrl, file.mediaKind])

  return (
    <PreviewStage>
      <PreviewHeader>
        <h3>문서 뷰어</h3>
      </PreviewHeader>
      <PdfCanvas ref={canvasRef} aria-label={`${file.originalFilename} PDF 미리보기`} />
      <InlineList aria-label="PDF 문서 제어">
        <span>{renderState}</span>
        <span>1 / {pageCount || 1}</span>
        <span>확대 110%</span>
      </InlineList>
    </PreviewStage>
  )
}

type DocumentFallbackPreviewProps = {
  file: CloudFile
  contentUrl: string
}

const DocumentFallbackPreview = ({ file, contentUrl }: DocumentFallbackPreviewProps) => (
  <PreviewStage>
    <PreviewHeader>
      <h3>문서 파일</h3>
    </PreviewHeader>
    <DocumentFallbackBox>
      <strong>{getCloudKindBadge(file)} 파일</strong>
      <p>{file.originalFilename}</p>
      <a href={contentUrl} download={file.originalFilename}>
        다운로드
      </a>
    </DocumentFallbackBox>
  </PreviewStage>
)

type PhotoPreviewProps = {
  file: CloudFile
  contentUrl: string
}

const PhotoPreview = ({ file, contentUrl }: PhotoPreviewProps) => {
  const [imageState, setImageState] = useState<"loading" | "ready" | "error">("loading")

  useEffect(() => {
    setImageState("loading")
  }, [contentUrl])

  return (
    <PreviewStage>
      <PreviewHeader>
        <h3>사진 보기</h3>
      </PreviewHeader>
      <PhotoFrame
        aria-label={`${file.originalFilename} 사진 미리보기`}
        aria-busy={imageState === "loading" ? "true" : "false"}
      >
        {imageState === "error" ? <PhotoFallback role="alert">이미지를 불러올 수 없습니다.</PhotoFallback> : null}
        <img
          src={contentUrl}
          alt={file.originalFilename}
          decoding="async"
          loading="eager"
          hidden={imageState === "error"}
          onLoad={() => setImageState("ready")}
          onError={() => setImageState("error")}
        />
      </PhotoFrame>
    </PreviewStage>
  )
}

type VideoPreviewProps = {
  file: CloudFile
  contentUrl: string
}

const VideoPreview = ({ file, contentUrl }: VideoPreviewProps) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [speed, setSpeed] = useState<(typeof PLAYBACK_SPEEDS)[number]>(1)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    video.playbackRate = speed
  }, [speed, contentUrl])

  return (
    <PreviewStage>
      <PreviewHeader>
        <h3>클라우드 동영상</h3>
      </PreviewHeader>
      <VideoFrame>
        <video ref={videoRef} src={contentUrl} controls preload="metadata" playsInline />
        <PlayerBar aria-label="클라우드 동영상 재생 제어">
          <InlineList>
            <span>브라우저 기본 재생</span>
            <span>원본 파일 재생</span>
          </InlineList>
          <FilterGroup aria-label="동영상 재생 속도">
            {PLAYBACK_SPEEDS.map((candidate) => (
              <GhostButton
                key={candidate}
                type="button"
                data-active={speed === candidate ? "true" : "false"}
                onClick={() => setSpeed(candidate)}
              >
                {candidate}x
              </GhostButton>
            ))}
          </FilterGroup>
        </PlayerBar>
      </VideoFrame>
    </PreviewStage>
  )
}

type PreviewDrawerProps = {
  file: CloudFile | null
}

const PreviewDrawer = ({ file }: PreviewDrawerProps) => {
  if (!file) {
    return (
      <EmptyState>
        <strong>파일 선택</strong>
      </EmptyState>
    )
  }

  const contentUrl = getCloudFileContentUrl(file.id)
  if (file.mediaKind === "DOCUMENT" && isPdfDocumentFile(file)) return <PdfPreview file={file} contentUrl={contentUrl} />
  if (file.mediaKind === "DOCUMENT") return <DocumentFallbackPreview file={file} contentUrl={contentUrl} />
  if (file.mediaKind === "PHOTO") return <PhotoPreview file={file} contentUrl={contentUrl} />
  return <VideoPreview file={file} contentUrl={contentUrl} />
}

type FileThumbnailProps = {
  file: CloudFile
  selected: boolean
}

const FileThumbnail = ({ file, selected }: FileThumbnailProps) => {
  const badge = getCloudKindBadge(file)

  return (
    <FileThumbnailFrame
      aria-hidden="true"
      data-kind={file.mediaKind}
      data-selected={selected ? "true" : "false"}
    >
      {badge}
    </FileThumbnailFrame>
  )
}

type DeleteConfirmState = {
  files: CloudFile[]
}

type CloudToastState =
  | {
      tone: "success" | "error"
      text: string
    }
  | null

const FileTableHead = () => (
  <thead>
    <tr>
      <th aria-label="선택" />
      <th aria-label="즐겨찾기" />
      <th>이름</th>
      <th>크기</th>
      <th>수정한 날짜</th>
    </tr>
  </thead>
)

const AdminCloudWorkspacePage = () => {
  const queryClient = useQueryClient()
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const uploadControllersRef = useRef<Map<string, AbortController>>(new Map())
  const [filter, setFilter] = useState<CloudMediaFilter>("ALL")
  const [keyword, setKeyword] = useState("")
  const [selectedFileId, setSelectedFileId] = useState<number | null>(null)
  const [checkedFileIds, setCheckedFileIds] = useState<number[]>([])
  const [notice, setNotice] = useState("")
  const [toast, setToast] = useState<CloudToastState>(null)
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([])
  const [optimisticFiles, setOptimisticFiles] = useState<CloudFile[]>([])
  const [isDetailPanelOpen, setIsDetailPanelOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState | null>(null)
  const [isDeletePending, setIsDeletePending] = useState(false)

  const filesQuery = useQuery({
    queryKey: [CLOUD_QUERY_KEY, filter, keyword],
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: () => {
      const searchParams = resolveCloudSearchParams(keyword)
      return listCloudFiles({
        folderPath: searchParams.folderPath,
        keyword: searchParams.keyword,
        mediaKind: mediaKindFromFilter(filter),
      })
    },
  })
  const serverFiles = filesQuery.data ?? EMPTY_CLOUD_FILES
  const visibleOptimisticFiles = useMemo(
    () => optimisticFiles.filter((file) => doesCloudFileMatchFilters(file, filter, keyword)),
    [filter, keyword, optimisticFiles]
  )
  const files = useMemo(
    () => mergeCloudFiles(visibleOptimisticFiles, serverFiles),
    [serverFiles, visibleOptimisticFiles]
  )
  const selectedFile = files.find((file) => file.id === selectedFileId) || files[0] || null
  const isDetailDrawerMode = files.length > 8
  const shouldShowDetailPanel = isDetailPanelOpen && selectedFile !== null
  const activeUploadCount = uploadQueue.filter((item) => isUploadActive(item.status)).length
  const completedUploadCount = uploadQueue.filter((item) => item.status === "done").length
  const allVisibleChecked = files.length > 0 && files.every((file) => checkedFileIds.includes(file.id))
  const deleteDialogRef = useRef<HTMLDivElement | null>(null)
  const deleteCancelButtonRef = useRef<HTMLButtonElement | null>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (selectedFileId && files.some((file) => file.id === selectedFileId)) return
    setSelectedFileId(files[0]?.id ?? null)
  }, [files, selectedFileId])

  useEffect(() => {
    setCheckedFileIds((current) => current.filter((id) => files.some((file) => file.id === id)))
  }, [files])

  useEffect(() => {
    if (!deleteConfirm) return

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusFrame = window.requestAnimationFrame(() => {
      deleteCancelButtonRef.current?.focus()
    })

    return () => {
      window.cancelAnimationFrame(focusFrame)
      previousFocusRef.current?.focus()
      previousFocusRef.current = null
    }
  }, [deleteConfirm])

  useEffect(() => {
    if (!deleteConfirm) return

    const handleDocumentKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || isDeletePending) return
      event.preventDefault()
      setDeleteConfirm(null)
    }

    document.addEventListener("keydown", handleDocumentKeyDown)
    return () => {
      document.removeEventListener("keydown", handleDocumentKeyDown)
    }
  }, [deleteConfirm, isDeletePending])

  useEffect(() => {
    const hasActiveUpload = uploadQueue.some((item) => item.status === "uploading")
    const nextUpload = uploadQueue.find((item) => item.status === "queued")
    if (hasActiveUpload || !nextUpload) return

    const controller = new AbortController()
    uploadControllersRef.current.set(nextUpload.id, controller)
    setUploadQueue((current) =>
      current.map((item) =>
        item.id === nextUpload.id
          ? { ...item, status: "uploading", progress: 36, message: "서버로 업로드 중" }
          : item
      )
    )

    const run = async () => {
      try {
        const uploaded = await uploadCloudFile(nextUpload.file, "", controller.signal, {
          onProgress: ({ progress, message }) => {
            setUploadQueue((current) =>
              current.map((item) =>
                item.id === nextUpload.id && item.status !== "cancelled"
                  ? { ...item, progress, message }
                  : item
              )
            )
          },
        })
        if (controller.signal.aborted) throw new DOMException("Upload aborted", "AbortError")
        const displayUploaded = preferClientFilenameForUploadedFile(uploaded, nextUpload.name)

        setOptimisticFiles((current) => mergeCloudFiles([displayUploaded], current))
        queryClient.getQueriesData<CloudFile[]>({ queryKey: [CLOUD_QUERY_KEY] }).forEach(([queryKey, current]) => {
          if (!Array.isArray(current)) return
          const cachedFilters = getCachedCloudQueryFilters(queryKey)
          if (!doesCloudFileMatchFilters(displayUploaded, cachedFilters.filter, cachedFilters.keyword)) return
          queryClient.setQueryData(queryKey, mergeCloudFiles([displayUploaded], current))
        })
        setIsDetailPanelOpen(true)
        setSelectedFileId(displayUploaded.id)
        setNotice((current) =>
          current.includes(nextUpload.name) && /업로드 (실패|취소)/.test(current) ? "" : current
        )
        setUploadQueue((current) =>
          current.map((item) =>
            item.id === nextUpload.id && item.status !== "cancelled"
              ? {
                  ...item,
                  status: "done",
                  progress: 100,
                  message: "업로드 완료",
                  uploadedFileId: displayUploaded.id,
                }
              : item
          )
        )
        void queryClient.invalidateQueries({ queryKey: [CLOUD_QUERY_KEY] })
      } catch (error) {
        const aborted = controller.signal.aborted || isAbortLikeError(error)
        const failureMessage = aborted ? "사용자가 취소함" : resolveCloudErrorMessage(error)
        setNotice(aborted ? `${nextUpload.name} 업로드 취소` : `${nextUpload.name} 업로드 실패: ${failureMessage}`)
        setUploadQueue((current) =>
          current.map((item) =>
            item.id === nextUpload.id
              ? {
                  ...item,
                  status: aborted ? "cancelled" : "failed",
                  progress: aborted ? 0 : 100,
                  message: failureMessage,
                }
              : item
          )
        )
      } finally {
        uploadControllersRef.current.delete(nextUpload.id)
      }
    }

    void run()
  }, [queryClient, uploadQueue])

  const queueUploadFiles = (selectedFiles: File[]) => {
    if (selectedFiles.length === 0) return

    setUploadQueue((current) => [...current, ...selectedFiles.map(createUploadQueueItem)])
  }

  const handleUploadSelect = (event: ChangeEvent<HTMLInputElement>) => {
    queueUploadFiles(Array.from(event.currentTarget.files || []))
    event.currentTarget.value = ""
  }

  const handleUploadDragOver = (event: ReactDragEvent<HTMLButtonElement>) => {
    event.preventDefault()
  }

  const handleUploadDrop = (event: ReactDragEvent<HTMLButtonElement>) => {
    event.preventDefault()
    queueUploadFiles(Array.from(event.dataTransfer.files || []))
  }

  const handleCancelUpload = (item: UploadQueueItem) => {
    if (!isUploadActive(item.status)) return
    uploadControllersRef.current.get(item.id)?.abort()
    setUploadQueue((current) =>
      current.map((queueItem) =>
        queueItem.id === item.id
          ? { ...queueItem, status: "cancelled", progress: 0, message: "사용자가 취소함" }
          : queueItem
      )
    )
  }

  const handleClearFinishedUploads = () => {
    setUploadQueue((current) => current.filter((item) => isUploadActive(item.status)))
  }

  const handleRetryUpload = (item: UploadQueueItem) => {
    if (item.status !== "failed") return
    setUploadQueue((current) =>
      current.map((queueItem) =>
        queueItem.id === item.id
          ? {
              ...queueItem,
              status: "queued",
              progress: 0,
              message: "업로드 대기 중",
              retryCount: (queueItem.retryCount ?? 0) + 1,
            }
          : queueItem
      )
    )
  }

  const handleToggleAllChecked = () => {
    setCheckedFileIds(allVisibleChecked ? [] : files.map((file) => file.id))
  }

  const handleToggleChecked = (fileId: number) => {
    setCheckedFileIds((current) =>
      current.includes(fileId) ? current.filter((id) => id !== fileId) : [...current, fileId]
    )
  }

  const handlePreviewFile = (fileId: number) => {
    setIsDetailPanelOpen(true)
    setSelectedFileId(fileId)
  }

  const removeDeletedFilesFromCloudCaches = (deletedIds: Set<number>) => {
    queryClient.getQueriesData<CloudFile[]>({ queryKey: [CLOUD_QUERY_KEY] }).forEach(([queryKey, current]) => {
      if (!Array.isArray(current)) return
      queryClient.setQueryData(
        queryKey,
        current.filter((file) => !deletedIds.has(file.id))
      )
    })
  }

  const closeDeleteConfirm = () => {
    if (isDeletePending) return
    setDeleteConfirm(null)
  }

  const handleDeleteDialogKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault()
      closeDeleteConfirm()
      return
    }

    if (event.key !== "Tab") return

    const dialog = deleteDialogRef.current
    if (!dialog) return
    const focusableElements = Array.from(dialog.querySelectorAll<HTMLElement>("button:not(:disabled)"))
    if (focusableElements.length === 0) {
      event.preventDefault()
      return
    }

    const firstElement = focusableElements[0]
    const lastElement = focusableElements[focusableElements.length - 1]
    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault()
      lastElement.focus()
      return
    }
    if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault()
      firstElement.focus()
    }
  }

  const performSingleDelete = async (file: CloudFile) => {
    try {
      await deleteCloudFile(file.id)
      const deletedIds = new Set([file.id])
      setToast({ tone: "success", text: `${file.originalFilename} 삭제 완료` })
      setOptimisticFiles((current) => current.filter((item) => item.id !== file.id))
      setCheckedFileIds((current) => current.filter((id) => id !== file.id))
      removeDeletedFilesFromCloudCaches(deletedIds)
      if (selectedFileId === file.id) setSelectedFileId(null)
    } catch {
      setToast({ tone: "error", text: `${file.originalFilename} 삭제 실패` })
    } finally {
      await queryClient.invalidateQueries({ queryKey: [CLOUD_QUERY_KEY] })
    }
  }

  const performBulkDelete = async (targets: CloudFile[]) => {
    const results = await Promise.allSettled(
      targets.map(async (file) => {
        await deleteCloudFile(file.id)
        return file
      })
    )
    const deletedFiles = results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []))
    const deletedIds = new Set(deletedFiles.map((file) => file.id))
    const failedCount = targets.length - deletedIds.size

    if (deletedIds.size > 0) {
      setOptimisticFiles((current) => current.filter((file) => !deletedIds.has(file.id)))
      setCheckedFileIds((current) => current.filter((id) => !deletedIds.has(id)))
      removeDeletedFilesFromCloudCaches(deletedIds)
      if (selectedFileId && deletedIds.has(selectedFileId)) setSelectedFileId(null)
    }

    if (failedCount > 0) {
      const failureText =
        deletedIds.size > 0 ? `${deletedIds.size}개 삭제 완료, ${failedCount}개 실패` : `${failedCount}개 파일 삭제 실패`
      setToast({ tone: "error", text: failureText })
    } else {
      const successText = `${deletedIds.size}개 파일 삭제 완료`
      setToast({ tone: "success", text: successText })
    }
    await queryClient.invalidateQueries({ queryKey: [CLOUD_QUERY_KEY] })
  }

  const handleDeleteSelected = () => {
    const targets = files.filter((file) => checkedFileIds.includes(file.id))
    if (targets.length === 0) return

    setDeleteConfirm({ files: targets })
  }

  const handleConfirmDelete = async () => {
    if (!deleteConfirm || isDeletePending) return

    setIsDeletePending(true)
    try {
      if (deleteConfirm.files.length === 1) {
        await performSingleDelete(deleteConfirm.files[0])
      } else {
        await performBulkDelete(deleteConfirm.files)
      }
      setDeleteConfirm(null)
    } finally {
      setIsDeletePending(false)
    }
  }

  const isFileListError = filesQuery.isError
  const emptyTitle = filesQuery.isLoading
    ? "파일을 불러오는 중입니다."
    : isFileListError
      ? "파일 목록을 불러오지 못했습니다."
    : activeUploadCount > 0
      ? "업로드 중인 파일이 있습니다."
    : keyword || filter !== "ALL"
      ? "선택한 조건에 맞는 파일이 없습니다."
      : "표시할 파일이 없습니다."

  return (
    <CloudMain>
      <CloudWorkspace
        data-detail-open={shouldShowDetailPanel ? "true" : "false"}
        data-detail-mode={isDetailDrawerMode ? "drawer" : "inline"}
      >
        <CloudContent>
          <CloudTitleBar>
            <div>
              <span>Storage</span>
              <h1>미디어 라이브러리</h1>
              <p>글 이미지, 첨부 파일과 업로드 lifecycle을 관리합니다.</p>
            </div>
            <CloudSearchField>
              <AppIcon name="search" />
              <SearchInput
                aria-label="클라우드 파일 검색"
                placeholder="클라우드 파일 검색"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
              />
              <SearchDetail aria-hidden="true">파일</SearchDetail>
            </CloudSearchField>
          </CloudTitleBar>

          <UploadZone
            type="button"
            aria-label="파일을 끌어놓거나 클릭해 업로드"
            onClick={() => uploadInputRef.current?.click()}
            onDragOver={handleUploadDragOver}
            onDrop={handleUploadDrop}
          >
            <AppIcon name="cloud" />
            <strong>파일을 끌어놓거나 클릭해 업로드</strong>
            <span>사진 50MB · 문서 100MB · 동영상 5GB 이하</span>
          </UploadZone>

          <ActionBar>
            <ActionGroup>
              <IconButton
                type="button"
                aria-label={allVisibleChecked ? "전체 선택 해제" : "전체 선택"}
                data-active={allVisibleChecked ? "true" : "false"}
                onClick={handleToggleAllChecked}
              >
                ✓
              </IconButton>
              <UploadInput
                ref={uploadInputRef}
                aria-label="클라우드 파일 업로드"
                type="file"
                multiple
                onChange={handleUploadSelect}
              />
              <PrimaryButton
                type="button"
                aria-label={activeUploadCount > 0 ? "업로드 중" : "파일 업로드"}
                onClick={() => uploadInputRef.current?.click()}
              >
                ⤴ 올리기
              </PrimaryButton>
              <SecondaryButton type="button" disabled>
                새 폴더
              </SecondaryButton>
              <SecondaryButton type="button" disabled={checkedFileIds.length === 0} onClick={handleDeleteSelected}>
                선택 삭제
              </SecondaryButton>
            </ActionGroup>

            <ActionGroup data-align="end">
              {notice ? <Notice>{notice}</Notice> : null}
              <FilterGroup aria-label="파일 종류 필터">
                {CLOUD_FILTERS.map((item) => (
                  <GhostButton
                    key={item.value}
                    type="button"
                    data-active={filter === item.value ? "true" : "false"}
                    onClick={() => setFilter(item.value)}
                  >
                    {item.label}
                  </GhostButton>
                ))}
              </FilterGroup>
              <ViewModeButton type="button" aria-label="리스트 보기" data-active="true">
                ☰ 리스트
              </ViewModeButton>
              <ViewModeButton type="button" aria-label="그리드 보기" disabled>
                ⊞ 그리드
              </ViewModeButton>
              <ViewModeButton
                type="button"
                aria-label="상세 패널 보기"
                data-active={shouldShowDetailPanel ? "true" : "false"}
                onClick={() => {
                  setIsDetailPanelOpen((current) => !current)
                  setSelectedFileId((current) => current ?? files[0]?.id ?? null)
                }}
              >
                ⓘ 정보
              </ViewModeButton>
            </ActionGroup>
          </ActionBar>

          <AdminCloudUploadQueue
            uploadQueue={uploadQueue}
            activeUploadCount={activeUploadCount}
            completedUploadCount={completedUploadCount}
            onCancelUpload={handleCancelUpload}
            onRetryUpload={handleRetryUpload}
            onClearFinishedUploads={handleClearFinishedUploads}
          />

          <FileTableScroll>
            {files.length === 0 && filesQuery.isLoading ? (
              <FileTable role="table" aria-busy="true">
                <FileTableHead />
                <tbody>
                  <tr data-loading-row="true">
                    <td colSpan={5}>
                      <LoadingTableStatus role="status" aria-label="파일 목록 로딩">
                        <SkeletonRows aria-hidden="true">
                          <SkeletonRow data-admin-cloud-skeleton-row="true" />
                          <SkeletonRow data-admin-cloud-skeleton-row="true" />
                          <SkeletonRow data-admin-cloud-skeleton-row="true" />
                        </SkeletonRows>
                      </LoadingTableStatus>
                    </td>
                  </tr>
                </tbody>
              </FileTable>
            ) : files.length === 0 ? (
              <EmptyTableState>
                <strong>{emptyTitle}</strong>
                {activeUploadCount > 0 ? null : (
                  isFileListError ? (
                    <PrimaryButton
                      type="button"
                      aria-label="파일 목록 다시 시도"
                      onClick={() => void filesQuery.refetch()}
                    >
                      다시 시도
                    </PrimaryButton>
                  ) : (
                    <PrimaryButton type="button" aria-label="파일 업로드" onClick={() => uploadInputRef.current?.click()}>
                      ⤴ 올리기
                    </PrimaryButton>
                  )
                )}
              </EmptyTableState>
            ) : (
              <FileTable role="table" aria-busy={filesQuery.isFetching ? "true" : "false"}>
                <FileTableHead />
                <tbody>
                  {files.map((file) => {
                    const checked = checkedFileIds.includes(file.id)
                    const selected = shouldShowDetailPanel && selectedFile?.id === file.id
                    const filenameParts = getCloudFilenameParts(file.originalFilename)
                    return (
                      <tr key={file.id} role="row" data-selected={selected ? "true" : "false"}>
                        <SelectBoxCell>
                          <RowCheckbox
                            type="checkbox"
                            aria-label={`${file.originalFilename} 선택`}
                            checked={checked}
                            onChange={() => handleToggleChecked(file.id)}
                          />
                        </SelectBoxCell>
                        <td>
                          <FavoriteButton
                            type="button"
                            aria-label={`${file.originalFilename} 즐겨찾기 (준비 중)`}
                            disabled
                          >
                            ☆
                          </FavoriteButton>
                        </td>
                        <td>
                          <FileIdentity>
                            <FileThumbnail file={file} selected={selected} />
                            <FileNameStack>
                              <FileNameButton
                                type="button"
                                title={file.originalFilename}
                                onClick={() => handlePreviewFile(file.id)}
                              >
                                <strong>
                                  <span data-filename-stem>{filenameParts.stem}</span>
                                  <span data-filename-extension>{filenameParts.extension}</span>
                                </strong>
                              </FileNameButton>
                              <FileMetaLine>
                                <FileTypeIcon
                                  aria-label={getCloudKindLabel(file.mediaKind)}
                                  data-file-kind-badge="true"
                                  data-selected={selected ? "true" : "false"}
                                >
                                  {getCloudKindIconLabel(file)}
                                </FileTypeIcon>
                                <span>{getCloudKindLabel(file.mediaKind)}</span>
                              </FileMetaLine>
                            </FileNameStack>
                          </FileIdentity>
                        </td>
                        <td>{formatCloudFileSize(file.byteSize)}</td>
                        <td>{formatCloudDate(file.modifiedAt || file.createdAt)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </FileTable>
            )}
          </FileTableScroll>
        </CloudContent>

        {shouldShowDetailPanel ? (
          <>
            <DetailScrim
              type="button"
              aria-label="상세 패널 닫기"
              data-mode={isDetailDrawerMode ? "drawer" : "inline"}
              onClick={() => setIsDetailPanelOpen(false)}
            />
            <DetailPanel aria-label="클라우드 상세정보" data-mode={isDetailDrawerMode ? "drawer" : "inline"}>
              <DetailHeader>
                <h2>파일 정보</h2>
                <IconButton
                  type="button"
                  aria-label="상세 패널 닫기"
                  onClick={() => {
                    setIsDetailPanelOpen(false)
                  }}
                >
                  ×
                </IconButton>
              </DetailHeader>
              <DetailTabs>
                <DetailTab type="button" data-active="true">
                  상세정보
                </DetailTab>
              </DetailTabs>
              <DetailPreviewBox>
                <PreviewDrawer file={selectedFile} />
              </DetailPreviewBox>
              <DetailSummary>
                <FileThumbnail file={selectedFile} selected />
                <div>
                  <strong>{selectedFile.originalFilename}</strong>
                  <p>
                    {getCloudKindBadge(selectedFile)} · {getCloudKindLabel(selectedFile.mediaKind)} ·{" "}
                    {formatCloudFileSize(selectedFile.byteSize)}
                  </p>
                </div>
              </DetailSummary>
              <DetailMetaList>
                <dt>
                  <span aria-hidden="true">
                    <AppIcon name="file" />
                  </span>
                  종류
                </dt>
                <dd>
                  {getCloudKindBadge(selectedFile)} · {getCloudKindLabel(selectedFile.mediaKind)}
                </dd>
                <dt>
                  <span aria-hidden="true">
                    <AppIcon name="folder" />
                  </span>
                  위치
                </dt>
                <dd>{selectedFile.folderPath || "/"}</dd>
                <dt>
                  <span aria-hidden="true">
                    <AppIcon name="clock" />
                  </span>
                  올린 날짜
                </dt>
                <dd>{formatCloudDate(selectedFile.createdAt)}</dd>
                <dt>
                  <span aria-hidden="true">
                    <AppIcon name="edit" />
                  </span>
                  수정한 날짜
                </dt>
                <dd>{formatCloudDate(selectedFile.modifiedAt || selectedFile.createdAt)}</dd>
                <dt>
                  <span aria-hidden="true">
                    <AppIcon name="package" />
                  </span>
                  크기
                </dt>
                <dd>{formatCloudFileSize(selectedFile.byteSize)}</dd>
                <dt>
                  <span aria-hidden="true">
                    <AppIcon name="lock" />
                  </span>
                  권한
                </dt>
                <dd>계정 소유주만 볼 수 있음</dd>
              </DetailMetaList>
            </DetailPanel>
          </>
        ) : null}
      </CloudWorkspace>
      {toast ? (
        <ToastViewport data-tone={toast.tone} role="status" aria-live="polite">
          <strong>{toast.tone === "error" ? "작업 실패" : "작업 완료"}</strong>
          <span>{toast.text}</span>
          <button type="button" onClick={() => setToast(null)}>
            닫기
          </button>
        </ToastViewport>
      ) : null}
      {deleteConfirm ? (
        <ConfirmBackdrop role="presentation" onClick={closeDeleteConfirm}>
          <ConfirmDialog
            ref={deleteDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="cloud-delete-confirm-title"
            aria-describedby="cloud-delete-confirm-description"
            tabIndex={-1}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={handleDeleteDialogKeyDown}
          >
            <strong id="cloud-delete-confirm-title">파일 삭제</strong>
            <p id="cloud-delete-confirm-description">
              <span>
                {deleteConfirm.files.length === 1
                  ? deleteConfirm.files[0].originalFilename
                  : `${deleteConfirm.files.length}개 파일`}
              </span>
              삭제한 파일은 관리자 클라우드 목록에서 제거됩니다.
            </p>
            <div>
              <SecondaryButton
                ref={deleteCancelButtonRef}
                type="button"
                disabled={isDeletePending}
                onClick={closeDeleteConfirm}
              >
                취소
              </SecondaryButton>
              <PrimaryButton type="button" disabled={isDeletePending} onClick={() => void handleConfirmDelete()}>
                삭제
              </PrimaryButton>
            </div>
          </ConfirmDialog>
        </ConfirmBackdrop>
      ) : null}
    </CloudMain>
  )
}

export default AdminCloudWorkspacePage
