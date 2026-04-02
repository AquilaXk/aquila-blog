import styled from "@emotion/styled"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { GetServerSideProps, NextPage } from "next"
import { IncomingMessage } from "http"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { apiFetch } from "src/apis/backend/client"
import { toFriendlyApiMessage } from "src/apis/backend/errorMessages"
import useAuthSession from "src/hooks/useAuthSession"
import { AdminPageProps, getAdminPageProps } from "src/libs/server/adminPage"
import { serverApiFetch } from "src/libs/server/backend"
import { appendSsrDebugTiming, timed } from "src/libs/server/serverTiming"
import { buildMonitoringItems, getMonitoringEnv } from "src/routes/Admin/adminMonitoring"

type JsonValue = unknown

const pretty = (value: JsonValue) => JSON.stringify(value, null, 2)

type SignupMailDiagnostics = {
  status: string
  adapter: string
  host: string | null
  port: number | null
  mailFrom: string | null
  usernameConfigured: boolean
  passwordConfigured: boolean
  smtpAuth: boolean
  startTlsEnabled: boolean
  missing: string[]
  canConnect: boolean | null
  checkedAt: string
  verifyPath: string
  connectionError?: string | null
  taskQueue?: TaskTypeDiagnostics | null
}

type TaskRetryPolicy = {
  label: string
  maxRetries: number
  baseDelaySeconds: number
  backoffMultiplier: number
  maxDelaySeconds: number
}

type TaskTypeDiagnostics = {
  taskType: string
  pendingCount: number
  readyPendingCount: number
  delayedPendingCount: number
  processingCount: number
  backlogCount?: number
  queueLagSeconds?: number | null
  failedCount: number
  staleProcessingCount: number
  label: string
  oldestReadyPendingAt: string | null
  oldestReadyPendingAgeSeconds: number | null
  latestFailureAt: string | null
  latestFailureMessage: string | null
  retryPolicy: TaskRetryPolicy
}

type TaskExecutionSample = {
  taskId: number
  taskType: string
  label: string
  aggregateType: string
  aggregateId: number
  status: string
  retryCount: number
  maxRetries: number
  modifiedAt: string
  nextRetryAt: string
  errorMessage: string | null
}

type TaskQueueDiagnostics = {
  pendingCount: number
  readyPendingCount: number
  delayedPendingCount: number
  processingCount: number
  completedCount: number
  failedCount: number
  staleProcessingCount: number
  oldestReadyPendingAt: string | null
  oldestProcessingAt: string | null
  oldestReadyPendingAgeSeconds: number | null
  oldestProcessingAgeSeconds: number | null
  processingTimeoutSeconds: number
  taskTypes: TaskTypeDiagnostics[]
  recentFailures: TaskExecutionSample[]
  staleProcessingSamples: TaskExecutionSample[]
}

type UploadedFileCleanupDiagnostics = {
  tempCount: number
  activeCount: number
  pendingDeleteCount: number
  deletedCount: number
  eligibleForPurgeCount: number
  cleanupSafetyThreshold: number
  blockedBySafetyThreshold: boolean
  oldestEligiblePurgeAfter: string | null
  sampleEligibleObjectKeys: string[]
}

type AuthSecurityEvent = {
  id: number
  createdAt: string
  eventType: "LOGIN_POLICY_APPLIED" | "IP_SECURITY_MISMATCH_BLOCKED" | string
  memberId: number | null
  loginIdentifier: string | null
  rememberLoginEnabled: boolean
  ipSecurityEnabled: boolean
  clientIpFingerprint: string | null
  requestPath: string | null
  reason: string | null
}

type ApiRsData<T> = {
  resultCode: string
  msg: string
  data: T
}

type AdminToolsInitialSnapshot = {
  systemHealth: SystemHealthPayload | null
  systemHealthFetchedAt: string | null
  mailDiagnostics: SignupMailDiagnostics | null
  taskQueueDiagnostics: TaskQueueDiagnostics | null
  taskQueueCheckedAt: string | null
  cleanupDiagnostics: UploadedFileCleanupDiagnostics | null
  cleanupCheckedAt: string | null
  authSecurityEvents: AuthSecurityEvent[]
  authSecurityCheckedAt: string | null
  seedPostId: string
}

type AdminToolsPageProps = AdminPageProps & {
  initialSnapshot: AdminToolsInitialSnapshot
}

type SystemHealthPayload = {
  status?: string
  details?: Record<string, unknown>
  [key: string]: unknown
}

type PageDto<T> = {
  content?: T[]
}

const EMPTY_INITIAL_SNAPSHOT: AdminToolsInitialSnapshot = {
  systemHealth: null,
  systemHealthFetchedAt: null,
  mailDiagnostics: null,
  taskQueueDiagnostics: null,
  taskQueueCheckedAt: null,
  cleanupDiagnostics: null,
  cleanupCheckedAt: null,
  authSecurityEvents: [],
  authSecurityCheckedAt: null,
  seedPostId: "",
}

async function readJsonIfOk<T>(req: IncomingMessage, path: string): Promise<T | null> {
  try {
    const response = await serverApiFetch(req, path)
    if (!response.ok) return null

    const contentLength = response.headers.get("content-length")
    if (contentLength === "0") return null

    return (await response.json()) as T
  } catch {
    return null
  }
}

export const getServerSideProps: GetServerSideProps<AdminToolsPageProps> = async ({ req, res }) => {
  const ssrStartedAt = performance.now()
  const baseResult = await timed(() => getAdminPageProps(req))
  if (!baseResult.ok) throw baseResult.error
  if ("redirect" in baseResult.value) return baseResult.value
  if (!("props" in baseResult.value)) return baseResult.value
  const baseProps = await baseResult.value.props

  const fetchedAt = new Date().toISOString()
  const [systemHealthResult, mailResult] = await Promise.all([
    timed(() => readJsonIfOk<SystemHealthPayload>(req, "/system/api/v1/adm/health")),
    timed(() => readJsonIfOk<SignupMailDiagnostics>(req, "/system/api/v1/adm/mail/signup")),
  ])

  const systemHealth = systemHealthResult.ok ? systemHealthResult.value : null
  const mailDiagnostics = mailResult.ok ? mailResult.value : null

  appendSsrDebugTiming(req, res, [
    {
      name: "admin-tools-auth",
      durationMs: baseResult.durationMs,
      description: "ok",
    },
    {
      name: "admin-tools-health",
      durationMs: systemHealthResult.durationMs,
      description: systemHealth ? "ok" : "empty",
    },
    {
      name: "admin-tools-mail",
      durationMs: mailResult.durationMs,
      description: mailDiagnostics ? "ok" : "empty",
    },
    {
      name: "admin-tools-ssr-total",
      durationMs: performance.now() - ssrStartedAt,
      description: "ready",
    },
  ])

  return {
    props: {
      ...baseProps,
      initialSnapshot: {
        systemHealth,
        systemHealthFetchedAt: systemHealth ? fetchedAt : null,
        mailDiagnostics,
        taskQueueDiagnostics: null,
        taskQueueCheckedAt: null,
        cleanupDiagnostics: null,
        cleanupCheckedAt: null,
        authSecurityEvents: [],
        authSecurityCheckedAt: null,
        seedPostId: "",
      },
    },
  }
}

type ActionCardTone = "read" | "write" | "danger" | "infra"
type InlineNoticeTone = "warning" | "danger" | "success"
type DiagnosticTab = "mail" | "queue" | "cleanup" | "auth"
type ExecutionDomain = "overview" | "diagnostics" | "execution" | "mutation"
type ExecutionResultFilter = "all" | "success" | "error" | "stale"

type ExecutionEntry = {
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

const SYSTEM_HEALTH_QUERY_KEY = ["admin", "tools", "system-health"] as const
const HEALTH_CACHE_MS = 10_000
const RESULTS_FILTER_STORAGE_KEY = "admin.tools.resultsFilter.v1"
const SECTION_IDS = {
  overview: "ops-overview",
  diagnostics: "ops-diagnostics",
  observability: "ops-observability",
  execution: "ops-execution",
  mutation: "ops-mutation",
  results: "ops-results",
} as const

type SectionKey = keyof typeof SECTION_IDS

const SECTION_LABELS: Record<SectionKey, string> = {
  overview: "개요",
  diagnostics: "진단",
  observability: "관측",
  execution: "실행",
  mutation: "실데이터 테스트",
  results: "최근 실행 결과",
}

const DIAGNOSTIC_TAB_LABELS: Record<DiagnosticTab, string> = {
  mail: "메일 진단",
  queue: "작업 큐 진단",
  cleanup: "파일 정리 진단",
  auth: "인증 보안 기록",
}

const MONITORING_ENV = getMonitoringEnv()

const isExecutionResultFilter = (value: string): value is ExecutionResultFilter =>
  value === "all" || value === "success" || value === "error" || value === "stale"

const ACTION_META: Record<
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

const formatInstant = (value: string | null | undefined) => {
  if (!value) return "-"

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date)
}

const formatAge = (seconds: number | null | undefined) => {
  if (seconds == null) return "-"
  if (seconds < 60) return `${seconds}초`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}분`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}시간`
  return `${Math.floor(seconds / 86400)}일`
}

const getFreshnessMeta = (value: string | null | undefined): { label: string; tone: "fresh" | "aging" | "stale" } => {
  if (!value) return { label: "미확인", tone: "stale" }

  const timestamp = new Date(value).getTime()
  if (Number.isNaN(timestamp)) return { label: "미확인", tone: "stale" }

  const diffMs = Date.now() - timestamp
  if (diffMs < 90_000) return { label: "방금 확인", tone: "fresh" }
  if (diffMs < 15 * 60_000) return { label: `${Math.max(1, Math.floor(diffMs / 60_000))}분 전`, tone: "fresh" }
  if (diffMs < 60 * 60_000) return { label: `${Math.max(15, Math.floor(diffMs / 60_000))}분 전`, tone: "aging" }
  return { label: `${Math.max(1, Math.floor(diffMs / 3_600_000))}시간 전`, tone: "stale" }
}

const combineFreshnessTones = (...tones: Array<"fresh" | "aging" | "stale" | null | undefined>) => {
  if (tones.some((tone) => tone === "stale")) return "stale" as const
  if (tones.some((tone) => tone === "aging")) return "aging" as const
  return "fresh" as const
}

const formatRetryPolicy = (policy: TaskRetryPolicy) =>
  `${policy.maxRetries}회 / ${policy.baseDelaySeconds}초 시작 / x${policy.backoffMultiplier.toFixed(1)} / 최대 ${policy.maxDelaySeconds}초`

