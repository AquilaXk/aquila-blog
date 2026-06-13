/* eslint-disable @next/next/no-img-element -- private cloud content needs browser-owned auth cookies. */
import { useQuery, useQueryClient } from "@tanstack/react-query"
import type { PDFDocumentLoadingTask, RenderTask } from "pdfjs-dist"
import { useEffect, useMemo, useRef, useState } from "react"
import {
  deleteCloudFile,
  getCloudFileContentUrl,
  listCloudFiles,
  uploadCloudFile,
  type CloudFile,
  type CloudMediaKind,
} from "src/apis/backend/cloud"
import {
  CLOUD_FILTERS,
  IINA_CHAPTERS,
  IINA_SHORTCUTS,
  PLAYBACK_SPEEDS,
  formatCloudDate,
  formatCloudFileSize,
  getCloudKindBadge,
  getCloudKindLabel,
  getCloudSummary,
  type CloudMediaFilter,
} from "./AdminCloudWorkspaceModel"
import {
  CloudHeader,
  CloudMain,
  CloudMetrics,
  EmptyState,
  FileBrowserPanel,
  FileCopy,
  FileList,
  FileRow,
  FilterGroup,
  GhostButton,
  HeaderActions,
  HeaderCopy,
  InlineList,
  KindBadge,
  MetricItem,
  Notice,
  PdfCanvas,
  PhotoFrame,
  PlayerBar,
  PreviewHeader,
  PreviewPanel,
  PreviewStage,
  PrimaryButton,
  RowActions,
  SearchInput,
  ThumbnailStrip,
  Timeline,
  Toolbar,
  UploadInput,
  VideoFrame,
  WorkspaceGrid,
} from "./AdminCloudWorkspace.styles"

const CLOUD_QUERY_KEY = "admin-cloud-files"
const EMPTY_CLOUD_FILES: CloudFile[] = []

const mediaKindFromFilter = (filter: CloudMediaFilter): CloudMediaKind | undefined =>
  filter === "ALL" ? undefined : filter

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
        // 관리자 전용 파일 preview가 외부 CDN worker를 신뢰하지 않도록 같은-origin worker를 사용한다.
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"
        loadingTask = pdfjs.getDocument({
          url: contentUrl,
          withCredentials: true,
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
      renderTask?.cancel()
      void loadingTask?.destroy()
    }
  }, [contentUrl, file.mediaKind])

  return (
    <PreviewStage>
      <PreviewHeader>
        <h2>문서 뷰어</h2>
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
      <h2>사진 보기</h2>
      <p>{file.originalFilename}</p>
    </PreviewHeader>
    <PhotoFrame>
      <img src={contentUrl} alt={file.originalFilename} />
      <ThumbnailStrip aria-label="Immich 스타일 사진 썸네일">
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
        <h2>동영상 플레이어</h2>
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
    return <EmptyState>미리 볼 파일을 선택하세요.</EmptyState>
  }

  const contentUrl = getCloudFileContentUrl(file.id)
  if (file.mediaKind === "DOCUMENT") return <PdfPreview file={file} contentUrl={contentUrl} />
  if (file.mediaKind === "PHOTO") return <PhotoPreview file={file} contentUrl={contentUrl} />
  return <VideoPreview file={file} contentUrl={contentUrl} />
}

