import type { IconName } from "src/components/icons/AppIcon"

export type SystemHealthPayload = {
  status?: string
}

export type DashboardSnapshotPayload = {
  generatedAt: string
  taskQueue: {
    pendingCount: number
    readyPendingCount: number
    processingCount: number
    failedCount: number
    staleProcessingCount: number
    oldestReadyPendingAgeSeconds: number | null
    latestFailureAt: string | null
    latestFailureMessage: string | null
  }
  signupMail: {
    status: string
    queueLagSeconds: number | null
    latestFailureAt: string | null
    latestFailureMessage: string | null
  }
  authSecurity: {
    recentEventCount: number
    blockedEventCount: number
    latestEventAt: string | null
    latestBlockedAt: string | null
  }
  storageCleanup: {
    eligibleForPurgeCount: number
    blockedBySafetyThreshold: boolean
    oldestEligiblePurgeAfter: string | null
  }
}

export type AdminDashboardInitialSnapshot = {
  systemHealth: SystemHealthPayload | null
  dashboard: DashboardSnapshotPayload | null
  systemHealthFetchedAt: string | null
  dashboardFetchedAt: string | null
}

export type DashboardKpiCard = {
  key: string
  label: string
  value: string
  detail: string
  tone: "neutral" | "good" | "warn"
  icon: IconName
}

export type DashboardPriorityRow = {
  key: string
  title: string
  summary: string
  tone: "neutral" | "good" | "warn"
  href: string
  actionLabel: string
}

export type DashboardQuickAction = {
  key: string
  href: string
  label: string
}

export const EMPTY_INITIAL_SNAPSHOT: AdminDashboardInitialSnapshot = {
  systemHealth: null,
  dashboard: null,
  systemHealthFetchedAt: null,
  dashboardFetchedAt: null,
}

export const ADMIN_DASHBOARD_DISPLAY_TIME_ZONE = "Asia/Seoul"

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
    timeZone: ADMIN_DASHBOARD_DISPLAY_TIME_ZONE,
  }).format(date)
}

export const formatAge = (seconds: number | null | undefined) => {
  if (seconds == null) return "-"
  if (seconds < 60) return `${seconds}초`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}분`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}시간`
  return `${Math.floor(seconds / 86400)}일`
}

export const getMailStatusLabel = (value: string | null | undefined) => {
  switch (value) {
    case "READY":
      return "전송 준비"
    case "TEST_MODE":
      return "테스트 모드"
    case "MISCONFIGURED":
      return "설정 누락"
    case "QUEUE_LOCKED":
      return "큐 잠금"
    case "CONNECTION_FAILED":
      return "연결 실패"
    case "UNAVAILABLE":
      return "비활성"
    default:
      return value || "미확인"
  }
}

export const getMailStatusTone = (value: string | null | undefined): DashboardKpiCard["tone"] =>
  value === "READY" || value === "TEST_MODE" ? "good" : value ? "warn" : "neutral"

export const getTaskQueueTone = (snapshot: DashboardSnapshotPayload | null | undefined): DashboardKpiCard["tone"] => {
  if (!snapshot) return "neutral"
  if (snapshot.taskQueue.failedCount > 0 || snapshot.taskQueue.staleProcessingCount > 0) return "warn"
  if (snapshot.taskQueue.readyPendingCount === 0 && snapshot.taskQueue.processingCount === 0) return "good"
  return "neutral"
}
