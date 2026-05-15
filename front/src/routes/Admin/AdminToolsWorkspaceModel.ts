export type JsonValue = unknown

export type TaskRetryPolicy = {
  label: string
  maxRetries: number
  baseDelaySeconds: number
  backoffMultiplier: number
  maxDelaySeconds: number
}

export type SystemHealthPayload = {
  status?: string
  details?: Record<string, unknown>
  [key: string]: unknown
}

export type ActionCardTone = "read" | "write" | "danger" | "infra"
export type InlineNoticeTone = "warning" | "danger" | "success"
export type DiagnosticTab = "mail" | "queue" | "cleanup" | "auth"
export type ExecutionDomain = "overview" | "diagnostics" | "execution" | "mutation"
export type ExecutionResultFilter = "all" | "success" | "error" | "stale"

export type ExecutionEntry = {
  id: string
  key: string
  source: string
  domain: ExecutionDomain
  tone: ActionCardTone
  status: "success" | "error"
  startedAt: string
  completedAt: string
  summary: string
  payload: JsonValue
}

export const ADMIN_TOOLS_DISPLAY_TIME_ZONE = "Asia/Seoul"
export const SYSTEM_HEALTH_QUERY_KEY = ["admin", "tools", "system-health"] as const
export const HEALTH_CACHE_MS = 10_000
export const RESULTS_FILTER_STORAGE_KEY = "admin.tools.resultsFilter.v1"
export const SECTION_IDS = {
  overview: "ops-overview",
  diagnostics: "ops-diagnostics",
  execution: "ops-execution",
  mutation: "ops-mutation",
  results: "ops-results",
} as const

export type SectionKey = keyof typeof SECTION_IDS

export const isExecutionResultFilter = (value: string): value is ExecutionResultFilter =>
  value === "all" || value === "success" || value === "error" || value === "stale"

export const ACTION_META: Record<
  string,
  {
    label: string
    domain: ExecutionDomain
    tone: ActionCardTone
  }
> = {
  commentList: { label: "댓글 목록 조회", domain: "mutation", tone: "read" },
  commentOne: { label: "댓글 상세 조회", domain: "mutation", tone: "read" },
  commentWrite: { label: "댓글 생성", domain: "mutation", tone: "write" },
  commentModify: { label: "댓글 수정", domain: "mutation", tone: "write" },
  commentDelete: { label: "댓글 삭제", domain: "mutation", tone: "danger" },
  admPostCount: { label: "전체 글 수 확인", domain: "execution", tone: "read" },
  systemHealth: { label: "서비스 상태 조회", domain: "execution", tone: "infra" },
  mailStatus: { label: "메일 진단", domain: "diagnostics", tone: "infra" },
  mailConnectivity: { label: "SMTP 연결 확인", domain: "diagnostics", tone: "infra" },
  mailTest: { label: "테스트 메일 발송", domain: "execution", tone: "write" },
  taskQueueStatus: { label: "작업 큐 진단", domain: "diagnostics", tone: "infra" },
  cleanupStatus: { label: "파일 정리 진단", domain: "diagnostics", tone: "infra" },
  authSecurityEvents: { label: "인증 보안 기록 조회", domain: "diagnostics", tone: "infra" },
  seedPostId: { label: "실데이터 테스트 대상 글 준비", domain: "mutation", tone: "read" },
}

export const formatInstant = (value: string | null | undefined) => {
  if (!value) return "-"

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: ADMIN_TOOLS_DISPLAY_TIME_ZONE,
  }).format(date)
}

export const formatAge = (seconds: number | null | undefined) => {
  if (seconds == null) return "-"
  if (seconds < 60) return `${seconds}초`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}분`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}시간`
  return `${Math.floor(seconds / 86400)}일`
}