const getSystemHealthSummary = (health: SystemHealthPayload | null) => {
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

const getResultMessage = (payload: JsonValue) => {
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

const buildExecutionSummary = (key: string, status: "success" | "error", payload: JsonValue) => {
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

const getStatusTone = (status: string) => {
  if (status === "정상") return "success"
  if (status === "오류") return "danger"
  return "warning"
}

const AdminToolsPage: NextPage<AdminToolsPageProps> = ({ initialMember, initialSnapshot = EMPTY_INITIAL_SNAPSHOT }) => {
  const queryClient = useQueryClient()
  const { me, authStatus } = useAuthSession()
  const sessionMember = authStatus === "loading" || authStatus === "unavailable" ? initialMember : me || initialMember
  const [loadingKey, setLoadingKey] = useState("")
  const [executions, setExecutions] = useState<ExecutionEntry[]>([])
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(null)
  const [resultsFilter, setResultsFilter] = useState<ExecutionResultFilter>("all")
  const [postId, setPostId] = useState(initialSnapshot.seedPostId)
  const [commentId, setCommentId] = useState("1")
  const [commentContent, setCommentContent] = useState("운영 테스트 댓글")
  const [mailDiagnostics, setMailDiagnostics] = useState<SignupMailDiagnostics | null>(initialSnapshot.mailDiagnostics)
  const [mailDiagnosticsError, setMailDiagnosticsError] = useState("")
  const [taskQueueDiagnostics, setTaskQueueDiagnostics] = useState<TaskQueueDiagnostics | null>(
    initialSnapshot.taskQueueDiagnostics
  )
  const [taskQueueDiagnosticsError, setTaskQueueDiagnosticsError] = useState("")
  const [taskQueueCheckedAt, setTaskQueueCheckedAt] = useState<string | null>(initialSnapshot.taskQueueCheckedAt)
  const [cleanupDiagnostics, setCleanupDiagnostics] = useState<UploadedFileCleanupDiagnostics | null>(
    initialSnapshot.cleanupDiagnostics
  )
  const [cleanupDiagnosticsError, setCleanupDiagnosticsError] = useState("")
  const [cleanupCheckedAt, setCleanupCheckedAt] = useState<string | null>(initialSnapshot.cleanupCheckedAt)
  const [authSecurityEvents, setAuthSecurityEvents] = useState<AuthSecurityEvent[]>(initialSnapshot.authSecurityEvents)
  const [authSecurityEventsError, setAuthSecurityEventsError] = useState("")
  const [authSecurityCheckedAt, setAuthSecurityCheckedAt] = useState<string | null>(initialSnapshot.authSecurityCheckedAt)
  const [activeSection, setActiveSection] = useState<SectionKey>("overview")
  const [sectionJumpTarget, setSectionJumpTarget] = useState<SectionKey | null>(null)
  const [activeDiagnosticTab, setActiveDiagnosticTab] = useState<DiagnosticTab>("mail")
  const [testEmail, setTestEmail] = useState("")
  const [mailTestNotice, setMailTestNotice] = useState<{ tone: InlineNoticeTone; text: string }>({
    tone: "warning",
    text: "",
  })
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [advancedToolsOpen, setAdvancedToolsOpen] = useState(false)
  const systemHealthQuery = useQuery({
    queryKey: SYSTEM_HEALTH_QUERY_KEY,
    queryFn: async (): Promise<SystemHealthPayload> => apiFetch<SystemHealthPayload>("/system/api/v1/adm/health"),
    enabled: Boolean(sessionMember?.isAdmin),
    initialData: initialSnapshot.systemHealth ?? undefined,
    initialDataUpdatedAt: initialSnapshot.systemHealthFetchedAt
      ? new Date(initialSnapshot.systemHealthFetchedAt).getTime()
      : undefined,
    staleTime: HEALTH_CACHE_MS,
    gcTime: 60_000,
    retry: 1,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  })

  const fetchSystemHealthCached = async () =>
    queryClient.fetchQuery<SystemHealthPayload>({
      queryKey: SYSTEM_HEALTH_QUERY_KEY,
      queryFn: () => apiFetch<SystemHealthPayload>("/system/api/v1/adm/health"),
      staleTime: HEALTH_CACHE_MS,
    })

  const pushExecution = useCallback((key: string, status: "success" | "error", payload: JsonValue, startedAt: string) => {
    const meta = ACTION_META[key] || { label: key, domain: "execution" as const, tone: "read" as const }
    const entry: ExecutionEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      key,
      source: meta.label,
      domain: meta.domain,
      tone: meta.tone,
      status,
      startedAt,
      completedAt: new Date().toISOString(),
      summary: buildExecutionSummary(key, status, payload),
      payload,
    }

    setExecutions((prev) => {
      const next = [entry, ...prev].slice(0, 5)
      return next
    })
    setSelectedExecutionId(entry.id)
  }, [])

  const executeAction = useCallback(async <T extends JsonValue>(
    key: string,
    fn: () => Promise<T>,
    options?: {
      onSuccess?: (data: T) => void
      onError?: (message: string) => void
    }
  ) => {
    const startedAt = new Date().toISOString()

    try {
      setLoadingKey(key)
      const data = await fn()
      options?.onSuccess?.(data)
      pushExecution(key, "success", data, startedAt)
      return data
    } catch (error) {
      const message = toFriendlyApiMessage(error, "요청 처리 중 오류가 발생했습니다.")
      options?.onError?.(message)
      pushExecution(key, "error", { error: message }, startedAt)
      return null
    } finally {
      setLoadingKey("")
    }
  }, [pushExecution])

  const parsePositiveInt = (value: string, label: string) => {
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new Error(`${label}는 1 이상의 정수여야 합니다.`)
    }
    return parsed
  }

  const requireCommentContent = () => {
    const content = commentContent.trim()
    if (content.length < 2) {
      throw new Error("댓글 내용은 2자 이상 입력해주세요.")
    }
    return content
  }

  const fetchSignupMailDiagnostics = useCallback(async (checkConnection = false) => {
    const actionKey = checkConnection ? "mailConnectivity" : "mailStatus"
    await executeAction(
      actionKey,
      () => apiFetch<SignupMailDiagnostics>(`/system/api/v1/adm/mail/signup${checkConnection ? "?checkConnection=true" : ""}`),
      {
        onSuccess: (diagnostics) => {
          setMailDiagnosticsError("")
          setMailTestNotice((prev) => ({ ...prev, text: "" }))
          setMailDiagnostics(diagnostics)
        },
        onError: (message) => {
          setMailDiagnosticsError(message)
        },
      }
    )
  }, [executeAction])

  const sendSignupTestMail = async () => {
    const email = testEmail.trim()
    if (!email) {
      setMailTestNotice({ tone: "warning", text: "테스트 메일을 받을 주소를 먼저 입력하세요." })
      return
    }

    await executeAction(
      "mailTest",
      () =>
        apiFetch<ApiRsData<{ email: string }>>("/system/api/v1/adm/mail/signup/test", {
          method: "POST",
          body: JSON.stringify({ email }),
        }),
      {
        onSuccess: (response) => {
          setMailTestNotice({ tone: "success", text: `${response.data.email} 주소로 테스트 메일을 요청했습니다.` })
        },
        onError: (message) => {
          setMailTestNotice({ tone: "danger", text: message })
        },
      }
    )
  }

  const fetchTaskQueueDiagnostics = useCallback(async () => {
    await executeAction("taskQueueStatus", () => apiFetch<TaskQueueDiagnostics>("/system/api/v1/adm/tasks"), {
      onSuccess: (diagnostics) => {
        setTaskQueueDiagnosticsError("")
        setTaskQueueDiagnostics(diagnostics)
        setTaskQueueCheckedAt(new Date().toISOString())
      },
      onError: (message) => {
        setTaskQueueDiagnosticsError(message)
      },
    })
  }, [executeAction])

  const fetchCleanupDiagnostics = useCallback(async () => {
    await executeAction("cleanupStatus", () => apiFetch<UploadedFileCleanupDiagnostics>("/system/api/v1/adm/storage/cleanup"), {
      onSuccess: (diagnostics) => {
        setCleanupDiagnosticsError("")
        setCleanupDiagnostics(diagnostics)
        setCleanupCheckedAt(new Date().toISOString())
      },
      onError: (message) => {
        setCleanupDiagnosticsError(message)
      },
    })
  }, [executeAction])

  const fetchAuthSecurityEvents = useCallback(async () => {
    await executeAction("authSecurityEvents", () => apiFetch<AuthSecurityEvent[]>("/system/api/v1/adm/auth/security-events?limit=30"), {
      onSuccess: (events) => {
        setAuthSecurityEventsError("")
        setAuthSecurityEvents(events)
        setAuthSecurityCheckedAt(new Date().toISOString())
      },
      onError: (message) => {
        setAuthSecurityEventsError(message)
      },
    })
  }, [executeAction])

  useEffect(() => {
    if (!sessionMember?.isAdmin) return

    if (activeDiagnosticTab === "mail" && !mailDiagnostics && loadingKey !== "mailStatus" && loadingKey !== "mailConnectivity") {
      void fetchSignupMailDiagnostics(false)
      return
    }

    if (activeDiagnosticTab === "queue" && !taskQueueDiagnostics && loadingKey !== "taskQueueStatus") {
      void fetchTaskQueueDiagnostics()
      return
    }

    if (activeDiagnosticTab === "cleanup" && !cleanupDiagnostics && loadingKey !== "cleanupStatus") {
      void fetchCleanupDiagnostics()
      return
    }

    if (activeDiagnosticTab === "auth" && authSecurityEvents.length === 0 && loadingKey !== "authSecurityEvents") {
      void fetchAuthSecurityEvents()
    }
  }, [
    activeDiagnosticTab,
    authSecurityEvents.length,
    cleanupDiagnostics,
    fetchAuthSecurityEvents,
    fetchCleanupDiagnostics,
    fetchSignupMailDiagnostics,
    fetchTaskQueueDiagnostics,
    loadingKey,
    mailDiagnostics,
    sessionMember?.isAdmin,
    taskQueueDiagnostics,
  ])

  useEffect(() => {
    if (!sessionMember?.isAdmin || postId.trim() || activeSection !== "mutation" || loadingKey === "seedPostId") return

    void executeAction(
      "seedPostId",
      async () => {
        const [publicPostsResult, adminPostsResult] = await Promise.allSettled([
          apiFetch<PageDto<{ id: number }>>("/post/api/v1/posts?page=1&pageSize=1&sort=CREATED_AT"),
          apiFetch<PageDto<{ id: number }>>("/post/api/v1/adm/posts?page=1&pageSize=1&sort=CREATED_AT"),
        ])
        const firstPublicPostId =
          publicPostsResult.status === "fulfilled" ? publicPostsResult.value?.content?.[0]?.id : undefined
        const firstAdminPostId =
          adminPostsResult.status === "fulfilled" ? adminPostsResult.value?.content?.[0]?.id : undefined

        return { id: firstPublicPostId ?? firstAdminPostId ?? null }
      },
      {
        onSuccess: (result) => {
          if (result?.id != null) setPostId(String(result.id))
        },
      }
    )
  }, [activeSection, executeAction, loadingKey, postId, sessionMember?.isAdmin])

  useEffect(() => {
    if (!sectionJumpTarget || typeof window === "undefined") return

    const timeout = window.setTimeout(() => {
      setSectionJumpTarget((current) => (current === sectionJumpTarget ? null : current))
    }, 1600)

    return () => window.clearTimeout(timeout)
  }, [sectionJumpTarget])

  useEffect(() => {
    if (typeof window === "undefined") return
    const savedFilter = window.sessionStorage.getItem(RESULTS_FILTER_STORAGE_KEY)
    if (!savedFilter || !isExecutionResultFilter(savedFilter)) return
    setResultsFilter(savedFilter)
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    window.sessionStorage.setItem(RESULTS_FILTER_STORAGE_KEY, resultsFilter)
  }, [resultsFilter])

  useEffect(() => {
    if (typeof window === "undefined") return

    const observer = new IntersectionObserver(
      (entries) => {
        const next = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (!next) return
        const section = next.target.getAttribute("data-ops-section") as SectionKey | null
        if (section) {
          setActiveSection(section)
          setSectionJumpTarget((current) => (current === section ? null : current))
        }
      },
      {
        rootMargin: "-20% 0px -60% 0px",
        threshold: [0.1, 0.25, 0.5, 0.75],
      }
    )

    const nodes = Object.values(SECTION_IDS)
      .map((id) => document.getElementById(id))
      .filter((node): node is HTMLElement => Boolean(node))

    nodes.forEach((node) => observer.observe(node))
    return () => observer.disconnect()
  }, [])

  const filteredExecutions = useMemo(() => {
    return executions.filter((entry) => {
      if (resultsFilter === "all") return true
      if (resultsFilter === "success") return entry.status === "success"
      if (resultsFilter === "error") return entry.status === "error"
      return getFreshnessMeta(entry.completedAt).tone === "stale"
    })
  }, [executions, resultsFilter])

  const resultFilterCounts = useMemo(
    () => ({
      all: executions.length,
      success: executions.filter((entry) => entry.status === "success").length,
      error: executions.filter((entry) => entry.status === "error").length,
      stale: executions.filter((entry) => getFreshnessMeta(entry.completedAt).tone === "stale").length,
    }),
    [executions]
  )

  const selectedExecution = useMemo(() => {
    if (!filteredExecutions.length) return null
    return filteredExecutions.find((entry) => entry.id === selectedExecutionId) ?? filteredExecutions[0]
  }, [filteredExecutions, selectedExecutionId])

  const systemHealthStatus = systemHealthQuery.data?.status || "UNKNOWN"
  const systemHealthFreshness = getFreshnessMeta(
    systemHealthQuery.dataUpdatedAt ? new Date(systemHealthQuery.dataUpdatedAt).toISOString() : null
  )
  const mailFreshness = getFreshnessMeta(mailDiagnostics?.checkedAt ?? null)
  const taskQueueFreshness = getFreshnessMeta(taskQueueCheckedAt)
  const cleanupFreshness = getFreshnessMeta(cleanupCheckedAt)
  const authFreshness = getFreshnessMeta(authSecurityCheckedAt)
  const systemHealthSummary = getSystemHealthSummary(systemHealthQuery.data ?? null)
  const systemHealthFetchedAt = systemHealthQuery.dataUpdatedAt ? formatInstant(new Date(systemHealthQuery.dataUpdatedAt).toISOString()) : "-"
  const isMailLoading = loadingKey === "mailStatus" || loadingKey === "mailConnectivity"
  const isQueueLoading = loadingKey === "taskQueueStatus"
  const isCleanupLoading = loadingKey === "cleanupStatus"
  const isAuthLoading = loadingKey === "authSecurityEvents"
  const hasMailDiagnostics = Boolean(mailDiagnostics)
  const hasTaskQueueDiagnostics = Boolean(taskQueueDiagnostics)
  const hasCleanupDiagnostics = Boolean(cleanupDiagnostics)
  const hasAuthDiagnostics = Boolean(authSecurityCheckedAt) || Boolean(authSecurityEvents.length)
  const monitoringItems = useMemo(
    () => buildMonitoringItems(systemHealthStatus, MONITORING_ENV),
    [systemHealthStatus]
  )
  const mailStatusLabel =
    !hasMailDiagnostics
      ? isMailLoading
        ? "갱신 중"
        : "열기"
      : mailDiagnostics?.status === "READY"
      ? "정상"
      : mailDiagnostics?.status === "CONNECTION_FAILED"
        ? "오류"
        : mailDiagnostics?.status === "MISCONFIGURED"
          ? "확인 필요"
          : "열기"
  const mailStatusMessage =
    !hasMailDiagnostics
      ? isMailLoading
        ? "메일 진단을 불러오는 중"
        : "메일 진단 열기"
      : mailDiagnostics?.status === "READY"
      ? "준비 완료"
      : mailDiagnostics?.status === "CONNECTION_FAILED"
        ? "연결 실패"
        : mailDiagnostics?.status === "MISCONFIGURED"
          ? "설정 누락"
          : "메일 진단 열기"
  const signupMailTaskQueue = mailDiagnostics?.taskQueue ?? null
  const signupMailQueueStatusLabel =
    signupMailTaskQueue?.staleProcessingCount && signupMailTaskQueue.staleProcessingCount > 0
      ? "오류"
      : signupMailTaskQueue?.failedCount && signupMailTaskQueue.failedCount > 0
        ? "확인 필요"
        : signupMailTaskQueue?.backlogCount && signupMailTaskQueue.backlogCount > 0
          ? "대기 중"
          : signupMailTaskQueue
            ? "정상"
            : "미확인"
  const signupMailQueueStatusMessage =
    signupMailTaskQueue?.staleProcessingCount && signupMailTaskQueue.staleProcessingCount > 0
      ? `stale ${signupMailTaskQueue.staleProcessingCount}건`
      : signupMailTaskQueue?.failedCount && signupMailTaskQueue.failedCount > 0
        ? `실패 ${signupMailTaskQueue.failedCount}건`
        : signupMailTaskQueue?.backlogCount && signupMailTaskQueue.backlogCount > 0
          ? `대기 ${signupMailTaskQueue.backlogCount}건`
          : "이상 없음"
  const queueStatusLabel =
    !hasTaskQueueDiagnostics
      ? isQueueLoading
        ? "갱신 중"
        : "열기"
      : taskQueueDiagnostics?.staleProcessingCount && taskQueueDiagnostics.staleProcessingCount > 0
      ? "오류"
      : taskQueueDiagnostics?.failedCount && taskQueueDiagnostics.failedCount > 0
        ? "확인 필요"
        : taskQueueDiagnostics
          ? "정상"
          : "열기"
  const queueHealthMessage =
    !hasTaskQueueDiagnostics
      ? isQueueLoading
        ? "작업 큐 진단을 불러오는 중"
        : "작업 큐 진단 열기"
      : taskQueueDiagnostics?.staleProcessingCount && taskQueueDiagnostics.staleProcessingCount > 0
      ? `stale processing ${taskQueueDiagnostics.staleProcessingCount}건 감지`
      : taskQueueDiagnostics?.failedCount && taskQueueDiagnostics.failedCount > 0
        ? `최근 실패 ${taskQueueDiagnostics.failedCount}건`
        : "이상 없음"
  const cleanupStatusLabel = !hasCleanupDiagnostics ? (isCleanupLoading ? "갱신 중" : "열기") : cleanupDiagnostics?.blockedBySafetyThreshold ? "확인 필요" : "정상"
  const cleanupHealthMessage = !hasCleanupDiagnostics
    ? isCleanupLoading
      ? "파일 정리 진단을 불러오는 중"
      : "파일 정리 진단 열기"
    : cleanupDiagnostics?.blockedBySafetyThreshold
      ? "보류됨"
      : "이상 없음"
  const authSecurityStatusLabel =
    !hasAuthDiagnostics
      ? isAuthLoading
        ? "갱신 중"
        : "열기"
      : authSecurityEvents.length > 0
      ? authSecurityEvents[0]?.eventType === "IP_SECURITY_MISMATCH_BLOCKED"
        ? "확인 필요"
        : "최근 기록"
      : "정상"
  const authSecurityHealthMessage =
    !hasAuthDiagnostics
      ? isAuthLoading
        ? "인증 보안 기록을 불러오는 중"
        : "인증 보안 기록 열기"
      : authSecurityEvents[0]?.eventType === "IP_SECURITY_MISMATCH_BLOCKED"
      ? "차단 기록 있음"
      : authSecurityEvents.length > 0
        ? "최근 기록 있음"
        : "이상 없음"

  const recentCheckedLabel = useMemo(() => {
    const values = [
      systemHealthQuery.dataUpdatedAt ? new Date(systemHealthQuery.dataUpdatedAt).toISOString() : null,
      mailDiagnostics?.checkedAt ?? null,
    ]
      .filter((value): value is string => Boolean(value))
      .sort()

    return values.length ? formatInstant(values[values.length - 1]) : "-"
  }, [systemHealthQuery.dataUpdatedAt, mailDiagnostics?.checkedAt])

  const overviewStatusLabel =
    systemHealthStatus !== "UP" || mailDiagnostics?.status === "CONNECTION_FAILED"
      ? "오류"
      : mailDiagnostics?.status === "MISCONFIGURED"
        ? "확인 필요"
        : "정상"

  const sectionNavFreshnessMap: Partial<Record<SectionKey, "fresh" | "aging" | "stale">> = {
    overview: combineFreshnessTones(systemHealthFreshness.tone, hasMailDiagnostics ? mailFreshness.tone : null),
    diagnostics: combineFreshnessTones(
      hasMailDiagnostics ? mailFreshness.tone : null,
      hasTaskQueueDiagnostics ? taskQueueFreshness.tone : null,
      hasCleanupDiagnostics ? cleanupFreshness.tone : null,
      hasAuthDiagnostics ? authFreshness.tone : null
    ),
    observability: systemHealthFreshness.tone,
    results: executions[0] ? getFreshnessMeta(executions[0].completedAt).tone : "stale",
  }

  const attentionItems = [
    systemHealthStatus !== "UP" ? "서비스 상태를 먼저 확인하세요." : null,
    mailDiagnostics?.status === "MISCONFIGURED" ? "메일 설정 누락을 정리해야 합니다." : null,
    mailDiagnostics?.status === "CONNECTION_FAILED" ? "SMTP 연결 실패 원인을 확인해야 합니다." : null,
    (signupMailTaskQueue?.failedCount ?? 0) > 0 ? "회원가입 메일 큐에 실패 작업이 있습니다." : null,
    (signupMailTaskQueue?.backlogCount ?? 0) > 0 ? "회원가입 메일 큐에 대기 작업이 남아 있습니다." : null,
  ]
    .filter((item): item is string => Boolean(item))
    .slice(0, 3)

  const quickLinks = [
    {
      label: "메일",
      status: mailStatusLabel,
      detail: mailStatusMessage,
      section: "diagnostics" as SectionKey,
      tab: "mail" as DiagnosticTab,
    },
    {
      label: "작업 큐",
      status: queueStatusLabel,
      detail: queueHealthMessage,
      section: "diagnostics" as SectionKey,
      tab: "queue" as DiagnosticTab,
    },
    {
      label: "파일 정리",
      status: cleanupStatusLabel,
      detail: cleanupHealthMessage,
      section: "diagnostics" as SectionKey,
      tab: "cleanup" as DiagnosticTab,
    },
    {
      label: "인증 보안",
      status: authSecurityStatusLabel,
      detail: authSecurityHealthMessage,
      section: "diagnostics" as SectionKey,
      tab: "auth" as DiagnosticTab,
    },
  ]

  const focusSection = (section: SectionKey, tab?: DiagnosticTab) => {
    if (tab) setActiveDiagnosticTab(tab)
    setActiveSection(section)
    setSectionJumpTarget(section)
    const target = document.getElementById(SECTION_IDS[section])
    if (target) {
      requestAnimationFrame(() => {
        target.scrollIntoView({ behavior: "smooth", block: "start" })
      })
    }
  }

  if (!sessionMember) return null

  const isBusy = Boolean(loadingKey)
  const sectionNavStatusLabel = sectionJumpTarget
    ? `${SECTION_LABELS[sectionJumpTarget]}로 이동 중`
    : activeSection === "diagnostics"
      ? `${SECTION_LABELS[activeSection]} · ${DIAGNOSTIC_TAB_LABELS[activeDiagnosticTab]}`
      : SECTION_LABELS[activeSection]
  return (
    <Main>
      <OpsOverview id={SECTION_IDS.overview} data-ops-section="overview">
        <OverviewHeader>
          <div>
            <h1>운영 진단</h1>
          </div>
          <OverviewMeta>
            <StatusBadge data-tone={getStatusTone(overviewStatusLabel)}>{overviewStatusLabel}</StatusBadge>
            <MetaCaption>
              <span>최근 확인</span>
              <strong>{recentCheckedLabel}</strong>
            </MetaCaption>
          </OverviewMeta>
        </OverviewHeader>

        <HeaderLinks>
          <Link href="/admin" passHref legacyBehavior>
            <NavLink>관리자 허브</NavLink>
          </Link>
          <Link href="/admin/dashboard" passHref legacyBehavior>
            <NavLink>운영 대시보드</NavLink>
          </Link>
          <Link href="/admin/posts" passHref legacyBehavior>
            <NavLink>글 작업 공간</NavLink>
          </Link>
        </HeaderLinks>

        <OverviewContent>
          <Link href="/admin/dashboard" passHref legacyBehavior>
            <FeaturedStatusCard as="a">
              <CardEyebrow>운영 대시보드</CardEyebrow>
              <CardMainLine>
                <strong>{systemHealthStatus === "UP" ? "정상" : systemHealthStatus}</strong>
                <StatusDot data-tone={systemHealthStatus === "UP" ? "success" : "danger"} />
              </CardMainLine>
              <CardDetail>{systemHealthSummary[0] || `최근 확인 ${systemHealthFetchedAt}`}</CardDetail>
            </FeaturedStatusCard>
          </Link>

          <StatusCardGrid>
            {quickLinks.map((card) => (
              <StatusCardButton key={card.label} type="button" onClick={() => focusSection(card.section, card.tab)}>
                <small>{card.label}</small>
                <strong>{card.status}</strong>
                <span>{card.detail}</span>
              </StatusCardButton>
            ))}
          </StatusCardGrid>
        </OverviewContent>

        {attentionItems.length ? (
          <InlineNotice data-tone="warning">{attentionItems[0]}</InlineNotice>
        ) : null}
      </OpsOverview>

      <WorkspaceShell>
        <SectionNav aria-label="운영 섹션">
          <SectionNavStatus data-jumping={sectionJumpTarget ? "true" : "false"}>
            <small>{sectionJumpTarget ? "이동 중" : "현재 위치"}</small>
            <strong>{sectionNavStatusLabel}</strong>
          </SectionNavStatus>
          {([
            { key: "overview", label: "개요" },
            { key: "diagnostics", label: "진단" },
            { key: "observability", label: "관측" },
            { key: "execution", label: "실행" },
            { key: "mutation", label: "실데이터 테스트", tone: "danger" },
            { key: "results", label: "최근 실행 결과" },
          ] as Array<{ key: SectionKey; label: string; tone?: "danger" }>).map((item) => (
            <SectionNavButton
              key={item.key}
              type="button"
              data-active={activeSection === item.key}
              data-tone={item.tone || "default"}
              data-freshness={sectionNavFreshnessMap[item.key] || undefined}
              onClick={() => focusSection(item.key)}
            >
              {item.label}
            </SectionNavButton>
          ))}
        </SectionNav>

        <WorkspaceColumn>
          <WorkspaceSection id={SECTION_IDS.diagnostics} data-ops-section="diagnostics">
            <SectionHeading>
              <SectionTitleBlock>
                <h2>진단</h2>
              </SectionTitleBlock>
              <ReadonlyPill>읽기 전용</ReadonlyPill>
            </SectionHeading>

            <DiagnosticsTabs role="tablist" aria-label="진단 도메인">
              {([
                { key: "mail", label: "메일 진단" },
                { key: "queue", label: "작업 큐 진단" },
                { key: "cleanup", label: "파일 정리 진단" },
                { key: "auth", label: "인증 보안 기록" },
              ] as const).map((tab) => (
                <DiagnosticsTabButton
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={activeDiagnosticTab === tab.key}
                  data-active={activeDiagnosticTab === tab.key}
                  onClick={() => setActiveDiagnosticTab(tab.key)}
                >
                  {tab.label}
                </DiagnosticsTabButton>
              ))}
            </DiagnosticsTabs>

            {activeDiagnosticTab === "mail" ? (
              <DiagnosticPanel>
                <DiagnosticHeader>
                  <div>
                    <strong>메일 진단</strong>
                    <HeaderSubline>
                      <span>{mailStatusMessage}</span>
                      {hasMailDiagnostics ? <FreshnessBadge data-tone={mailFreshness.tone}>{mailFreshness.label}</FreshnessBadge> : null}
                    </HeaderSubline>
                  </div>
                  <ActionRow>
                    <QuietButton type="button" disabled={isBusy} onClick={() => void fetchSignupMailDiagnostics(false)}>
                      다시 확인
                    </QuietButton>
                    <QuietButton type="button" disabled={isBusy} onClick={() => void fetchSignupMailDiagnostics(true)}>
                      SMTP 연결 확인
                    </QuietButton>
                  </ActionRow>
                </DiagnosticHeader>

                {!!mailDiagnostics?.missing.length && <InlineNotice data-tone="warning">누락된 설정: {mailDiagnostics.missing.join(", ")}</InlineNotice>}
                {!!mailDiagnostics?.connectionError && <InlineNotice data-tone="danger">{mailDiagnostics.connectionError}</InlineNotice>}
                {!!mailDiagnosticsError && <InlineNotice data-tone="danger">{mailDiagnosticsError}</InlineNotice>}

                {hasMailDiagnostics ? (
                  <>
                    <MetricGrid>
                      <MetricCard>
                        <small>상태</small>
                        <strong>{mailDiagnostics?.status || "-"}</strong>
                      </MetricCard>
                      <MetricCard>
                        <small>SMTP 호스트</small>
                        <strong>{mailDiagnostics?.host || "미설정"}</strong>
                      </MetricCard>
                      <MetricCard>
                        <small>발신 주소</small>
                        <strong>{mailDiagnostics?.mailFrom || "미설정"}</strong>
                      </MetricCard>
                      <MetricCard>
                        <small>최근 확인</small>
                        <strong>{mailDiagnostics?.checkedAt ? formatInstant(mailDiagnostics.checkedAt) : "-"}</strong>
                      </MetricCard>
                    </MetricGrid>

                    <SubSectionHeading>
                      <strong>회원가입 메일 큐</strong>
                      <small>{signupMailQueueStatusLabel}</small>
                    </SubSectionHeading>
                    {signupMailTaskQueue ? (
                      <>
                        <MetricGrid>
                          <MetricCard>
                            <small>ready</small>
                            <strong>{signupMailTaskQueue.readyPendingCount}</strong>
                          </MetricCard>
                          <MetricCard>
                            <small>processing</small>
                            <strong>{signupMailTaskQueue.processingCount}</strong>
                          </MetricCard>
                          <MetricCard>
                            <small>backlog</small>
                            <strong>{signupMailTaskQueue.backlogCount ?? 0}</strong>
                          </MetricCard>
                          <MetricCard>
                            <small>failed</small>
                            <strong>{signupMailTaskQueue.failedCount}</strong>
                          </MetricCard>
                        </MetricGrid>
                        <SubtleMetaGrid>
                          <SubtleMetaItem>
                            <span>상태</span>
                            <strong>{signupMailQueueStatusMessage}</strong>
                          </SubtleMetaItem>
                          <SubtleMetaItem>
                            <span>가장 오래 대기</span>
                            <strong>{formatAge(signupMailTaskQueue.oldestReadyPendingAgeSeconds)}</strong>
                          </SubtleMetaItem>
                          <SubtleMetaItem>
                            <span>마지막 실패</span>
                            <strong>{signupMailTaskQueue.latestFailureAt ? formatInstant(signupMailTaskQueue.latestFailureAt) : "-"}</strong>
                          </SubtleMetaItem>
                          <SubtleMetaItem>
                            <span>재시도 정책</span>
                            <strong>{signupMailTaskQueue.retryPolicy.maxRetries}회</strong>
                          </SubtleMetaItem>
                        </SubtleMetaGrid>
                        {!!signupMailTaskQueue.latestFailureMessage && (
                          <InlineNotice data-tone="danger">{signupMailTaskQueue.latestFailureMessage}</InlineNotice>
                        )}
                      </>
                    ) : (
                      <CalmMessage>큐 상태는 메일 진단 결과와 함께 채워집니다.</CalmMessage>
                    )}
                  </>
                ) : (
                  <CalmMessage>{isMailLoading ? "메일 진단을 불러오는 중입니다." : "메일 진단 결과가 아직 없습니다. 다시 확인으로 최신 상태를 가져오세요."}</CalmMessage>
                )}

                {hasMailDiagnostics ? (
                  <SubtleMetaGrid>
                    <SubtleMetaItem>
                      <span>메일 어댑터</span>
                      <strong>{mailDiagnostics?.adapter || "-"}</strong>
                    </SubtleMetaItem>
                    <SubtleMetaItem>
                      <span>검증 경로</span>
                      <strong>{mailDiagnostics?.verifyPath || "/signup/verify"}</strong>
                    </SubtleMetaItem>
                    <SubtleMetaItem>
                      <span>SMTP 인증</span>
                      <strong>{mailDiagnostics?.smtpAuth ? "사용" : "미사용"}</strong>
                    </SubtleMetaItem>
                    <SubtleMetaItem>
                      <span>STARTTLS</span>
                      <strong>{mailDiagnostics?.startTlsEnabled ? "사용" : "미사용"}</strong>
                    </SubtleMetaItem>
                  </SubtleMetaGrid>
                ) : null}
              </DiagnosticPanel>
            ) : null}

            {activeDiagnosticTab === "queue" ? (
              <DiagnosticPanel>
                <DiagnosticHeader>
                  <div>
                    <strong>작업 큐 진단</strong>
                    <HeaderSubline>
                      <span>{queueHealthMessage}</span>
                      {hasTaskQueueDiagnostics ? <FreshnessBadge data-tone={taskQueueFreshness.tone}>{taskQueueFreshness.label}</FreshnessBadge> : null}
                    </HeaderSubline>
                  </div>
                  <ActionRow>
                    <QuietButton type="button" disabled={isBusy} onClick={() => void fetchTaskQueueDiagnostics()}>
                      다시 확인
                    </QuietButton>
                  </ActionRow>
                </DiagnosticHeader>

                {!!taskQueueDiagnosticsError && <InlineNotice data-tone="danger">{taskQueueDiagnosticsError}</InlineNotice>}

                {taskQueueDiagnostics ? (
                  <>
                    <MetricGrid>
                      <MetricCard>
                        <small>ready</small>
                        <strong>{taskQueueDiagnostics.readyPendingCount}</strong>
                      </MetricCard>
                      <MetricCard>
                        <small>processing</small>
                        <strong>{taskQueueDiagnostics.processingCount}</strong>
                      </MetricCard>
                      <MetricCard>
                        <small>최근 실패</small>
                        <strong>{taskQueueDiagnostics.failedCount}</strong>
                      </MetricCard>
                      <MetricCard>
                        <small>stale</small>
                        <strong>{taskQueueDiagnostics.staleProcessingCount}</strong>
                      </MetricCard>
                    </MetricGrid>

                  <SubtleMetaGrid>
                    <SubtleMetaItem>
                      <span>가장 오래 대기 중</span>
                      <strong>{formatAge(taskQueueDiagnostics.oldestReadyPendingAgeSeconds)}</strong>
                    </SubtleMetaItem>
                    <SubtleMetaItem>
                      <span>가장 오래 처리 중</span>
                      <strong>{formatAge(taskQueueDiagnostics.oldestProcessingAgeSeconds)}</strong>
                    </SubtleMetaItem>
                    <SubtleMetaItem>
                      <span>processing timeout</span>
                      <strong>{taskQueueDiagnostics.processingTimeoutSeconds}초</strong>
                    </SubtleMetaItem>
                    <SubtleMetaItem>
                      <span>완료 작업</span>
                      <strong>{taskQueueDiagnostics.completedCount}</strong>
                    </SubtleMetaItem>
                  </SubtleMetaGrid>
                  </>
                ) : (
                  <CalmMessage>{isQueueLoading ? "작업 큐 진단을 불러오는 중입니다." : "작업 큐 진단을 열면 최신 상태를 가져옵니다."}</CalmMessage>
                )}

                {!!taskQueueDiagnostics?.taskTypes.length && (
                  <DetailsPanel>
                    <DetailsSummary>
                      <span>작업 유형별 상태</span>
                      <small>{taskQueueDiagnostics.taskTypes.length}개</small>
                    </DetailsSummary>
                    <CompactList>
                      {taskQueueDiagnostics.taskTypes.map((taskType) => (
                        <CompactListItem key={taskType.taskType}>
                          <div>
                            <strong>{taskType.label}</strong>
                            <span>{taskType.taskType}</span>
                          </div>
                          <div>
                            <small>ready {taskType.readyPendingCount}</small>
                            <small>failed {taskType.failedCount}</small>
                            <small>{formatRetryPolicy(taskType.retryPolicy)}</small>
                          </div>
                        </CompactListItem>
                      ))}
                    </CompactList>
                  </DetailsPanel>
                )}

                {!!taskQueueDiagnostics?.recentFailures.length && (
                  <DetailsPanel>
                    <DetailsSummary>
                      <span>최근 실패 작업</span>
                      <small>{taskQueueDiagnostics.recentFailures.length}건</small>
                    </DetailsSummary>
                    <CompactList>
                      {taskQueueDiagnostics.recentFailures.map((sample) => (
                        <CompactListItem key={`failed-${sample.taskId}`}>
                          <div>
                            <strong>{sample.label}</strong>
                            <span>
                              #{sample.taskId} · {sample.taskType} · retry {sample.retryCount}/{sample.maxRetries}
                            </span>
                          </div>
                          <div>
                            <small>{formatInstant(sample.modifiedAt)}</small>
                            <small>{sample.errorMessage || "오류 메시지 없음"}</small>
                          </div>
                        </CompactListItem>
                      ))}
                    </CompactList>
                  </DetailsPanel>
                )}
              </DiagnosticPanel>
            ) : null}

            {activeDiagnosticTab === "cleanup" ? (
              <DiagnosticPanel>
                <DiagnosticHeader>
                  <div>
                    <strong>파일 정리 진단</strong>
                    <HeaderSubline>
                      <span>{cleanupHealthMessage}</span>
                      {hasCleanupDiagnostics ? <FreshnessBadge data-tone={cleanupFreshness.tone}>{cleanupFreshness.label}</FreshnessBadge> : null}
                    </HeaderSubline>
                  </div>
                  <ActionRow>
                    <QuietButton type="button" disabled={isBusy} onClick={() => void fetchCleanupDiagnostics()}>
                      다시 확인
                    </QuietButton>
                  </ActionRow>
                </DiagnosticHeader>

                {!!cleanupDiagnosticsError && <InlineNotice data-tone="danger">{cleanupDiagnosticsError}</InlineNotice>}
                {cleanupDiagnostics ? (
                  <>
                    <MetricGrid>
                      <MetricCard>
                        <small>TEMP</small>
                        <strong>{cleanupDiagnostics.tempCount}</strong>
                      </MetricCard>
                      <MetricCard>
                        <small>PENDING_DELETE</small>
                        <strong>{cleanupDiagnostics.pendingDeleteCount}</strong>
                      </MetricCard>
                      <MetricCard>
                        <small>purge 후보</small>
                        <strong>{cleanupDiagnostics.eligibleForPurgeCount}</strong>
                      </MetricCard>
                      <MetricCard>
                        <small>threshold</small>
                        <strong>{cleanupDiagnostics.cleanupSafetyThreshold}</strong>
                      </MetricCard>
                    </MetricGrid>

                    {!!cleanupDiagnostics.sampleEligibleObjectKeys.length && (
                      <DetailsPanel>
                        <DetailsSummary>
                          <span>샘플 object key</span>
                          <small>{cleanupDiagnostics.sampleEligibleObjectKeys.length}개</small>
                        </DetailsSummary>
                        <CompactCodeList>
                          {cleanupDiagnostics.sampleEligibleObjectKeys.map((key) => (
                            <code key={key}>{key}</code>
                          ))}
                        </CompactCodeList>
                      </DetailsPanel>
                    )}
                  </>
                ) : (
                  <CalmMessage>{isCleanupLoading ? "파일 정리 진단을 불러오는 중입니다." : "파일 정리 진단을 열면 최신 상태를 가져옵니다."}</CalmMessage>
                )}
              </DiagnosticPanel>
            ) : null}

            {activeDiagnosticTab === "auth" ? (
              <DiagnosticPanel>
                <DiagnosticHeader>
                  <div>
                    <strong>인증 보안 기록</strong>
                    <HeaderSubline>
                      <span>{authSecurityHealthMessage}</span>
                      {hasAuthDiagnostics ? <FreshnessBadge data-tone={authFreshness.tone}>{authFreshness.label}</FreshnessBadge> : null}
                    </HeaderSubline>
                  </div>
                  <ActionRow>
                    <QuietButton type="button" disabled={isBusy} onClick={() => void fetchAuthSecurityEvents()}>
                      다시 확인
                    </QuietButton>
                  </ActionRow>
                </DiagnosticHeader>

                {!!authSecurityEventsError && <InlineNotice data-tone="danger">{authSecurityEventsError}</InlineNotice>}

                {!hasAuthDiagnostics ? (
                  <CalmMessage>{isAuthLoading ? "인증 보안 기록을 불러오는 중입니다." : "인증 보안 기록을 열면 최근 이벤트를 확인합니다."}</CalmMessage>
                ) : authSecurityEvents.length > 0 ? (
                  <CompactList>
                    {authSecurityEvents.map((event) => (
                      <CompactListItem key={event.id}>
                        <div>
                          <strong>{event.eventType}</strong>
                          <span>
                            memberId {event.memberId ?? "-"} · {event.loginIdentifier || "식별자 없음"}
                          </span>
                        </div>
                        <div>
                          <small>{formatInstant(event.createdAt)}</small>
                          <small>{event.reason || event.requestPath || "사유 없음"}</small>
                        </div>
                      </CompactListItem>
                    ))}
                  </CompactList>
                ) : authSecurityEventsError ? null : (
                  <CalmMessage>최근 인증 보안 기록이 없습니다.</CalmMessage>
                )}
              </DiagnosticPanel>
            ) : null}
          </WorkspaceSection>

          <WorkspaceSection id={SECTION_IDS.observability} data-ops-section="observability">
            <SectionHeading>
              <SectionTitleBlock>
                <h2>관측</h2>
              </SectionTitleBlock>
              <ReadonlyPill>대시보드 단일 운용</ReadonlyPill>
            </SectionHeading>

            <ObservabilityNotice>
              Grafana 패널 임베드는 운영 중 브라우저 세션 회전 요청(401) 노이즈를 줄이기 위해
              <strong> `/admin/dashboard` 단일 화면</strong>으로 통합했습니다.
            </ObservabilityNotice>

            <DashboardShortcutRow>
              <Link href="/admin/dashboard" passHref legacyBehavior>
                <DashboardShortcutLink>운영 대시보드 열기</DashboardShortcutLink>
              </Link>
            </DashboardShortcutRow>

            {monitoringItems.length ? (
              <MonitoringLinkRail>
                {monitoringItems.map((item) => (
                  <MonitoringLinkCard key={item.key} href={item.href} target="_blank" rel="noreferrer noopener">
                    <strong>{item.title}</strong>
                    <span>{item.status}</span>
                  </MonitoringLinkCard>
                ))}
              </MonitoringLinkRail>
            ) : null}
          </WorkspaceSection>

          <WorkspaceSection id={SECTION_IDS.execution} data-ops-section="execution">
            <SectionHeading>
              <SectionTitleBlock>
                <h2>실행</h2>
              </SectionTitleBlock>
            </SectionHeading>

            <ExecutionGrid>
              <ActionGroupCard>
                <CardSectionHeading>
                  <div>
                    <h3>읽기 전용 실행</h3>
                  </div>
                  <ReadonlyPill>읽기 전용</ReadonlyPill>
                </CardSectionHeading>
                <ActionList>
                  <ActionRowButton type="button" disabled={isBusy} onClick={() => void executeAction("systemHealth", () => fetchSystemHealthCached())}>
                    <span>서비스 상태 조회</span>
                  </ActionRowButton>
                  <ActionRowButton type="button" disabled={isBusy} onClick={() => void executeAction("admPostCount", () => apiFetch("/post/api/v1/adm/posts/count"))}>
                    <span>전체 글 수 확인</span>
                  </ActionRowButton>
                </ActionList>
              </ActionGroupCard>

              <ActionGroupCard>
                <CardSectionHeading>
                  <div>
                    <h3>메일 발송 확인</h3>
                  </div>
                  <ActionToneBadge data-tone="write">실행 가능</ActionToneBadge>
                </CardSectionHeading>
                <FieldStack>
                  <FieldBox>
                    <FieldLabel htmlFor="signup-mail-test-email">테스트 메일 주소</FieldLabel>
                    <Input
                      id="signup-mail-test-email"
                      type="email"
                      value={testEmail}
                      placeholder="메일 수신을 확인할 주소를 입력하세요"
                      onChange={(event) => setTestEmail(event.target.value)}
                    />
                  </FieldBox>
                  <PrimaryButton type="button" disabled={isBusy} onClick={() => void sendSignupTestMail()}>
                    테스트 메일 발송
                  </PrimaryButton>
                  {!!mailTestNotice.text && <InlineNotice data-tone={mailTestNotice.tone}>{mailTestNotice.text}</InlineNotice>}
                </FieldStack>
              </ActionGroupCard>
            </ExecutionGrid>

            <DetailsPanel open={advancedToolsOpen}>
              <DetailsSummary onClick={(event) => {
                event.preventDefault()
                setAdvancedToolsOpen((prev) => !prev)
              }}>
                <span>고급 도구</span>
                <small>{advancedToolsOpen ? "접기" : "열기"}</small>
              </DetailsSummary>
              {advancedToolsOpen ? (
                <ActionList>
                  <ActionRowButton type="button" disabled={isBusy} onClick={() => void fetchSignupMailDiagnostics(true)}>
                    <span>SMTP 연결 확인</span>
                    <small>메일 도메인 진단 없이 연결 단계만 다시 확인합니다</small>
                  </ActionRowButton>
                </ActionList>
              ) : null}
            </DetailsPanel>
          </WorkspaceSection>

          <WorkspaceSection id={SECTION_IDS.mutation} data-ops-section="mutation" data-tone="danger">
            <SectionHeading>
              <SectionTitleBlock>
                <h2>실데이터 테스트</h2>
              </SectionTitleBlock>
              <ActionToneBadge data-tone="danger">실데이터 변경</ActionToneBadge>
            </SectionHeading>

            <DangerPanel>
              <InlineNotice data-tone="danger">이 영역의 실행은 실제 데이터에 영향을 줍니다. 운영 데이터 확인 후 진행하세요.</InlineNotice>

              <SubtleMetaGrid>
                <SubtleMetaItem>
                  <span>대상 글</span>
                  <strong>#{postId || "-"}</strong>
                </SubtleMetaItem>
                <SubtleMetaItem>
                  <span>대상 댓글</span>
                  <strong>{commentId ? `#${commentId}` : "미지정"}</strong>
                </SubtleMetaItem>
              </SubtleMetaGrid>

              <FieldGrid>
                <FieldBox>
                  <FieldLabel htmlFor="comment-post-id">대상 글</FieldLabel>
                  <Input id="comment-post-id" value={postId} onChange={(event) => setPostId(event.target.value)} />
                </FieldBox>
                <FieldBox>
                  <FieldLabel htmlFor="comment-id">대상 댓글</FieldLabel>
                  <Input id="comment-id" value={commentId} onChange={(event) => setCommentId(event.target.value)} />
                </FieldBox>
                <FieldBox className="wide">
                  <FieldLabel htmlFor="comment-content">내용</FieldLabel>
                  <TextArea
                    id="comment-content"
                    value={commentContent}
                    placeholder="테스트할 댓글 내용을 입력하세요"
                    onChange={(event) => setCommentContent(event.target.value)}
                  />
                </FieldBox>
              </FieldGrid>

              <SandboxSection>
                <SandboxHeader>
                  <h3>읽기 전용 확인</h3>
                  <ReadonlyPill>읽기 전용</ReadonlyPill>
                </SandboxHeader>
                <ActionList>
                  <ActionRowButton
                    type="button"
                    disabled={isBusy}
                    onClick={() =>
                      void executeAction("commentList", () => {
                        const targetPostId = parsePositiveInt(postId, "대상 글")
                        return apiFetch(`/post/api/v1/posts/${targetPostId}/comments`)
                      })
                    }
                  >
                    <span>댓글 목록 조회</span>
                  </ActionRowButton>
                  <ActionRowButton
                    type="button"
                    disabled={isBusy}
                    onClick={() =>
                      void executeAction("commentOne", () => {
                        const targetPostId = parsePositiveInt(postId, "대상 글")
                        const targetCommentId = parsePositiveInt(commentId, "대상 댓글")
                        return apiFetch(`/post/api/v1/posts/${targetPostId}/comments/${targetCommentId}`)
                      })
                    }
                  >
                    <span>댓글 상세 조회</span>
                  </ActionRowButton>
                </ActionList>
              </SandboxSection>

              <SandboxSection>
                <SandboxHeader>
                  <h3>변경 실행</h3>
                  <ActionToneBadge data-tone="write">실행 가능</ActionToneBadge>
                </SandboxHeader>
                <ActionList>
                  <ActionRowButton
                    type="button"
                    disabled={isBusy}
                    onClick={() =>
                      void executeAction("commentWrite", async () => {
                        const targetPostId = parsePositiveInt(postId, "대상 글")
                        const content = requireCommentContent()
                        const response = await apiFetch<ApiRsData<{ id?: number }>>(`/post/api/v1/posts/${targetPostId}/comments`, {
                          method: "POST",
                          body: JSON.stringify({ content }),
                        })
                        const createdCommentId = response.data?.id
                        if (typeof createdCommentId === "number") setCommentId(String(createdCommentId))
                        return response
                      })
                    }
                  >
                    <span>댓글 생성</span>
                  </ActionRowButton>
                  <ActionRowButton
                    type="button"
                    disabled={isBusy}
                    onClick={() =>
                      void executeAction("commentModify", () => {
                        const targetPostId = parsePositiveInt(postId, "대상 글")
                        const targetCommentId = parsePositiveInt(commentId, "대상 댓글")
                        const content = requireCommentContent()
                        return apiFetch(`/post/api/v1/posts/${targetPostId}/comments/${targetCommentId}`, {
                          method: "PUT",
                          body: JSON.stringify({ content }),
                        })
                      })
                    }
                  >
                    <span>댓글 수정</span>
                  </ActionRowButton>
                </ActionList>
              </SandboxSection>

              <DangerActionRow>
                <ConfirmDeleteRow>
                  <input
                    id="confirm-comment-delete"
                    type="checkbox"
                    checked={confirmDelete}
                    onChange={(event) => setConfirmDelete(event.target.checked)}
                  />
                  <label htmlFor="confirm-comment-delete">삭제 전 대상 댓글을 다시 확인했습니다.</label>
                </ConfirmDeleteRow>
                <DangerButton
                  type="button"
                  disabled={isBusy || !confirmDelete || !commentId.trim()}
                  onClick={() =>
                    void executeAction("commentDelete", () => {
                      const targetPostId = parsePositiveInt(postId, "대상 글")
                      const targetCommentId = parsePositiveInt(commentId, "대상 댓글")
                      return apiFetch(`/post/api/v1/posts/${targetPostId}/comments/${targetCommentId}`, {
                        method: "DELETE",
                      })
                    }).then(() => setConfirmDelete(false))
                  }
                >
                  댓글 삭제
                </DangerButton>
              </DangerActionRow>
            </DangerPanel>
          </WorkspaceSection>

          <WorkspaceSection id={SECTION_IDS.results} data-ops-section="results">
            <SectionHeading>
              <SectionTitleBlock>
                <h2>최근 실행 결과</h2>
                <p>방금 실행한 작업과 최근 진단 결과를 빠르게 좁혀서 확인할 수 있습니다.</p>
              </SectionTitleBlock>
            </SectionHeading>

            <ResultFilterRow aria-label="실행 결과 필터">
              <ResultFilterButton
                type="button"
                data-active={resultsFilter === "all"}
                onClick={() => setResultsFilter("all")}
              >
                전체
                <span>{resultFilterCounts.all}</span>
              </ResultFilterButton>
              <ResultFilterButton
                type="button"
                data-active={resultsFilter === "success"}
                onClick={() => setResultsFilter("success")}
              >
                성공
                <span>{resultFilterCounts.success}</span>
              </ResultFilterButton>
              <ResultFilterButton
                type="button"
                data-active={resultsFilter === "error"}
                onClick={() => setResultsFilter("error")}
              >
                실패
                <span>{resultFilterCounts.error}</span>
              </ResultFilterButton>
              <ResultFilterButton
                type="button"
                data-active={resultsFilter === "stale"}
                onClick={() => setResultsFilter("stale")}
              >
                오래됨
                <span>{resultFilterCounts.stale}</span>
              </ResultFilterButton>
            </ResultFilterRow>

            {selectedExecution ? (
              <ResultsLayout>
                <ResultPrimaryCard>
                  <ResultTop>
                    <div>
                      <small>방금 실행한 작업</small>
                      <strong>{selectedExecution.source}</strong>
                    </div>
                    <ResultBadgeRow>
                      <ActionToneBadge data-tone={selectedExecution.status === "error" ? "danger" : selectedExecution.tone === "danger" ? "danger" : selectedExecution.tone === "write" ? "write" : "read"}>
                        {selectedExecution.status === "error" ? "실패" : "성공"}
                      </ActionToneBadge>
                      <FreshnessBadge data-tone={getFreshnessMeta(selectedExecution.completedAt).tone}>
                        {getFreshnessMeta(selectedExecution.completedAt).label}
                      </FreshnessBadge>
                    </ResultBadgeRow>
                  </ResultTop>
                  <ResultMetaGrid>
                    <SubtleMetaItem>
                      <span>영역</span>
                      <strong>{selectedExecution.domain}</strong>
                    </SubtleMetaItem>
                    <SubtleMetaItem>
                      <span>실행 시각</span>
                      <strong>{formatInstant(selectedExecution.completedAt)}</strong>
                    </SubtleMetaItem>
                  </ResultMetaGrid>
                  <ResultSummary>{selectedExecution.summary}</ResultSummary>
                  <DetailsPanel>
                    <DetailsSummary>
                      <span>원본 응답 보기</span>
                      <small>JSON</small>
                    </DetailsSummary>
                    <ResultPanel>{pretty(selectedExecution.payload)}</ResultPanel>
                  </DetailsPanel>
                </ResultPrimaryCard>

                <ResultHistoryCard>
                  <CardSectionHeading>
                    <div>
                      <h3>최근 기록</h3>
                    </div>
                  </CardSectionHeading>
                  <HistoryList>
                    {filteredExecutions.map((entry) => (
                      <HistoryButton
                        key={entry.id}
                        type="button"
                        data-active={selectedExecution.id === entry.id}
                        onClick={() => setSelectedExecutionId(entry.id)}
                      >
                        <span>{entry.source}</span>
                        <small>
                          {entry.status === "error" ? "실패" : "성공"} · {formatInstant(entry.completedAt)} · {getFreshnessMeta(entry.completedAt).label}
                        </small>
                      </HistoryButton>
                    ))}
                  </HistoryList>
                </ResultHistoryCard>
              </ResultsLayout>
            ) : (
              <EmptyResultState>
                {executions.length === 0 ? "실행 기록 없음" : "현재 필터에 맞는 실행 결과가 없습니다."}
              </EmptyResultState>
            )}
          </WorkspaceSection>
        </WorkspaceColumn>
      </WorkspaceShell>
    </Main>
  )
}

export default AdminToolsPage

const Main = styled.main`
  max-width: 1440px;
  width: 100%;
  min-width: 0;
  margin: 0 auto;
  padding: 1.5rem 1rem 3rem;
  display: grid;
  gap: 1.25rem;
`

const OpsOverview = styled.section`
  display: grid;
  gap: 1rem;
  padding: 1.1rem 1.1rem 1rem;
  border-radius: 22px;
  background: ${({ theme }) => theme.colors.gray2};
  border: 1px solid ${({ theme }) => theme.colors.gray5};
`

const OverviewHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;

  h1 {
    margin: 0;
    font-size: clamp(1.9rem, 3.8vw, 2.6rem);
    line-height: 1.04;
    letter-spacing: -0.035em;
  }

  p {
    margin: 0.35rem 0 0;
    color: ${({ theme }) => theme.colors.gray10};
    line-height: 1.55;
  }

  @media (max-width: 960px) {
    flex-direction: column;
  }
`

const OverviewMeta = styled.div`
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 0.6rem;
`

const MetaCaption = styled.div`
  display: grid;
  gap: 0.16rem;
  text-align: right;

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.74rem;
    font-weight: 700;
    letter-spacing: 0.02em;
  }

  strong {
    font-size: 0.88rem;
    color: ${({ theme }) => theme.colors.gray12};
  }
