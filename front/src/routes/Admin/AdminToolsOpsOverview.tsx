import {
  Chart,
  ChartBar,
  ChartBars,
  HeaderLink,
  HeroActions,
  HeroCopy,
  HeroPanel,
  HeroTop,
  LogLine,
  LogLines,
  MetricCard,
  MetricCopy,
  OpsGrid,
  PanelCard,
  PanelHeader,
  PrioritySummary,
  ServiceRail,
  StatusChip,
  StatusDot,
  StatusRow,
  StatusRows,
} from "src/routes/Admin/AdminDashboardWorkspace.styles"
import {
  CalmMessage,
  FreshnessBadge,
} from "src/routes/Admin/AdminToolsWorkspace.styles"
import {
  CONNECTION_UNAVAILABLE_STATUS_LABEL,
  DATA_EMPTY_STATUS_LABEL,
  DATA_MISSING_STATUS_LABEL,
  SECTION_IDS,
  formatInstant,
  type SystemHealthPayload,
} from "src/routes/Admin/AdminToolsWorkspaceModel"

type OpsTone = "good" | "neutral" | "warn"

type OpsMetric = {
  key: string
  label: string
  value: string
  detail: string
  tone: OpsTone
}

type OpsBar = {
  key: string
  label: string
  height: number
  tone: OpsTone
}

type OpsLogRow = {
  key: string
  time: string
  message: string
  detail: string
  tone: OpsTone
}

type Props = Record<string, any>

const toOpsTone = (value: string | null | undefined): OpsTone => {
  const normalized = value?.trim()
  if (!normalized || normalized === DATA_EMPTY_STATUS_LABEL) return "neutral"
  if (
    normalized === DATA_MISSING_STATUS_LABEL ||
    normalized === CONNECTION_UNAVAILABLE_STATUS_LABEL ||
    normalized.toUpperCase() === "UNKNOWN"
  )
    return "neutral"
  if (
    /오류|실패|DOWN|DEGRADED|WARN|점검|MISCONFIGURED|CONNECTION_FAILED/i.test(
      normalized
    )
  )
    return "warn"
  return "good"
}

const readStringField = (payload: unknown, key: string) => {
  if (!payload || typeof payload !== "object") return ""
  const value = (payload as Record<string, unknown>)[key]
  return typeof value === "string" ? value : ""
}

const readHealthCheck = (
  health: SystemHealthPayload | null | undefined,
  key: string
) => readStringField(health?.checks, key)

