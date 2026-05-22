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

export { default } from "src/routes/Admin/AdminToolsWorkspacePage"
