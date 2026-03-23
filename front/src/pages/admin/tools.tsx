import styled from "@emotion/styled"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { GetServerSideProps, NextPage } from "next"
import Link from "next/link"
import { useEffect, useState } from "react"
import { apiFetch } from "src/apis/backend/client"
import { toFriendlyApiMessage } from "src/apis/backend/errorMessages"
import useAuthSession from "src/hooks/useAuthSession"
import { AdminPageProps, getAdminPageProps } from "src/libs/server/adminPage"

export const getServerSideProps: GetServerSideProps<AdminPageProps> = async ({ req }) => {
  return await getAdminPageProps(req)
}

type JsonValue = Record<string, unknown> | unknown[] | string | number | boolean | null

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

const ACTION_LABELS: Record<string, string> = {
  commentList: "댓글 목록 조회",
  commentOne: "댓글 단건 조회",
  commentWrite: "댓글 작성",
  commentModify: "댓글 수정",
  commentDelete: "댓글 삭제",
  admPostCount: "전체 글 개수 확인",
  systemHealth: "서버 상태 조회",
  mailStatus: "메일 준비 상태 새로고침",
  mailConnectivity: "SMTP 연결 확인",
  mailTest: "테스트 메일 발송",
  taskQueueStatus: "Task Queue 진단 새로고침",
  cleanupStatus: "파일 정리 진단 새로고침",
  authSecurityEvents: "인증 보안 이벤트 새로고침",
}

const QUICK_GUIDES = [
  {
    icon: "💬",
    title: "댓글 API 테스트",
    description: "조회/작성/수정/삭제를 즉시 점검합니다. 작성·수정·삭제는 실제 데이터가 바뀝니다.",
  },
  {
    icon: "📧",
    title: "회원가입 메일 진단",
    description: "SMTP 설정 누락, 연결 실패, 테스트 메일 발송 결과를 한 번에 확인합니다.",
  },
  {
    icon: "⚙️",
    title: "Task Queue 모니터링",
    description: "revalidate·메일 작업의 적체, 실패, stale processing을 진단합니다.",
  },
  {
    icon: "🧹",
    title: "스토리지 정리 상태",
    description: "purge 후보와 safety threshold를 확인해 과삭제 리스크를 빠르게 파악합니다.",
  },
  {
    icon: "🔐",
    title: "인증 보안 이벤트",
    description: "로그인 정책 적용과 IP 보안 차단 이벤트를 최근 내역으로 확인합니다.",
  },
] as const

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

const SYSTEM_HEALTH_QUERY_KEY = ["admin", "tools", "system-health"] as const
const HEALTH_CACHE_MS = 10_000

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