const buildBars = (props: Props): OpsBar[] => {
  const dashboardSnapshot = props.dashboardSnapshot
  const mailQueue = props.mailDiagnostics?.taskQueue
  const values = dashboardSnapshot
    ? [
        {
          key: "ready",
          label: "ready",
          value: dashboardSnapshot.taskQueue.readyPendingCount,
          tone: "neutral" as OpsTone,
        },
        {
          key: "processing",
          label: "processing",
          value: dashboardSnapshot.taskQueue.processingCount,
          tone: "neutral" as OpsTone,
        },
        {
          key: "failed",
          label: "failed",
          value: dashboardSnapshot.taskQueue.failedCount,
          tone: dashboardSnapshot.taskQueue.failedCount
            ? ("warn" as OpsTone)
            : ("good" as OpsTone),
        },
        {
          key: "stale",
          label: "stale",
          value: dashboardSnapshot.taskQueue.staleProcessingCount,
          tone: dashboardSnapshot.taskQueue.staleProcessingCount
            ? ("warn" as OpsTone)
            : ("good" as OpsTone),
        },
        {
          key: "purge",
          label: "purge",
          value: dashboardSnapshot.storageCleanup.eligibleForPurgeCount,
          tone: dashboardSnapshot.storageCleanup.eligibleForPurgeCount
            ? ("warn" as OpsTone)
            : ("good" as OpsTone),
        },
        {
          key: "auth",
          label: "auth",
          value: dashboardSnapshot.authSecurity.recentEventCount,
          tone: dashboardSnapshot.authSecurity.recentEventCount
            ? ("neutral" as OpsTone)
            : ("good" as OpsTone),
        },
        {
          key: "blocked",
          label: "blocked",
          value: dashboardSnapshot.authSecurity.blockedEventCount,
          tone: dashboardSnapshot.authSecurity.blockedEventCount
            ? ("warn" as OpsTone)
            : ("good" as OpsTone),
        },
        {
          key: "mail-lag",
          label: "mail",
          value: dashboardSnapshot.signupMail.queueLagSeconds ?? 0,
          tone: toOpsTone(dashboardSnapshot.signupMail.status),
        },
      ]
    : [
        {
          key: "ready",
          label: "ready",
          value: props.taskQueueDiagnostics?.readyPendingCount ?? 0,
          tone: "neutral" as OpsTone,
        },
        {
          key: "processing",
          label: "processing",
          value: props.taskQueueDiagnostics?.processingCount ?? 0,
          tone: "neutral" as OpsTone,
        },
        {
          key: "failed",
          label: "failed",
          value: props.taskQueueDiagnostics?.failedCount ?? 0,
          tone: props.taskQueueDiagnostics?.failedCount
            ? ("warn" as OpsTone)
            : ("good" as OpsTone),
        },
        {
          key: "stale",
          label: "stale",
          value: props.taskQueueDiagnostics?.staleProcessingCount ?? 0,
          tone: props.taskQueueDiagnostics?.staleProcessingCount
            ? ("warn" as OpsTone)
            : ("good" as OpsTone),
        },
        {
          key: "purge",
          label: "purge",
          value: props.cleanupDiagnostics?.eligibleForPurgeCount ?? 0,
          tone: props.cleanupDiagnostics?.eligibleForPurgeCount
            ? ("warn" as OpsTone)
            : ("good" as OpsTone),
        },
        {
          key: "auth",
          label: "auth",
          value: props.authSecurityEvents.length,
          tone: props.authSecurityEvents.length
            ? ("neutral" as OpsTone)
            : ("good" as OpsTone),
        },
        {
          key: "mail-backlog",
          label: "mail",
          value: mailQueue?.backlogCount ?? 0,
          tone: mailQueue?.backlogCount
            ? ("warn" as OpsTone)
            : ("good" as OpsTone),
        },
        {
          key: "mail-failed",
          label: "mail-failed",
          value: mailQueue?.failedCount ?? 0,
          tone: mailQueue?.failedCount
            ? ("warn" as OpsTone)
            : ("good" as OpsTone),
        },
      ]
  const hasCollectedData = Boolean(
    dashboardSnapshot ||
      props.taskQueueDiagnostics ||
      props.cleanupDiagnostics ||
      props.authSecurityEvents.length ||
      mailQueue
  )
  if (!hasCollectedData) return []
  const maxValue = Math.max(...values.map((bar) => bar.value), 1)
  return values.map((bar) => ({
    key: bar.key,
    label: bar.label,
    height:
      bar.value > 0
        ? Math.max(14, Math.round((bar.value / maxValue) * 100))
        : 8,
    tone: bar.tone,
  }))
}

