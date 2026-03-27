import styled from "@emotion/styled"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { GetServerSideProps, NextPage } from "next"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { apiFetch } from "src/apis/backend/client"
import { toFriendlyApiMessage } from "src/apis/backend/errorMessages"
import useAuthSession from "src/hooks/useAuthSession"
import { AdminPageProps, getAdminPageProps } from "src/libs/server/adminPage"

export const getServerSideProps: GetServerSideProps<AdminPageProps> = async ({ req }) => {
  return await getAdminPageProps(req)
}

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

type SystemHealthPayload = {
  status?: string
  details?: Record<string, unknown>
  [key: string]: unknown
}

type PageDto<T> = {
  content?: T[]
}

type ActionCardTone = "read" | "write" | "danger" | "infra"
type InlineNoticeTone = "warning" | "danger" | "success"
type DiagnosticTab = "mail" | "queue" | "cleanup" | "auth"
type ExecutionDomain = "overview" | "monitoring" | "diagnostics" | "execution" | "mutation"

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
const SECTION_IDS = {
  overview: "ops-overview",
  monitoring: "ops-monitoring",
  diagnostics: "ops-diagnostics",
  execution: "ops-execution",
  mutation: "ops-mutation",
  results: "ops-results",
} as const

type SectionKey = keyof typeof SECTION_IDS

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