const AdminToolsPage: NextPage<AdminPageProps> = ({ initialMember }) => {
  const queryClient = useQueryClient()
  const { me, authStatus } = useAuthSession()
  const sessionMember = authStatus === "loading" || authStatus === "unavailable" ? initialMember : me
  const [dashboardOpen, setDashboardOpen] = useState(false)
  const [loadingKey, setLoadingKey] = useState("")
  const [result, setResult] = useState("")
  const [lastActionLabel, setLastActionLabel] = useState("")
  const [postId, setPostId] = useState("1")
  const [commentId, setCommentId] = useState("1")
  const [commentContent, setCommentContent] = useState("운영 도구 댓글 테스트")
  const [mailDiagnostics, setMailDiagnostics] = useState<SignupMailDiagnostics | null>(null)
  const [mailDiagnosticsError, setMailDiagnosticsError] = useState("")
  const [taskQueueDiagnostics, setTaskQueueDiagnostics] = useState<TaskQueueDiagnostics | null>(null)
  const [taskQueueDiagnosticsError, setTaskQueueDiagnosticsError] = useState("")
  const [cleanupDiagnostics, setCleanupDiagnostics] = useState<UploadedFileCleanupDiagnostics | null>(null)
  const [cleanupDiagnosticsError, setCleanupDiagnosticsError] = useState("")
  const [authSecurityEvents, setAuthSecurityEvents] = useState<AuthSecurityEvent[]>([])
  const [authSecurityEventsError, setAuthSecurityEventsError] = useState("")
  const [taskQueuePanelOpen, setTaskQueuePanelOpen] = useState(false)
  const [cleanupPanelOpen, setCleanupPanelOpen] = useState(false)
  const [isMobileLayout, setIsMobileLayout] = useState(false)
  const [advancedPanelsOpen, setAdvancedPanelsOpen] = useState(true)
  const [testEmail, setTestEmail] = useState("")
  const [mailTestNotice, setMailTestNotice] = useState<{ tone: InlineNoticeTone; text: string }>({
    tone: "warning",
    text: "",
  })
  const defaultUptimeStatusPath = process.env.NEXT_PUBLIC_UPTIME_KUMA_STATUS_PATH?.trim() || "/status/aquila"
  const monitoringEmbedUrl =
    process.env.NEXT_PUBLIC_MONITORING_EMBED_URL?.trim() ||
    process.env.NEXT_PUBLIC_GRAFANA_EMBED_URL?.trim() ||
    defaultUptimeStatusPath
  const uptimeKumaUrl = process.env.NEXT_PUBLIC_UPTIME_KUMA_URL?.trim() || defaultUptimeStatusPath
  const prometheusUrl = process.env.NEXT_PUBLIC_PROMETHEUS_URL?.trim() || ""
  const monitoringEmbedIsCrossOrigin =
    typeof window !== "undefined" &&
    (() => {
      try {
        return new URL(monitoringEmbedUrl, window.location.href).origin !== window.location.origin
      } catch {
        return false
      }
    })()

  const systemHealthQuery = useQuery({
    queryKey: SYSTEM_HEALTH_QUERY_KEY,
    queryFn: async (): Promise<SystemHealthPayload> =>
      apiFetch<SystemHealthPayload>("/system/api/v1/adm/health"),
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

  const run = async (key: string, fn: () => Promise<JsonValue>) => {
    try {
      setLoadingKey(key)
      setLastActionLabel(ACTION_LABELS[key] || key)
      const data = await fn()
      setResult(pretty(data))
    } catch (error) {
      const message = toFriendlyApiMessage(error, "요청 처리 중 오류가 발생했습니다.")
      setResult(pretty({ error: message }))
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
      throw new Error("comment content는 2자 이상 입력해주세요.")
    }
    return content
  }

  const fetchSignupMailDiagnostics = async (checkConnection = false) => {
    try {
      const actionKey = checkConnection ? "mailConnectivity" : "mailStatus"
      setLoadingKey(actionKey)
      setLastActionLabel(ACTION_LABELS[actionKey] || actionKey)
      setMailDiagnosticsError("")
      setMailTestNotice((prev) => ({ ...prev, text: "" }))
      const diagnostics = await apiFetch<SignupMailDiagnostics>(
        `/system/api/v1/adm/mail/signup${checkConnection ? "?checkConnection=true" : ""}`
      )
      setMailDiagnostics(diagnostics)
      setResult(pretty(diagnostics))
    } catch (error) {
      const message = toFriendlyApiMessage(error, "메일 진단 조회에 실패했습니다.")
      setMailDiagnosticsError(message)
      setResult(pretty({ error: message }))
    } finally {
      setLoadingKey("")
    }
  }

  const sendSignupTestMail = async () => {
    const email = testEmail.trim()
    if (!email) {
      setMailTestNotice({ tone: "warning", text: "테스트 메일을 받을 이메일을 먼저 입력해주세요." })
      return
    }

    try {
      setLoadingKey("mailTest")
      setLastActionLabel(ACTION_LABELS.mailTest)
      setMailTestNotice({ tone: "warning", text: "테스트 메일을 전송하고 있습니다..." })
      const response = await apiFetch<ApiRsData<{ email: string }>>("/system/api/v1/adm/mail/signup/test", {
        method: "POST",
        body: JSON.stringify({ email }),
      })
      setMailTestNotice({ tone: "success", text: `${response.data.email} 주소로 테스트 메일을 요청했습니다.` })
      setResult(pretty(response))
    } catch (error) {
      const message = toFriendlyApiMessage(error, "테스트 메일 전송에 실패했습니다.")
      setMailTestNotice({ tone: "danger", text: message })
      setResult(pretty({ error: message }))
    } finally {
      setLoadingKey("")
    }
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
      const firstPublicPostId =
        publicPostsResult.status === "fulfilled"
          ? publicPostsResult.value.content?.[0]?.id
          : undefined
      const firstAdminPostId =
        adminPostsResult.status === "fulfilled"
          ? adminPostsResult.value.content?.[0]?.id
          : undefined
      const seedPostId = firstPublicPostId ?? firstAdminPostId
      if (seedPostId != null) {
        setPostId(String(seedPostId))
      }
    })()
  }, [])

  useEffect(() => {
    if (!dashboardOpen) return

    const onWindowError = (event: ErrorEvent) => {
      const message = event.message || ""
      if (!message.includes("Failed to read a named property 'scrollY' from 'Window'")) return

      // Known cross-origin iframe limitation when embedding external dashboards.
      event.preventDefault()
    }

    window.addEventListener("error", onWindowError)
    return () => window.removeEventListener("error", onWindowError)
  }, [dashboardOpen])

  useEffect(() => {
    if (typeof window === "undefined") return
    const media = window.matchMedia("(max-width: 960px)")

    const sync = () => {
      const mobile = media.matches
      setIsMobileLayout(mobile)
      if (mobile) {
        setAdvancedPanelsOpen(false)
      } else {
        setAdvancedPanelsOpen(true)
      }
    }

    sync()
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", sync)
      return () => media.removeEventListener("change", sync)
    }

    media.addListener(sync)
    return () => media.removeListener(sync)
  }, [])

  const fetchTaskQueueDiagnostics = async () => {
    try {
      setLoadingKey("taskQueueStatus")
      setLastActionLabel(ACTION_LABELS.taskQueueStatus)
      setTaskQueueDiagnosticsError("")
      const diagnostics = await apiFetch<TaskQueueDiagnostics>("/system/api/v1/adm/tasks")
      setTaskQueueDiagnostics(diagnostics)
      setResult(pretty(diagnostics))
    } catch (error) {
      const message = toFriendlyApiMessage(error, "Task Queue 진단 조회에 실패했습니다.")
      setTaskQueueDiagnosticsError(message)
      setResult(pretty({ error: message }))
    } finally {
      setLoadingKey("")
    }
  }

  const fetchCleanupDiagnostics = async () => {
    try {
      setLoadingKey("cleanupStatus")
      setLastActionLabel(ACTION_LABELS.cleanupStatus)
      setCleanupDiagnosticsError("")
      const diagnostics = await apiFetch<UploadedFileCleanupDiagnostics>("/system/api/v1/adm/storage/cleanup")
      setCleanupDiagnostics(diagnostics)
      setResult(pretty(diagnostics))
    } catch (error) {
      const message = toFriendlyApiMessage(error, "파일 정리 진단 조회에 실패했습니다.")
      setCleanupDiagnosticsError(message)
      setResult(pretty({ error: message }))
    } finally {
      setLoadingKey("")
    }
  }

  const fetchAuthSecurityEvents = async () => {
    try {
      setLoadingKey("authSecurityEvents")
      setLastActionLabel(ACTION_LABELS.authSecurityEvents)
      setAuthSecurityEventsError("")
      const events = await apiFetch<AuthSecurityEvent[]>("/system/api/v1/adm/auth/security-events?limit=30")
      setAuthSecurityEvents(events)
      setResult(pretty(events))
    } catch (error) {
      const message = toFriendlyApiMessage(error, "인증 보안 이벤트 조회에 실패했습니다.")
      setAuthSecurityEventsError(message)
      setResult(pretty({ error: message }))
    } finally {
      setLoadingKey("")
    }
  }

  if (!sessionMember) return null

  const consoleStatus = loadingKey
    ? `${ACTION_LABELS[loadingKey] || loadingKey} 실행 중입니다.`
    : lastActionLabel
      ? `${lastActionLabel} 결과를 아래에서 확인할 수 있습니다.`
      : "도구를 실행하면 API 원본 응답이 여기에 표시됩니다."
  const isBusy = !!loadingKey
  const mailStatusMessage =
    mailDiagnostics?.status === "READY"
      ? "회원가입 메일 발송 준비가 완료된 상태입니다."
      : mailDiagnostics?.status === "CONNECTION_FAILED"
        ? "SMTP 접속은 설정되어 있지만 연결 단계에서 실패했습니다. 호스트, 계정, 앱 비밀번호를 확인하세요."
        : mailDiagnostics?.status === "MISCONFIGURED"
          ? "필수 설정이 누락되었습니다. 누락 필드를 먼저 채우세요."
          : "메일 진단 정보를 불러오는 중입니다."
  const queueHealthMessage =
    taskQueueDiagnostics?.staleProcessingCount && taskQueueDiagnostics.staleProcessingCount > 0
      ? `stale processing ${taskQueueDiagnostics.staleProcessingCount}건 감지`
      : taskQueueDiagnostics?.failedCount && taskQueueDiagnostics.failedCount > 0
        ? `최근 실패 ${taskQueueDiagnostics.failedCount}건`
        : "현재 큐는 안정 상태"
  const cleanupHealthMessage =
    cleanupDiagnostics?.blockedBySafetyThreshold
      ? "safety threshold 초과로 purge가 보류됨"
      : "safety threshold 내에서 purge 가능"
  const systemHealthStatus = systemHealthQuery.data?.status || "UNKNOWN"
  const systemHealthSummary = getSystemHealthSummary(systemHealthQuery.data ?? null)
  const systemHealthFetchedAt = systemHealthQuery.dataUpdatedAt
    ? formatInstant(new Date(systemHealthQuery.dataUpdatedAt).toISOString())
    : "-"
  const queueStatusLabel =
    taskQueueDiagnostics?.staleProcessingCount && taskQueueDiagnostics.staleProcessingCount > 0
      ? "주의 필요"
      : taskQueueDiagnostics?.failedCount && taskQueueDiagnostics.failedCount > 0
        ? "실패 확인 필요"
        : taskQueueDiagnostics
          ? "정상"
          : "미확인"
  const cleanupStatusLabel = cleanupDiagnostics?.blockedBySafetyThreshold
    ? "보류 상태"
    : cleanupDiagnostics
      ? "정상"
      : "미확인"
  const authSecurityStatusLabel =
    authSecurityEvents.length > 0
      ? authSecurityEvents[0]?.eventType === "IP_SECURITY_MISMATCH_BLOCKED"
        ? "차단 이벤트 감지"
        : "최근 이벤트 있음"
      : "이벤트 없음"
  const authSecurityHealthMessage =
    authSecurityEvents[0]?.eventType === "IP_SECURITY_MISMATCH_BLOCKED"
      ? "최근 IP 보안 차단 이벤트가 감지되었습니다."
      : "최근 인증 보안 이벤트를 확인하세요."
  const mailStatusLabel =
    mailDiagnostics?.status === "READY"
      ? "준비 완료"
      : mailDiagnostics?.status === "CONNECTION_FAILED"
        ? "연결 실패"
        : mailDiagnostics?.status === "MISCONFIGURED"
          ? "설정 누락"
          : "미확인"

  const commentActions: Array<{
    key: string
    title: string
    description: string
    tone: ActionCardTone
    onClick: () => Promise<void>
  }> = [
    {
      key: "commentList",
      title: "댓글 목록 조회",
      description: "게시글의 전체 댓글 트리와 정렬 상태 확인",
      tone: "read",
      onClick: async () =>
        void run("commentList", () => {
          const targetPostId = parsePositiveInt(postId, "post id")
          return apiFetch(`/post/api/v1/posts/${targetPostId}/comments`)
        }),
    },
    {
      key: "commentOne",
      title: "댓글 단건 조회",
      description: "특정 comment id 상세 확인",
      tone: "read",
      onClick: async () =>
        void run("commentOne", () => {
          const targetPostId = parsePositiveInt(postId, "post id")
          const targetCommentId = parsePositiveInt(commentId, "comment id")
          return apiFetch(`/post/api/v1/posts/${targetPostId}/comments/${targetCommentId}`)
        }),
    },
    {
      key: "commentWrite",
      title: "댓글 작성",
      description: "입력한 내용을 새 댓글로 생성",
      tone: "write",
      onClick: async () =>
        void run("commentWrite", async () => {
          const targetPostId = parsePositiveInt(postId, "post id")
          const content = requireCommentContent()
          const response = await apiFetch<ApiRsData<{ id?: number }>>(`/post/api/v1/posts/${targetPostId}/comments`, {
            method: "POST",
            body: JSON.stringify({ content }),
          })
          const createdCommentId = response.data?.id
          if (typeof createdCommentId === "number" && Number.isInteger(createdCommentId)) {
            setCommentId(String(createdCommentId))
          }
          return response
        }),
    },
    {
      key: "commentModify",
      title: "댓글 수정",
      description: "comment id에 해당하는 댓글 내용 변경",
      tone: "write",
      onClick: async () =>
        void run("commentModify", () => {
          const targetPostId = parsePositiveInt(postId, "post id")
          const targetCommentId = parsePositiveInt(commentId, "comment id")
          const content = requireCommentContent()
          return apiFetch(`/post/api/v1/posts/${targetPostId}/comments/${targetCommentId}`, {
            method: "PUT",
            body: JSON.stringify({ content }),
          })
        }),
    },
    {
      key: "commentDelete",
      title: "댓글 삭제",
      description: "comment id 댓글 삭제 (복구 불가 정책일 수 있음)",
      tone: "danger",
      onClick: async () =>
        void run("commentDelete", () => {
          const targetPostId = parsePositiveInt(postId, "post id")
          const targetCommentId = parsePositiveInt(commentId, "comment id")
          return apiFetch(`/post/api/v1/posts/${targetPostId}/comments/${targetCommentId}`, {
            method: "DELETE",
          })
        }),
    },
  ]

  const systemActions: Array<{
    key: string
    title: string
    description: string
    tone: ActionCardTone
    onClick: () => Promise<void>
  }> = [
    {
      key: "admPostCount",
      title: "전체 글 개수 확인",
      description: "운영 DB 기준 총 게시글 수를 조회",
      tone: "read",
      onClick: async () => void run("admPostCount", () => apiFetch("/post/api/v1/adm/posts/count")),
    },
    {
      key: "systemHealth",
      title: "서버 상태 조회",
      description: "헬스 체크 API 응답으로 기본 상태 확인",
      tone: "infra",
      onClick: async () => void run("systemHealth", () => fetchSystemHealthCached()),
    },
  ]

  const consoleActions: Array<{
    key: string
    title: string
    description: string
    tone: ActionCardTone
    onClick: () => Promise<void>
  }> = [
    {
      key: "mailStatus",
      title: "메일 준비 상태 새로고침",
      description: "설정 누락/준비 상태 재진단",
      tone: "infra",
      onClick: async () => void fetchSignupMailDiagnostics(false),
    },
    {
      key: "mailConnectivity",
      title: "SMTP 연결 확인",
      description: "실제 SMTP 연결 가능 여부 점검",
      tone: "infra",
      onClick: async () => void fetchSignupMailDiagnostics(true),
    },
    {
      key: "taskQueueStatus",
      title: "Task Queue 진단",
      description: "적체·실패·stale processing 새로고침",
      tone: "infra",
      onClick: async () => void fetchTaskQueueDiagnostics(),
    },
    {
      key: "cleanupStatus",
      title: "파일 정리 진단",
      description: "purge 후보/threshold 상태 새로고침",
      tone: "infra",
      onClick: async () => void fetchCleanupDiagnostics(),
    },
    {
      key: "authSecurityEvents",
      title: "인증 보안 이벤트",
      description: "로그인 정책/IP 보안 차단 이벤트 조회",
      tone: "infra",
      onClick: async () => void fetchAuthSecurityEvents(),
    },
  ]

  const prioritizedActions: Array<{
    key: string
    label: string
    onClick: () => Promise<void>
    tone: ActionCardTone
  }> = [
    {
      key: "systemHealth",
      label: "서버 상태 새로고침",
      tone: "infra",
      onClick: async () => void run("systemHealth", () => fetchSystemHealthCached()),
    },
    {
      key: "mailStatus",
      label: "메일 준비 상태",
      tone: "infra",
      onClick: async () => void fetchSignupMailDiagnostics(false),
    },
    {
      key: "taskQueueStatus",
      label: "Task Queue 진단",
      tone: "infra",
      onClick: async () => void fetchTaskQueueDiagnostics(),
    },
    {
      key: "authSecurityEvents",
      label: "인증 보안 이벤트",
      tone: "infra",
      onClick: async () => void fetchAuthSecurityEvents(),
    },
  ]
  const shouldShowAdvancedPanels = !isMobileLayout || advancedPanelsOpen
  const visiblePrioritizedActions = isMobileLayout ? prioritizedActions.slice(0, 3) : prioritizedActions

  return (
    <Main>
      <HeaderCard>
        <HeaderCopy>
          <Eyebrow>Admin Tools</Eyebrow>
          <h1>운영 도구</h1>
          <p>운영 중 자주 쓰는 점검 기능을 목적별로 정리했습니다. 각 카드 설명을 보고 필요한 작업만 바로 실행하세요.</p>
        </HeaderCopy>
        <HeaderActions>
          <Link href="/admin" passHref legacyBehavior>
            <NavLink>허브</NavLink>
          </Link>
          <Link href="/admin/posts/new" passHref legacyBehavior>
            <NavLink>글 작업실</NavLink>
          </Link>
        </HeaderActions>
      </HeaderCard>

      {isMobileLayout ? (
        <AdvancedToggle
          type="button"
          aria-expanded={advancedPanelsOpen}
          onClick={() => setAdvancedPanelsOpen((prev) => !prev)}
        >
          {advancedPanelsOpen ? "고급 진단 영역 접기" : "고급 진단 영역 펼치기"}
        </AdvancedToggle>
      ) : null}

      {shouldShowAdvancedPanels && (
        <GuideGrid>
          {QUICK_GUIDES.map((guide) => (
            <GuideCard key={guide.title}>
              <GuideIcon aria-hidden="true">{guide.icon}</GuideIcon>
              <div>
                <h3>{guide.title}</h3>
                <p>{guide.description}</p>
              </div>
            </GuideCard>
          ))}
        </GuideGrid>
      )}

      <OverviewCard>
        <SectionTop>
          <div>
            <SectionEyebrow>Overview</SectionEyebrow>
            <SectionTitleRow>
              <SectionIcon aria-hidden="true">🧭</SectionIcon>
              <h2>운영 상태 요약</h2>
            </SectionTitleRow>
            <SectionDescription>현재 상태를 먼저 확인하고, 필요한 진단만 바로 실행할 수 있도록 구성했습니다.</SectionDescription>
          </div>
        </SectionTop>
        <OverviewGrid>
          <OverviewItem>
            <small>서버 상태</small>
            <strong>{systemHealthStatus}</strong>
            <span>{systemHealthFetchedAt}</span>
          </OverviewItem>
          <OverviewItem>
            <small>메일 진단</small>
            <strong>{mailStatusLabel}</strong>
            <span>{mailDiagnostics?.checkedAt ? formatInstant(mailDiagnostics.checkedAt) : "-"}</span>
          </OverviewItem>
          <OverviewItem>
            <small>Task Queue</small>
            <strong>{queueStatusLabel}</strong>
            <span>{queueHealthMessage}</span>
          </OverviewItem>
          <OverviewItem>
            <small>파일 정리</small>
            <strong>{cleanupStatusLabel}</strong>
            <span>{cleanupHealthMessage}</span>
          </OverviewItem>
          <OverviewItem>
            <small>인증 보안</small>
            <strong>{authSecurityStatusLabel}</strong>
            <span>{authSecurityHealthMessage}</span>
          </OverviewItem>
        </OverviewGrid>
      </OverviewCard>

      <QuickActionsCard>
        <SectionTop>
          <div>
            <SectionEyebrow>Quick Actions</SectionEyebrow>
            <SectionTitleRow>
              <SectionIcon aria-hidden="true">⚡</SectionIcon>
              <h2>자주 쓰는 운영 액션</h2>
            </SectionTitleRow>
            <SectionDescription>모바일/데스크톱 공통으로 가장 자주 쓰는 점검 액션만 우선 배치했습니다.</SectionDescription>
          </div>
        </SectionTop>
        <QuickActionRow>
          {visiblePrioritizedActions.map((action) => (
            <ConsoleQuickActionButton
              key={action.key}
              type="button"
              disabled={isBusy}
              data-tone={action.tone}
              onClick={() => void action.onClick()}
            >
              <span className="title">{action.label}</span>
              <span className="chip">실행</span>
            </ConsoleQuickActionButton>
          ))}
        </QuickActionRow>
      </QuickActionsCard>

      {isMobileLayout && !advancedPanelsOpen ? (
        <CollapsedStateCard>
          <strong>고급 진단은 접힌 상태입니다.</strong>
          <p>기본 화면에서는 상태 요약과 자주 쓰는 액션만 노출합니다. 필요할 때만 고급 진단을 펼쳐 실행하세요.</p>
          <CollapsedStateAction type="button" onClick={() => setAdvancedPanelsOpen(true)}>
            고급 진단 펼치기
          </CollapsedStateAction>
        </CollapsedStateCard>
      ) : null}

      {shouldShowAdvancedPanels && (
        <Grid>
        <SectionCard>
          <SectionTop>
            <div>
              <SectionEyebrow>Comment Studio</SectionEyebrow>
              <SectionTitleRow>
                <SectionIcon aria-hidden="true">💬</SectionIcon>
                <h2>댓글 테스트 도구</h2>
              </SectionTitleRow>
              <SectionDescription>댓글 조회, 작성, 수정, 삭제 동작을 빠르게 점검합니다.</SectionDescription>
            </div>
          </SectionTop>
          <InlineNotice data-tone="warning">
            이 영역의 <strong>작성/수정/삭제</strong>는 실제 데이터에 적용됩니다. 운영 점검 시 테스트용 post/comment id 사용을 권장합니다.
          </InlineNotice>
          <FieldGrid>
            <FieldBox>
              <FieldLabel htmlFor="comment-post-id">post id</FieldLabel>
              <Input id="comment-post-id" value={postId} onChange={(e) => setPostId(e.target.value)} />
            </FieldBox>
            <FieldBox>
              <FieldLabel htmlFor="comment-id">comment id</FieldLabel>
              <Input id="comment-id" value={commentId} onChange={(e) => setCommentId(e.target.value)} />
            </FieldBox>
            <FieldBox className="wide">
              <FieldLabel htmlFor="comment-content">comment content</FieldLabel>
              <Input
                id="comment-content"
                value={commentContent}
                placeholder="댓글 내용을 입력하세요"
                onChange={(e) => setCommentContent(e.target.value)}
              />
            </FieldBox>
          </FieldGrid>
          <ActionCardGrid>
            {commentActions.map((action) => (
              <ActionCardButton key={action.key} type="button" disabled={isBusy} data-tone={action.tone} onClick={() => void action.onClick()}>
                <ActionCardHeader>
                  <ActionCardTitle>{action.title}</ActionCardTitle>
                  <ActionStateChip data-tone={action.tone}>
                    {action.tone === "read" ? "조회" : action.tone === "danger" ? "주의" : "쓰기"}
                  </ActionStateChip>
                </ActionCardHeader>
                <ActionCardHint>{action.description}</ActionCardHint>
              </ActionCardButton>
            ))}
          </ActionCardGrid>
        </SectionCard>

        <SectionCard>
          <SectionTop>
            <div>
              <SectionEyebrow>System Tools</SectionEyebrow>
              <SectionTitleRow>
                <SectionIcon aria-hidden="true">🩺</SectionIcon>
                <h2>시스템 점검 도구</h2>
              </SectionTitleRow>
              <SectionDescription>자주 확인하는 관리자 API만 별도로 모았습니다.</SectionDescription>
            </div>
          </SectionTop>
          <ActionCardGrid data-columns="2">
            {systemActions.map((action) => (
              <ActionCardButton key={action.key} type="button" disabled={isBusy} data-tone={action.tone} onClick={() => void action.onClick()}>
                <ActionCardHeader>
                  <ActionCardTitle>{action.title}</ActionCardTitle>
                  <ActionStateChip data-tone={action.tone}>{action.tone === "infra" ? "운영" : "조회"}</ActionStateChip>
                </ActionCardHeader>
                <ActionCardHint>{action.description}</ActionCardHint>
              </ActionCardButton>
            ))}
          </ActionCardGrid>
        </SectionCard>

        <SectionCard>
          <SectionTop>
            <div>
              <SectionEyebrow>Monitoring</SectionEyebrow>
              <SectionTitleRow>
                <SectionIcon aria-hidden="true">📈</SectionIcon>
                <h2>서비스 모니터링</h2>
              </SectionTitleRow>
              <SectionDescription>관리자 페이지 진입 시 서버 상태를 1회 조회하고, 10초 캐시를 재사용합니다.</SectionDescription>
            </div>
            <StatusBadge data-status={systemHealthStatus}>{systemHealthStatus}</StatusBadge>
          </SectionTop>
          <InlineNotice data-tone={systemHealthStatus === "UP" ? "success" : "warning"}>
            최근 서버 상태 조회: {systemHealthFetchedAt}
          </InlineNotice>
          {systemHealthSummary.length > 0 && (
            <MetaGrid>
              {systemHealthSummary.map((line) => (
                <MetaBox key={line}>
                  <small>컴포넌트</small>
                  <strong>{line}</strong>
                </MetaBox>
              ))}
            </MetaGrid>
          )}
          <MonitoringActions>
            <BaseButton type="button" disabled={isBusy} onClick={() => void run("systemHealth", () => fetchSystemHealthCached())}>
              서버 상태 즉시 새로고침
            </BaseButton>
            {uptimeKumaUrl && (
              <NavLink href={uptimeKumaUrl} target="_blank" rel="noreferrer noopener">
                Uptime Kuma 열기
              </NavLink>
            )}
            {prometheusUrl && (
              <NavLink href={prometheusUrl} target="_blank" rel="noreferrer noopener">
                Prometheus 열기
              </NavLink>
            )}
            {monitoringEmbedUrl ? (
              <PrimaryButton type="button" onClick={() => setDashboardOpen((prev) => !prev)}>
                {dashboardOpen ? "대시보드 접기" : "대시보드 열기"}
              </PrimaryButton>
            ) : (
              <InlineNotice>
                기본값은 `NEXT_PUBLIC_UPTIME_KUMA_STATUS_PATH`(예: `/status/aquila`)이며, 필요하면
                `NEXT_PUBLIC_UPTIME_KUMA_URL`(링크) 또는 `NEXT_PUBLIC_MONITORING_EMBED_URL`(임베드)로 재정의할 수 있습니다.
              </InlineNotice>
            )}
          </MonitoringActions>
          {dashboardOpen && monitoringEmbedIsCrossOrigin && (
            <InlineNotice data-tone="warning">
              임베드 주소가 관리자 페이지와 다른 도메인이라 브라우저 보안 정책상 콘솔 경고가 표시될 수 있습니다.
            </InlineNotice>
          )}
          {dashboardOpen && monitoringEmbedUrl && (
            <MonitoringFrame
              src={monitoringEmbedUrl}
              loading="lazy"
              title="Monitoring Dashboard"
              referrerPolicy="no-referrer"
            />
          )}
        </SectionCard>

        <SectionCard>
          <SectionTop>
            <div>
              <SectionEyebrow>Signup Mail</SectionEyebrow>
              <SectionTitleRow>
                <SectionIcon aria-hidden="true">📧</SectionIcon>
                <h2>회원가입 메일 진단</h2>
              </SectionTitleRow>
              <SectionDescription>SMTP 준비 상태를 보고, 테스트 메일을 바로 발송할 수 있습니다.</SectionDescription>
            </div>
            <StatusBadge data-status={mailDiagnostics?.status || "unknown"}>{mailDiagnostics?.status || "LOADING"}</StatusBadge>
          </SectionTop>
          <InlineNotice data-tone={mailDiagnostics?.status === "READY" ? "success" : "warning"}>{mailStatusMessage}</InlineNotice>

          <MetaGrid>
            <MetaBox>
              <small>메일 어댑터</small>
              <strong>{mailDiagnostics?.adapter || "-"}</strong>
            </MetaBox>
            <MetaBox>
              <small>SMTP 호스트</small>
              <strong>{mailDiagnostics?.host || "미설정"}</strong>
            </MetaBox>
            <MetaBox>
              <small>발신 주소</small>
              <strong>{mailDiagnostics?.mailFrom || "미설정"}</strong>
            </MetaBox>
            <MetaBox>
              <small>검증 경로</small>
              <strong>{mailDiagnostics?.verifyPath || "/signup/verify"}</strong>
            </MetaBox>
            <MetaBox>
              <small>SMTP 인증</small>
              <strong>{mailDiagnostics?.smtpAuth ? "사용" : "미사용"}</strong>
            </MetaBox>
            <MetaBox>
              <small>STARTTLS</small>
              <strong>{mailDiagnostics?.startTlsEnabled ? "사용" : "미사용"}</strong>
            </MetaBox>
            <MetaBox>
              <small>아이디 설정</small>
              <strong>{mailDiagnostics?.usernameConfigured ? "완료" : "누락"}</strong>
            </MetaBox>
            <MetaBox>
              <small>비밀번호 설정</small>
              <strong>{mailDiagnostics?.passwordConfigured ? "완료" : "누락"}</strong>
            </MetaBox>
          </MetaGrid>

          {!!mailDiagnostics?.missing.length && (
            <InlineNotice data-tone="warning">
              누락된 설정: {mailDiagnostics.missing.join(", ")}
            </InlineNotice>
          )}
          {!!mailDiagnostics?.connectionError && <InlineNotice data-tone="danger">{mailDiagnostics.connectionError}</InlineNotice>}
          {!!mailDiagnosticsError && <InlineNotice data-tone="danger">{mailDiagnosticsError}</InlineNotice>}

          <MailTestSection>
            <MailTestBox>
              <FieldBox className="wide">
                <FieldLabel htmlFor="signup-mail-test-email">테스트 메일 주소</FieldLabel>
                <Input
                  id="signup-mail-test-email"
                  type="email"
                  value={testEmail}
                  placeholder="메일 수신을 확인할 이메일을 입력하세요"
                  onChange={(e) => setTestEmail(e.target.value)}
                />
              </FieldBox>
              <PrimaryButton type="button" disabled={!!loadingKey} onClick={() => void sendSignupTestMail()}>
                테스트 메일 발송
              </PrimaryButton>
            </MailTestBox>
            {!!mailTestNotice.text && <InlineNotice data-tone={mailTestNotice.tone}>{mailTestNotice.text}</InlineNotice>}
          </MailTestSection>
        </SectionCard>

        <SectionCard>
          <SectionTop>
            <div>
              <SectionEyebrow>Task Queue</SectionEyebrow>
              <SectionTitleRow>
                <SectionIcon aria-hidden="true">⚙️</SectionIcon>
                <h2>백그라운드 작업 상태</h2>
              </SectionTitleRow>
              <SectionDescription>revalidate, 회원가입 메일 같은 비동기 작업 적체와 stale processing 상태를 봅니다.</SectionDescription>
            </div>
            <SectionToggleButton type="button" onClick={() => setTaskQueuePanelOpen((prev) => !prev)}>
              {taskQueuePanelOpen ? "패널 접기" : "패널 펼치기"}
            </SectionToggleButton>
          </SectionTop>
          {taskQueuePanelOpen && (
            <>
              <InlineNotice data-tone={taskQueueDiagnostics?.staleProcessingCount ? "warning" : "success"}>
                {queueHealthMessage}
              </InlineNotice>

              <MetaGrid>
                <MetaBox>
                  <small>대기 작업</small>
                  <strong>{taskQueueDiagnostics?.pendingCount ?? "-"}</strong>
                </MetaBox>
                <MetaBox>
                  <small>즉시 실행 가능</small>
                  <strong>{taskQueueDiagnostics?.readyPendingCount ?? "-"}</strong>
                </MetaBox>
                <MetaBox>
                  <small>처리 중</small>
                  <strong>{taskQueueDiagnostics?.processingCount ?? "-"}</strong>
                </MetaBox>
                <MetaBox>
                  <small>stale processing</small>
                  <strong>{taskQueueDiagnostics?.staleProcessingCount ?? "-"}</strong>
                </MetaBox>
              </MetaGrid>

              {!!taskQueueDiagnosticsError && <InlineNotice data-tone="danger">{taskQueueDiagnosticsError}</InlineNotice>}

              {!!taskQueueDiagnostics && (
                <TaskSummaryStrip>
                  <TaskSummaryLine>
                    <span>가장 오래 대기 중인 ready task</span>
                    <strong>{formatAge(taskQueueDiagnostics.oldestReadyPendingAgeSeconds)}</strong>
                  </TaskSummaryLine>
                  <TaskSummaryLine>
                    <span>가장 오래 처리 중인 task</span>
                    <strong>{formatAge(taskQueueDiagnostics.oldestProcessingAgeSeconds)}</strong>
                  </TaskSummaryLine>
                  <TaskSummaryLine>
                    <span>processing timeout</span>
                    <strong>{taskQueueDiagnostics.processingTimeoutSeconds}초</strong>
                  </TaskSummaryLine>
                </TaskSummaryStrip>
              )}

              {!!taskQueueDiagnostics?.taskTypes.length && (
                <TaskTypeGrid>
                  {taskQueueDiagnostics.taskTypes.map((taskType) => (
                    <TaskTypeCard key={taskType.taskType}>
                      <TaskTypeHeader>
                        <div>
                          <strong>{taskType.label}</strong>
                          <small>{taskType.taskType}</small>
                        </div>
                        <TaskStatePill data-tone={taskType.staleProcessingCount > 0 || taskType.failedCount > 0 ? "warning" : "neutral"}>
                          {taskType.staleProcessingCount > 0
                            ? `stale ${taskType.staleProcessingCount}`
                            : taskType.failedCount > 0
                              ? `failed ${taskType.failedCount}`
                              : "정상"}
                        </TaskStatePill>
                      </TaskTypeHeader>
                      <TaskMetricGrid>
                        <TaskMetric>
                          <span>ready</span>
                          <strong>{taskType.readyPendingCount}</strong>
                        </TaskMetric>
                        <TaskMetric>
                          <span>backlog</span>
                          <strong>{taskType.backlogCount ?? taskType.pendingCount + taskType.processingCount}</strong>
                        </TaskMetric>
                        <TaskMetric>
                          <span>delayed</span>
                          <strong>{taskType.delayedPendingCount}</strong>
                        </TaskMetric>
                        <TaskMetric>
                          <span>processing</span>
                          <strong>{taskType.processingCount}</strong>
                        </TaskMetric>
                        <TaskMetric>
                          <span>failed</span>
                          <strong>{taskType.failedCount}</strong>
                        </TaskMetric>
                      </TaskMetricGrid>
                      <TaskMetaLine>
                        <span>retry 정책</span>
                        <strong>{formatRetryPolicy(taskType.retryPolicy)}</strong>
                      </TaskMetaLine>
                      <TaskMetaLine>
                        <span>가장 오래 대기 중</span>
                        <strong>
                          {formatAge(taskType.queueLagSeconds ?? taskType.oldestReadyPendingAgeSeconds)}
                          {taskType.oldestReadyPendingAt ? ` · ${formatInstant(taskType.oldestReadyPendingAt)}` : ""}
                        </strong>
                      </TaskMetaLine>
                      <TaskMetaLine>
                        <span>최근 실패</span>
                        <strong>
                          {taskType.latestFailureAt ? formatInstant(taskType.latestFailureAt) : "-"}
                        </strong>
                      </TaskMetaLine>
                      {!!taskType.latestFailureMessage && (
                        <TaskErrorSnippet>{taskType.latestFailureMessage}</TaskErrorSnippet>
                      )}
                    </TaskTypeCard>
                  ))}
                </TaskTypeGrid>
              )}

              {!!taskQueueDiagnostics?.recentFailures.length && (
                <TaskSamplesSection>
                  <TaskSamplesHeader>
                    <h3>최근 실패 작업</h3>
                    <span>{taskQueueDiagnostics.recentFailures.length}건</span>
                  </TaskSamplesHeader>
                  <TaskSampleList>
                    {taskQueueDiagnostics.recentFailures.map((sample) => (
                      <TaskSampleItem key={`failed-${sample.taskId}`}>
                        <TaskSampleTop>
                          <div>
                            <strong>{sample.label}</strong>
                            <small>
                              #{sample.taskId} · {sample.taskType}
                            </small>
                          </div>
                          <TaskStatePill data-tone="warning">{sample.status}</TaskStatePill>
                        </TaskSampleTop>
                        <TaskSampleMeta>
                          <span>
                            {sample.aggregateType}:{sample.aggregateId}
                          </span>
                          <span>
                            retry {sample.retryCount}/{sample.maxRetries}
                          </span>
                          <span>{formatInstant(sample.modifiedAt)}</span>
                        </TaskSampleMeta>
                        {!!sample.errorMessage && <TaskErrorSnippet>{sample.errorMessage}</TaskErrorSnippet>}
                      </TaskSampleItem>
                    ))}
                  </TaskSampleList>
                </TaskSamplesSection>
              )}

              {!!taskQueueDiagnostics?.staleProcessingSamples.length && (
                <TaskSamplesSection>
                  <TaskSamplesHeader>
                    <h3>stale processing 샘플</h3>
                    <span>{taskQueueDiagnostics.staleProcessingSamples.length}건</span>
                  </TaskSamplesHeader>
                  <TaskSampleList>
                    {taskQueueDiagnostics.staleProcessingSamples.map((sample) => (
                      <TaskSampleItem key={`stale-${sample.taskId}`}>
                        <TaskSampleTop>
                          <div>
                            <strong>{sample.label}</strong>
                            <small>
                              #{sample.taskId} · {sample.taskType}
                            </small>
                          </div>
                          <TaskStatePill data-tone="warning">stale</TaskStatePill>
                        </TaskSampleTop>
                        <TaskSampleMeta>
                          <span>
                            {sample.aggregateType}:{sample.aggregateId}
                          </span>
                          <span>
                            retry {sample.retryCount}/{sample.maxRetries}
                          </span>
                          <span>다음 시도 {formatInstant(sample.nextRetryAt)}</span>
                        </TaskSampleMeta>
                        {!!sample.errorMessage && <TaskErrorSnippet>{sample.errorMessage}</TaskErrorSnippet>}
                      </TaskSampleItem>
                    ))}
                  </TaskSampleList>
                </TaskSamplesSection>
              )}
            </>
          )}
        </SectionCard>

        <SectionCard>
          <SectionTop>
            <div>
              <SectionEyebrow>Storage Cleanup</SectionEyebrow>
              <SectionTitleRow>
                <SectionIcon aria-hidden="true">🧹</SectionIcon>
                <h2>파일 정리 상태</h2>
              </SectionTitleRow>
              <SectionDescription>TEMP/PENDING_DELETE 파일의 purge 대상 수와 safety threshold를 확인합니다.</SectionDescription>
            </div>
            <SectionToggleButton type="button" onClick={() => setCleanupPanelOpen((prev) => !prev)}>
              {cleanupPanelOpen ? "패널 접기" : "패널 펼치기"}
            </SectionToggleButton>
          </SectionTop>
          {cleanupPanelOpen && (
            <>
              <InlineNotice data-tone={cleanupDiagnostics?.blockedBySafetyThreshold ? "warning" : "success"}>
                {cleanupHealthMessage}
              </InlineNotice>

              <MetaGrid>
                <MetaBox>
                  <small>TEMP</small>
                  <strong>{cleanupDiagnostics?.tempCount ?? "-"}</strong>
                </MetaBox>
                <MetaBox>
                  <small>PENDING_DELETE</small>
                  <strong>{cleanupDiagnostics?.pendingDeleteCount ?? "-"}</strong>
                </MetaBox>
                <MetaBox>
                  <small>purge 후보</small>
                  <strong>{cleanupDiagnostics?.eligibleForPurgeCount ?? "-"}</strong>
                </MetaBox>
                <MetaBox>
                  <small>safety threshold</small>
                  <strong>{cleanupDiagnostics?.cleanupSafetyThreshold ?? "-"}</strong>
                </MetaBox>
              </MetaGrid>

              {!!cleanupDiagnosticsError && <InlineNotice data-tone="danger">{cleanupDiagnosticsError}</InlineNotice>}
              {!!cleanupDiagnostics?.sampleEligibleObjectKeys.length && (
                <InlineNotice>
                  샘플 object key: {cleanupDiagnostics.sampleEligibleObjectKeys.join(", ")}
                </InlineNotice>
              )}
            </>
          )}
        </SectionCard>

        <SectionCard>
          <SectionTop>
            <div>
              <SectionEyebrow>Auth Security</SectionEyebrow>
              <SectionTitleRow>
                <SectionIcon aria-hidden="true">🔐</SectionIcon>
                <h2>인증 보안 이벤트</h2>
              </SectionTitleRow>
              <SectionDescription>로그인 정책 적용/차단 이력을 최근 순으로 확인해 운영 이상 징후를 빠르게 파악합니다.</SectionDescription>
            </div>
            <BaseButton type="button" disabled={isBusy} onClick={() => void fetchAuthSecurityEvents()}>
              이벤트 새로고침
            </BaseButton>
          </SectionTop>
          <InlineNotice data-tone={authSecurityEvents[0]?.eventType === "IP_SECURITY_MISMATCH_BLOCKED" ? "warning" : "success"}>
            {authSecurityEvents.length > 0
              ? `최근 이벤트: ${authSecurityEvents[0].eventType} · ${formatInstant(authSecurityEvents[0].createdAt)}`
              : "아직 기록된 인증 보안 이벤트가 없습니다."}
          </InlineNotice>

          {!!authSecurityEventsError && <InlineNotice data-tone="danger">{authSecurityEventsError}</InlineNotice>}

          {authSecurityEvents.length > 0 ? (
            <AuthEventList>
              {authSecurityEvents.map((event) => (
                <AuthEventItem key={event.id}>
                  <AuthEventHeader>
                    <strong>{event.eventType}</strong>
                    <small>{formatInstant(event.createdAt)}</small>
                  </AuthEventHeader>
                  <AuthEventMeta>
                    <span>memberId: {event.memberId ?? "-"}</span>
                    <span>identifier: {event.loginIdentifier || "-"}</span>
                    <span>rememberMe: {event.rememberLoginEnabled ? "ON" : "OFF"}</span>
                    <span>ipSecurity: {event.ipSecurityEnabled ? "ON" : "OFF"}</span>
                  </AuthEventMeta>
                  <AuthEventMeta>
                    <span>path: {event.requestPath || "-"}</span>
                    <span>fingerprint: {event.clientIpFingerprint || "-"}</span>
                  </AuthEventMeta>
                  {event.reason ? <AuthEventReason>{event.reason}</AuthEventReason> : null}
                </AuthEventItem>
              ))}
            </AuthEventList>
          ) : (
            <InlineNotice>이벤트가 발생하면 이 영역에 표시됩니다.</InlineNotice>
          )}
        </SectionCard>
        </Grid>
      )}

      {shouldShowAdvancedPanels && (
        <ConsoleCard>
          <ConsoleHeader>
            <div>
              <SectionEyebrow>Console</SectionEyebrow>
              <h2>실행 결과 콘솔</h2>
              <ConsoleDescription>메일, task queue, 파일 정리 진단 버튼과 API 원본 응답을 한 자리에서 확인합니다.</ConsoleDescription>
            </div>
            <ConsoleStatus>{consoleStatus}</ConsoleStatus>
          </ConsoleHeader>
          <ConsoleQuickActions>
            {consoleActions.map((action) => (
              <ConsoleQuickActionButton
                key={action.key}
                type="button"
                disabled={isBusy}
                data-tone={action.tone}
                title={action.description}
                onClick={() => void action.onClick()}
              >
                <span className="title">{action.title}</span>
                <span className="chip">진단</span>
              </ConsoleQuickActionButton>
            ))}
          </ConsoleQuickActions>
          <ResultPanel>{result || "// 도구를 실행하면 API 응답 결과가 여기에 표시됩니다."}</ResultPanel>
        </ConsoleCard>
      )}
    </Main>
  )
}

