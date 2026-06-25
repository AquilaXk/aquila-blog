import { useQuery, useQueryClient } from "@tanstack/react-query"
import { NextPage } from "next"
import { useCallback, useEffect, useMemo, useState } from "react"
import { apiFetch } from "src/apis/backend/client"
import { toFriendlyApiMessage } from "src/apis/backend/errorMessages"
import useAuthSession from "src/hooks/useAuthSession"
import type { DashboardSnapshotPayload } from "src/routes/Admin/AdminDashboardWorkspaceModel"
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
  formatInstant,
  getDiagnosticFallbackStatusLabel,
  getFreshnessMeta,
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
} from "src/routes/Admin/AdminToolsWorkspaceModel"
import {
  EMPTY_INITIAL_SNAPSHOT,
  persistMailSnapshotCookie,
  type AdminToolsPageProps,
  type ApiRsData,
  type AuthSecurityEvent,
  type PageDto,
  type SignupMailDiagnostics,
  type TaskQueueDiagnostics,
  type UploadedFileCleanupDiagnostics,
} from "src/routes/Admin/AdminToolsWorkspacePageState"
import { AdminToolsWorkspaceSections } from "src/routes/Admin/AdminToolsWorkspaceSections"

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
  const dashboardSnapshotQuery = useQuery({
    queryKey: ["admin", "tools", "dashboard-snapshot"],
    queryFn: (): Promise<DashboardSnapshotPayload> => apiFetch<DashboardSnapshotPayload>("/system/api/v1/adm/dashboard-snapshot"),
    enabled: Boolean(sessionMember?.isAdmin),
    staleTime: 30_000,
    gcTime: 120_000,
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
  const toolsWorkspaceSectionProps = { queryClient, sessionMember, loadingKey, setLoadingKey, executions, setExecutions, selectedExecutionId, setSelectedExecutionId, resultsFilter, setResultsFilter, postId, setPostId, commentId, setCommentId, commentContent, setCommentContent, mailDiagnostics, setMailDiagnostics, mailDiagnosticsError, setMailDiagnosticsError, taskQueueDiagnostics, setTaskQueueDiagnostics, taskQueueDiagnosticsError, setTaskQueueDiagnosticsError, taskQueueCheckedAt, setTaskQueueCheckedAt, cleanupDiagnostics, setCleanupDiagnostics, cleanupDiagnosticsError, setCleanupDiagnosticsError, cleanupCheckedAt, setCleanupCheckedAt, authSecurityEvents, setAuthSecurityEvents, authSecurityEventsError, setAuthSecurityEventsError, authSecurityCheckedAt, setAuthSecurityCheckedAt, systemHealthCheckedAt, setSystemHealthCheckedAt, activeSection, setActiveSection, sectionJumpTarget, setSectionJumpTarget, activeDiagnosticTab, setActiveDiagnosticTab, testEmail, setTestEmail, mailTestNotice, setMailTestNotice, freshnessClock, setFreshnessClock, confirmDelete, setConfirmDelete, advancedToolsOpen, setAdvancedToolsOpen, isMutationExpanded, setIsMutationExpanded, systemHealthQuery, dashboardSnapshot: dashboardSnapshotQuery.data ?? null, fetchSystemHealthCached, pushExecution, executeAction, parsePositiveInt, requireCommentContent, fetchSignupMailDiagnostics, sendSignupTestMail, fetchTaskQueueDiagnostics, fetchCleanupDiagnostics, fetchAuthSecurityEvents, filteredExecutions, resultFilterCounts, selectedExecution, rawSystemHealthStatus, hasSystemHealthStatus, isSystemHealthConnectionUnavailable, systemHealthStatus, mailFreshness, taskQueueFreshness, cleanupFreshness, authFreshness, systemHealthFreshness, systemHealthSummary, systemHealthFetchedAt, isMailLoading, isQueueLoading, isCleanupLoading, isAuthLoading, hasMailDiagnostics, hasTaskQueueDiagnostics, hasCleanupDiagnostics, hasAuthDiagnostics, mailStatusLabel, signupMailTaskQueue, signupMailQueueStatusLabel, signupMailQueueStatusMessage, queueStatusLabel, cleanupStatusLabel, authSecurityStatusLabel, recentCheckedLabel, overviewStatusLabel, attentionItems, quickLinks, focusSection }
  return <AdminToolsWorkspaceSections {...toolsWorkspaceSectionProps} />
}

export default AdminToolsPage
