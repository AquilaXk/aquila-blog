import { useQuery, useQueryClient } from "@tanstack/react-query"
import { GetServerSideProps, NextPage } from "next"
import { IncomingMessage } from "http"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { setCookie } from "cookies-next"
import { apiFetch } from "src/apis/backend/client"
import { toFriendlyApiMessage } from "src/apis/backend/errorMessages"
import type { AuthMember } from "src/hooks/useAuthSession"
import useAuthSession from "src/hooks/useAuthSession"
import { AdminPageProps, buildAdminPagePropsFromMember, getAdminPageProps, readAdminProtectedBootstrap } from "src/libs/server/adminPage"
import { hasServerAuthCookie } from "src/libs/server/authSession"
import { serverApiFetch } from "src/libs/server/backend"
import { readServerSnapshot } from "src/libs/server/serverSnapshotCache"
import { appendSsrDebugTiming, timed } from "src/libs/server/serverTiming"
import AdminShell from "src/routes/Admin/AdminShell"
import {
  ACTION_META,
  CHECK_REQUIRED_STATUS_LABEL,
  CONNECTION_UNAVAILABLE_STATUS_LABEL,
  DATA_EMPTY_STATUS_LABEL,
  HEALTH_CACHE_MS,
  RESULTS_FILTER_STORAGE_KEY,
  SECTION_IDS,
  SYSTEM_HEALTH_QUERY_KEY,
  buildExecutionSummary,
  formatAge,
  formatInstant,
  formatRetryPolicy,
  getDiagnosticFallbackStatusLabel,
  getFreshnessMeta,
  getStatusTone,
  getSystemHealthSummary,
  isOperationalStatusMissing,
  isExecutionResultFilter,
  normalizeOperationalStatusLabel,
  type DiagnosticTab,
  type ExecutionEntry,
  type ExecutionResultFilter,
  type InlineNoticeTone,
  type JsonValue,
  type SectionKey,
  type SystemHealthPayload,
  type TaskRetryPolicy,
} from "src/routes/Admin/AdminToolsWorkspaceModel"
import {
  Main,
  OpsOverview,
  OverviewHeader,
  OverviewMeta,
  MetaCaption,
  OverviewContent,
  FeaturedStatusCard,
  CardEyebrow,
  CardMainLine,
  CardDetail,
  StatusCardGrid,
  StatusCardButton,
  SectionTitleBlock,
  CalmMessage,
  WorkspaceShell,
  WorkspaceColumn,
  WorkspaceSection,
  SectionHeading,
  StatusBadge,
  FreshnessBadge,
  SubSectionHeading,
  DetailsPanel,
  DetailsSummary,
  DiagnosticsTabs,
  DiagnosticsTabButton,
  DiagnosticPanel,
  DiagnosticHeader,
  ActionRow,
  QuietButton,
  MetricGrid,
  MetricCard,
  InlineNotice,
  SubtleMetaGrid,
  SubtleMetaItem,
  CompactList,
  CompactListItem,
  CompactCodeList,
  ExecutionLayout,
  ExecutionMain,
  ActionToneBadge,
  ActionList,
  ActionRowButton,
  FieldGrid,
  FieldBox,
  FieldLabel,
  Input,
  TextArea,
  DangerPanel,
  SandboxSection,
  SandboxHeader,
  DangerActionRow,
  ConfirmDeleteRow,
  DangerButton,
} from "src/routes/Admin/AdminToolsWorkspace.styles"
import AdminToolsExecutionRail from "src/routes/Admin/AdminToolsExecutionRail"
import AdminToolsResultsPanel from "src/routes/Admin/AdminToolsResultsPanel"

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

type AdminToolsHealthSsrSnapshot = {
  systemHealth: SystemHealthPayload
  fetchedAt: string
}

type AdminToolsBootstrapPayload = {
  member: AuthMember
  health: SystemHealthPayload
}