export default AdminToolsPage

const Main = styled.main`
  max-width: 1180px;
  width: 100%;
  min-width: 0;
  margin: 0 auto;
  padding: 1.5rem 1rem 2.6rem;
  display: grid;
  gap: 1rem;
`

const HeaderCard = styled.section`
  display: grid;
  gap: 0.95rem;
  padding: 1.05rem 1.1rem;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  border-radius: 16px;
  background: ${({ theme }) => theme.colors.gray2};
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.22);

  h1 {
    margin: 0;
    font-size: clamp(1.72rem, 3.2vw, 2.15rem);
    letter-spacing: -0.03em;
    line-height: 1.08;
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray11};
    line-height: 1.75;
  }
`

const HeaderCopy = styled.div`
  display: grid;
  gap: 0.7rem;
  max-width: 42rem;
`

const GuideGrid = styled.section`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.8rem;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`

const GuideCard = styled.article`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: start;
  gap: 0.8rem;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  background: ${({ theme }) => theme.colors.gray3};
  padding: 0.72rem 0.82rem;

  h3 {
    margin: 0 0 0.28rem;
    font-size: 1.02rem;
    letter-spacing: -0.02em;
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.86rem;
    line-height: 1.6;
  }
`

const GuideIcon = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 0;
  border: none;
  background: transparent;
  font-size: 1rem;
