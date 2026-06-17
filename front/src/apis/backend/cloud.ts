import type { components } from "@shared/contracts"
import { apiFetch, getApiRequestUrl } from "./client"

export type CloudFileDto = components["schemas"]["CloudFileDto"]
export type CloudMediaKind = NonNullable<CloudFileDto["mediaKind"]>
type CloudFileListResBody = components["schemas"]["CloudFileListResBody"]
type RsDataCloudFileDto = components["schemas"]["RsDataCloudFileDto"]
type RsDataVoid = components["schemas"]["RsDataVoid"]

const CLOUD_UPLOAD_TIMEOUT_MS = 10 * 60_000 + 30_000
const CLOUD_SYNC_UPLOAD_MAX_BYTES = 100 * 1024 * 1024
const CLOUD_VIDEO_RESUMABLE_PART_BYTES = 64 * 1024 * 1024
const CLOUD_VIDEO_RESUMABLE_CHUNK_TIMEOUT_MS = 5 * 60_000
const CLOUD_VIDEO_UPLOAD_SESSION_STORAGE_PREFIX = "aquila-cloud-video-upload-session"

export type CloudFile = Required<
  Pick<
    CloudFileDto,
    "id" | "ownerMemberId" | "originalFilename" | "contentType" | "byteSize" | "mediaKind" | "folderPath"
  >
> &
  Pick<CloudFileDto, "createdAt" | "modifiedAt">

export type CloudFileListParams = {
  folderPath?: string
  keyword?: string
  mediaKind?: CloudMediaKind
}

type CloudVideoUploadSession = {
  id: number
  ownerMemberId: number
  originalFilename: string
  contentType: string
  byteSize: number
  folderPath: string
  partSizeBytes: number
  totalParts: number
  uploadedParts: number[]
  status: "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "EXPIRED"
  expiresAt: string
  completedFileId?: number | null
}

type CloudVideoUploadPartResult = {
  session: CloudVideoUploadSession
  part: {
    partNumber: number
    byteSize: number
  }
}

type RsDataCloudVideoUploadSession = {
  resultCode?: string
  msg?: string
  data?: CloudVideoUploadSession
}

type CloudUploadProgress = {
  progress: number
  message: string
}

type CloudUploadOptions = {
  onProgress?: (progress: CloudUploadProgress) => void
}

const normalizeCloudFile = (file: CloudFileDto): CloudFile => ({
  id: Number(file.id || 0),
  ownerMemberId: Number(file.ownerMemberId || 0),
  originalFilename: file.originalFilename || "cloud-file",
  contentType: file.contentType || "application/octet-stream",
  byteSize: Number(file.byteSize || 0),
  mediaKind: file.mediaKind || "DOCUMENT",
  folderPath: file.folderPath || "/",
  createdAt: file.createdAt,
  modifiedAt: file.modifiedAt,
})

const appendQuery = (path: string, params: Record<string, string | undefined>) => {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    const normalized = value?.trim()
    if (normalized) query.set(key, normalized)
  })
  const serialized = query.toString()
  return serialized ? `${path}?${serialized}` : path
}

export const getCloudFileContentUrl = (fileId: number) =>
  getApiRequestUrl(`/system/api/v1/adm/cloud/files/${fileId}/content`)

export const isResumableVideoUploadFile = (file: File) => {
  const lowerName = file.name.toLowerCase()
  const looksLikeVideo =
    file.type.startsWith("video/") ||
    lowerName.endsWith(".mp4") ||
    lowerName.endsWith(".m4v") ||
    lowerName.endsWith(".mov") ||
    lowerName.endsWith(".webm")
  return looksLikeVideo && file.size > CLOUD_SYNC_UPLOAD_MAX_BYTES
}

export const listCloudFiles = async ({
  folderPath = "",
  keyword = "",
  mediaKind,
}: CloudFileListParams = {}): Promise<CloudFile[]> => {
  const response = await apiFetch<CloudFileListResBody>(
    appendQuery("/system/api/v1/adm/cloud/files", {
      folderPath,
      kw: keyword,
      mediaKind,
    })
  )
  return (response.files || []).map(normalizeCloudFile).filter((file) => file.id > 0)
}

export const uploadCloudFile = async (
  file: File,
  folderPath = "",
  signal?: AbortSignal,
  options: CloudUploadOptions = {},
): Promise<CloudFile> => {
  if (isResumableVideoUploadFile(file)) {
    return uploadCloudVideoFileResumable(file, folderPath, signal, options)
  }

  const formData = new FormData()
  formData.append("clientFilename", file.name)
  formData.append("file", file)
  const response = await apiFetch<RsDataCloudFileDto>(
    appendQuery("/system/api/v1/adm/cloud/files", { folderPath }),
    {
      method: "POST",
      body: formData,
      signal,
      timeoutMs: CLOUD_UPLOAD_TIMEOUT_MS,
    }
  )
  return normalizeCloudFile(response.data || {})
}

const createVideoUploadSession = async (
  file: File,
  folderPath: string,
  signal?: AbortSignal,
): Promise<CloudVideoUploadSession> => {
  const response = await apiFetch<RsDataCloudVideoUploadSession>(
    "/system/api/v1/adm/cloud/files/video-upload-sessions",
    {
      method: "POST",
      body: JSON.stringify({
        originalFilename: file.name,
        contentType: file.type || "application/octet-stream",
        byteSize: file.size,
        folderPath,
      }),
      signal,
      timeoutMs: 30_000,
    }
  )
  if (!response.data) throw new Error("대용량 동영상 업로드 세션을 생성하지 못했습니다.")
  return response.data
}

