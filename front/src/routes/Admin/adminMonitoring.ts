import type { SimpleIcon } from "simple-icons"
import { siGrafana, siPrometheus, siUptimekuma } from "simple-icons"

type MonitoringBrandIcon = {
  icon?: SimpleIcon
  fallbackIcon?: "service"
}

export type MonitoringItem = {
  key: string
  brand: MonitoringBrandIcon
  title: string
  description: string
  href: string
  status: string
}

export type MonitoringPanelCard = {
  key: string
  title: string
  description: string
  panelId: number
}

export const DASHBOARD_PANEL_CARDS: MonitoringPanelCard[] = [
  {
    key: "http-total",
    title: "총 HTTP 요청 수",
    description: "최근 구간 동안 누적된 API 요청량입니다.",
    panelId: 9,
  },
  {
    key: "http-p95",
    title: "HTTP p95 응답 시간",
    description: "지연이 커지는 구간을 빠르게 확인합니다.",
    panelId: 1,
  },
  {
    key: "jvm-heap",
    title: "JVM Heap 사용량",
    description: "메모리 압박이 생기는지 모니터링합니다.",
    panelId: 10,
  },
  {
    key: "hikari-active",
    title: "Hikari 활성 커넥션",
    description: "DB 커넥션 풀이 과하게 점유되는지 확인합니다.",
    panelId: 11,
  },
  {
    key: "http-5xx",
    title: "HTTP 5xx 비율",
    description: "에러 비율이 급등하는 상황을 감시합니다.",
    panelId: 2,
  },
  {
    key: "task-queue",
    title: "작업 큐 적체",
    description: "대기, 처리, 실패, stale 상태를 한 번에 봅니다.",
    panelId: 5,
  },
  {
    key: "cache-hit",
    title: "Post read cache hit rate",
    description: "읽기 캐시 효율이 떨어지는 시점을 빠르게 확인합니다.",
    panelId: 4,
  },
  {
    key: "sse-recovery",
    title: "Notification SSE recovery",
    description: "reconnect, send failure, replay 추이를 감시합니다.",
    panelId: 8,
  },
  {
    key: "scrape-health",
    title: "Back scrape health",
    description: "Prometheus 수집 자체가 흔들리는지 먼저 확인합니다.",
    panelId: 6,
  },
  {
    key: "sse-emitters",
    title: "Notification SSE emitters",
    description: "현재 열린 SSE 연결 수가 비정상적으로 쌓이는지 확인합니다.",
    panelId: 7,
  },
]

const stripTrailingSlash = (value: string) => value.replace(/\/+$/, "")

const extractUrlOrigin = (value: string) => {
  try {
    return new URL(value).origin
  } catch {
    return ""
  }
}

const buildGrafanaDashboardUrl = (origin: string, uid: string, slug: string) => {
  if (!origin) return ""
  return `${stripTrailingSlash(origin)}/d/${uid}/${slug}?orgId=1&kiosk`
}

export const getMonitoringEnv = () => {
  const defaultUptimeStatusPath = process.env.NEXT_PUBLIC_UPTIME_KUMA_STATUS_PATH?.trim() || "/status/aquila"
  const monitoringEmbedUrl =
    process.env.NEXT_PUBLIC_MONITORING_EMBED_URL?.trim() ||
    process.env.NEXT_PUBLIC_GRAFANA_EMBED_URL?.trim() ||
    defaultUptimeStatusPath
  const monitoringEmbedLooksLikeGrafana =
    monitoringEmbedUrl.includes("grafana") ||
    monitoringEmbedUrl.includes("/d/") ||
    monitoringEmbedUrl.includes("/public-dashboards/")
  const monitoringOrigin = extractUrlOrigin(monitoringEmbedUrl)
  const logsDashboardUrl =
    process.env.NEXT_PUBLIC_LOGS_EMBED_URL?.trim() ||
    process.env.NEXT_PUBLIC_GRAFANA_LOGS_EMBED_URL?.trim() ||
    (monitoringEmbedLooksLikeGrafana ? buildGrafanaDashboardUrl(monitoringOrigin, "blog-logs-overview", "aquila-logs-overview") : "")
  const uptimeKumaUrl = process.env.NEXT_PUBLIC_UPTIME_KUMA_URL?.trim() || defaultUptimeStatusPath
  const prometheusUrl = process.env.NEXT_PUBLIC_PROMETHEUS_URL?.trim() || ""

  return {
    defaultUptimeStatusPath,
    monitoringEmbedUrl,
    monitoringEmbedLooksLikeGrafana,
    monitoringOrigin,
    logsDashboardUrl,
    uptimeKumaUrl,
    prometheusUrl,
  }
}

export const buildMonitoringItems = (
  systemHealthStatus: string,
  env: ReturnType<typeof getMonitoringEnv>
): MonitoringItem[] => {
  const items: Array<MonitoringItem | null> = [
    env.uptimeKumaUrl
      ? {
          key: "uptime",
          brand: { icon: siUptimekuma },
          title: "Uptime Kuma",
          description: "외부 가용성과 헬스체크 결과를 봅니다.",
          href: env.uptimeKumaUrl,
          status: systemHealthStatus === "UP" ? "정상" : "확인 필요",
        }
      : null,
    env.prometheusUrl
      ? {
          key: "prometheus",
          brand: { icon: siPrometheus },
          title: "Prometheus",
          description: "원본 시계열과 alert rule을 점검합니다.",
          href: env.prometheusUrl,
          status: "원본 지표",
        }
      : null,
    env.monitoringEmbedUrl
      ? {
          key: "grafana",
          brand: env.monitoringEmbedLooksLikeGrafana ? { icon: siGrafana } : { fallbackIcon: "service" as const },
          title: env.monitoringEmbedLooksLikeGrafana ? "Grafana" : "대시보드",
          description: "운영 패널을 카드 단위로 빠르게 확인합니다.",
          href: env.monitoringEmbedUrl,
          status: env.monitoringEmbedLooksLikeGrafana ? "장기 추이" : "외부 대시보드",
        }
      : null,
  ]

  return items.filter((item): item is MonitoringItem => Boolean(item))
}

export const buildGrafanaPanelEmbedUrl = (dashboardUrl: string, panelId: number) => {
  if (!dashboardUrl) return ""
  try {
    const url = new URL(dashboardUrl)
    if (url.pathname.includes("/d-solo/")) {
      url.searchParams.set("panelId", String(panelId))
      url.searchParams.set("kiosk", "tv")
      url.searchParams.set("theme", "light")
      return url.toString()
    }
    if (url.pathname.includes("/d/")) {
      url.pathname = url.pathname.replace("/d/", "/d-solo/")
      url.searchParams.set("panelId", String(panelId))
      url.searchParams.set("kiosk", "tv")
      url.searchParams.set("theme", "light")
      return url.toString()
    }
    return dashboardUrl
  } catch {
    return dashboardUrl
  }
}