type AdminToolsPageProps = AdminPageProps & {
  initialSnapshot: AdminToolsInitialSnapshot
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

const ADMIN_TOOLS_MAIL_SNAPSHOT_COOKIE = "admin_tools_mail_snapshot_v1"
const ADMIN_TOOLS_MAIL_SNAPSHOT_MAX_AGE_SECONDS = 60 * 30
const ADMIN_TOOLS_MAIL_SNAPSHOT_MAX_STALE_MS = 1000 * 60 * 60 * 6
const ADMIN_TOOLS_HEALTH_SSR_CACHE_KEY = "admin-tools:system-health"
const ADMIN_TOOLS_HEALTH_SSR_CACHE_TTL_MS = 10_000

const readCookieValue = (req: IncomingMessage, key: string) => {
  const rawCookie = req.headers.cookie || ""
  if (!rawCookie) return null

  const pairs = rawCookie.split(";")
  for (const pair of pairs) {
    const [cookieKey, ...valueParts] = pair.trim().split("=")
    if (cookieKey !== key) continue
    const value = valueParts.join("=")
    return value ? decodeURIComponent(value) : null
  }

  return null
}

const buildMailSnapshot = (diagnostics: SignupMailDiagnostics): SignupMailDiagnostics => ({
  status: diagnostics.status,
  adapter: diagnostics.adapter,
  host: diagnostics.host,
  port: diagnostics.port,
  mailFrom: diagnostics.mailFrom,
  usernameConfigured: diagnostics.usernameConfigured,
  passwordConfigured: diagnostics.passwordConfigured,
  smtpAuth: diagnostics.smtpAuth,
  startTlsEnabled: diagnostics.startTlsEnabled,
  missing: diagnostics.missing,
  canConnect: diagnostics.canConnect,
  checkedAt: diagnostics.checkedAt,
  verifyPath: diagnostics.verifyPath,
  connectionError: diagnostics.connectionError ?? null,
  taskQueue: diagnostics.taskQueue
    ? {
        taskType: diagnostics.taskQueue.taskType,
        pendingCount: diagnostics.taskQueue.pendingCount,
        readyPendingCount: diagnostics.taskQueue.readyPendingCount,
        delayedPendingCount: diagnostics.taskQueue.delayedPendingCount,
        processingCount: diagnostics.taskQueue.processingCount,
        backlogCount: diagnostics.taskQueue.backlogCount,
        queueLagSeconds: diagnostics.taskQueue.queueLagSeconds,
        failedCount: diagnostics.taskQueue.failedCount,
        staleProcessingCount: diagnostics.taskQueue.staleProcessingCount,
        label: diagnostics.taskQueue.label,
        oldestReadyPendingAt: diagnostics.taskQueue.oldestReadyPendingAt,
        oldestReadyPendingAgeSeconds: diagnostics.taskQueue.oldestReadyPendingAgeSeconds,
        latestFailureAt: diagnostics.taskQueue.latestFailureAt,
        latestFailureMessage: diagnostics.taskQueue.latestFailureMessage,
        retryPolicy: diagnostics.taskQueue.retryPolicy,
      }
    : null,
})

const readMailSnapshotFromCookie = (req: IncomingMessage): SignupMailDiagnostics | null => {
  const raw = readCookieValue(req, ADMIN_TOOLS_MAIL_SNAPSHOT_COOKIE)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<SignupMailDiagnostics>
    if (!parsed || typeof parsed !== "object" || typeof parsed.status !== "string" || typeof parsed.checkedAt !== "string") {
      return null
    }

    const checkedAtMs = new Date(parsed.checkedAt).getTime()
    if (!Number.isFinite(checkedAtMs)) return null
    if (Date.now() - checkedAtMs > ADMIN_TOOLS_MAIL_SNAPSHOT_MAX_STALE_MS) return null

    return {
      status: parsed.status,
      adapter: typeof parsed.adapter === "string" ? parsed.adapter : "UNAVAILABLE",
      host: typeof parsed.host === "string" ? parsed.host : null,
      port: typeof parsed.port === "number" ? parsed.port : null,
      mailFrom: typeof parsed.mailFrom === "string" ? parsed.mailFrom : null,
      usernameConfigured: Boolean(parsed.usernameConfigured),
      passwordConfigured: Boolean(parsed.passwordConfigured),
      smtpAuth: Boolean(parsed.smtpAuth),
      startTlsEnabled: Boolean(parsed.startTlsEnabled),
      missing: Array.isArray(parsed.missing) ? parsed.missing.filter((item): item is string => typeof item === "string") : [],
      canConnect: typeof parsed.canConnect === "boolean" ? parsed.canConnect : null,
      checkedAt: parsed.checkedAt,
      verifyPath: typeof parsed.verifyPath === "string" ? parsed.verifyPath : "/signup/verify",
      connectionError: typeof parsed.connectionError === "string" ? parsed.connectionError : null,
      taskQueue:
        parsed.taskQueue && typeof parsed.taskQueue === "object"
          ? {
              taskType: typeof parsed.taskQueue.taskType === "string" ? parsed.taskQueue.taskType : "미분류",
              pendingCount: typeof parsed.taskQueue.pendingCount === "number" ? parsed.taskQueue.pendingCount : 0,
              readyPendingCount:
                typeof parsed.taskQueue.readyPendingCount === "number" ? parsed.taskQueue.readyPendingCount : 0,
              delayedPendingCount:
                typeof parsed.taskQueue.delayedPendingCount === "number" ? parsed.taskQueue.delayedPendingCount : 0,
              processingCount: typeof parsed.taskQueue.processingCount === "number" ? parsed.taskQueue.processingCount : 0,
              backlogCount: typeof parsed.taskQueue.backlogCount === "number" ? parsed.taskQueue.backlogCount : 0,
              queueLagSeconds:
                typeof parsed.taskQueue.queueLagSeconds === "number" ? parsed.taskQueue.queueLagSeconds : null,
              failedCount: typeof parsed.taskQueue.failedCount === "number" ? parsed.taskQueue.failedCount : 0,
              staleProcessingCount:
                typeof parsed.taskQueue.staleProcessingCount === "number" ? parsed.taskQueue.staleProcessingCount : 0,
              label: typeof parsed.taskQueue.label === "string" ? parsed.taskQueue.label : "회원가입 메일 큐",
              oldestReadyPendingAt:
                typeof parsed.taskQueue.oldestReadyPendingAt === "string" ? parsed.taskQueue.oldestReadyPendingAt : null,
              oldestReadyPendingAgeSeconds:
                typeof parsed.taskQueue.oldestReadyPendingAgeSeconds === "number"
                  ? parsed.taskQueue.oldestReadyPendingAgeSeconds
                  : null,
              latestFailureAt:
                typeof parsed.taskQueue.latestFailureAt === "string" ? parsed.taskQueue.latestFailureAt : null,
              latestFailureMessage:
                typeof parsed.taskQueue.latestFailureMessage === "string" ? parsed.taskQueue.latestFailureMessage : null,
              retryPolicy:
                parsed.taskQueue.retryPolicy && typeof parsed.taskQueue.retryPolicy === "object"
                  ? {
                      label:
                        typeof parsed.taskQueue.retryPolicy.label === "string"
                          ? parsed.taskQueue.retryPolicy.label
                          : "기본 정책",
                      maxRetries:
                        typeof parsed.taskQueue.retryPolicy.maxRetries === "number"
                          ? parsed.taskQueue.retryPolicy.maxRetries
                          : 0,
                      baseDelaySeconds:
                        typeof parsed.taskQueue.retryPolicy.baseDelaySeconds === "number"
                          ? parsed.taskQueue.retryPolicy.baseDelaySeconds
                          : 0,
                      backoffMultiplier:
                        typeof parsed.taskQueue.retryPolicy.backoffMultiplier === "number"
                          ? parsed.taskQueue.retryPolicy.backoffMultiplier
                          : 1,
                      maxDelaySeconds:
                        typeof parsed.taskQueue.retryPolicy.maxDelaySeconds === "number"
                          ? parsed.taskQueue.retryPolicy.maxDelaySeconds
                          : 0,
                    }
                  : {
                      label: "기본 정책",
                      maxRetries: 0,
                      baseDelaySeconds: 0,
                      backoffMultiplier: 1,
                      maxDelaySeconds: 0,
                    },
            }
          : null,
    }
  } catch {
    return null
  }
}

