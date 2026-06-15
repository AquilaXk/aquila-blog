/* eslint-disable @next/next/no-img-element -- private cloud content needs browser-owned auth cookies. */
import { useQuery, useQueryClient } from "@tanstack/react-query"
import type { PDFDocumentLoadingTask, RenderTask } from "pdfjs-dist"
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react"
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
  IINA_CHAPTERS,
  IINA_SHORTCUTS,
  PLAYBACK_SPEEDS,
  doesCloudFileMatchFilters,
  formatCloudDate,
  formatCloudFileSize,
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
  DetailHeader,
  DetailMetaList,
  DetailPanel,
  DetailPreviewBox,
  DetailTab,
  DetailTabs,
  EmptyState,
  EmptyTableState,
  FavoriteButton,
  FileNameButton,
  FileTable,
  FileTableScroll,
  FileTypeIcon,
  FilterGroup,
  GhostButton,
  IconButton,
  InlineList,
  Notice,
  PdfCanvas,
  PhotoFrame,
  PlayerBar,
  PreviewHeader,
  PreviewStage,
  PrimaryButton,
  RowActions,
  RowCheckbox,
  SearchDetail,
  SearchInput,
  SecondaryButton,
  SelectBoxCell,
  ThumbnailStrip,
  Timeline,
  UploadInput,
  VideoFrame,
} from "./AdminCloudWorkspace.styles"

const CLOUD_QUERY_KEY = "admin-cloud-files"
const EMPTY_CLOUD_FILES: CloudFile[] = []

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

const isAbortLikeError = (error: unknown) =>
  error instanceof DOMException && (error.name === "AbortError" || error.name === "TimeoutError")

const resolveCloudErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message.trim()) return error.message.trim()
  return "요청 처리 중 오류가 발생했습니다."
}

const ignorePdfPreviewTeardownRejection = (task: PDFDocumentLoadingTask | null) => {
  if (!task) return

  void task.promise.catch(() => {
    // 미리보기 cleanup에서 PDF.js worker를 의도적으로 종료하면 reject가 발생할 수 있다.
  })
  void task.destroy().catch(() => {
    // 미리보기 cleanup에서 PDF.js worker를 의도적으로 종료하면 reject가 발생할 수 있다.
  })
}

type PdfPreviewProps = {
  file: CloudFile
  contentUrl: string
}