`

const HeaderLinks = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
`

const NavLink = styled.a`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 38px;
  padding: 0 0.88rem;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray11};
  text-decoration: none;
  font-size: 0.84rem;
  font-weight: 700;

  &:hover {
    border-color: ${({ theme }) => theme.colors.gray7};
    color: ${({ theme }) => theme.colors.gray12};
  }
`

const OverviewContent = styled.div`
  display: grid;
  grid-template-columns: minmax(280px, 1.05fr) minmax(0, 1.4fr);
  gap: 0.9rem;

  @media (max-width: 1024px) {
    grid-template-columns: 1fr;
  }
`

const FeaturedStatusCard = styled.button`
  text-align: left;
  display: grid;
  gap: 0.55rem;
  border-radius: 18px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: linear-gradient(180deg, ${({ theme }) => theme.colors.gray1} 0%, ${({ theme }) => theme.colors.gray2} 100%);
  padding: 1rem;
  cursor: pointer;

  &:hover {
    border-color: ${({ theme }) => theme.colors.gray7};
  }
`

const CardEyebrow = styled.span`
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.04em;
`

const CardMainLine = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;

  strong {
    font-size: clamp(1.3rem, 2.4vw, 1.75rem);
    letter-spacing: -0.03em;
  }
`

const StatusDot = styled.span`
  width: 0.96rem;
  height: 0.96rem;
  flex: 0 0 auto;
  border-radius: 999px;
  background: ${({ theme }) => theme.colors.indigo8};

  &[data-tone="success"] {
    background: ${({ theme }) => theme.colors.statusSuccessBorder};
  }

  &[data-tone="danger"] {
    background: ${({ theme }) => theme.colors.statusDangerBorder};
  }