`

const Eyebrow = styled.span`
  width: fit-content;
  border-radius: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
`

const HeaderActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;

  @media (max-width: 1024px) {
    width: 100%;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 560px) {
    grid-template-columns: 1fr;
  }
`

const AdvancedToggle = styled.button`
  min-height: 36px;
  width: fit-content;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
  color: ${({ theme }) => theme.colors.gray11};
  padding: 0 0.82rem;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;

  &:hover {
    border-color: ${({ theme }) => theme.colors.gray7};
    color: ${({ theme }) => theme.colors.gray12};
  }
`

const CollapsedStateCard = styled.section`
  display: grid;
  gap: 0.62rem;
  padding: 0.88rem 0.92rem;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 12px;
  background: ${({ theme }) => theme.colors.gray2};

  strong {
    font-size: 0.9rem;
    color: ${({ theme }) => theme.colors.gray12};
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.82rem;
    line-height: 1.6;
  }
`

const CollapsedStateAction = styled.button`
  width: fit-content;
  min-height: 36px;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.blue8};
  background: ${({ theme }) => theme.colors.blue3};
  color: ${({ theme }) => theme.colors.blue11};
  padding: 0 0.82rem;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
`

const BaseButton = styled.button`
  border-radius: 10px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray11};
  padding: 0.72rem 1rem;
  min-height: 40px;
  font-size: 0.92rem;
  font-weight: 700;
  cursor: pointer;

  &:hover:not(:disabled) {
    color: ${({ theme }) => theme.colors.gray12};
    border-color: ${({ theme }) => theme.colors.gray8};
    background: ${({ theme }) => theme.colors.gray2};
  }

  &:disabled {
    opacity: 1;
    cursor: not-allowed;
    background: ${({ theme }) => theme.colors.gray2};
    color: ${({ theme }) => theme.colors.gray10};
  }
`

