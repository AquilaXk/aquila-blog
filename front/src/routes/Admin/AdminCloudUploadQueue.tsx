import { type CSSProperties } from "react"
import {
  formatCloudFileSize,
  getUploadStatusLabel,
  isUploadActive,
  type UploadQueueItem,
} from "./AdminCloudWorkspaceModel"
import {
  GhostButton,
  ProgressTrack,
  QueueHeader,
  QueueItem,
  QueueList,
  QueuePanel,
  StatusPill,
} from "./AdminCloudWorkspace.styles"

type AdminCloudUploadQueueProps = {
  uploadQueue: UploadQueueItem[]
  activeUploadCount: number
  completedUploadCount: number
  onCancelUpload: (item: UploadQueueItem) => void
  onRetryUpload: (item: UploadQueueItem) => void
  onClearFinishedUploads: () => void
}

const AdminCloudUploadQueue = ({
  uploadQueue,
  activeUploadCount,
  completedUploadCount,
  onCancelUpload,
  onRetryUpload,
  onClearFinishedUploads,
}: AdminCloudUploadQueueProps) => {
  if (uploadQueue.length === 0) return null

  const failedOrCancelledCount = uploadQueue.filter(
    (item) => item.status === "failed" || item.status === "cancelled"
  ).length
  const title =
    activeUploadCount > 0
      ? `항목 ${activeUploadCount}개 업로드 중`
      : completedUploadCount === uploadQueue.length
        ? `항목 ${completedUploadCount}개 업로드 완료`
        : `항목 ${failedOrCancelledCount}개 업로드 실패/취소`

  // The queue is fixed like Drive's transfer panel, while the upload state machine stays in this page.
  return (
    <QueuePanel aria-label="업로드 중인 파일">
      <QueueHeader>
        <div>
          <h2>{title}</h2>
          <p>
            진행 중 {activeUploadCount}개 · 완료 {completedUploadCount}개
          </p>
        </div>
        <GhostButton
          type="button"
          aria-label="종료된 업로드 항목 지우기"
          disabled={uploadQueue.every((item) => isUploadActive(item.status))}
          onClick={onClearFinishedUploads}
        >
          ×
        </GhostButton>
      </QueueHeader>
      <QueueList>
        {uploadQueue.map((item) => (
          <QueueItem key={item.id}>
            <div>
              <strong>{item.name}</strong>
              <p>
                {formatCloudFileSize(item.byteSize)} · {item.message}
              </p>
            </div>
            <StatusPill data-status={item.status}>{getUploadStatusLabel(item.status)}</StatusPill>
            {isUploadActive(item.status) ? (
              <GhostButton type="button" aria-label={`${item.name} 업로드 취소`} onClick={() => onCancelUpload(item)}>
                취소
              </GhostButton>
            ) : null}
            {item.status === "failed" ? (
              <GhostButton type="button" aria-label={`${item.name} 업로드 다시 시도`} onClick={() => onRetryUpload(item)}>
                다시 시도
              </GhostButton>
            ) : null}
            <ProgressTrack style={{ "--progress": `${item.progress}%` } as CSSProperties}>
              <span />
            </ProgressTrack>
          </QueueItem>
        ))}
      </QueueList>
    </QueuePanel>
  )
}

export default AdminCloudUploadQueue