`

const CardDetail = styled.span`
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.86rem;
  line-height: 1.6;
`

const StatusCardGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.8rem;

  @media (max-width: 680px) {
    grid-template-columns: 1fr;
  }
`

const StatusCardButton = styled.button`
  text-align: left;
  display: grid;
  gap: 0.22rem;
  border-radius: 16px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  padding: 0.82rem 0.9rem;
  cursor: pointer;

  &:hover {
    border-color: ${({ theme }) => theme.colors.gray7};
  }

  small {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.74rem;
    font-weight: 700;
  }

  strong {
    font-size: 1rem;
  }

  span {
    color: ${({ theme }) => theme.colors.gray10};
    line-height: 1.55;
    font-size: 0.82rem;
  }
`

const SectionTitleBlock = styled.div`
  min-width: 0;

  h2,
  h3 {
    margin: 0;
    font-size: 1.05rem;
    letter-spacing: -0.02em;
  }

  p {
    margin: 0.26rem 0 0;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.84rem;
    line-height: 1.55;
  }
`

const CalmMessage = styled.p`
  margin: 0;
  color: ${({ theme }) => theme.colors.gray10};
  line-height: 1.6;
`

const WorkspaceShell = styled.div`
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 1.1rem;
  align-items: start;

  @media (max-width: 960px) {
    grid-template-columns: 1fr;
  }
`