export const AdminToolsOpsOverview = (props: Props) => {
  const health = props.systemHealthQuery.data ?? null
  const isActionBusy = Boolean(props.loadingKey)
  const version = readStringField(health, "version") || "dev"
  const redisStatus =
    readHealthCheck(health, "redis") || props.systemHealthStatus
  const dbStatus = readHealthCheck(health, "db") || props.systemHealthStatus
  const signupMailStatus =
    readHealthCheck(health, "signupMail") || props.mailStatusLabel
  const dashboardSnapshot = props.dashboardSnapshot
  const blockedAuthCount = props.authSecurityEvents.filter(
    (event: { eventType?: string }) =>
      event.eventType === "IP_SECURITY_MISMATCH_BLOCKED"
  ).length
  const queueFailures = dashboardSnapshot
    ? dashboardSnapshot.taskQueue.failedCount +
      dashboardSnapshot.taskQueue.staleProcessingCount
    : (props.taskQueueDiagnostics?.failedCount ?? 0) +
      (props.taskQueueDiagnostics?.staleProcessingCount ?? 0)
  const authFailures = dashboardSnapshot
    ? dashboardSnapshot.authSecurity.blockedEventCount
    : blockedAuthCount
  const queueValue = dashboardSnapshot
    ? `${dashboardSnapshot.taskQueue.readyPendingCount} ready`
    : props.queueStatusLabel
  const metricCards: OpsMetric[] = [
    {
      key: "slot",
      label: "Active slot",
      value: props.systemHealthStatus,
      detail: `version ${version}`,
      tone: toOpsTone(props.systemHealthStatus),
    },
    {
      key: "api-p95",
      label: "API p95",
      value: queueValue,
      detail: dashboardSnapshot
        ? `processing ${dashboardSnapshot.taskQueue.processingCount}`
        : "queue snapshot",
      tone: toOpsTone(props.queueStatusLabel),
    },
    {
      key: "error-rate",
      label: "Error rate",
      value: `${queueFailures + authFailures}건`,
      detail: `queue ${queueFailures} · auth ${authFailures}`,
      tone: queueFailures + authFailures ? "warn" : "good",
    },
    {
      key: "cache-hit",
      label: "Cache hit",
      value: redisStatus,
      detail: `signup mail ${signupMailStatus}`,
      tone: toOpsTone(redisStatus),
    },
  ]
  const bars = buildBars(props)
  const logRows: OpsLogRow[] = [
    {
      key: "health",
      time: props.recentCheckedLabel,
      message: "system.health",
      detail: `status=${props.systemHealthStatus} redis=${redisStatus}`,
      tone: toOpsTone(props.systemHealthStatus),
    },
    {
      key: "queue",
      time: dashboardSnapshot?.taskQueue.latestFailureAt
        ? formatInstant(dashboardSnapshot.taskQueue.latestFailureAt)
        : props.recentCheckedLabel,
      message: "task.queue",
      detail: dashboardSnapshot
        ? `ready=${dashboardSnapshot.taskQueue.readyPendingCount} failed=${dashboardSnapshot.taskQueue.failedCount} stale=${dashboardSnapshot.taskQueue.staleProcessingCount}`
        : "snapshot=empty",
      tone: toOpsTone(props.queueStatusLabel),
    },
    {
      key: "mail",
      time: dashboardSnapshot?.signupMail.latestFailureAt
        ? formatInstant(dashboardSnapshot.signupMail.latestFailureAt)
        : props.recentCheckedLabel,
      message: "signup.mail",
      detail: `status=${signupMailStatus}`,
      tone: toOpsTone(signupMailStatus),
    },
    {
      key: "storage",
      time: dashboardSnapshot?.storageCleanup.oldestEligiblePurgeAfter
        ? formatInstant(
            dashboardSnapshot.storageCleanup.oldestEligiblePurgeAfter
          )
        : props.recentCheckedLabel,
      message: "storage.cleanup",
      detail: dashboardSnapshot
        ? `eligible=${dashboardSnapshot.storageCleanup.eligibleForPurgeCount} blocked=${dashboardSnapshot.storageCleanup.blockedBySafetyThreshold}`
        : "snapshot=empty",
      tone: dashboardSnapshot?.storageCleanup.blockedBySafetyThreshold
        ? "warn"
        : "good",
    },
    {
      key: "auth",
      time: dashboardSnapshot?.authSecurity.latestEventAt
        ? formatInstant(dashboardSnapshot.authSecurity.latestEventAt)
        : props.recentCheckedLabel,
      message: "auth.security",
      detail: dashboardSnapshot
        ? `recent=${dashboardSnapshot.authSecurity.recentEventCount} blocked=${dashboardSnapshot.authSecurity.blockedEventCount}`
        : `recent=${props.authSecurityEvents.length} blocked=${blockedAuthCount}`,
      tone: authFailures ? "warn" : "neutral",
    },
  ]

  return (
    <>
      <HeroPanel id={SECTION_IDS.overview} data-ops-section="overview">
        <HeroTop>
          <HeroCopy>
            <span>Operations</span>
            <h1>운영 상태와 복구</h1>
            <p>배포 슬롯, readiness, 로그와 주요 시스템 지표를 확인합니다.</p>
          </HeroCopy>
          <HeroActions>
            <StatusChip data-tone={toOpsTone(props.overviewStatusLabel)}>
              {props.overviewStatusLabel}
            </StatusChip>
            <FreshnessBadge data-tone={props.systemHealthFreshness.tone}>
              {props.systemHealthFreshness.label}
            </FreshnessBadge>
            <HeaderLink
              as="button"
              type="button"
              aria-disabled={isActionBusy}
              onClick={() =>
                isActionBusy
                  ? undefined
                  : void props.executeAction(
                      "systemHealth",
                      props.fetchSystemHealthCached,
                      {
                        onSuccess: () =>
                          props.setSystemHealthCheckedAt(
                            new Date().toISOString()
                          ),
                      }
                    )
              }
            >
              Doctor 실행
            </HeaderLink>
            <HeaderLink
              as="button"
              type="button"
              data-variant="primary"
              onClick={() => props.focusSection("execution")}
            >
              Rollback
            </HeaderLink>
          </HeroActions>
        </HeroTop>
      </HeroPanel>

      <ServiceRail data-ui="tools-service-rail">
        {metricCards.map((item) => (
          <MetricCard key={item.key} data-tone={item.tone}>
            <MetricCopy>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <small>{item.detail}</small>
            </MetricCopy>
          </MetricCard>
        ))}
      </ServiceRail>

      <OpsGrid>
        <PanelCard>
          <PanelHeader>
            <h2>Public read latency</h2>
            <StatusChip data-tone={toOpsTone(props.overviewStatusLabel)}>
              LIVE
            </StatusChip>
          </PanelHeader>
          <Chart aria-label="운영 도구 진단 지표 차트">
            {bars.length ? (
              <ChartBars>
                {bars.map((bar) => (
                  <ChartBar
                    key={bar.key}
                    aria-label={`${bar.label} ${bar.height}`}
                    data-tone={bar.tone}
                    style={{ height: `${bar.height}%` }}
                  />
                ))}
              </ChartBars>
            ) : (
              <CalmMessage>데이터 없음</CalmMessage>
            )}
          </Chart>
        </PanelCard>

        <PanelCard>
          <PanelHeader>
            <h2>Steady-state guard</h2>
          </PanelHeader>
          <StatusRows data-ui="tools-guard-rows">
            {[
              {
                key: "route",
                title: "Caddy route",
                summary: `system ${props.systemHealthStatus}`,
                tone: toOpsTone(props.systemHealthStatus),
                value: props.systemHealthStatus,
              },
              {
                key: "readiness",
                title: "Readiness",
                summary: `db ${dbStatus} · mail ${signupMailStatus}`,
                tone: toOpsTone(dbStatus),
                value: dbStatus === "UP" ? "PASS" : dbStatus,
              },
              {
                key: "redis",
                title: "Redis memory",
                summary: `redis ${redisStatus}`,
                tone: toOpsTone(redisStatus),
                value: redisStatus === "UP" ? "PASS" : redisStatus,
              },
            ].map((row) => (
              <StatusRow key={row.key} data-tone={row.tone}>
                <span>
                  <StatusDot data-tone={row.tone} aria-hidden="true" />
                  <span>
                    <strong>{row.title}</strong>
                    <small>{row.summary}</small>
                  </span>
                </span>
                <PrioritySummary data-tone={row.tone}>
                  {row.value}
                </PrioritySummary>
              </StatusRow>
            ))}
          </StatusRows>
        </PanelCard>

        <PanelCard data-size="wide">
          <PanelHeader>
            <h2>Live logs</h2>
            <span>Loki · production</span>
          </PanelHeader>
          <LogLines>
            {logRows.map((row) => (
              <LogLine key={row.key} data-tone={row.tone}>
                <span>{row.time}</span>
                <p>
                  {row.message}
                  <small>{row.detail}</small>
                </p>
              </LogLine>
            ))}
          </LogLines>
        </PanelCard>
      </OpsGrid>
    </>
  )
}
