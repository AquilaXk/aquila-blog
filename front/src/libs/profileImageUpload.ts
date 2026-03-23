const MEGABYTE = 1024 * 1024
const MIN_RETRY_LONG_EDGE = 480
const RETRY_SCALE_FACTOR = 0.86
const LOSSY_QUALITY_STEPS = [0.9, 0.82, 0.74, 0.66, 0.58]

type ImageUploadTarget = "profile" | "post"
type EncodedCandidate = {
  blob: Blob
  mimeType: string
  width: number
  height: number
}

type ImageUploadPolicy = {
  maxBytes: number
  targetBytes: number
  maxLongEdge: number
  maxSourceBytes: number
  outputMimeTypes: readonly string[]
}

export type PreparedImageUpload = {
  file: File
  optimized: boolean
  originalBytes: number
  optimizedBytes: number
  originalWidth: number
  originalHeight: number
  width: number
  height: number
}

export type ProfileImageEditTransform = {
  focusX: number
  focusY: number
  zoom: number
  outputSize?: number
}

const IMAGE_UPLOAD_POLICIES: Record<ImageUploadTarget, ImageUploadPolicy> = {
  profile: {
    // 실무 기준: 프로필 이미지는 2MB 이내 + 긴 변 1024px 제한.
    maxBytes: 2 * MEGABYTE,
    targetBytes: 700 * 1024,
    maxLongEdge: 1024,
    maxSourceBytes: 30 * MEGABYTE,
    outputMimeTypes: ["image/webp", "image/jpeg", "image/png"],
  },
  post: {
    // 실무 기준: 본문 이미지는 8MB 이내 + 긴 변 2560px 제한.
    maxBytes: 8 * MEGABYTE,
    targetBytes: 3_500 * 1024,
    maxLongEdge: 2560,
    maxSourceBytes: 40 * MEGABYTE,
    outputMimeTypes: ["image/webp", "image/jpeg", "image/png"],
  },
}

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/pjpeg",
  "image/png",
  "image/x-png",
  "image/gif",
  "image/webp",
  "image/x-webp",
])

const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp"]

export const PROFILE_IMAGE_UPLOAD_RULE_LABEL = "JPG/PNG/GIF/WebP, 자동 최적화 후 최대 2MB"
export const POST_IMAGE_UPLOAD_RULE_LABEL = "JPG/PNG/GIF/WebP, 자동 최적화 후 최대 8MB"
export const PROFILE_IMAGE_EDIT_DEFAULT_FOCUS_X = 50
export const PROFILE_IMAGE_EDIT_DEFAULT_FOCUS_Y = 38
export const PROFILE_IMAGE_EDIT_MIN_ZOOM = 1
export const PROFILE_IMAGE_EDIT_MAX_ZOOM = 2.8

const normalizeMimeType = (raw: string): string =>
  raw
    .trim()
    .toLowerCase()
    .replace("image/jpg", "image/jpeg")
    .replace("image/pjpeg", "image/jpeg")
    .replace("image/x-png", "image/png")
    .replace("image/x-webp", "image/webp")

const hasAllowedExtension = (fileName: string): boolean => {
  const normalized = fileName.trim().toLowerCase()
  return ALLOWED_EXTENSIONS.some((ext) => normalized.endsWith(ext))
}

const bytesToMbText = (bytes: number): string => `${(bytes / MEGABYTE).toFixed(1)}MB`

export const clampProfileImageEditFocus = (value: number): number => {
  if (!Number.isFinite(value)) return PROFILE_IMAGE_EDIT_DEFAULT_FOCUS_X
  return Math.min(100, Math.max(0, value))
}

export const clampProfileImageEditZoom = (value: number): number => {
  if (!Number.isFinite(value)) return PROFILE_IMAGE_EDIT_MIN_ZOOM
  return Math.min(PROFILE_IMAGE_EDIT_MAX_ZOOM, Math.max(PROFILE_IMAGE_EDIT_MIN_ZOOM, value))
}

