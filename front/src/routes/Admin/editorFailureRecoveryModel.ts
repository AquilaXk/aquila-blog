import { ApiError, ApiTimeoutError } from "src/apis/backend/client"

export type EditorFailureAction = "write" | "modify" | "publish-temp"
export type EditorUploadFailureKind = "image" | "file" | "thumbnail"
export type EditorFailureType =
  | "version-conflict"
  | "offline"
  | "timeout"
  | "session-expired"
  | "too-large"
  | "rate-limited"
  | "server-error"
  | "unknown"

export type EditorFailureRecovery = {
  statusText: string
  result: {
    errorType: EditorFailureType
    message: string
    draftProtected: true
    canRetry: boolean
    nextActions: string[]
    status?: number
    fileName?: string
  }
}

type ResolveEditorFailureRecoveryParams = {
  action: EditorFailureAction
  isOnline?: boolean
}

type ResolveEditorUploadFailureRecoveryParams = {
  kind: EditorUploadFailureKind
  fileName: string
  isOnline?: boolean
}

const actionLabels: Record<EditorFailureAction, string> = {
  write: "작성",
  modify: "수정",
  "publish-temp": "새 글 작성",
}

const uploadLabels: Record<EditorUploadFailureKind, string> = {
  image: "이미지",
  file: "첨부 파일",
  thumbnail: "썸네일",
}

const preserveDraftAction = "현재 내용을 로컬 임시저장으로 보존"
const retryAction = "네트워크와 상태를 확인한 뒤 다시 시도"

const isBrowserOffline = (isOnline: boolean | undefined) => isOnline === false

const isFetchTransportError = (error: unknown) =>
  error instanceof TypeError &&
  /failed to fetch|networkerror|load failed|fetch/i.test(error.message)

const getStatus = (error: unknown) => error instanceof ApiError ? error.status : undefined

const classifyEditorFailure = (
  error: unknown,
  isOnline: boolean | undefined,
): { type: EditorFailureType; status?: number } => {
  if (isBrowserOffline(isOnline) || isFetchTransportError(error)) return { type: "offline" }
  if (error instanceof ApiTimeoutError) return { type: "timeout" }

  const status = getStatus(error)
  if (status === 409) return { type: "version-conflict", status }
  if (status === 401) return { type: "session-expired", status }
  if (status === 413) return { type: "too-large", status }
  if (status === 429) return { type: "rate-limited", status }
  if (typeof status === "number" && status >= 500) return { type: "server-error", status }

  return { type: "unknown", status }
}

const buildMessage = (type: EditorFailureType) => {
  switch (type) {
    case "version-conflict":
      return "서버 최신본과 충돌했습니다. 작성 내용은 유지됩니다."
    case "offline":
      return "오프라인 상태라 서버에 연결하지 못했습니다. 작성 내용은 유지됩니다."
    case "timeout":
      return "응답이 지연되고 있습니다. 작성 내용은 유지됩니다."
    case "session-expired":
      return "로그인 세션이 만료되었습니다. 작성 내용은 유지됩니다."
    case "too-large":
      return "요청 또는 업로드 용량이 너무 큽니다. 작성 내용은 유지됩니다."
    case "rate-limited":
      return "요청이 많아 제한되었습니다. 잠시 후 다시 시도해주세요. 작성 내용은 유지됩니다."
    case "server-error":
      return "서버 오류로 요청을 완료하지 못했습니다. 작성 내용은 유지됩니다."
    case "unknown":
      return "요청을 완료하지 못했습니다. 작성 내용은 유지됩니다."
  }
}

const buildNextActions = (type: EditorFailureType) => {
  switch (type) {
    case "version-conflict":
      return [
        preserveDraftAction,
        "서버 최신본을 다시 불러와 차이를 비교",
        "필요한 내용을 수동 병합한 뒤 다시 저장",
      ]
    case "session-expired":
      return [preserveDraftAction, "새 탭에서 다시 로그인한 뒤 이 탭으로 돌아와 저장"]
    case "too-large":
      return [preserveDraftAction, "이미지와 첨부 파일 용량을 줄인 뒤 다시 시도"]
    case "rate-limited":
      return [preserveDraftAction, "잠시 후 같은 버튼으로 다시 시도"]
    case "server-error":
      return [preserveDraftAction, retryAction]
    case "offline":
      return [preserveDraftAction, "연결이 복구되면 같은 버튼으로 다시 시도"]
    case "timeout":
      return [preserveDraftAction, "중복 저장 여부를 확인한 뒤 같은 버튼으로 다시 시도"]
    case "unknown":
      return [preserveDraftAction, retryAction]
  }
}

const canRetryFailure = (type: EditorFailureType) => type !== "unknown"

export const resolveEditorFailureRecovery = (
  error: unknown,
  { action, isOnline }: ResolveEditorFailureRecoveryParams,
): EditorFailureRecovery => {
  const { type, status } = classifyEditorFailure(error, isOnline)
  const actionLabel = actionLabels[action]
  const message = buildMessage(type)
  const nextActions = buildNextActions(type)

  return {
    statusText: `${actionLabel} 실패: ${message} ${nextActions.join(" · ")}`,
    result: {
      errorType: type,
      message,
      draftProtected: true,
      canRetry: canRetryFailure(type),
      nextActions,
      ...(typeof status === "number" ? { status } : {}),
    },
  }
}

export const resolveEditorUploadFailureRecovery = (
  error: unknown,
  { kind, fileName, isOnline }: ResolveEditorUploadFailureRecoveryParams,
): EditorFailureRecovery => {
  const { type, status } = classifyEditorFailure(error, isOnline)
  const uploadLabel = uploadLabels[kind]
  const message = buildMessage(type)
  const nextActions = buildNextActions(type)

  return {
    statusText: `${uploadLabel} 업로드 실패: "${fileName}" 파일별 실패 상태입니다. ${message} ${nextActions.join(" · ")} 다시 시도할 수 있습니다.`,
    result: {
      errorType: type,
      message,
      draftProtected: true,
      canRetry: canRetryFailure(type),
      nextActions,
      fileName,
      ...(typeof status === "number" ? { status } : {}),
    },
  }
}