const SectionNav = styled.aside`
  position: sticky;
  top: calc(var(--app-header-height, 64px) + 1rem);
  display: grid;
  gap: 0.55rem;

  @media (max-width: 960px) {
    position: static;
    display: flex;
    gap: 0.5rem;
    overflow-x: auto;
    padding-bottom: 0.2rem;
    scrollbar-width: none;

    &::-webkit-scrollbar {
      display: none;
    }
  }
`

const SectionNavStatus = styled.div`
  display: grid;
  gap: 0.22rem;
  padding: 0.88rem 0.96rem;
  border-radius: 16px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};

  small {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.03em;
  }

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.92rem;
    font-weight: 780;
    letter-spacing: -0.02em;
  }

  &[data-jumping="true"] {
    border-color: ${({ theme }) => theme.colors.accentBorder};
    background: ${({ theme }) => theme.colors.accentSurfaceSubtle};
  }

  @media (max-width: 960px) {
    min-width: 12.5rem;
    flex: 0 0 auto;
  }
`

const SectionNavButton = styled.button`
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  min-height: 42px;
  padding: 0 0.9rem;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.84rem;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
  white-space: nowrap;

  &[data-active="true"] {
    color: ${({ theme }) => theme.colors.gray12};
    border-color: ${({ theme }) => theme.colors.accentBorder};
    background: ${({ theme }) => theme.colors.accentSurfaceSubtle};
  }

  &[data-freshness="fresh"] {
    border-color: ${({ theme }) => theme.colors.statusSuccessBorder};
  }

  &[data-freshness="aging"] {
    border-color: ${({ theme }) => theme.colors.orange7};
  }

  &[data-freshness="stale"] {
    border-color: ${({ theme }) => theme.colors.gray7};
  }

  &[data-freshness]::before {
    content: "";
    position: absolute;
    left: 0;
    top: 7px;
    bottom: 7px;
    width: 3px;
    border-radius: 999px;
    background: ${({ theme }) => theme.colors.gray7};
  }

  &[data-freshness="fresh"]::before {
    background: ${({ theme }) => theme.colors.statusSuccessBorder};
  }

  &[data-freshness="aging"]::before {
    background: ${({ theme }) => theme.colors.orange8};
  }

  &[data-freshness="stale"]::before {
    background: ${({ theme }) => theme.colors.gray8};
  }

  &[data-tone="danger"] {
    border-color: ${({ theme }) => theme.colors.statusDangerBorder};
    color: ${({ theme }) => theme.colors.statusDangerText};
  }
`