const PrimaryButton = styled(BaseButton)`
  background: ${({ theme }) => theme.colors.blue9};
  color: #fff;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.blue10};
    color: #fff;
  }
`

const NavLink = styled.a`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray11};
  text-decoration: none;
  padding: 0.72rem 1rem;
  min-height: 40px;
  font-size: 0.92rem;
  font-weight: 700;

  @media (max-width: 1024px) {
    width: 100%;
  }
`

const Grid = styled.section`
  display: grid;
  gap: 1rem;
`

const SectionCard = styled.section`
  min-width: 0;
  border-radius: 14px;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  background: ${({ theme }) => theme.colors.gray2};
  box-shadow: 0 8px 18px rgba(2, 6, 23, 0.14);
  padding: 1rem;
`

const QuickActionsCard = styled(SectionCard)`
  padding: 0.92rem 1rem;
`

const QuickActionRow = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.6rem;

  @media (max-width: 960px) {
    grid-template-columns: 1fr;
  }
`

const SectionTop = styled.div`
  margin-bottom: 0.9rem;
  display: flex;
  justify-content: space-between;
  gap: 0.9rem;
  align-items: flex-start;

  > div {
    min-width: 0;
  }

  h2 {
    margin: 0;
    font-size: 1.2rem;
  }

  @media (max-width: 760px) {
    flex-direction: column;
  }
