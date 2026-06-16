import type { components } from "@shared/contracts"
import { apiFetch, getApiRequestUrl } from "./client"

export type CloudFileDto = components["schemas"]["CloudFileDto"]
export type CloudMediaKind = NonNullable<CloudFileDto["mediaKind"]>
type CloudFileListResBody = components["schemas"]["CloudFileListResBody"]
type RsDataCloudFileDto = components["schemas"]["RsDataCloudFileDto"]
type RsDataVoid = components["schemas"]["RsDataVoid"]

const CLOUD_UPLOAD_TIMEOUT_MS = 10 * 60_000 + 30_000

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
): Promise<CloudFile> => {
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

export const deleteCloudFile = async (fileId: number) =>
  apiFetch<RsDataVoid>(`/system/api/v1/adm/cloud/files/${fileId}`, {
    method: "DELETE",
  })