const uploadVideoPart = async (
  sessionId: number,
  partNumber: number,
  chunk: Blob,
  signal?: AbortSignal,
): Promise<CloudVideoUploadPartResult> =>
  apiFetch<CloudVideoUploadPartResult>(
    `/system/api/v1/adm/cloud/files/video-upload-sessions/${sessionId}/parts/${partNumber}`,
    {
      method: "PUT",
      body: chunk,
      headers: { "Content-Type": "application/octet-stream" },
      signal,
      timeoutMs: CLOUD_VIDEO_RESUMABLE_CHUNK_TIMEOUT_MS,
    }
  )

const completeVideoUploadSession = async (
  sessionId: number,
  signal?: AbortSignal,
): Promise<CloudFile> => {
  const response = await apiFetch<RsDataCloudFileDto>(
    `/system/api/v1/adm/cloud/files/video-upload-sessions/${sessionId}/complete`,
    {
      method: "POST",
      signal,
      timeoutMs: 60_000,
    }
  )
  return normalizeCloudFile(response.data || {})
}

const getVideoUploadSession = (sessionId: number, signal?: AbortSignal): Promise<CloudVideoUploadSession> =>
  apiFetch<CloudVideoUploadSession>(`/system/api/v1/adm/cloud/files/video-upload-sessions/${sessionId}`, {
    signal,
    timeoutMs: 30_000,
  })

const cancelVideoUploadSession = async (sessionId: number) => {
  await apiFetch<RsDataVoid>(`/system/api/v1/adm/cloud/files/video-upload-sessions/${sessionId}`, {
    method: "DELETE",
    timeoutMs: 30_000,
  })
}

const buildVideoUploadStorageKey = (file: File, folderPath: string) =>
  [
    CLOUD_VIDEO_UPLOAD_SESSION_STORAGE_PREFIX,
    folderPath.trim(),
    file.name,
    String(file.size),
    String(file.lastModified || 0),
  ].join(":")

const readStoredVideoUploadSessionId = (storageKey: string): number | null => {
  if (typeof window === "undefined") return null
  const raw = window.localStorage.getItem(storageKey)
  const parsed = Number.parseInt(raw || "", 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

const storeVideoUploadSessionId = (storageKey: string, sessionId: number) => {
  if (typeof window === "undefined") return
  window.localStorage.setItem(storageKey, String(sessionId))
}

const clearStoredVideoUploadSessionId = (storageKey: string) => {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(storageKey)
}

const isMatchingVideoUploadSession = (session: CloudVideoUploadSession, file: File) =>
  session.status === "IN_PROGRESS" && session.byteSize === file.size && session.originalFilename === file.name

const resolveVideoUploadSession = async (
  file: File,
  folderPath: string,
  storageKey: string,
  signal?: AbortSignal,
) => {
  const storedSessionId = readStoredVideoUploadSessionId(storageKey)
  if (storedSessionId) {
    try {
      const storedSession = await getVideoUploadSession(storedSessionId, signal)
      if (isMatchingVideoUploadSession(storedSession, file)) return storedSession
    } catch {
      // 조회 실패한 stale session id는 새 세션으로 대체한다.
    }
    clearStoredVideoUploadSessionId(storageKey)
  }

  const session = await createVideoUploadSession(file, folderPath, signal)
  storeVideoUploadSessionId(storageKey, session.id)
  return session
}

const isExplicitUploadAbort = (error: unknown, signal?: AbortSignal) => {
  if (signal?.aborted) return true
  if (!(error instanceof Error)) return false
  return error.name === "AbortError"
}

const uploadCloudVideoFileResumable = async (
  file: File,
  folderPath: string,
  signal?: AbortSignal,
  options: CloudUploadOptions = {},
): Promise<CloudFile> => {
  let session: CloudVideoUploadSession | null = null
  const storageKey = buildVideoUploadStorageKey(file, folderPath)
  try {
    options.onProgress?.({ progress: 2, message: "대용량 업로드 준비 중" })
    session = await resolveVideoUploadSession(file, folderPath, storageKey, signal)
    const partSize = session.partSizeBytes || CLOUD_VIDEO_RESUMABLE_PART_BYTES
    const uploadedParts = new Set(session.uploadedParts || [])
    const totalParts = session.totalParts || Math.ceil(file.size / partSize)

    for (let partNumber = 1; partNumber <= totalParts; partNumber += 1) {
      if (signal?.aborted) throw new DOMException("Upload aborted", "AbortError")
      if (!uploadedParts.has(partNumber)) {
        const start = (partNumber - 1) * partSize
        const end = Math.min(start + partSize, file.size)
        const chunk = file.slice(start, end)
        await uploadVideoPart(session.id, partNumber, chunk, signal)
      }
      uploadedParts.add(partNumber)
      const progress = Math.min(96, Math.max(5, Math.round((uploadedParts.size / totalParts) * 92)))
      options.onProgress?.({
        progress,
        message: `동영상 조각 ${uploadedParts.size}/${totalParts} 업로드`,
      })
    }

    options.onProgress?.({ progress: 98, message: "동영상 업로드 완료 처리 중" })
    const completed = await completeVideoUploadSession(session.id, signal)
    clearStoredVideoUploadSessionId(storageKey)
    return completed
  } catch (error) {
    if (session && isExplicitUploadAbort(error, signal)) {
      await cancelVideoUploadSession(session.id).catch(() => undefined)
      clearStoredVideoUploadSessionId(storageKey)
    }
    throw error
  }
}

export const deleteCloudFile = async (fileId: number) =>
  apiFetch<RsDataVoid>(`/system/api/v1/adm/cloud/files/${fileId}`, {
    method: "DELETE",
  })