`

const SectionToggleButton = styled.button`
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 999px;
  background: ${({ theme }) => theme.colors.gray2};
  color: ${({ theme }) => theme.colors.gray11};
  min-height: 32px;
  padding: 0 0.7rem;
  font-size: 0.76rem;
  font-weight: 700;
  line-height: 1;
  transition: border-color 0.16s ease, color 0.16s ease, background-color 0.16s ease;

  &:hover {
    color: ${({ theme }) => theme.colors.gray12};
    border-color: ${({ theme }) => theme.colors.gray7};
    background: ${({ theme }) => theme.colors.gray3};
  }
`

const SectionEyebrow = styled.span`
  width: fit-content;
  display: inline-flex;
  border-radius: 0;
  padding: 0;
  border: 0;
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin-bottom: 0.55rem;
`

const SectionDescription = styled.p`
  margin: 0.35rem 0 0;
  color: ${({ theme }) => theme.colors.gray11};
  line-height: 1.7;
`

const SectionTitleRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.55rem;
`

const SectionIcon = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.4rem;
  height: 1.4rem;
  border-radius: 0;
  border: none;
  background: transparent;
  font-size: 0.95rem;
`

const FieldGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.9rem;
  margin-bottom: 1rem;

  .wide {
    grid-column: 1 / -1;
  }

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`