const AdminCloudWorkspacePage = () => {
  const queryClient = useQueryClient()
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const [filter, setFilter] = useState<CloudMediaFilter>("ALL")
  const [keyword, setKeyword] = useState("")
  const [selectedFileId, setSelectedFileId] = useState<number | null>(null)
  const [notice, setNotice] = useState("")
  const [isUploading, setIsUploading] = useState(false)

  const filesQuery = useQuery({
    queryKey: [CLOUD_QUERY_KEY, filter, keyword],
    queryFn: () =>
      listCloudFiles({
        keyword,
        mediaKind: mediaKindFromFilter(filter),
      }),
  })
  const files = filesQuery.data ?? EMPTY_CLOUD_FILES
  const selectedFile = files.find((file) => file.id === selectedFileId) || files[0] || null
  const summary = useMemo(() => getCloudSummary(files), [files])

  useEffect(() => {
    if (selectedFileId && files.some((file) => file.id === selectedFileId)) return
    setSelectedFileId(files[0]?.id ?? null)
  }, [files, selectedFileId])

  const refreshFiles = () => queryClient.invalidateQueries({ queryKey: [CLOUD_QUERY_KEY] })

  const handleUpload = async (file: File | undefined) => {
    if (!file) return
    setIsUploading(true)
    setNotice("")
    try {
      const uploaded = await uploadCloudFile(file)
      setSelectedFileId(uploaded.id)
      setNotice("업로드 완료")
      await refreshFiles()
    } catch {
      setNotice("업로드 실패")
    } finally {
      setIsUploading(false)
      if (uploadInputRef.current) uploadInputRef.current.value = ""
    }
  }

  const handleDelete = async (file: CloudFile) => {
    await deleteCloudFile(file.id)
    setNotice("삭제 완료")
    if (selectedFileId === file.id) setSelectedFileId(null)
    await refreshFiles()
  }

  return (
    <CloudMain>
      <CloudHeader>
        <HeaderCopy>
          <h1>관리자 클라우드</h1>
          <p>
            서버 백업 외장 스토리지와 분리된 관리자 전용 파일 작업 공간입니다. 모든 파일은 계정 소유주만 볼 수 있음
            상태로 다루고 public URL은 만들지 않습니다.
          </p>
        </HeaderCopy>
        <HeaderActions>
          <UploadInput
            ref={uploadInputRef}
            aria-label="클라우드 파일 업로드"
            type="file"
            onChange={(event) => void handleUpload(event.currentTarget.files?.[0])}
          />
          <PrimaryButton type="button" disabled={isUploading} onClick={() => uploadInputRef.current?.click()}>
            {isUploading ? "업로드 중" : "파일 업로드"}
          </PrimaryButton>
        </HeaderActions>
      </CloudHeader>

      <CloudMetrics>
        <MetricItem>
          <dt>전체 파일</dt>
          <dd>{summary.totalCount}개</dd>
        </MetricItem>
        <MetricItem>
          <dt>사용량</dt>
          <dd>{summary.totalSize}</dd>
        </MetricItem>
        <MetricItem>
          <dt>사진</dt>
          <dd>{summary.photoCount}개</dd>
        </MetricItem>
        <MetricItem>
          <dt>동영상</dt>
          <dd>{summary.videoCount}개</dd>
        </MetricItem>
      </CloudMetrics>

      {notice ? <Notice>{notice}</Notice> : null}

      <WorkspaceGrid>
        <FileBrowserPanel>
          <Toolbar>
            <SearchInput
              placeholder="파일명 검색"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
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
          </Toolbar>

          <FileList aria-busy={filesQuery.isFetching ? "true" : "false"}>
            {files.length === 0 ? (
              <EmptyState>{filesQuery.isFetching ? "파일을 불러오는 중입니다." : "표시할 파일이 없습니다."}</EmptyState>
            ) : (
              files.map((file) => (
                <FileRow key={file.id} data-selected={selectedFile?.id === file.id ? "true" : "false"}>
                  <KindBadge>{getCloudKindBadge(file)}</KindBadge>
                  <FileCopy>
                    <strong>{file.originalFilename}</strong>
                    <span>
                      {getCloudKindLabel(file.mediaKind)} · {formatCloudFileSize(file.byteSize)} ·{" "}
                      {formatCloudDate(file.modifiedAt || file.createdAt)} · 계정 소유주만 볼 수 있음
                    </span>
                  </FileCopy>
                  <RowActions>
                    <GhostButton
                      type="button"
                      aria-label={`${file.originalFilename} 미리보기`}
                      onClick={() => setSelectedFileId(file.id)}
                    >
                      미리보기
                    </GhostButton>
                    <GhostButton
                      type="button"
                      aria-label={`${file.originalFilename} 삭제`}
                      onClick={() => void handleDelete(file)}
                    >
                      삭제
                    </GhostButton>
                  </RowActions>
                </FileRow>
              ))
            )}
          </FileList>
        </FileBrowserPanel>

        <PreviewPanel aria-label="클라우드 미리보기">
          <PreviewDrawer file={selectedFile} />
        </PreviewPanel>
      </WorkspaceGrid>
    </CloudMain>
  )
}

export default AdminCloudWorkspacePage
