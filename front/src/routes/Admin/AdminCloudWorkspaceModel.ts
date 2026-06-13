import type { CloudFile, CloudMediaKind } from "src/apis/backend/cloud"

export type CloudMediaFilter = "ALL" | CloudMediaKind

export const CLOUD_FILTERS: Array<{ value: CloudMediaFilter; label: string }> = [
  { value: "ALL", label: "전체" },
  { value: "DOCUMENT", label: "문서" },
  { value: "PHOTO", label: "사진" },
  { value: "VIDEO", label: "동영상" },
]

export const IINA_SHORTCUTS = [
  { key: "Space", label: "재생/일시정지" },
  { key: "← / →", label: "5초 이동" },
  { key: "J / L", label: "챕터 이동" },
  { key: "S", label: "자막 전환" },
]

export const IINA_CHAPTERS = [
  { at: "00:00", label: "시작" },
  { at: "01:12", label: "핵심 구간" },
  { at: "03:40", label: "점검 메모" },
]

export const PLAYBACK_SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const

export const getCloudKindLabel = (kind: CloudMediaFilter) => {
  if (kind === "DOCUMENT") return "문서"
  if (kind === "PHOTO") return "사진"
  if (kind === "VIDEO") return "동영상"
  return "전체"
}

export const getCloudKindBadge = (file: CloudFile) => {
  if (file.mediaKind === "DOCUMENT") return "PDF"
  if (file.mediaKind === "PHOTO") return "IMG"
  return "MP4"
}

export const formatCloudFileSize = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB"] as const
  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

export const formatCloudDate = (value?: string) => {
  if (!value) return "날짜 없음"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "날짜 없음"
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

export const getCloudSummary = (files: CloudFile[]) => {
  const totalBytes = files.reduce((sum, file) => sum + file.byteSize, 0)
  const countByKind = files.reduce(
    (summary, file) => {
      summary[file.mediaKind] += 1
      return summary
    },
    { DOCUMENT: 0, PHOTO: 0, VIDEO: 0 }
  )

  return {
    totalCount: files.length,
    totalSize: formatCloudFileSize(totalBytes),
    documentCount: countByKind.DOCUMENT,
    photoCount: countByKind.PHOTO,
    videoCount: countByKind.VIDEO,
  }
}
