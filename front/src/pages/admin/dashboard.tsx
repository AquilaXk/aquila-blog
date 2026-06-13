import { useQuery } from "@tanstack/react-query"
import { GetServerSideProps, NextPage } from "next"
import { IncomingMessage } from "http"
import Link from "next/link"
import type { SimpleIcon } from "simple-icons"
import { useEffect, useRef, useState } from "react"
import { apiFetch } from "src/apis/backend/client"
import AppIcon from "src/components/icons/AppIcon"
import type { AuthMember } from "src/hooks/useAuthSession"
import useAuthSession from "src/hooks/useAuthSession"
import { AdminPageProps, buildAdminPagePropsFromMember, getAdminPageProps, readAdminProtectedBootstrap } from "src/libs/server/adminPage"
import { hasServerAuthCookie } from "src/libs/server/authSession"
import { serverApiFetch } from "src/libs/server/backend"
import { appendSsrDebugTiming, timed } from "src/libs/server/serverTiming"
import {
  DASHBOARD_PANEL_CARDS,
  buildGrafanaPanelEmbedUrl,
  buildMonitoringItems,
  getMonitoringEnv,
} from "src/routes/Admin/adminMonitoring"
import AdminShell from "src/routes/Admin/AdminShell"
import {
  DASHBOARD_BACKEND_CHECK_LABEL,
  DASHBOARD_DATA_MISSING_LABEL,
  EMPTY_INITIAL_SNAPSHOT,
  formatAge,
  formatInstant,
  getMailStatusLabel,
  getMailStatusTone,
  getSystemHealthStatusLabel,
  getSystemHealthTone,
  getTaskQueueTone,
  hasDashboardSnapshot,
  type AdminDashboardInitialSnapshot,
  type DashboardKpiCard,
  type DashboardPriorityRow,
  type DashboardQuickAction,
  type DashboardSnapshotPayload,
  type SystemHealthPayload,
} from "src/routes/Admin/AdminDashboardWorkspaceModel"
import {
  Main,
  Shell,
  HeroPanel,
  HeroTop,
  HeroCopy,
  HeroActions,
  StatusChip,
  HeaderLink,
  ServiceRail,
  MetricCard,
  MetricIcon,
  MetricCopy,
  PanelGrid,
  PanelCard,
  LeadPanelCard,
  CompactPanelCard,
  PanelHeader,
  LaunchLink,
  PanelBody,
  SnapshotLeadBody,
  PanelFrame,
  CompactPanelBody,
  CompactPanelSummary,
  PanelFallback,
  InsightRail,
  LeadMetaGrid,
  LeadMetaCard,
  ActionList,
  ActionListLinkCard,
  SectionHeader,
  PrioritySection,
  ContextGrid,
  ContextSection,
  ContextLinkGrid,
  ContextMonitoringLinkCard,
  AdditionalPanelsSection,
  AdditionalPanelsDisclosure,
  AdditionalPanelsSummary,
  AdditionalPanelsGrid,
  PriorityTable,
  PriorityCellCopy,
  PrioritySummary,
  PriorityLink,
  InsightLink,
} from "src/routes/Admin/AdminDashboardWorkspace.styles"
import {
  AdminInfoLinkCard,
  AdminInfoList,
  AdminInfoStatusItem,
  AdminInfoStatusList,
} from "src/routes/Admin/AdminSurfacePrimitives"

type AdminDashboardPageProps = AdminPageProps & {
  initialSnapshot: AdminDashboardInitialSnapshot
}

type AdminDashboardBootstrapPayload = {
  member: AuthMember
  health: SystemHealthPayload
  dashboard: DashboardSnapshotPayload
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

export const getServerSideProps: GetServerSideProps<AdminDashboardPageProps> = async ({ req, res }) => {
  const ssrStartedAt = performance.now()
  const bootstrapResultPromise =
    hasServerAuthCookie(req)
      ? timed(() =>
          readAdminProtectedBootstrap<AdminDashboardBootstrapPayload>(req, "/system/api/v1/adm/bootstrap", "/admin/dashboard")
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
  let authDescription: string = "bootstrap"
  let systemHealthResult: {
    durationMs: number
    ok: true
    value: { value: SystemHealthPayload | null; source: string }
  }
  let dashboardSnapshotResult: {
    durationMs: number
    ok: true
    value: { value: DashboardSnapshotPayload | null; source: string }
  }

  if (bootstrapResult?.ok && bootstrapResult.value.ok) {
    baseProps = buildAdminPagePropsFromMember(bootstrapResult.value.value.member)
    systemHealthResult = {
      durationMs: bootstrapResult.durationMs,
      ok: true,
      value: {
        value: bootstrapResult.value.value.health,
        source: "bootstrap",
      },
    }
    dashboardSnapshotResult = {
      durationMs: bootstrapResult.durationMs,
      ok: true,
      value: {
        value: bootstrapResult.value.value.dashboard,
        source: "bootstrap",
      },
    }
  } else {
    const baseResult = await timed(() => getAdminPageProps(req))
    if (!baseResult.ok) throw baseResult.error
    if ("redirect" in baseResult.value) return baseResult.value
    if (!("props" in baseResult.value)) return baseResult.value
    baseProps = await baseResult.value.props
    authDurationMs = baseResult.durationMs
    authDescription = "fallback"

    const fallbackSystemHealthResult = await timed(() => readJsonIfOk<SystemHealthPayload>(req, "/system/api/v1/adm/health"))
    if (!fallbackSystemHealthResult.ok) throw fallbackSystemHealthResult.error
    const fallbackDashboardSnapshotResult = await timed(() =>
      readJsonIfOk<DashboardSnapshotPayload>(req, "/system/api/v1/adm/dashboard-snapshot")
    )
    if (!fallbackDashboardSnapshotResult.ok) throw fallbackDashboardSnapshotResult.error
    systemHealthResult = {
      durationMs: fallbackSystemHealthResult.durationMs,
      ok: true,
      value: {
        value: fallbackSystemHealthResult.value,
        source: fallbackSystemHealthResult.value ? "ok" : "empty",
      },
    }
    dashboardSnapshotResult = {
      durationMs: fallbackDashboardSnapshotResult.durationMs,
      ok: true,
      value: {
        value: fallbackDashboardSnapshotResult.value,
        source: fallbackDashboardSnapshotResult.value ? "ok" : "empty",
      },
    }
  }

  const systemHealth = systemHealthResult.value.value
  const dashboardSnapshot = dashboardSnapshotResult.value.value

  appendSsrDebugTiming(req, res, [
    {
      name: "admin-dashboard-auth",
      durationMs: authDurationMs,
      description: authDescription,
    },
    {
      name: "admin-dashboard-health",
      durationMs: systemHealthResult.durationMs,
      description: systemHealth ? systemHealthResult.value.source : "empty",
    },
    {
      name: "admin-dashboard-snapshot",
      durationMs: dashboardSnapshotResult.durationMs,
      description: dashboardSnapshot ? dashboardSnapshotResult.value.source : "empty",
    },
    {
      name: "admin-dashboard-ssr-total",
      durationMs: performance.now() - ssrStartedAt,
      description: "ready",
    },
  ])

  return {
    props: {
      ...baseProps,
      initialSnapshot: {
        systemHealth,
        dashboard: dashboardSnapshot,
        systemHealthFetchedAt: systemHealth ? new Date().toISOString() : null,
        dashboardFetchedAt: dashboardSnapshot?.generatedAt ?? (dashboardSnapshot ? new Date().toISOString() : null),
      },
    },
  }
}

export { default } from "src/routes/Admin/AdminDashboardWorkspacePage"