const AdminToolsPage: NextPage<AdminPageProps> = ({ initialMember }) => {
  const queryClient = useQueryClient()
  const { me, authStatus } = useAuthSession()
  const sessionMember = authStatus === "loading" || authStatus === "unavailable" ? initialMember : me
  const [loadingKey, setLoadingKey] = useState("")
  const [executions, setExecutions] = useState<ExecutionEntry[]>([])
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(null)
  const [postId, setPostId] = useState("1")
  const [commentId, setCommentId] = useState("1")
  const [commentContent, setCommentContent] = useState("운영 테스트 댓글")
  const [mailDiagnostics, setMailDiagnostics] = useState<SignupMailDiagnostics | null>(null)
  const [mailDiagnosticsError, setMailDiagnosticsError] = useState("")
  const [taskQueueDiagnostics, setTaskQueueDiagnostics] = useState<TaskQueueDiagnostics | null>(null)
  const [taskQueueDiagnosticsError, setTaskQueueDiagnosticsError] = useState("")
  const [cleanupDiagnostics, setCleanupDiagnostics] = useState<UploadedFileCleanupDiagnostics | null>(null)
  const [cleanupDiagnosticsError, setCleanupDiagnosticsError] = useState("")
  const [authSecurityEvents, setAuthSecurityEvents] = useState<AuthSecurityEvent[]>([])
  const [authSecurityEventsError, setAuthSecurityEventsError] = useState("")
  const [dashboardOpen, setDashboardOpen] = useState(false)
  const [, setIsMobileLayout] = useState(false)
  const [activeSection, setActiveSection] = useState<SectionKey>("overview")
  const [activeDiagnosticTab, setActiveDiagnosticTab] = useState<DiagnosticTab>("mail")
  const [testEmail, setTestEmail] = useState("")
  const [mailTestNotice, setMailTestNotice] = useState<{ tone: InlineNoticeTone; text: string }>({
    tone: "warning",
    text: "",
  })
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [advancedToolsOpen, setAdvancedToolsOpen] = useState(false)
  const defaultUptimeStatusPath = process.env.NEXT_PUBLIC_UPTIME_KUMA_STATUS_PATH?.trim() || "/status/aquila"
  const monitoringEmbedUrl =
    process.env.NEXT_PUBLIC_MONITORING_EMBED_URL?.trim() ||
    process.env.NEXT_PUBLIC_GRAFANA_EMBED_URL?.trim() ||
    defaultUptimeStatusPath
  const monitoringEmbedLooksLikeGrafana =
    monitoringEmbedUrl.includes("grafana") ||
    monitoringEmbedUrl.includes("/d/") ||
    monitoringEmbedUrl.includes("/public-dashboards/")
  const uptimeKumaUrl = process.env.NEXT_PUBLIC_UPTIME_KUMA_URL?.trim() || defaultUptimeStatusPath
  const prometheusUrl = process.env.NEXT_PUBLIC_PROMETHEUS_URL?.trim() || ""
  const systemHealthQuery = useQuery({
    queryKey: SYSTEM_HEALTH_QUERY_KEY,
    queryFn: async (): Promise<SystemHealthPayload> => apiFetch<SystemHealthPayload>("/system/api/v1/adm/health"),
    enabled: Boolean(sessionMember?.isAdmin),
    staleTime: HEALTH_CACHE_MS,
    gcTime: 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  })

  const fetchSystemHealthCached = async () =>
    queryClient.fetchQuery<SystemHealthPayload>({
      queryKey: SYSTEM_HEALTH_QUERY_KEY,
      queryFn: () => apiFetch<SystemHealthPayload>("/system/api/v1/adm/health"),
      staleTime: HEALTH_CACHE_MS,
    })

  const pushExecution = (key: string, status: "success" | "error", payload: JsonValue, startedAt: string) => {
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
      const next = [entry, ...prev].slice(0, 6)
      return next
    })
    setSelectedExecutionId(entry.id)
  }

  const executeAction = async <T extends JsonValue>(
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
  }

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

  const fetchSignupMailDiagnostics = async (checkConnection = false) => {
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
  }

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

  const fetchTaskQueueDiagnostics = async () => {
    await executeAction("taskQueueStatus", () => apiFetch<TaskQueueDiagnostics>("/system/api/v1/adm/tasks"), {
      onSuccess: (diagnostics) => {
        setTaskQueueDiagnosticsError("")
        setTaskQueueDiagnostics(diagnostics)
      },
      onError: (message) => {
        setTaskQueueDiagnosticsError(message)
      },
    })
  }

  const fetchCleanupDiagnostics = async () => {
    await executeAction("cleanupStatus", () => apiFetch<UploadedFileCleanupDiagnostics>("/system/api/v1/adm/storage/cleanup"), {
      onSuccess: (diagnostics) => {
        setCleanupDiagnosticsError("")
        setCleanupDiagnostics(diagnostics)
      },
      onError: (message) => {
        setCleanupDiagnosticsError(message)
      },
    })
  }

  const fetchAuthSecurityEvents = async () => {
    await executeAction("authSecurityEvents", () => apiFetch<AuthSecurityEvent[]>("/system/api/v1/adm/auth/security-events?limit=30"), {
      onSuccess: (events) => {
        setAuthSecurityEventsError("")
        setAuthSecurityEvents(events)
      },
      onError: (message) => {
        setAuthSecurityEventsError(message)
      },
    })
  }

  useEffect(() => {
    void (async () => {
      const [mailResult, taskResult, cleanupResult, authEventsResult, publicPostsResult, adminPostsResult] = await Promise.allSettled([
        apiFetch<SignupMailDiagnostics>("/system/api/v1/adm/mail/signup"),
        apiFetch<TaskQueueDiagnostics>("/system/api/v1/adm/tasks"),
        apiFetch<UploadedFileCleanupDiagnostics>("/system/api/v1/adm/storage/cleanup"),
        apiFetch<AuthSecurityEvent[]>("/system/api/v1/adm/auth/security-events?limit=30"),
        apiFetch<PageDto<{ id: number }>>("/post/api/v1/posts?page=1&pageSize=1&sort=CREATED_AT"),
        apiFetch<PageDto<{ id: number }>>("/post/api/v1/adm/posts?page=1&pageSize=1&sort=CREATED_AT"),
      ])

      if (mailResult.status === "fulfilled") setMailDiagnostics(mailResult.value)
      if (taskResult.status === "fulfilled") setTaskQueueDiagnostics(taskResult.value)
      if (cleanupResult.status === "fulfilled") setCleanupDiagnostics(cleanupResult.value)
      if (authEventsResult.status === "fulfilled") setAuthSecurityEvents(authEventsResult.value)
      const firstPublicPostId = publicPostsResult.status === "fulfilled" ? publicPostsResult.value.content?.[0]?.id : undefined
      const firstAdminPostId = adminPostsResult.status === "fulfilled" ? adminPostsResult.value.content?.[0]?.id : undefined
      const seedPostId = firstPublicPostId ?? firstAdminPostId
      if (seedPostId != null) setPostId(String(seedPostId))
    })()
  }, [])

  useEffect(() => {
    if (!dashboardOpen) return

    const onWindowError = (event: ErrorEvent) => {
      const message = event.message || ""
      if (!message.includes("Failed to read a named property 'scrollY' from 'Window'")) return
      event.preventDefault()
    }

    window.addEventListener("error", onWindowError)
    return () => window.removeEventListener("error", onWindowError)
  }, [dashboardOpen])

  useEffect(() => {
    if (typeof window === "undefined") return
    const media = window.matchMedia("(max-width: 960px)")
    const sync = () => setIsMobileLayout(media.matches)
    sync()
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", sync)
      return () => media.removeEventListener("change", sync)
    }
    media.addListener(sync)
    return () => media.removeListener(sync)
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return

    const observer = new IntersectionObserver(
      (entries) => {
        const next = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (!next) return
        const section = next.target.getAttribute("data-ops-section") as SectionKey | null
        if (section) setActiveSection(section)
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

  const selectedExecution = useMemo(() => {
    if (!executions.length) return null
    return executions.find((entry) => entry.id === selectedExecutionId) ?? executions[0]
  }, [executions, selectedExecutionId])

  const systemHealthStatus = systemHealthQuery.data?.status || "UNKNOWN"
  const systemHealthSummary = getSystemHealthSummary(systemHealthQuery.data ?? null)
  const systemHealthFetchedAt = systemHealthQuery.dataUpdatedAt ? formatInstant(new Date(systemHealthQuery.dataUpdatedAt).toISOString()) : "-"
  const mailStatusLabel =
    mailDiagnostics?.status === "READY"
      ? "정상"
      : mailDiagnostics?.status === "CONNECTION_FAILED"
        ? "오류"
        : mailDiagnostics?.status === "MISCONFIGURED"
          ? "확인 필요"
          : "미확인"
  const mailStatusMessage =
    mailDiagnostics?.status === "READY"
      ? "회원가입 메일 발송 준비가 완료된 상태입니다."
      : mailDiagnostics?.status === "CONNECTION_FAILED"
        ? "SMTP 연결 단계에서 실패했습니다. 호스트, 계정, 앱 비밀번호를 확인하세요."
        : mailDiagnostics?.status === "MISCONFIGURED"
          ? "필수 메일 설정이 누락되어 있습니다."
          : "메일 진단 정보를 불러오는 중입니다."
  const queueStatusLabel =
    taskQueueDiagnostics?.staleProcessingCount && taskQueueDiagnostics.staleProcessingCount > 0
      ? "오류"
      : taskQueueDiagnostics?.failedCount && taskQueueDiagnostics.failedCount > 0
        ? "확인 필요"
        : taskQueueDiagnostics
          ? "정상"
          : "미확인"
  const queueHealthMessage =
    taskQueueDiagnostics?.staleProcessingCount && taskQueueDiagnostics.staleProcessingCount > 0
      ? `stale processing ${taskQueueDiagnostics.staleProcessingCount}건 감지`
      : taskQueueDiagnostics?.failedCount && taskQueueDiagnostics.failedCount > 0
        ? `최근 실패 ${taskQueueDiagnostics.failedCount}건`
        : "현재 큐는 안정 상태입니다."
  const cleanupStatusLabel = cleanupDiagnostics?.blockedBySafetyThreshold ? "확인 필요" : cleanupDiagnostics ? "정상" : "미확인"
  const cleanupHealthMessage = cleanupDiagnostics?.blockedBySafetyThreshold
    ? "safety threshold 초과로 purge가 보류되어 있습니다."
    : "safety threshold 내에서 purge가 가능합니다."
  const authSecurityStatusLabel =
    authSecurityEvents.length > 0
      ? authSecurityEvents[0]?.eventType === "IP_SECURITY_MISMATCH_BLOCKED"
        ? "확인 필요"
        : "최근 기록"
      : "정상"
  const authSecurityHealthMessage =
    authSecurityEvents[0]?.eventType === "IP_SECURITY_MISMATCH_BLOCKED"
      ? "최근 IP 보안 차단 이벤트가 감지되었습니다."
      : authSecurityEvents.length > 0
        ? "최근 인증 보안 기록이 있습니다."
        : "최근 인증 보안 이상 징후가 없습니다."

  const recentCheckedLabel = useMemo(() => {
    const values = [
      systemHealthQuery.dataUpdatedAt ? new Date(systemHealthQuery.dataUpdatedAt).toISOString() : null,
      mailDiagnostics?.checkedAt ?? null,
      taskQueueDiagnostics ? new Date().toISOString() : null,
      cleanupDiagnostics ? new Date().toISOString() : null,
      authSecurityEvents[0]?.createdAt ?? null,
    ]
      .filter((value): value is string => Boolean(value))
      .sort()

    return values.length ? formatInstant(values[values.length - 1]) : "-"
  }, [systemHealthQuery.dataUpdatedAt, mailDiagnostics?.checkedAt, taskQueueDiagnostics, cleanupDiagnostics, authSecurityEvents])

  const overviewStatusLabel =
    systemHealthStatus !== "UP" || mailDiagnostics?.status === "CONNECTION_FAILED"
      ? "오류"
      : mailDiagnostics?.status === "MISCONFIGURED" ||
          (taskQueueDiagnostics?.staleProcessingCount ?? 0) > 0 ||
          (taskQueueDiagnostics?.failedCount ?? 0) > 0 ||
          Boolean(cleanupDiagnostics?.blockedBySafetyThreshold) ||
          authSecurityEvents[0]?.eventType === "IP_SECURITY_MISMATCH_BLOCKED"
        ? "확인 필요"
        : "정상"

  const statusCards = [
    {
      label: "서버 상태",
      status: systemHealthStatus === "UP" ? "정상" : "오류",
      detail: systemHealthSummary[0] || `최근 확인 ${systemHealthFetchedAt}`,
      section: "monitoring" as SectionKey,
    },
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

  const attentionItems = [
    systemHealthStatus !== "UP" ? "서비스 상태를 먼저 확인하세요." : null,
    mailDiagnostics?.status === "MISCONFIGURED" ? "메일 설정 누락을 정리해야 합니다." : null,
    mailDiagnostics?.status === "CONNECTION_FAILED" ? "SMTP 연결 실패 원인을 확인해야 합니다." : null,
    (taskQueueDiagnostics?.staleProcessingCount ?? 0) > 0 ? "작업 큐에 stale processing이 남아 있습니다." : null,
    (taskQueueDiagnostics?.failedCount ?? 0) > 0 ? "최근 실패한 작업이 있어 재처리 여부를 검토해야 합니다." : null,
    cleanupDiagnostics?.blockedBySafetyThreshold ? "파일 정리 purge가 safety threshold 때문에 보류되어 있습니다." : null,
    authSecurityEvents[0]?.eventType === "IP_SECURITY_MISMATCH_BLOCKED" ? "최근 IP 보안 차단 이벤트를 검토하세요." : null,
  ]
    .filter((item): item is string => Boolean(item))
    .slice(0, 3)

  const focusSection = (section: SectionKey, tab?: DiagnosticTab) => {
    if (tab) setActiveDiagnosticTab(tab)
    setActiveSection(section)
    const target = document.getElementById(SECTION_IDS[section])
    if (target) {
      requestAnimationFrame(() => {
        target.scrollIntoView({ behavior: "smooth", block: "start" })
      })
    }
  }

  if (!sessionMember) return null

  const isBusy = Boolean(loadingKey)
  const monitoringItems = [
    uptimeKumaUrl
      ? {
          key: "uptime",
          icon: "UK",
          title: "Uptime Kuma",
          description: "실시간 가용성과 상태 페이지를 확인합니다.",
          href: uptimeKumaUrl,
          status: systemHealthStatus === "UP" ? "정상" : "확인 필요",
        }
      : null,
    prometheusUrl
      ? {
          key: "prometheus",
          icon: "PM",
          title: "Prometheus",
          description: "메트릭 쿼리와 시계열 지표를 확인합니다.",
          href: prometheusUrl,
          status: "외부 대시보드",
        }
      : null,
    monitoringEmbedUrl
      ? {
          key: "grafana",
          icon: "GR",
          title: monitoringEmbedLooksLikeGrafana ? "Grafana" : "대시보드",
          description: monitoringEmbedLooksLikeGrafana ? "운영 대시보드와 장기 추이를 확인합니다." : "임베드 대시보드를 확인합니다.",
          href: monitoringEmbedUrl,
          status: monitoringEmbedLooksLikeGrafana ? "장기 추이 분석" : "외부 대시보드",
        }
      : null,
  ].filter((item): item is NonNullable<typeof item> => Boolean(item))

  return (
    <Main>
      <OpsOverview id={SECTION_IDS.overview} data-ops-section="overview">
        <OverviewHeader>
          <div>
            <h1>운영 센터</h1>
            <p>현재 상태, 진단, 실데이터 테스트를 한곳에서 관리합니다.</p>
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
          <Link href="/admin/posts" passHref legacyBehavior>
            <NavLink>글 작업 공간</NavLink>
          </Link>
        </HeaderLinks>

        <OverviewContent>
          <FeaturedStatusCard type="button" onClick={() => focusSection("monitoring")}>
            <CardEyebrow>서비스 상태</CardEyebrow>
            <CardMainLine>
              <strong>{systemHealthStatus === "UP" ? "정상" : systemHealthStatus}</strong>
              <StatusDot data-tone={systemHealthStatus === "UP" ? "success" : "danger"} />
            </CardMainLine>
            <CardDetail>{systemHealthSummary[0] || `최근 확인 ${systemHealthFetchedAt}`}</CardDetail>
          </FeaturedStatusCard>

          <StatusCardGrid>
            {statusCards.slice(1).map((card) => (
              <StatusCardButton key={card.label} type="button" onClick={() => focusSection(card.section, card.tab)}>
                <small>{card.label}</small>
                <strong>{card.status}</strong>
                <span>{card.detail}</span>
              </StatusCardButton>
            ))}
          </StatusCardGrid>
        </OverviewContent>

        <AttentionRow>
          <SectionTitleBlock>
            <h2>주의 필요</h2>
            <p>{attentionItems.length ? "바로 확인할 항목만 추렸습니다." : "즉시 확인이 필요한 항목은 없습니다."}</p>
          </SectionTitleBlock>
          <AttentionList>
            {attentionItems.length ? (
              attentionItems.map((item) => <AttentionItem key={item}>{item}</AttentionItem>)
            ) : (
              <CalmMessage>현재 상태 기준으로 즉시 대응이 필요한 항목은 없습니다.</CalmMessage>
            )}
          </AttentionList>
        </AttentionRow>
      </OpsOverview>

      <WorkspaceShell>
        <SectionNav aria-label="운영 섹션">
          {([
            { key: "overview", label: "개요" },
            { key: "monitoring", label: "모니터링" },
            { key: "diagnostics", label: "진단" },
            { key: "execution", label: "실행" },
            { key: "mutation", label: "실데이터 테스트", tone: "danger" },
            { key: "results", label: "최근 실행 결과" },
          ] as Array<{ key: SectionKey; label: string; tone?: "danger" }>).map((item) => (
            <SectionNavButton
              key={item.key}
              type="button"
              data-active={activeSection === item.key}
              data-tone={item.tone || "default"}
              onClick={() => focusSection(item.key)}
            >
              {item.label}
            </SectionNavButton>
          ))}
        </SectionNav>

        <WorkspaceColumn>
          <WorkspaceSection id={SECTION_IDS.monitoring} data-ops-section="monitoring">
            <SectionHeading>
              <SectionTitleBlock>
                <h2>모니터링</h2>
                <p>외부 관측 도구는 별도 launchpad로 모아둡니다.</p>
              </SectionTitleBlock>
              <StatusBadge data-tone={systemHealthStatus === "UP" ? "success" : "warning"}>
                {systemHealthStatus === "UP" ? "정상" : "확인 필요"}
              </StatusBadge>
            </SectionHeading>

            <MonitoringGrid>
              {monitoringItems.map((item) => (
                <MonitoringCard key={item.key}>
                  <ToolIcon>{item.icon}</ToolIcon>
                  <MonitoringCopy>
                    <strong>{item.title}</strong>
                    <span>{item.description}</span>
                  </MonitoringCopy>
                  <MonitoringMeta>
                    <ToolStatus>{item.status}</ToolStatus>
                    <LaunchLink href={item.href} target="_blank" rel="noreferrer noopener">
                      {item.title} 열기
                    </LaunchLink>
                  </MonitoringMeta>
                </MonitoringCard>
              ))}
            </MonitoringGrid>

            {monitoringEmbedUrl ? (
              <DetailsPanel open={dashboardOpen}>
                <DetailsSummary onClick={(event) => {
                  event.preventDefault()
                  setDashboardOpen((prev) => !prev)
                }}>
                  <span>대시보드 보기</span>
                  <small>{dashboardOpen ? "숨기기" : "열기"}</small>
                </DetailsSummary>
                {dashboardOpen ? (
                  <MonitoringFrame
                    src={monitoringEmbedUrl}
                    loading="lazy"
                    title="Monitoring Dashboard"
                    referrerPolicy="no-referrer"
                  />
                ) : null}
              </DetailsPanel>
            ) : null}
          </WorkspaceSection>

          <WorkspaceSection id={SECTION_IDS.diagnostics} data-ops-section="diagnostics">
            <SectionHeading>
              <SectionTitleBlock>
                <h2>진단</h2>
                <p>한 번에 하나의 도메인만 집중해서 확인합니다.</p>
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
                    <span>{mailStatusMessage}</span>
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

                <MetricGrid>
                  <MetricCard>
                    <small>상태</small>
                    <strong>{mailDiagnostics?.status || "미확인"}</strong>
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

                {!!mailDiagnostics?.missing.length && <InlineNotice data-tone="warning">누락된 설정: {mailDiagnostics.missing.join(", ")}</InlineNotice>}
                {!!mailDiagnostics?.connectionError && <InlineNotice data-tone="danger">{mailDiagnostics.connectionError}</InlineNotice>}
                {!!mailDiagnosticsError && <InlineNotice data-tone="danger">{mailDiagnosticsError}</InlineNotice>}

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
              </DiagnosticPanel>
            ) : null}

            {activeDiagnosticTab === "queue" ? (
              <DiagnosticPanel>
                <DiagnosticHeader>
                  <div>
                    <strong>작업 큐 진단</strong>
                    <span>{queueHealthMessage}</span>
                  </div>
                  <ActionRow>
                    <QuietButton type="button" disabled={isBusy} onClick={() => void fetchTaskQueueDiagnostics()}>
                      다시 확인
                    </QuietButton>
                  </ActionRow>
                </DiagnosticHeader>

                <MetricGrid>
                  <MetricCard>
                    <small>ready</small>
                    <strong>{taskQueueDiagnostics?.readyPendingCount ?? "-"}</strong>
                  </MetricCard>
                  <MetricCard>
                    <small>processing</small>
                    <strong>{taskQueueDiagnostics?.processingCount ?? "-"}</strong>
                  </MetricCard>
                  <MetricCard>
                    <small>최근 실패</small>
                    <strong>{taskQueueDiagnostics?.failedCount ?? "-"}</strong>
                  </MetricCard>
                  <MetricCard>
                    <small>stale</small>
                    <strong>{taskQueueDiagnostics?.staleProcessingCount ?? "-"}</strong>
                  </MetricCard>
                </MetricGrid>

                {!!taskQueueDiagnosticsError && <InlineNotice data-tone="danger">{taskQueueDiagnosticsError}</InlineNotice>}

                {taskQueueDiagnostics ? (
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
                ) : null}

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
                    <span>{cleanupHealthMessage}</span>
                  </div>
                  <ActionRow>
                    <QuietButton type="button" disabled={isBusy} onClick={() => void fetchCleanupDiagnostics()}>
                      다시 확인
                    </QuietButton>
                  </ActionRow>
                </DiagnosticHeader>

                <MetricGrid>
                  <MetricCard>
                    <small>TEMP</small>
                    <strong>{cleanupDiagnostics?.tempCount ?? "-"}</strong>
                  </MetricCard>
                  <MetricCard>
                    <small>PENDING_DELETE</small>
                    <strong>{cleanupDiagnostics?.pendingDeleteCount ?? "-"}</strong>
                  </MetricCard>
                  <MetricCard>
                    <small>purge 후보</small>
                    <strong>{cleanupDiagnostics?.eligibleForPurgeCount ?? "-"}</strong>
                  </MetricCard>
                  <MetricCard>
                    <small>threshold</small>
                    <strong>{cleanupDiagnostics?.cleanupSafetyThreshold ?? "-"}</strong>
                  </MetricCard>
                </MetricGrid>

                {!!cleanupDiagnosticsError && <InlineNotice data-tone="danger">{cleanupDiagnosticsError}</InlineNotice>}
                {!!cleanupDiagnostics?.sampleEligibleObjectKeys.length && (
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
              </DiagnosticPanel>
            ) : null}

            {activeDiagnosticTab === "auth" ? (
              <DiagnosticPanel>
                <DiagnosticHeader>
                  <div>
                    <strong>인증 보안 기록</strong>
                    <span>{authSecurityHealthMessage}</span>
                  </div>
                  <ActionRow>
                    <QuietButton type="button" disabled={isBusy} onClick={() => void fetchAuthSecurityEvents()}>
                      다시 확인
                    </QuietButton>
                  </ActionRow>
                </DiagnosticHeader>

                {!!authSecurityEventsError && <InlineNotice data-tone="danger">{authSecurityEventsError}</InlineNotice>}

                {authSecurityEvents.length > 0 ? (
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
                ) : (
                  <CalmMessage>최근 인증 보안 기록이 없습니다.</CalmMessage>
                )}
              </DiagnosticPanel>
            ) : null}
          </WorkspaceSection>

          <WorkspaceSection id={SECTION_IDS.execution} data-ops-section="execution">
            <SectionHeading>
              <SectionTitleBlock>
                <h2>실행</h2>
                <p>읽기 전용 점검과 운영성 실행만 분리해서 둡니다.</p>
              </SectionTitleBlock>
            </SectionHeading>

            <ExecutionGrid>
              <ActionGroupCard>
                <CardSectionHeading>
                  <div>
                    <h3>읽기 전용 실행</h3>
                    <p>상태 확인과 단순 조회만 실행합니다.</p>
                  </div>
                  <ReadonlyPill>읽기 전용</ReadonlyPill>
                </CardSectionHeading>
                <ActionList>
                  <ActionRowButton type="button" disabled={isBusy} onClick={() => void executeAction("systemHealth", () => fetchSystemHealthCached())}>
                    <span>서비스 상태 조회</span>
                    <small>최근 상태를 다시 가져옵니다</small>
                  </ActionRowButton>
                  <ActionRowButton type="button" disabled={isBusy} onClick={() => void executeAction("admPostCount", () => apiFetch("/post/api/v1/adm/posts/count"))}>
                    <span>전체 글 수 확인</span>
                    <small>관리자 기준 총 게시글 수를 확인합니다</small>
                  </ActionRowButton>
                </ActionList>
              </ActionGroupCard>

              <ActionGroupCard>
                <CardSectionHeading>
                  <div>
                    <h3>메일 발송 확인</h3>
                    <p>운영 메일이 실제로 전달되는지 최소 범위로 점검합니다.</p>
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
                <p>이 영역은 실제 데이터에 영향을 주는 작업만 다룹니다.</p>
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
                    <small>대상 글의 전체 댓글 트리를 불러옵니다</small>
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
                    <small>삭제 전에 대상 댓글을 다시 확인합니다</small>
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
                    <small>입력한 내용을 새 댓글로 생성합니다</small>
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
                    <small>대상 댓글의 내용을 현재 입력값으로 바꿉니다</small>
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
                <p>방금 실행한 작업과 최근 기록을 같은 자리에서 확인합니다.</p>
              </SectionTitleBlock>
            </SectionHeading>

            {selectedExecution ? (
              <ResultsLayout>
                <ResultPrimaryCard>
                  <ResultTop>
                    <div>
                      <small>방금 실행한 작업</small>
                      <strong>{selectedExecution.source}</strong>
                    </div>
                    <ActionToneBadge data-tone={selectedExecution.status === "error" ? "danger" : selectedExecution.tone === "danger" ? "danger" : selectedExecution.tone === "write" ? "write" : "read"}>
                      {selectedExecution.status === "error" ? "실패" : "성공"}
                    </ActionToneBadge>
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
                      <p>최대 5건까지 유지합니다.</p>
                    </div>
                  </CardSectionHeading>
                  <HistoryList>
                    {executions.map((entry) => (
                      <HistoryButton
                        key={entry.id}
                        type="button"
                        data-active={selectedExecution.id === entry.id}
                        onClick={() => setSelectedExecutionId(entry.id)}
                      >
                        <span>{entry.source}</span>
                        <small>
                          {entry.status === "error" ? "실패" : "성공"} · {formatInstant(entry.completedAt)}
                        </small>
                      </HistoryButton>
                    ))}
                  </HistoryList>
                </ResultHistoryCard>
              </ResultsLayout>
            ) : (
              <EmptyResultState>아직 실행한 작업이 없습니다. 상태 카드나 진단 섹션에서 확인을 시작하세요.</EmptyResultState>
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
  width: 0.72rem;
  height: 0.72rem;
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

const AttentionRow = styled.div`
  display: grid;
  gap: 0.72rem;
  padding-top: 0.2rem;
  border-top: 1px solid ${({ theme }) => theme.colors.gray5};
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

const AttentionList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
`

const AttentionItem = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  min-height: 36px;
  padding: 0 0.8rem;
  border-radius: 999px;
  background: ${({ theme }) => theme.colors.indigo3};
  border: 1px solid ${({ theme }) => theme.colors.indigo8};
  color: ${({ theme }) => theme.colors.indigo11};
  font-size: 0.8rem;
  font-weight: 700;
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

const SectionNavButton = styled.button`
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

const MonitoringGrid = styled.div`
  display: grid;
  gap: 0.7rem;
`

const MonitoringCard = styled.article`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 0.85rem;
  align-items: center;
  padding: 0.9rem 0.95rem;
  border-radius: 16px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};

  @media (max-width: 760px) {
    grid-template-columns: auto 1fr;
  }
`

const ToolIcon = styled.div`
  width: 2.4rem;
  height: 2.4rem;
  border-radius: 12px;
  display: grid;
  place-items: center;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
  color: ${({ theme }) => theme.colors.gray12};
  font-size: 0.8rem;
  font-weight: 800;
  letter-spacing: 0.04em;
`

const MonitoringCopy = styled.div`
  display: grid;
  gap: 0.2rem;
  min-width: 0;

  strong {
    font-size: 0.95rem;
  }

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.82rem;
    line-height: 1.5;
  }
`

const MonitoringMeta = styled.div`
  display: grid;
  gap: 0.4rem;
  justify-items: end;

  @media (max-width: 760px) {
    grid-column: 1 / -1;
    justify-items: start;
  }
`

const ToolStatus = styled.span`
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.78rem;
  font-weight: 700;
`

const LaunchLink = styled.a`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 36px;
  padding: 0 0.82rem;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.82rem;
  font-weight: 700;
  text-decoration: none;

  &:hover {
    border-color: ${({ theme }) => theme.colors.gray7};
    color: ${({ theme }) => theme.colors.gray12};
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

const MonitoringFrame = styled.iframe`
  width: calc(100% - 1.2rem);
  min-height: 420px;
  margin: 0 0.6rem 0.8rem;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 14px;
  background: transparent;
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

const ActionRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
`

const QuietButton = styled.button`
  min-height: 36px;
  padding: 0 0.8rem;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
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