const FieldBox = styled.label`
  display: grid;
  gap: 0.4rem;
`

const FieldLabel = styled.label`
  font-size: 0.82rem;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.gray11};
`

const Input = styled.input`
  width: 100%;
  min-height: 44px;
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray12};
  padding: 0.9rem 1rem;
  font-size: 0.98rem;
`

const ActionCardGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(var(--columns, 3), minmax(0, 1fr));
  gap: 0.72rem;
  margin-top: 0.25rem;

  &[data-columns="2"] {
    --columns: 2;
  }

  @media (max-width: 980px) {
    --columns: 2;
  }

  @media (max-width: 680px) {
    --columns: 1;
  }
`

const ActionCardButton = styled.button`
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray12};
  padding: 0.8rem 0.88rem;
  text-align: left;
  display: grid;
  gap: 0.42rem;
  cursor: pointer;
  transition:
    border-color 0.16s ease,
    transform 0.16s ease,
    box-shadow 0.16s ease;

  &:hover {
    transform: none;
    box-shadow: none;
    background: ${({ theme }) => theme.colors.gray2};
    border-color: ${({ theme }) => theme.colors.gray7};
  }

  &:disabled {
    opacity: 0.56;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
  }

  &[data-tone="danger"] {
    border-color: ${({ theme }) => theme.colors.red7};
  }
`

const ActionCardHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  min-width: 0;

  @media (max-width: 760px) {
    align-items: flex-start;
  }
`

const ActionCardTitle = styled.span`
  display: block;
  min-width: 0;
  font-size: 0.92rem;
  font-weight: 800;
  letter-spacing: -0.01em;
  overflow-wrap: anywhere;
`

const ActionCardHint = styled.span`
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.8rem;
  line-height: 1.55;
`

const ActionStateChip = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 2.55rem;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: transparent;
  color: ${({ theme }) => theme.colors.gray11};
  padding: 0.2rem 0.5rem;
  font-size: 0.74rem;
  font-weight: 800;
  letter-spacing: 0.02em;

  &[data-tone="read"] {
    border-color: ${({ theme }) => theme.colors.blue8};
    color: ${({ theme }) => theme.colors.blue11};
    background: ${({ theme }) => theme.colors.blue3};
  }

  &[data-tone="write"] {
    border-color: ${({ theme }) => theme.colors.green8};
    color: ${({ theme }) => theme.colors.green11};
    background: ${({ theme }) => theme.colors.green3};
  }

  &[data-tone="danger"] {
    border-color: ${({ theme }) => theme.colors.red8};
    color: ${({ theme }) => theme.colors.red11};
    background: ${({ theme }) => theme.colors.red3};
  }

  &[data-tone="infra"] {
    border-color: ${({ theme }) => theme.colors.indigo8};
    color: ${({ theme }) => theme.colors.indigo11};
    background: ${({ theme }) => theme.colors.indigo3};
  }
`

const MetaGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.8rem;
  margin-bottom: 1rem;

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`

const MetaBox = styled.div`
  display: grid;
  gap: 0.25rem;
  padding: 0.58rem 0.68rem;
  border-radius: 8px;
  border: 0;
  background: ${({ theme }) => theme.colors.gray3};

  small {
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.76rem;
    font-weight: 700;
  }

  strong {
    font-size: 0.98rem;
    word-break: break-word;
  }
`

const StatusBadge = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 92px;
  padding: 0.45rem 0.75rem;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 800;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: transparent;
  color: ${({ theme }) => theme.colors.gray12};

  &[data-status="READY"],
  &[data-status="TEST_MODE"] {
    border-color: ${({ theme }) => theme.colors.green8};
    background: ${({ theme }) => theme.colors.green3};
    color: ${({ theme }) => theme.colors.green11};
  }

  &[data-status="MISCONFIGURED"],
  &[data-status="CONNECTION_FAILED"] {
    border-color: ${({ theme }) => theme.colors.red8};
    background: ${({ theme }) => theme.colors.red3};
    color: ${({ theme }) => theme.colors.red11};
  }