const persistMailSnapshotCookie = (diagnostics: SignupMailDiagnostics) => {
  const snapshot = buildMailSnapshot(diagnostics)
  setCookie(ADMIN_TOOLS_MAIL_SNAPSHOT_COOKIE, JSON.stringify(snapshot), {
    path: "/admin/tools",
    sameSite: "lax",
    maxAge: ADMIN_TOOLS_MAIL_SNAPSHOT_MAX_AGE_SECONDS,
    secure: typeof window !== "undefined" && window.location.protocol === "https:",
  })
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
  const bootstrapResultPromise =
    hasServerAuthCookie(req)
      ? timed(() =>
          readAdminProtectedBootstrap<AdminToolsBootstrapPayload>(req, "/system/api/v1/adm/bootstrap", "/admin/tools")
        )
      : null

  const bootstrapResult = bootstrapResultPromise ? await bootstrapResultPromise : null
  if (bootstrapResult?.ok && !bootstrapResult.value.ok && bootstrapResult.value.destination) {
    return {
      redirect: {
        destination: bootstrapResult.value.destination,
        permanent: false,
      },
    }
  }

  let baseProps: AdminPageProps
  let authDurationMs = 0
  let authDescription = "bootstrap"
  let systemHealthResult: {
    durationMs: number
    ok: true
    value: { value: AdminToolsHealthSsrSnapshot | null; source: string }
  }

  if (bootstrapResult?.ok && bootstrapResult.value.ok) {
    baseProps = buildAdminPagePropsFromMember(bootstrapResult.value.value.member)
    systemHealthResult = {
      durationMs: bootstrapResult.durationMs,
      ok: true,
      value: {
        value: {
          systemHealth: bootstrapResult.value.value.health,
          fetchedAt: new Date().toISOString(),
        },
        source: "bootstrap",
      },
    }
  } else {
    const systemHealthResultPromise =
      hasServerAuthCookie(req)
        ? timed(() =>
            readServerSnapshot<AdminToolsHealthSsrSnapshot>(
              ADMIN_TOOLS_HEALTH_SSR_CACHE_KEY,
              ADMIN_TOOLS_HEALTH_SSR_CACHE_TTL_MS,
              async () => {
                const systemHealth = await readJsonIfOk<SystemHealthPayload>(req, "/system/api/v1/adm/health")
                if (!systemHealth) return null
                return {
                  systemHealth,
                  fetchedAt: new Date().toISOString(),
                }
              }
            )
          )
        : null
    const baseResult = await timed(() => getAdminPageProps(req))
    if (!baseResult.ok) throw baseResult.error
    if ("redirect" in baseResult.value) return baseResult.value
    if (!("props" in baseResult.value)) return baseResult.value
    baseProps = await baseResult.value.props
    authDurationMs = baseResult.durationMs
    authDescription = "fallback"

    const fallbackSystemHealthResult =
      systemHealthResultPromise
        ? await systemHealthResultPromise
        : await timed(() =>
            readServerSnapshot<AdminToolsHealthSsrSnapshot>(
              ADMIN_TOOLS_HEALTH_SSR_CACHE_KEY,
              ADMIN_TOOLS_HEALTH_SSR_CACHE_TTL_MS,
              async () => {
                const systemHealth = await readJsonIfOk<SystemHealthPayload>(req, "/system/api/v1/adm/health")
                if (!systemHealth) return null
                return {
                  systemHealth,
                  fetchedAt: new Date().toISOString(),
                }
              }
            )
          )
    if (!fallbackSystemHealthResult.ok) throw fallbackSystemHealthResult.error
    systemHealthResult = fallbackSystemHealthResult
  }

  const mailSnapshot = readMailSnapshotFromCookie(req)

  const healthSnapshot = systemHealthResult.ok ? systemHealthResult.value.value : null
  const systemHealth = healthSnapshot?.systemHealth ?? null
  const fetchedAt = healthSnapshot?.fetchedAt ?? null
  const mailDiagnostics = mailSnapshot

  appendSsrDebugTiming(req, res, [
    {
      name: "admin-tools-auth",
      durationMs: authDurationMs,
      description: authDescription,
    },
    {
      name: "admin-tools-health",
      durationMs: systemHealthResult.durationMs,
      description: systemHealth ? (systemHealthResult.ok ? systemHealthResult.value.source : "ok") : "empty",
    },
    {
      name: "admin-tools-mail",
      durationMs: 0,
      description: mailDiagnostics ? "snapshot" : "empty",
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
        systemHealthFetchedAt: fetchedAt,
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
  const [systemHealthCheckedAt, setSystemHealthCheckedAt] = useState<string | null>(initialSnapshot.systemHealthFetchedAt)
  const [activeSection, setActiveSection] = useState<SectionKey>("diagnostics")
  const [sectionJumpTarget, setSectionJumpTarget] = useState<SectionKey | null>(null)
  const [activeDiagnosticTab, setActiveDiagnosticTab] = useState<DiagnosticTab | null>(null)
  const [testEmail, setTestEmail] = useState("")
  const [mailTestNotice, setMailTestNotice] = useState<{ tone: InlineNoticeTone; text: string }>({
    tone: "warning",
    text: "",
  })
  const [freshnessClock, setFreshnessClock] = useState<number | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [advancedToolsOpen, setAdvancedToolsOpen] = useState(false)
  const [isMutationExpanded, setIsMutationExpanded] = useState(false)
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
      queryFn: () => apiFetch<SystemHealthPayload>("/system/api/v1/adm/health?fresh=true"),
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
          persistMailSnapshotCookie(diagnostics)
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
    fetchTaskQueueDiagnostics,
    loadingKey,
    mailDiagnostics,
    sessionMember?.isAdmin,
    taskQueueDiagnostics,
  ])

  useEffect(() => {
    if (!sessionMember?.isAdmin || postId.trim() || activeSection !== "execution" || !isMutationExpanded || loadingKey === "seedPostId") return

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
  }, [activeSection, executeAction, isMutationExpanded, loadingKey, postId, sessionMember?.isAdmin])

  useEffect(() => {
    if (typeof window === "undefined") return

    const syncClock = () => setFreshnessClock(Date.now())
    syncClock()
    const interval = window.setInterval(syncClock, 60_000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    if (systemHealthCheckedAt || !systemHealthQuery.data) return
    setSystemHealthCheckedAt(new Date().toISOString())
  }, [systemHealthCheckedAt, systemHealthQuery.data])

  useEffect(() => {
    if (!sectionJumpTarget || typeof window === "undefined") return

    const target = document.getElementById(SECTION_IDS[sectionJumpTarget])
    if (!target) return

    const frame = window.requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: "smooth", block: "start" })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [sectionJumpTarget])

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
      return getFreshnessMeta(entry.completedAt, freshnessClock).tone === "stale"
    })
  }, [executions, freshnessClock, resultsFilter])

  const resultFilterCounts = useMemo(
    () => ({
      all: executions.length,
      success: executions.filter((entry) => entry.status === "success").length,
      error: executions.filter((entry) => entry.status === "error").length,
      stale: executions.filter((entry) => getFreshnessMeta(entry.completedAt, freshnessClock).tone === "stale").length,
    }),
    [executions, freshnessClock]
  )

  const selectedExecution = useMemo(() => {
    if (!filteredExecutions.length) return null
    return filteredExecutions.find((entry) => entry.id === selectedExecutionId) ?? filteredExecutions[0]
  }, [filteredExecutions, selectedExecutionId])

  const rawSystemHealthStatus = systemHealthQuery.data?.status ?? null
  const hasSystemHealthStatus = !isOperationalStatusMissing(rawSystemHealthStatus)
  const isSystemHealthConnectionUnavailable = systemHealthQuery.isError && !hasSystemHealthStatus
  const systemHealthStatus = isSystemHealthConnectionUnavailable
    ? CONNECTION_UNAVAILABLE_STATUS_LABEL
    : normalizeOperationalStatusLabel(systemHealthQuery.data?.status)
  const mailFreshness = getFreshnessMeta(mailDiagnostics?.checkedAt ?? null, freshnessClock)
  const taskQueueFreshness = getFreshnessMeta(taskQueueCheckedAt, freshnessClock)
  const cleanupFreshness = getFreshnessMeta(cleanupCheckedAt, freshnessClock)
  const authFreshness = getFreshnessMeta(authSecurityCheckedAt, freshnessClock)
  const systemHealthFreshness = getFreshnessMeta(systemHealthCheckedAt, freshnessClock)
  const systemHealthSummary = getSystemHealthSummary(systemHealthQuery.data ?? null)
  const systemHealthFetchedAt = systemHealthCheckedAt ? formatInstant(systemHealthCheckedAt) : "-"
  const isMailLoading = loadingKey === "mailStatus" || loadingKey === "mailConnectivity"
  const isQueueLoading = loadingKey === "taskQueueStatus"
  const isCleanupLoading = loadingKey === "cleanupStatus"
  const isAuthLoading = loadingKey === "authSecurityEvents"
  const hasMailDiagnostics = Boolean(mailDiagnostics)
  const hasTaskQueueDiagnostics = Boolean(taskQueueDiagnostics)
  const hasCleanupDiagnostics = Boolean(cleanupDiagnostics)
  const hasAuthDiagnostics = Boolean(authSecurityCheckedAt) || Boolean(authSecurityEvents.length)
  const mailStatusLabel =
    !hasMailDiagnostics
      ? getDiagnosticFallbackStatusLabel(isMailLoading, mailDiagnosticsError)
      : mailDiagnostics?.status === "READY"
      ? "정상"
      : mailDiagnostics?.status === "CONNECTION_FAILED"
        ? "오류"
        : mailDiagnostics?.status === "MISCONFIGURED"
          ? CHECK_REQUIRED_STATUS_LABEL
          : CHECK_REQUIRED_STATUS_LABEL
  const signupMailTaskQueue = mailDiagnostics?.taskQueue ?? null
  const signupMailQueueStatusLabel =
    signupMailTaskQueue?.staleProcessingCount && signupMailTaskQueue.staleProcessingCount > 0
      ? "오류"
      : signupMailTaskQueue?.failedCount && signupMailTaskQueue.failedCount > 0
        ? CHECK_REQUIRED_STATUS_LABEL
        : signupMailTaskQueue?.backlogCount && signupMailTaskQueue.backlogCount > 0
          ? "대기 중"
          : signupMailTaskQueue
            ? "정상"
            : DATA_EMPTY_STATUS_LABEL
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
      ? getDiagnosticFallbackStatusLabel(isQueueLoading, taskQueueDiagnosticsError)
      : taskQueueDiagnostics?.staleProcessingCount && taskQueueDiagnostics.staleProcessingCount > 0
      ? "오류"
      : taskQueueDiagnostics?.failedCount && taskQueueDiagnostics.failedCount > 0
        ? CHECK_REQUIRED_STATUS_LABEL
        : taskQueueDiagnostics
          ? "정상"
          : DATA_EMPTY_STATUS_LABEL
  const cleanupStatusLabel = !hasCleanupDiagnostics
    ? getDiagnosticFallbackStatusLabel(isCleanupLoading, cleanupDiagnosticsError)
    : cleanupDiagnostics?.blockedBySafetyThreshold ? CHECK_REQUIRED_STATUS_LABEL : "정상"
  const authSecurityStatusLabel =
    !hasAuthDiagnostics
      ? getDiagnosticFallbackStatusLabel(isAuthLoading, authSecurityEventsError)
      : authSecurityEvents.length > 0
      ? authSecurityEvents[0]?.eventType === "IP_SECURITY_MISMATCH_BLOCKED"
        ? CHECK_REQUIRED_STATUS_LABEL
        : "최근 기록"
      : "정상"

  const recentCheckedLabel = useMemo(() => {
    const values = [
      systemHealthCheckedAt,
      mailDiagnostics?.checkedAt ?? null,
    ]
      .filter((value): value is string => Boolean(value))
      .sort()

    return values.length ? formatInstant(values[values.length - 1]) : "-"
  }, [systemHealthCheckedAt, mailDiagnostics?.checkedAt])

  const overviewStatusLabel =
    isSystemHealthConnectionUnavailable
      ? CONNECTION_UNAVAILABLE_STATUS_LABEL
      : (hasSystemHealthStatus && rawSystemHealthStatus !== "UP") || mailDiagnostics?.status === "CONNECTION_FAILED"
      ? "오류"
      : mailDiagnostics?.status === "MISCONFIGURED"
        ? CHECK_REQUIRED_STATUS_LABEL
        : !hasSystemHealthStatus && !hasMailDiagnostics
          ? DATA_EMPTY_STATUS_LABEL
          : "정상"

  const attentionItems = [
    isSystemHealthConnectionUnavailable ? "공통 데이터 연결을 먼저 확인하세요." : null,
    hasSystemHealthStatus && rawSystemHealthStatus !== "UP" ? "서비스 상태를 먼저 확인하세요." : null,
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
      section: "diagnostics" as SectionKey,
      tab: "mail" as DiagnosticTab,
    },
    {
      label: "작업 큐",
      status: queueStatusLabel,
      section: "diagnostics" as SectionKey,
      tab: "queue" as DiagnosticTab,
    },
    {
      label: "파일 정리",
      status: cleanupStatusLabel,
      section: "execution" as SectionKey,
      tab: "cleanup" as DiagnosticTab,
    },
    {
      label: "인증 보안",
      status: authSecurityStatusLabel,
      section: "execution" as SectionKey,
      tab: "auth" as DiagnosticTab,
    },
  ]

  const focusSection = (section: SectionKey, tab?: DiagnosticTab) => {
    if (tab) setActiveDiagnosticTab(tab)
    if (section === "mutation") setIsMutationExpanded(true)
    setActiveSection(section)
    setSectionJumpTarget(section)
  }

  if (!sessionMember) return null

  const isBusy = Boolean(loadingKey)
  return (
    <AdminShell currentSection="tools" member={sessionMember}>
      <Main>
      <OpsOverview id={SECTION_IDS.overview} data-ops-section="overview">
        <OverviewHeader>
          <div>
            <h1>문제 확인과 복구를 같은 흐름에서 처리합니다</h1>
          </div>
          <OverviewMeta>
            <StatusBadge data-tone={getStatusTone(overviewStatusLabel)}>{overviewStatusLabel}</StatusBadge>
            <FreshnessBadge data-tone={systemHealthFreshness.tone}>{systemHealthFreshness.label}</FreshnessBadge>
            <MetaCaption>
              <span>최근 확인</span>
              <strong>{recentCheckedLabel}</strong>
            </MetaCaption>
          </OverviewMeta>
        </OverviewHeader>

        <OverviewContent>
          <Link href="/admin/dashboard" passHref legacyBehavior>
            <FeaturedStatusCard as="a">
              <CardEyebrow>운영 대시보드</CardEyebrow>
              <CardMainLine>
                <strong>{systemHealthStatus}</strong>
              </CardMainLine>
              <CardDetail>{systemHealthSummary[0] || `최근 확인 ${systemHealthFetchedAt}`}</CardDetail>
            </FeaturedStatusCard>
          </Link>

          <StatusCardGrid>
            {quickLinks.map((card) => (
              <StatusCardButton key={card.label} type="button" onClick={() => focusSection(card.section, card.tab)}>
                <small>{card.label}</small>
                <strong>{card.status}</strong>
              </StatusCardButton>
            ))}
          </StatusCardGrid>
        </OverviewContent>

        {attentionItems.length ? (
          <InlineNotice data-tone="warning">{attentionItems[0]}</InlineNotice>
        ) : null}
      </OpsOverview>

      <WorkspaceShell>
        <WorkspaceColumn>
          <WorkspaceSection id={SECTION_IDS.diagnostics} data-ops-section="diagnostics">
            <SectionHeading>
              <SectionTitleBlock>
                <h2>메일과 큐</h2>
              </SectionTitleBlock>
            </SectionHeading>

            <DiagnosticsTabs role="tablist" aria-label="메일과 큐 도메인">
              {([
                { key: "mail", label: "메일 진단" },
                { key: "queue", label: "작업 큐 진단" },
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
                  </div>
                  <ActionRow>
                    {hasMailDiagnostics ? <FreshnessBadge data-tone={mailFreshness.tone}>{mailFreshness.label}</FreshnessBadge> : null}
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
                      <CalmMessage>{isMailLoading ? "로딩 중" : "없음"}</CalmMessage>
                    )}
                  </>
                ) : (
                  <CalmMessage>{isMailLoading ? "로딩 중" : "없음"}</CalmMessage>
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
                  </div>
                  <ActionRow>
                    {hasTaskQueueDiagnostics ? <FreshnessBadge data-tone={taskQueueFreshness.tone}>{taskQueueFreshness.label}</FreshnessBadge> : null}
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
                  <CalmMessage>{isQueueLoading ? "로딩 중" : "없음"}</CalmMessage>
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
          </WorkspaceSection>

          <WorkspaceSection id={SECTION_IDS.execution} data-ops-section="execution">
            <SectionHeading>
              <SectionTitleBlock>
                <h2>정리와 보안</h2>
              </SectionTitleBlock>
            </SectionHeading>

            <ExecutionLayout>
              <ExecutionMain>
                <DiagnosticsTabs role="tablist" aria-label="정리와 보안 도메인">
                  {([
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

                {activeDiagnosticTab === "cleanup" ? (
                  <DiagnosticPanel>
                    <DiagnosticHeader>
                      <div>
                        <strong>파일 정리 진단</strong>
                      </div>
                      <ActionRow>
                        {hasCleanupDiagnostics ? <FreshnessBadge data-tone={cleanupFreshness.tone}>{cleanupFreshness.label}</FreshnessBadge> : null}
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
                      <CalmMessage>{isCleanupLoading ? "로딩 중" : "없음"}</CalmMessage>
                    )}
                  </DiagnosticPanel>
                ) : null}

                {activeDiagnosticTab === "auth" ? (
                  <DiagnosticPanel>
                    <DiagnosticHeader>
                      <div>
                        <strong>인증 보안 기록</strong>
                      </div>
                      <ActionRow>
                        {hasAuthDiagnostics ? <FreshnessBadge data-tone={authFreshness.tone}>{authFreshness.label}</FreshnessBadge> : null}
                        <QuietButton type="button" disabled={isBusy} onClick={() => void fetchAuthSecurityEvents()}>
                          다시 확인
                        </QuietButton>
                      </ActionRow>
                    </DiagnosticHeader>

                    {!!authSecurityEventsError && <InlineNotice data-tone="danger">{authSecurityEventsError}</InlineNotice>}

                    {!hasAuthDiagnostics ? (
                      <CalmMessage>{isAuthLoading ? "로딩 중" : "없음"}</CalmMessage>
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
                      <CalmMessage>없음</CalmMessage>
                    )}
                  </DiagnosticPanel>
                ) : null}

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
                      </ActionRowButton>
                    </ActionList>
                  ) : null}
                </DetailsPanel>

                <DetailsPanel open={isMutationExpanded}>
                  <DetailsSummary
                    onClick={(event) => {
                      event.preventDefault()
                      setIsMutationExpanded((prev) => !prev)
                    }}
                  >
                    <span>실데이터 테스트</span>
                    <small>{isMutationExpanded ? "접기" : "열기"}</small>
                  </DetailsSummary>
                  {isMutationExpanded ? (
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
                  ) : null}
                </DetailsPanel>
              </ExecutionMain>

              <AdminToolsExecutionRail
                isBusy={isBusy}
                mailTestNotice={mailTestNotice}
                onFocusSection={focusSection}
                onPostCountCheck={() => void executeAction("admPostCount", () => apiFetch("/post/api/v1/adm/posts/count"))}
                onSendSignupTestMail={() => void sendSignupTestMail()}
                onSystemHealthCheck={() =>
                  void executeAction("systemHealth", () => fetchSystemHealthCached(), {
                    onSuccess: () => {
                      setSystemHealthCheckedAt(new Date().toISOString())
                    },
                  })
                }
                onTestEmailChange={setTestEmail}
                testEmail={testEmail}
              />
            </ExecutionLayout>
          </WorkspaceSection>

          <AdminToolsResultsPanel
            executions={executions}
            filteredExecutions={filteredExecutions}
            freshnessClock={freshnessClock}
            onResultFilterChange={setResultsFilter}
            onSelectedExecutionChange={setSelectedExecutionId}
            resultFilterCounts={resultFilterCounts}
            resultsFilter={resultsFilter}
            selectedExecution={selectedExecution}
          />

        </WorkspaceColumn>
      </WorkspaceShell>
      </Main>
    </AdminShell>
  )
}

export default AdminToolsPage