const PdfPreview = ({ file, contentUrl }: PdfPreviewProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [pageCount, setPageCount] = useState(0)
  const [renderState, setRenderState] = useState("PDF.js canvas 렌더링 준비")

  useEffect(() => {
    if (file.mediaKind !== "DOCUMENT") return
    let cancelled = false
    let loadingTask: PDFDocumentLoadingTask | null = null
    let renderTask: RenderTask | null = null

    const render = async () => {
      try {
        const pdfjs = await import("pdfjs-dist")
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"
        loadingTask = pdfjs.getDocument({
          url: contentUrl,
          withCredentials: true,
        })
        void loadingTask.promise.catch(() => {
          // cleanup이 먼저 실행된 경우 await 경로 밖에서도 worker 종료 reject를 소비한다.
        })
        const pdf = await loadingTask.promise
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
        canvas.style.width = `${Math.floor(viewport.width)}px`
        canvas.style.height = `${Math.floor(viewport.height)}px`
        renderTask = page.render({
          canvas,
          canvasContext: context,
          viewport,
          transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined,
        })
        await renderTask.promise
        if (!cancelled) setRenderState("PDF.js canvas 렌더링")
      } catch {
        if (!cancelled) setRenderState("PDF.js canvas 렌더링 대기")
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
      ignorePdfPreviewTeardownRejection(loadingTask)
    }
  }, [contentUrl, file.mediaKind])

  return (
    <PreviewStage>
      <PreviewHeader>
        <h3>문서 뷰어</h3>
        <p>{file.originalFilename}</p>
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

type PhotoPreviewProps = {
  file: CloudFile
  contentUrl: string
}

const PhotoPreview = ({ file, contentUrl }: PhotoPreviewProps) => (
  <PreviewStage>
    <PreviewHeader>
      <h3>사진 보기</h3>
      <p>{file.originalFilename}</p>
    </PreviewHeader>
    <PhotoFrame>
      <img src={contentUrl} alt={file.originalFilename} />
      <ThumbnailStrip aria-label="사진 썸네일">
        <span />
        <span />
        <span />
        <span />
      </ThumbnailStrip>
    </PhotoFrame>
  </PreviewStage>
)

type VideoPreviewProps = {
  file: CloudFile
  contentUrl: string
}

const VideoPreview = ({ file, contentUrl }: VideoPreviewProps) => {
  const [speed, setSpeed] = useState<(typeof PLAYBACK_SPEEDS)[number]>(1)
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(true)

  return (
    <PreviewStage>
      <PreviewHeader>
        <h3>동영상 플레이어</h3>
        <p>{file.originalFilename}</p>
      </PreviewHeader>
      <VideoFrame>
        <video src={contentUrl} controls preload="metadata" />
        <PlayerBar aria-label="IINA playback model">
          <Timeline aria-hidden="true" />
          <InlineList>
            <span>IINA playback model</span>
            <span>Range streaming</span>
            <span>챕터 {IINA_CHAPTERS.length}개</span>
            <span>재생 기록 00:00</span>
          </InlineList>
          <FilterGroup aria-label="동영상 재생 제어">
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
            <GhostButton
              type="button"
              data-active={subtitlesEnabled ? "true" : "false"}
              onClick={() => setSubtitlesEnabled((current) => !current)}
            >
              자막
            </GhostButton>
          </FilterGroup>
          <InlineList aria-label="키보드 단축키">
            {IINA_SHORTCUTS.map((shortcut) => (
              <span key={shortcut.key}>
                {shortcut.key} {shortcut.label}
              </span>
            ))}
          </InlineList>
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
  if (file.mediaKind === "DOCUMENT") return <PdfPreview file={file} contentUrl={contentUrl} />
  if (file.mediaKind === "PHOTO") return <PhotoPreview file={file} contentUrl={contentUrl} />
  return <VideoPreview file={file} contentUrl={contentUrl} />
}

const AdminCloudWorkspacePage = () => {
  const queryClient = useQueryClient()
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const uploadControllersRef = useRef<Map<string, AbortController>>(new Map())
  const [filter, setFilter] = useState<CloudMediaFilter>("ALL")
  const [keyword, setKeyword] = useState("")
  const [selectedFileId, setSelectedFileId] = useState<number | null>(null)
  const [checkedFileIds, setCheckedFileIds] = useState<number[]>([])
  const [notice, setNotice] = useState("")
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([])
  const [optimisticFiles, setOptimisticFiles] = useState<CloudFile[]>([])
  const [isDetailPanelOpen, setIsDetailPanelOpen] = useState(true)

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
  const selectedFile = isDetailPanelOpen
    ? files.find((file) => file.id === selectedFileId) || files[0] || null
    : null
  const activeUploadCount = uploadQueue.filter((item) => isUploadActive(item.status)).length
  const completedUploadCount = uploadQueue.filter((item) => item.status === "done").length
  const allVisibleChecked = files.length > 0 && files.every((file) => checkedFileIds.includes(file.id))

  useEffect(() => {
    if (!isDetailPanelOpen) return
    if (selectedFileId && files.some((file) => file.id === selectedFileId)) return
    setSelectedFileId(files[0]?.id ?? null)
  }, [files, isDetailPanelOpen, selectedFileId])

  useEffect(() => {
    setCheckedFileIds((current) => current.filter((id) => files.some((file) => file.id === id)))
  }, [files])

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
        const uploaded = await uploadCloudFile(nextUpload.file, "", controller.signal)
        if (controller.signal.aborted) throw new DOMException("Upload aborted", "AbortError")

        setOptimisticFiles((current) => mergeCloudFiles([uploaded], current))
        queryClient.getQueriesData<CloudFile[]>({ queryKey: [CLOUD_QUERY_KEY] }).forEach(([queryKey, current]) => {
          if (!Array.isArray(current)) return
          const cachedFilters = getCachedCloudQueryFilters(queryKey)
          if (!doesCloudFileMatchFilters(uploaded, cachedFilters.filter, cachedFilters.keyword)) return
          queryClient.setQueryData(queryKey, mergeCloudFiles([uploaded], current))
        })
        setIsDetailPanelOpen(true)
        setSelectedFileId(uploaded.id)
        setNotice(`${uploaded.originalFilename} 업로드 완료`)
        setUploadQueue((current) =>
          current.map((item) =>
            item.id === nextUpload.id && item.status !== "cancelled"
              ? {
                  ...item,
                  status: "done",
                  progress: 100,
                  message: "업로드 완료",
                  uploadedFileId: uploaded.id,
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

  const handleUploadSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.currentTarget.files || [])
    if (selectedFiles.length === 0) return

    setUploadQueue((current) => [...current, ...selectedFiles.map(createUploadQueueItem)])
    setNotice(`${selectedFiles.length}개 파일을 업로드 큐에 추가했습니다.`)
    event.currentTarget.value = ""
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

  const handleDelete = async (file: CloudFile) => {
    try {
      await deleteCloudFile(file.id)
      const deletedIds = new Set([file.id])
      setNotice(`${file.originalFilename} 삭제 완료`)
      setOptimisticFiles((current) => current.filter((item) => item.id !== file.id))
      setCheckedFileIds((current) => current.filter((id) => id !== file.id))
      removeDeletedFilesFromCloudCaches(deletedIds)
      if (selectedFileId === file.id) setSelectedFileId(null)
    } catch {
      setNotice(`${file.originalFilename} 삭제 실패`)
    } finally {
      await queryClient.invalidateQueries({ queryKey: [CLOUD_QUERY_KEY] })
    }
  }

  const handleDeleteSelected = async () => {
    const targets = files.filter((file) => checkedFileIds.includes(file.id))
    if (targets.length === 0) return

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
      setNotice(
        deletedIds.size > 0
          ? `${deletedIds.size}개 삭제 완료, ${failedCount}개 실패`
          : `${failedCount}개 파일 삭제 실패`
      )
    } else {
      setNotice(`${deletedIds.size}개 파일 삭제 완료`)
    }
    await queryClient.invalidateQueries({ queryKey: [CLOUD_QUERY_KEY] })
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
      <CloudWorkspace>
        <CloudContent>
          <CloudTitleBar>
            <div>
              <h1>내 파일</h1>
            </div>
            <CloudSearchField>
              <AppIcon name="search" />
              <SearchInput
                aria-label="클라우드 파일 검색"
                placeholder="파일명 또는 /폴더 경로 검색"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
              />
              <SearchDetail aria-hidden="true">상세</SearchDetail>
            </CloudSearchField>
          </CloudTitleBar>

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
                새로 만들기
              </SecondaryButton>
              <SecondaryButton type="button" disabled={checkedFileIds.length === 0} onClick={() => void handleDeleteSelected()}>
                선택 삭제
              </SecondaryButton>
            </ActionGroup>

            <ActionGroup>
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
              <IconButton type="button" aria-label="리스트 보기" data-active="true">
                ☷
              </IconButton>
              <IconButton
                type="button"
                aria-label="상세 패널 보기"
                data-active={selectedFile ? "true" : "false"}
                onClick={() => {
                  setIsDetailPanelOpen(true)
                  setSelectedFileId((current) => current ?? files[0]?.id ?? null)
                }}
              >
                ⓘ
              </IconButton>
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
            {files.length === 0 ? (
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
              <FileTable aria-busy={filesQuery.isFetching ? "true" : "false"}>
                <thead>
                  <tr>
                    <th aria-label="선택" />
                    <th aria-label="즐겨찾기" />
                    <th>종류</th>
                    <th>이름</th>
                    <th>크기</th>
                    <th>수정한 날짜</th>
                    <th aria-label="작업" />
                  </tr>
                </thead>
                <tbody>
                  {files.map((file) => {
                    const checked = checkedFileIds.includes(file.id)
                    const selected = selectedFile?.id === file.id
                    return (
                      <tr key={file.id} data-selected={selected ? "true" : "false"}>
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
                          <FileTypeIcon aria-label={getCloudKindLabel(file.mediaKind)}>
                            {getCloudKindIconLabel(file)}
                          </FileTypeIcon>
                        </td>
                        <td>
                          <FileNameButton type="button" onClick={() => handlePreviewFile(file.id)}>
                            <strong>{file.originalFilename}</strong>
                          </FileNameButton>
                        </td>
                        <td>{formatCloudFileSize(file.byteSize)}</td>
                        <td>{formatCloudDate(file.modifiedAt || file.createdAt)}</td>
                        <td>
                          <RowActions>
                            <GhostButton
                              type="button"
                              aria-label={`${file.originalFilename} 미리보기`}
                              onClick={() => handlePreviewFile(file.id)}
                            >
                              <AppIcon name="eye" />
                            </GhostButton>
                            <GhostButton
                              type="button"
                              aria-label={`${file.originalFilename} 삭제`}
                              onClick={() => void handleDelete(file)}
                            >
                              <AppIcon name="trash" />
                            </GhostButton>
                          </RowActions>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </FileTable>
            )}
          </FileTableScroll>
        </CloudContent>

        <DetailPanel aria-label="클라우드 상세정보">
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
          {selectedFile ? (
            <DetailMetaList>
              <dt>종류</dt>
              <dd>
                {getCloudKindBadge(selectedFile)} · {getCloudKindLabel(selectedFile.mediaKind)}
              </dd>
              <dt>위치</dt>
              <dd>{selectedFile.folderPath || "/"}</dd>
              <dt>올린 날짜</dt>
              <dd>{formatCloudDate(selectedFile.createdAt)}</dd>
              <dt>수정한 날짜</dt>
              <dd>{formatCloudDate(selectedFile.modifiedAt || selectedFile.createdAt)}</dd>
              <dt>크기</dt>
              <dd>{formatCloudFileSize(selectedFile.byteSize)}</dd>
              <dt>권한</dt>
              <dd>계정 소유주만 볼 수 있음</dd>
            </DetailMetaList>
          ) : null}
        </DetailPanel>
      </CloudWorkspace>
    </CloudMain>
  )
}

export default AdminCloudWorkspacePage
