import { getApiBaseUrl } from "src/apis/backend/client"
import type { ProfileImageSourceSize } from "src/libs/profileImageUpload"

export const PROFILE_UNSAVED_CHANGES_MESSAGE = "저장하지 않은 변경 사항이 있습니다. 이 페이지를 떠날까요?"
export const PROFILE_IMAGE_DRAFT_DEFAULT_SOURCE_SIZE: ProfileImageSourceSize = { width: 1, height: 1 }
export const PROFILE_IMAGE_UPLOAD_RETRY_DELAY_MS = 700

export const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })

export const readImageSourceSizeFromFile = (file: File): Promise<ProfileImageSourceSize> =>
  new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const image = new window.Image()
    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      const width = image.naturalWidth || image.width
      const height = image.naturalHeight || image.height
      if (width <= 0 || height <= 0) {
        reject(new Error("이미지 해상도를 확인할 수 없습니다."))
        return
      }
      resolve({ width, height })
    }
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error("이미지 정보를 읽을 수 없습니다."))
    }
    image.src = objectUrl
  })

export const parseResponseErrorBody = async (response: Response): Promise<string> => {
  const text = await response.text().catch(() => "")
  if (!text) return ""

  try {
    const parsed = JSON.parse(text) as { resultCode?: string; msg?: string }
    const msg = parsed.msg?.trim()
    if (!msg) return text
    return parsed.resultCode ? `${msg} (${parsed.resultCode})` : msg
  } catch {
    return text
  }
}

export const revalidatePublicBlogAppearance = async (): Promise<boolean> => {
  try {
    const response = await fetch("/api/revalidate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    })
    return response.ok
  } catch {
    return false
  }
}

export const requestProfileImageUpload = async (memberId: number, file: File): Promise<Response> => {
  const formData = new FormData()
  formData.append("file", file, file.name)
  return await fetch(`${getApiBaseUrl()}/member/api/v1/adm/members/${memberId}/profileImageFile`, {
    method: "POST",
    credentials: "include",
    body: formData,
  })
}