const ensureFileIsUploadable = (file: File, target: ImageUploadTarget): void => {
  const policy = IMAGE_UPLOAD_POLICIES[target]
  if (file.size <= 0) {
    throw new Error("빈 파일은 업로드할 수 없습니다.")
  }

  if (file.size > policy.maxSourceBytes) {
    throw new Error(`원본 파일이 너무 큽니다. ${bytesToMbText(policy.maxSourceBytes)} 이하 파일로 시도해주세요.`)
  }

  const mimeType = normalizeMimeType(file.type || "")
  const validMimeType = mimeType.length > 0 && ALLOWED_MIME_TYPES.has(mimeType)
  const validExtension = hasAllowedExtension(file.name)

  if (!validMimeType && !validExtension) {
    throw new Error("지원하지 않는 이미지 형식입니다. JPG/PNG/GIF/WebP 파일만 업로드할 수 있습니다.")
  }
}

const sanitizeFileBaseName = (fileName: string): string => {
  const lastDotIndex = fileName.lastIndexOf(".")
  const rawBase = lastDotIndex > 0 ? fileName.slice(0, lastDotIndex) : fileName
  const normalized = rawBase.trim().replace(/[^a-zA-Z0-9가-힣._-]/g, "-").replace(/-+/g, "-")
  return normalized || "image"
}

const extensionFromMimeType = (mimeType: string): string => {
  if (mimeType === "image/webp") return "webp"
  if (mimeType === "image/jpeg") return "jpg"
  if (mimeType === "image/png") return "png"
  return "jpg"
}

const canvasToBlob = (canvas: HTMLCanvasElement, mimeType: string, quality?: number): Promise<Blob | null> =>
  new Promise((resolve) => {
    canvas.toBlob(resolve, mimeType, quality)
  })

const isCanvasEncodeSupported = (mimeType: string): boolean => {
  const canvas = document.createElement("canvas")
  try {
    return canvas.toDataURL(mimeType).startsWith(`data:${mimeType}`)
  } catch {
    return false
  }
}

const loadImageFromFile = (file: File): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const image = new Image()

    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(image)
    }

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error("이미지 파일을 읽을 수 없습니다. 손상된 파일인지 확인해주세요."))
    }

    image.src = objectUrl
  })