const WorkspaceColumn = styled.div`
  display: grid;
  gap: 1rem;
`

const WorkspaceSection = styled.section`
  display: grid;
  gap: 0.9rem;
  padding: 1rem;
  border-radius: 20px;
  background: ${({ theme }) => theme.colors.gray2};
  border: 1px solid ${({ theme }) => theme.colors.gray5};

  &[data-tone="danger"] {
    background: linear-gradient(180deg, ${({ theme }) => theme.colors.gray2} 0%, rgba(239, 68, 68, 0.08) 100%);
    border-color: ${({ theme }) => theme.colors.statusDangerBorder};
  }
`

const MonitoringLinkRail = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.65rem;

  @media (max-width: 960px) {
    grid-template-columns: 1fr;
  }
`

const MonitoringLinkCard = styled.a`
  display: grid;
  gap: 0.16rem;
  padding: 0.78rem 0.85rem;
  border-radius: 14px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  text-decoration: none;
  min-width: 0;

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.86rem;
    font-weight: 780;
    overflow-wrap: anywhere;
  }

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.78rem;
    font-weight: 700;
    overflow-wrap: anywhere;
  }
`

const ObservabilityNotice = styled.p`
  margin: 0;
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.82rem;
  line-height: 1.6;

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-weight: 820;
  }
