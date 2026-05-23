import { setCookie } from "cookies-next"
import type { AuthMember } from "src/hooks/useAuthSession"
import type { SystemHealthPayload, TaskRetryPolicy } from "src/routes/Admin/AdminToolsWorkspaceModel"

export type SignupMailDiagnostics = {
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

export type TaskTypeDiagnostics = {
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

export type TaskExecutionSample = {
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

export type TaskQueueDiagnostics = {
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

export type UploadedFileCleanupDiagnostics = {
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

export type AuthSecurityEvent = {
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

export type ApiRsData<T> = {
  resultCode: string
  msg: string
  data: T
}

export type AdminToolsInitialSnapshot = {
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

export type AdminToolsHealthSsrSnapshot = {
  systemHealth: SystemHealthPayload
  fetchedAt: string
}

export type AdminToolsBootstrapPayload = {
  member: AuthMember
  health: SystemHealthPayload
}

export type AdminToolsPageProps = {
  initialMember: AuthMember
  initialSnapshot: AdminToolsInitialSnapshot
}

export type PageDto<T> = {
  content?: T[]
}

export const EMPTY_INITIAL_SNAPSHOT: AdminToolsInitialSnapshot = {
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

export const buildMailSnapshot = (diagnostics: SignupMailDiagnostics): SignupMailDiagnostics => ({
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

export const persistMailSnapshotCookie = (diagnostics: SignupMailDiagnostics) => {
  const snapshot = buildMailSnapshot(diagnostics)
  setCookie(ADMIN_TOOLS_MAIL_SNAPSHOT_COOKIE, JSON.stringify(snapshot), {
    path: "/admin/tools",
    sameSite: "lax",
    maxAge: ADMIN_TOOLS_MAIL_SNAPSHOT_MAX_AGE_SECONDS,
    secure: typeof window !== "undefined" && window.location.protocol === "https:",
  })
}