const constrainByLongEdge = (
  width: number,
  height: number,
  maxLongEdge: number
): { width: number; height: number } => {
  const longEdge = Math.max(width, height)
  if (longEdge <= maxLongEdge) {
    return { width, height }
  }

  const scale = maxLongEdge / longEdge
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

const drawToCanvas = (
  image: HTMLImageElement,
  width: number,
  height: number
): HTMLCanvasElement => {
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext("2d", { alpha: true })
  if (!context) {
    throw new Error("이미지 최적화 캔버스 초기화에 실패했습니다.")
  }

  context.drawImage(image, 0, 0, width, height)
  return canvas
}

const encodeCandidates = async (
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  policy: ImageUploadPolicy
): Promise<EncodedCandidate[]> => {
  const candidates: EncodedCandidate[] = []

  for (const mimeType of policy.outputMimeTypes) {
    if (!isCanvasEncodeSupported(mimeType)) continue

    if (mimeType === "image/png") {
      const blob = await canvasToBlob(canvas, mimeType)
      if (blob) {
        candidates.push({ blob, mimeType, width, height })
      }
      continue
    }

    for (const quality of LOSSY_QUALITY_STEPS) {
      const blob = await canvasToBlob(canvas, mimeType, quality)
      if (!blob) continue

      candidates.push({ blob, mimeType, width, height })
      if (blob.size <= policy.targetBytes) break
    }
  }

  return candidates.sort((a, b) => a.blob.size - b.blob.size)
}

const toPreparedFile = (
  candidate: EncodedCandidate,
  sourceFile: File,
  originalWidth: number,
  originalHeight: number
): PreparedImageUpload => {
  const baseName = sanitizeFileBaseName(sourceFile.name)
  const extension = extensionFromMimeType(candidate.mimeType)
  const optimizedName = `${baseName}.${extension}`

  return {
    file: new File([candidate.blob], optimizedName, { type: candidate.mimeType }),
    optimized: true,
    originalBytes: sourceFile.size,
    optimizedBytes: candidate.blob.size,
    originalWidth,
    originalHeight,
    width: candidate.width,
    height: candidate.height,
  }
}

const optimizeImageByPolicy = async (
  sourceFile: File,
  policy: ImageUploadPolicy
): Promise<PreparedImageUpload> => {
  const sourceMimeType = normalizeMimeType(sourceFile.type || "")
  const looksLikeGif = sourceMimeType === "image/gif" || sourceFile.name.trim().toLowerCase().endsWith(".gif")
  const image = await loadImageFromFile(sourceFile)
  const originalWidth = image.naturalWidth || image.width
  const originalHeight = image.naturalHeight || image.height

  if (originalWidth <= 0 || originalHeight <= 0) {
    throw new Error("이미지 해상도를 확인할 수 없습니다.")
  }

  const constrained = constrainByLongEdge(originalWidth, originalHeight, policy.maxLongEdge)
  const sourceAlreadyValid =
    sourceFile.size <= policy.maxBytes &&
    constrained.width === originalWidth &&
    constrained.height === originalHeight &&
    (sourceMimeType === "image/jpeg" ||
      sourceMimeType === "image/png" ||
      sourceMimeType === "image/webp" ||
      sourceMimeType === "image/gif")

  if (sourceAlreadyValid) {
    return {
      file: sourceFile,
      optimized: false,
      originalBytes: sourceFile.size,
      optimizedBytes: sourceFile.size,
      originalWidth,
      originalHeight,
      width: originalWidth,
      height: originalHeight,
    }
  }

  if (looksLikeGif) {
    throw new Error(
      `움직이는 GIF는 자동 최적화 시 프레임 손실이 발생할 수 있습니다. ${bytesToMbText(policy.maxBytes)} 이하 GIF로 업로드해주세요.`
    )
  }

  let bestCandidate: EncodedCandidate | null = null
  let currentWidth = constrained.width
  let currentHeight = constrained.height

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const canvas = drawToCanvas(image, currentWidth, currentHeight)
    const candidates = await encodeCandidates(canvas, currentWidth, currentHeight, policy)
    const smallestCandidate = candidates[0] || null

    if (smallestCandidate && (!bestCandidate || smallestCandidate.blob.size < bestCandidate.blob.size)) {
      bestCandidate = smallestCandidate
    }

    if (smallestCandidate && smallestCandidate.blob.size <= policy.maxBytes) {
      return toPreparedFile(smallestCandidate, sourceFile, originalWidth, originalHeight)
    }

    const longEdge = Math.max(currentWidth, currentHeight)
    if (longEdge <= MIN_RETRY_LONG_EDGE) {
      break
    }

    currentWidth = Math.max(1, Math.round(currentWidth * RETRY_SCALE_FACTOR))
    currentHeight = Math.max(1, Math.round(currentHeight * RETRY_SCALE_FACTOR))
  }

  if (bestCandidate && bestCandidate.blob.size <= policy.maxBytes) {
    return toPreparedFile(bestCandidate, sourceFile, originalWidth, originalHeight)
  }

  throw new Error(
    `자동 최적화 후에도 업로드 용량 제한(${bytesToMbText(policy.maxBytes)})을 초과합니다. 더 작은 이미지를 사용해주세요.`
  )
}