`

const InlineNotice = styled.p`
  margin: 0 0 0.9rem;
  padding: 0.78rem 0.82rem;
  border-radius: 8px;
  border: 0;
  border-left: 3px solid ${({ theme }) => theme.colors.gray7};
  background: ${({ theme }) => theme.colors.gray3};
  color: ${({ theme }) => theme.colors.gray12};
  line-height: 1.6;

  &[data-tone="warning"] {
    border-left-color: ${({ theme }) => theme.colors.indigo8};
    background: ${({ theme }) => theme.colors.indigo3};
    color: ${({ theme }) => theme.colors.indigo11};
  }

  &[data-tone="danger"] {
    border-left-color: ${({ theme }) => theme.colors.red8};
    background: ${({ theme }) => theme.colors.red3};
    color: ${({ theme }) => theme.colors.red11};
  }

  &[data-tone="success"] {
    border-left-color: ${({ theme }) => theme.colors.green8};
    background: ${({ theme }) => theme.colors.green3};
    color: ${({ theme }) => theme.colors.green11};
  }
`

const MailTestSection = styled.div`
  margin-top: 1.1rem;
  display: grid;
  gap: 0.95rem;
`

const MailTestBox = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.8rem;
  align-items: end;

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`

const TaskSummaryStrip = styled.div`
  display: grid;
  gap: 0.6rem;
  margin-bottom: 1rem;
`

const TaskSummaryLine = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.6rem;
  padding: 0.62rem 0;
  border-radius: 0;
  border: 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.gray6};
  background: transparent;

  span {
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.84rem;
    font-weight: 700;
  }

  strong {
    font-size: 0.92rem;
    min-width: 0;
    max-width: 100%;
    overflow-wrap: anywhere;
  }
`

const TaskTypeGrid = styled.div`
  display: grid;
  gap: 0.8rem;
  margin-top: 1rem;
`

const TaskTypeCard = styled.div`
  display: grid;
  gap: 0.75rem;
  padding: 0.75rem 0;
  border-radius: 0;
  border: 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.gray6};
  background: transparent;
`

const TaskTypeHeader = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: flex-start;

  strong {
    display: block;
    font-size: 1rem;
  }

  small {
    display: block;
    margin-top: 0.2rem;
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.8rem;
    word-break: break-word;
  }
`

const TaskStatePill = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  padding: 0.34rem 0.62rem;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: transparent;
  color: ${({ theme }) => theme.colors.gray12};
  font-size: 0.76rem;
  font-weight: 800;
  white-space: nowrap;

  &[data-tone="warning"] {
    border-color: ${({ theme }) => theme.colors.indigo8};
    background: ${({ theme }) => theme.colors.indigo3};
    color: ${({ theme }) => theme.colors.indigo11};
  }

  @media (max-width: 760px) {
    white-space: normal;
    line-height: 1.25;
    text-align: center;
  }
`

const TaskMetricGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.65rem;

  @media (max-width: 760px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`

const TaskMetric = styled.div`
  display: grid;
  gap: 0.2rem;
  padding: 0.45rem 0;
  border-radius: 0;
  border: 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.gray6};
  background: transparent;

  span {
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.76rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
`

const TaskMetaLine = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.6rem;

  span {
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.82rem;
    font-weight: 700;
  }

  strong {
    font-size: 0.88rem;
    text-align: right;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  @media (max-width: 760px) {
    strong {
      text-align: left;
    }
  }
`

const TaskErrorSnippet = styled.p`
  margin: 0;
  padding: 0.58rem 0;
  border-radius: 0;
  border: 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.gray6};
  background: transparent;
  color: ${({ theme }) => theme.colors.gray11};
  line-height: 1.55;
  word-break: break-word;
`

const TaskSamplesSection = styled.div`
  margin-top: 1rem;
  display: grid;
  gap: 0.7rem;
`

const TaskSamplesHeader = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 0.6rem;
  align-items: center;

  h3 {
    margin: 0;
    font-size: 0.98rem;
  }

  span {
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.82rem;
    font-weight: 700;
  }
`

const TaskSampleList = styled.div`
  display: grid;
  gap: 0.7rem;
`

const TaskSampleItem = styled.div`
  display: grid;
  gap: 0.55rem;
  padding: 0.7rem 0;
  border-radius: 0;
  border: 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.gray6};
  background: transparent;
`

const TaskSampleTop = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 0.7rem;
  align-items: flex-start;

  strong {
    display: block;
    font-size: 0.94rem;
  }

  small {
    display: block;
    margin-top: 0.2rem;
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.78rem;
  }
`

const TaskSampleMeta = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 0.8rem;
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.8rem;
  font-weight: 700;

  span {
    overflow-wrap: anywhere;
  }
`

const AuthEventList = styled.div`
  margin-top: 0.8rem;
  display: grid;
  gap: 0.7rem;
`

const AuthEventItem = styled.article`
  display: grid;
  gap: 0.46rem;
  border-radius: 0;
  border: 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.gray6};
  background: transparent;
  padding: 0.65rem 0;
`

const AuthEventHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.6rem;

  strong {
    font-size: 0.9rem;
  }

  small {
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.78rem;
  }
`

const AuthEventMeta = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 0.8rem;

  span {
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.8rem;
    font-weight: 700;
    overflow-wrap: anywhere;
  }
`

const AuthEventReason = styled.p`
  margin: 0;
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.8rem;
  line-height: 1.5;
`

const MonitoringActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.62rem;
  margin-top: 0.7rem;

  a {
    text-decoration: none;
  }
`

const MonitoringFrame = styled.iframe`
  margin-top: 0.85rem;
  width: 100%;
  min-height: 420px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 8px;
  background: transparent;
`

const ConsoleCard = styled.section`
  min-width: 0;
  border-radius: 12px;
  border: 0;
  background: ${({ theme }) => theme.colors.gray2};
  padding: 1rem;
`

const ConsoleHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.75rem;
  margin-bottom: 0.75rem;

  h2 {
    margin: 0;
    font-size: 1.1rem;
  }

  @media (max-width: 760px) {
    flex-direction: column;
  }
`

const ConsoleDescription = styled.p`
  margin: 0.35rem 0 0;
  color: ${({ theme }) => theme.colors.gray11};
  line-height: 1.65;
`

const ConsoleStatus = styled.span`
  display: block;
  min-height: 2.7rem;
  max-width: 30rem;
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.84rem;
  line-height: 1.6;

  @media (max-width: 760px) {
    min-height: 1.5rem;
  }
`

const ConsoleQuickActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin: 0.28rem 0 0.88rem;
`

const ConsoleQuickActionButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.42rem;
  min-height: 2.3rem;
  flex: 0 1 auto;
  border-radius: 999px;
  border: 0;
  background: ${({ theme }) => theme.colors.gray3};
  color: ${({ theme }) => theme.colors.gray12};
  padding: 0 0.72rem;
  cursor: pointer;
  transition: background-color 0.16s ease;

  &:hover {
    background: ${({ theme }) => theme.colors.gray3};
  }

  &:disabled {
    opacity: 0.56;
    cursor: not-allowed;
  }

  .title {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: left;
    font-size: 0.82rem;
    font-weight: 700;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    border-radius: 999px;
    border: 1px solid ${({ theme }) => theme.colors.indigo8};
    background: ${({ theme }) => theme.colors.indigo3};
    color: ${({ theme }) => theme.colors.indigo11};
    padding: 0.2rem 0.46rem;
    font-size: 0.72rem;
    font-weight: 800;
  }

  @media (max-width: 760px) {
    flex-basis: 100%;
    width: 100%;
    min-height: 2.5rem;
  }
`

const ResultPanel = styled.pre`
  margin: 0;
  min-height: 220px;
  border-radius: 8px;
  border: 0;
  background: ${({ theme }) => theme.colors.gray3};
  padding: 0.95rem;
  overflow: auto;
  color: ${({ theme }) => theme.colors.gray12};
  font-size: 0.84rem;
  line-height: 1.65;
`

const OverviewCard = styled.section`
  min-width: 0;
  border-radius: 12px;
  border: 0;
  background: ${({ theme }) => theme.colors.gray2};
  padding: 1rem;
`

const OverviewGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.72rem;

  @media (max-width: 980px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 620px) {
    grid-template-columns: 1fr;
  }
`

const OverviewItem = styled.article`
  display: grid;
  gap: 0.2rem;
  border-radius: 10px;
  border: 0;
  background: ${({ theme }) => theme.colors.gray3};
  padding: 0.68rem 0.76rem;

  small {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.02em;
  }

  strong {
    font-size: 1.02rem;
    letter-spacing: -0.01em;
  }

  span {
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.8rem;
    line-height: 1.45;
  }
`