`

const DashboardShortcutRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-start;
`

const DashboardShortcutLink = styled.a`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 36px;
  padding: 0 0.9rem;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray12};
  text-decoration: none;
  font-size: 0.8rem;
  font-weight: 800;
`

const SectionHeading = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.8rem;

  @media (max-width: 760px) {
    flex-direction: column;
    align-items: stretch;
  }
`

const StatusBadge = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  padding: 0 0.78rem;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.indigo8};
  background: ${({ theme }) => theme.colors.indigo3};
  color: ${({ theme }) => theme.colors.indigo11};
  font-size: 0.78rem;
  font-weight: 800;

  &[data-tone="success"] {
    border-color: ${({ theme }) => theme.colors.statusSuccessBorder};
    background: ${({ theme }) => theme.colors.statusSuccessSurface};
    color: ${({ theme }) => theme.colors.statusSuccessText};
  }

  &[data-tone="danger"] {
    border-color: ${({ theme }) => theme.colors.statusDangerBorder};
    background: ${({ theme }) => theme.colors.statusDangerSurface};
    color: ${({ theme }) => theme.colors.statusDangerText};
  }
`

const FreshnessBadge = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 26px;
  padding: 0 0.58rem;
  border-radius: 10px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.78rem;
  font-weight: 800;
  line-height: 1;

  &[data-tone="fresh"] {
    border-color: ${({ theme }) => theme.colors.statusSuccessBorder};
    background: ${({ theme }) => theme.colors.statusSuccessSurface};
    color: ${({ theme }) => theme.colors.statusSuccessText};
  }

  &[data-tone="aging"] {
    border-color: ${({ theme }) => theme.colors.orange7};
    background: ${({ theme }) => theme.colors.orange2};
    color: ${({ theme }) => theme.colors.orange10};
  }

  &[data-tone="stale"] {
    border-color: ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.colors.gray2};
    color: ${({ theme }) => theme.colors.gray10};
  }
`

const SubSectionHeading = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
  margin-top: 1rem;

  strong {
    font-size: 1rem;
    font-weight: 800;
    color: ${({ theme }) => theme.colors.gray12};
  }

  small {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.82rem;
    font-weight: 700;
  }
`

const DetailsPanel = styled.details`
  border-radius: 16px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};

  &[open] {
    padding-bottom: 0.2rem;
  }
`

const DetailsSummary = styled.summary`
  list-style: none;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.8rem;
  padding: 0.84rem 0.95rem;
  cursor: pointer;

  &::-webkit-details-marker {
    display: none;
  }

  span {
    font-size: 0.9rem;
    font-weight: 760;
  }

  small {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.78rem;
    font-weight: 700;
  }
`