const prepareImageForUpload = async (file: File, target: ImageUploadTarget): Promise<PreparedImageUpload> => {
  ensureFileIsUploadable(file, target)
  return await optimizeImageByPolicy(file, IMAGE_UPLOAD_POLICIES[target])
}

export const buildProfileImageEditedFile = async (
  sourceFile: File,
  transform: ProfileImageEditTransform
): Promise<File> => {
  ensureFileIsUploadable(sourceFile, "profile")

  const image = await loadImageFromFile(sourceFile)
  const outputSize = Math.max(320, Math.round(transform.outputSize || 1024))
  const zoom = clampProfileImageEditZoom(transform.zoom)
  const focusX = clampProfileImageEditFocus(transform.focusX)
  const focusY = clampProfileImageEditFocus(transform.focusY)

  const sourceWidth = image.naturalWidth || image.width
  const sourceHeight = image.naturalHeight || image.height
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error("프로필 편집에 사용할 이미지 해상도를 확인할 수 없습니다.")
  }

  const sourceAspect = sourceWidth / sourceHeight
  const baseDrawWidth = sourceAspect >= 1 ? outputSize * sourceAspect : outputSize
  const baseDrawHeight = sourceAspect >= 1 ? outputSize : outputSize / sourceAspect
  const drawWidth = baseDrawWidth * zoom
  const drawHeight = baseDrawHeight * zoom

  const centerX = (focusX / 100) * outputSize
  const centerY = (focusY / 100) * outputSize
  const offsetX = centerX - drawWidth / 2
  const offsetY = centerY - drawHeight / 2

  const canvas = document.createElement("canvas")
  canvas.width = outputSize
  canvas.height = outputSize

  const context = canvas.getContext("2d", { alpha: true })
  if (!context) {
    throw new Error("프로필 편집 캔버스를 준비하지 못했습니다.")
  }

  context.clearRect(0, 0, outputSize, outputSize)
  context.drawImage(image, offsetX, offsetY, drawWidth, drawHeight)

  const webpBlob = isCanvasEncodeSupported("image/webp") ? await canvasToBlob(canvas, "image/webp", 0.92) : null
  const fallbackBlob = webpBlob || (await canvasToBlob(canvas, "image/jpeg", 0.92))
  if (!fallbackBlob) {
    throw new Error("프로필 편집 이미지를 생성하지 못했습니다.")
  }

  const mimeType = webpBlob ? "image/webp" : "image/jpeg"
  const extension = webpBlob ? "webp" : "jpg"
  const baseName = sanitizeFileBaseName(sourceFile.name)
  const fileName = `${baseName}-profile-edit.${extension}`
  return new File([fallbackBlob], fileName, { type: mimeType })
}

export const prepareProfileImageForUpload = async (file: File): Promise<PreparedImageUpload> =>
  await prepareImageForUpload(file, "profile")

export const preparePostImageForUpload = async (file: File): Promise<PreparedImageUpload> =>
  await prepareImageForUpload(file, "post")

export const buildImageOptimizationSummary = (prepared: PreparedImageUpload): string => {
  if (!prepared.optimized) {
    return "원본 이미지 기준을 충족해 추가 최적화 없이 업로드했습니다."
  }

  return `자동 최적화 적용: ${bytesToMbText(prepared.originalBytes)} → ${bytesToMbText(prepared.optimizedBytes)} (${prepared.originalWidth}x${prepared.originalHeight} → ${prepared.width}x${prepared.height})`
}

export const normalizeProfileImageUploadError = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error)
  const normalizedMessage = message.trim()

  if (normalizedMessage.includes("Failed to fetch") || normalizedMessage.includes("NetworkError")) {
    return "서버 연결이 중단되었습니다. 네트워크 상태를 확인한 뒤 다시 시도해주세요."
  }

  if (normalizedMessage.includes("413")) {
    return "업로드 가능한 파일 용량을 초과했습니다. 더 작은 이미지로 다시 시도해주세요."
  }

  return normalizedMessage
}