export const getFreshnessMeta = (
  value: string | null | undefined,
  referenceNow: number | null
): { label: string; tone: "fresh" | "aging" | "stale" } => {
  if (!value) return { label: "미확인", tone: "stale" }

  const timestamp = new Date(value).getTime()
  if (Number.isNaN(timestamp)) return { label: "미확인", tone: "stale" }

  if (referenceNow == null) return { label: "확인됨", tone: "fresh" }

  const diffMs = referenceNow - timestamp
  if (diffMs < 90_000) return { label: "방금 확인", tone: "fresh" }
  if (diffMs < 15 * 60_000) return { label: `${Math.max(1, Math.floor(diffMs / 60_000))}분 전`, tone: "fresh" }
  if (diffMs < 60 * 60_000) return { label: `${Math.max(15, Math.floor(diffMs / 60_000))}분 전`, tone: "aging" }
  return { label: `${Math.max(1, Math.floor(diffMs / 3_600_000))}시간 전`, tone: "stale" }
}

export const formatRetryPolicy = (policy: TaskRetryPolicy) =>
  `${policy.maxRetries}회 / ${policy.baseDelaySeconds}초 시작 / x${policy.backoffMultiplier.toFixed(1)} / 최대 ${policy.maxDelaySeconds}초`

export const getSystemHealthSummary = (health: SystemHealthPayload | null) => {
  if (!health?.details || typeof health.details !== "object") return []

  return Object.entries(health.details)
    .slice(0, 4)
    .map(([key, value]) => {
      if (value && typeof value === "object" && "status" in value && typeof value.status === "string") {
        return `${key}: ${String(value.status)}`
      }

      return `${key}: ${typeof value === "string" ? value : "ok"}`
    })
}

export const getResultMessage = (payload: JsonValue) => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null
  if ("msg" in payload && typeof (payload as { msg?: unknown }).msg === "string") {
    return (payload as { msg: string }).msg
  }
  if ("message" in payload && typeof (payload as { message?: unknown }).message === "string") {
    return (payload as { message: string }).message
  }
  if ("error" in payload && typeof (payload as { error?: unknown }).error === "string") {
    return (payload as { error: string }).error
  }
  return null
}

export const buildExecutionSummary = (key: string, status: "success" | "error", payload: JsonValue) => {
  if (status === "error") return getResultMessage(payload) || "실행에 실패했습니다."

  switch (key) {
    case "systemHealth": {
      const health = payload as SystemHealthPayload
      return `서비스 상태 ${health?.status || "확인"}`
    }
    case "admPostCount":
      return typeof payload === "number" ? `전체 글 ${payload}건을 확인했습니다.` : getResultMessage(payload) || "전체 글 수를 확인했습니다."
    case "commentList":
      return Array.isArray(payload) ? `댓글 ${payload.length}건을 불러왔습니다.` : "댓글 목록을 불러왔습니다."
    case "commentOne":
      return "댓글 상세를 불러왔습니다."
    case "commentWrite":
      return getResultMessage(payload) || "댓글을 생성했습니다."
    case "commentModify":
      return getResultMessage(payload) || "댓글을 수정했습니다."
    case "commentDelete":
      return getResultMessage(payload) || "댓글을 삭제했습니다."
    case "mailStatus":
      return "메일 준비 상태를 다시 확인했습니다."
    case "mailConnectivity":
      return "SMTP 연결 상태를 다시 확인했습니다."
    case "mailTest":
      return getResultMessage(payload) || "테스트 메일 발송을 요청했습니다."
    case "taskQueueStatus":
      return "작업 큐 진단을 새로고침했습니다."
    case "cleanupStatus":
      return "파일 정리 진단을 새로고침했습니다."
    case "authSecurityEvents":
      return "인증 보안 기록을 새로고침했습니다."
    default:
      return getResultMessage(payload) || ACTION_META[key]?.label || "작업을 실행했습니다."
  }
}

export const getStatusTone = (status: string) => {
  if (status === "정상") return "success"
  if (status === "오류") return "danger"
  return "warning"
}