const ReadonlyPill = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 32px;
  padding: 0 0.72rem;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray3};
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.76rem;
  font-weight: 800;
`

const DiagnosticsTabs = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
`

const DiagnosticsTabButton = styled.button`
  min-height: 38px;
  padding: 0 0.82rem;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;

  &[data-active="true"] {
    color: ${({ theme }) => theme.colors.gray12};
    border-color: ${({ theme }) => theme.colors.accentBorder};
    background: ${({ theme }) => theme.colors.accentSurfaceSubtle};
  }
`

const DiagnosticPanel = styled.div`
  display: grid;
  gap: 0.9rem;
`

const DiagnosticHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.9rem;

  strong {
    display: block;
    font-size: 1rem;
    letter-spacing: -0.02em;
  }

  span {
    display: block;
    margin-top: 0.22rem;
    color: ${({ theme }) => theme.colors.gray10};
    line-height: 1.55;
  }

  @media (max-width: 760px) {
    flex-direction: column;
  }
`

const HeaderSubline = styled.div`
  display: flex;
  align-items: center;
  gap: 0.55rem;
  flex-wrap: wrap;

  span {
    margin-top: 0.22rem;
  }

  ${FreshnessBadge} {
    margin-top: 0.22rem;
  }
`

const ActionRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
`

const QuietButton = styled.button`
  min-height: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;

  &:disabled {
    opacity: 0.56;
    cursor: not-allowed;
  }
`

const MetricGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.7rem;

  @media (max-width: 960px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 520px) {
    grid-template-columns: 1fr;
  }
`

const MetricCard = styled.div`
  display: grid;
  gap: 0.22rem;
  padding: 0.82rem 0.88rem;
  border-radius: 14px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};

  small {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.74rem;
    font-weight: 700;
    letter-spacing: 0.02em;
  }

  strong {
    font-size: 1rem;
    overflow-wrap: anywhere;
  }
`

const InlineNotice = styled.p`
  margin: 0;
  padding: 0.8rem 0.88rem;
  border-radius: 14px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray3};
  color: ${({ theme }) => theme.colors.gray12};
  line-height: 1.6;

  &[data-tone="warning"] {
    border-color: ${({ theme }) => theme.colors.indigo8};
    background: ${({ theme }) => theme.colors.indigo3};
    color: ${({ theme }) => theme.colors.indigo11};
  }

  &[data-tone="danger"] {
    border-color: ${({ theme }) => theme.colors.statusDangerBorder};
    background: ${({ theme }) => theme.colors.statusDangerSurface};
    color: ${({ theme }) => theme.colors.statusDangerText};
  }

  &[data-tone="success"] {
    border-color: ${({ theme }) => theme.colors.statusSuccessBorder};
    background: ${({ theme }) => theme.colors.statusSuccessSurface};
    color: ${({ theme }) => theme.colors.statusSuccessText};
  }
`

const SubtleMetaGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.6rem;

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }
`

const SubtleMetaItem = styled.div`
  display: grid;
  gap: 0.18rem;
  padding: 0.72rem 0.8rem;
  border-radius: 14px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: transparent;

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.76rem;
    font-weight: 700;
  }

  strong {
    font-size: 0.9rem;
    overflow-wrap: anywhere;
  }
`

const CompactList = styled.div`
  display: grid;
`

const CompactListItem = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.82rem 0.95rem;
  border-top: 1px solid ${({ theme }) => theme.colors.gray5};

  &:first-of-type {
    border-top: 0;
  }

  div {
    min-width: 0;
    display: grid;
    gap: 0.16rem;
  }

  strong {
    font-size: 0.9rem;
  }

  span,
  small {
    color: ${({ theme }) => theme.colors.gray10};
    line-height: 1.5;
    overflow-wrap: anywhere;
  }

  @media (max-width: 760px) {
    flex-direction: column;
  }
`

const CompactCodeList = styled.div`
  display: grid;
  gap: 0.42rem;
  padding: 0 0.95rem 0.95rem;

  code {
    display: block;
    border-radius: 10px;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.colors.gray2};
    padding: 0.62rem 0.72rem;
    font-size: 0.82rem;
    overflow-wrap: anywhere;
  }
`

const ExecutionGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.9rem;

  @media (max-width: 960px) {
    grid-template-columns: 1fr;
  }
`

const ActionGroupCard = styled.div`
  display: grid;
  gap: 0.8rem;
  padding: 0.92rem;
  border-radius: 18px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
`

const CardSectionHeading = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.8rem;

  h3 {
    margin: 0;
    font-size: 0.98rem;
    letter-spacing: -0.02em;
  }

  p {
    margin: 0.22rem 0 0;
    color: ${({ theme }) => theme.colors.gray10};
    line-height: 1.5;
    font-size: 0.82rem;
  }
`

const ActionToneBadge = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 32px;
  padding: 0 0.72rem;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray3};
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.76rem;
  font-weight: 800;

  &[data-tone="write"] {
    border-color: ${({ theme }) => theme.colors.accentBorder};
    background: ${({ theme }) => theme.colors.accentSurfaceSubtle};
    color: ${({ theme }) => theme.colors.accentLink};
  }

  &[data-tone="danger"] {
    border-color: ${({ theme }) => theme.colors.statusDangerBorder};
    background: ${({ theme }) => theme.colors.statusDangerSurface};
    color: ${({ theme }) => theme.colors.statusDangerText};
  }

  &[data-tone="read"] {
    color: ${({ theme }) => theme.colors.gray10};
  }
`

const ActionList = styled.div`
  display: grid;
  gap: 0.55rem;
`

const ActionRowButton = styled.button`
  text-align: left;
  display: grid;
  gap: 0.16rem;
  padding: 0.82rem 0.88rem;
  border-radius: 14px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: transparent;
  color: ${({ theme }) => theme.colors.gray12};
  cursor: pointer;

  &:disabled {
    opacity: 0.56;
    cursor: not-allowed;
  }

  span {
    font-size: 0.88rem;
    font-weight: 760;
  }

  small {
    color: ${({ theme }) => theme.colors.gray10};
    line-height: 1.55;
  }
`

const FieldStack = styled.div`
  display: grid;
  gap: 0.72rem;
`

const FieldGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.82rem;

  .wide {
    grid-column: 1 / -1;
  }

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`

const FieldBox = styled.div`
  display: grid;
  gap: 0.4rem;
`

const FieldLabel = styled.label`
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.82rem;
  font-weight: 700;
`

const Input = styled.input`
  width: 100%;
  min-height: 44px;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray12};
  padding: 0.82rem 0.92rem;
  font-size: 0.95rem;
`

const TextArea = styled.textarea`
  width: 100%;
  min-height: 110px;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray12};
  padding: 0.82rem 0.92rem;
  font-size: 0.95rem;
  line-height: 1.6;
  resize: vertical;
`

const PrimaryButton = styled.button`
  min-height: 42px;
  padding: 0 0.95rem;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.accentControl};
  background: ${({ theme }) => theme.colors.accentControl};
  color: ${({ theme }) => theme.colors.accentControlText};
  font-size: 0.84rem;
  font-weight: 800;
  cursor: pointer;

  &:disabled {
    opacity: 0.56;
    cursor: not-allowed;
  }
`

const DangerPanel = styled.div`
  display: grid;
  gap: 0.9rem;
  padding: 0.96rem;
  border-radius: 18px;
  border: 1px solid ${({ theme }) => theme.colors.statusDangerBorder};
  background: rgba(239, 68, 68, 0.06);
`

const SandboxSection = styled.div`
  display: grid;
  gap: 0.65rem;
`

const SandboxHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.8rem;

  h3 {
    margin: 0;
    font-size: 0.94rem;
  }
`

const DangerActionRow = styled.div`
  display: grid;
  gap: 0.7rem;
  padding-top: 0.3rem;
  border-top: 1px solid ${({ theme }) => theme.colors.statusDangerBorder};
`

const ConfirmDeleteRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.55rem;
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.82rem;
  line-height: 1.5;

  input {
    width: 16px;
    height: 16px;
  }
`

const DangerButton = styled.button`
  width: fit-content;
  min-height: 42px;
  padding: 0 0.95rem;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.statusDangerBorder};
  background: transparent;
  color: ${({ theme }) => theme.colors.statusDangerText};
  font-size: 0.84rem;
  font-weight: 800;
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`

const ResultFilterRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
`

const ResultFilterButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  min-height: 36px;
  padding: 0 0.8rem;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.78rem;
  font-weight: 800;
  cursor: pointer;

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.74rem;
  }

  &[data-active="true"] {
    border-color: ${({ theme }) => theme.colors.accentBorder};
    background: ${({ theme }) => theme.colors.accentSurfaceSubtle};
    color: ${({ theme }) => theme.colors.accentLink};
  }
`

const ResultsLayout = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) 320px;
  gap: 0.9rem;

  @media (max-width: 1024px) {
    grid-template-columns: 1fr;
  }
`

const ResultPrimaryCard = styled.div`
  display: grid;
  gap: 0.8rem;
  padding: 0.96rem;
  border-radius: 18px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
`

const ResultTop = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.8rem;

  small {
    display: block;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.74rem;
    font-weight: 700;
    letter-spacing: 0.03em;
  }

  strong {
    display: block;
    margin-top: 0.18rem;
    font-size: 1.08rem;
    letter-spacing: -0.02em;
  }
`

const ResultBadgeRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.45rem;
`

const ResultMetaGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.65rem;

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
`

const ResultSummary = styled.p`
  margin: 0;
  color: ${({ theme }) => theme.colors.gray12};
  line-height: 1.65;
`

const ResultHistoryCard = styled.div`
  display: grid;
  gap: 0.7rem;
  padding: 0.96rem;
  border-radius: 18px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
`

const HistoryList = styled.div`
  display: grid;
  gap: 0.5rem;
`

const HistoryButton = styled.button`
  text-align: left;
  display: grid;
  gap: 0.14rem;
  padding: 0.72rem 0.8rem;
  border-radius: 14px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: transparent;
  color: ${({ theme }) => theme.colors.gray12};
  cursor: pointer;

  &[data-active="true"] {
    border-color: ${({ theme }) => theme.colors.accentBorder};
    background: ${({ theme }) => theme.colors.accentSurfaceSubtle};
  }

  span {
    font-size: 0.84rem;
    font-weight: 760;
  }

  small {
    color: ${({ theme }) => theme.colors.gray10};
  }
`

const ResultPanel = styled.pre`
  margin: 0 0.95rem 0.95rem;
  min-height: 180px;
  padding: 0.95rem;
  border-radius: 14px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
  color: ${({ theme }) => theme.colors.gray12};
  overflow: auto;
  line-height: 1.6;
  font-size: 0.82rem;
`

const EmptyResultState = styled.p`
  margin: 0;
  padding: 1rem;
  border-radius: 16px;
  border: 1px dashed ${({ theme }) => theme.colors.gray6};
  color: ${({ theme }) => theme.colors.gray10};
  line-height: 1.6;
`
