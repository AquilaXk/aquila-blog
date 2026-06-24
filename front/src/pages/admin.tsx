import { GetServerSideProps, NextPage } from "next"
import dynamic from "next/dynamic"
import { IncomingMessage } from "http"
import type { AuthMember } from "src/hooks/useAuthSession"
import { type AdminProfile } from "src/hooks/useAdminProfile"
import { AdminPageProps, buildAdminPagePropsFromMember, getAdminPageProps, readAdminProtectedBootstrap } from "src/libs/server/adminPage"
import {
  fetchServerAdminProfile,
  hasServerAuthCookie,
  resolvePublicAdminProfileSnapshot,
} from "src/libs/server/adminProfile"
import { serverApiFetch } from "src/libs/server/backend"
import { appendSsrDebugTiming, timed } from "src/libs/server/serverTiming"
import AdminShell from "src/routes/Admin/AdminShell"

const AdminHubSurface = dynamic(() => import("src/routes/Admin/AdminHubSurface"), {
  loading: () => <div aria-hidden="true" style={{ minHeight: "32rem" }} />,
})

type AdminHubPageProps = AdminPageProps & {
  initialProfileSnapshot: AdminProfile
  initialOperationalSnapshot: AdminHubOperationalSnapshot
}

type AdminHubBootstrapPayload = {
  member: AuthMember
  profile: AdminProfile
}

type AdminHubPostListItem = {
  id: number
  title: string
  published: boolean
  listed: boolean
  tempDraft?: boolean
  modifiedAt: string
}

type AdminHubPageDto<T> = {
  content: T[]
  pageable?: {
    totalElements?: number
  }
}

type AdminHubSystemHealthPayload = {
  status?: string
}

type AdminHubDashboardSnapshotPayload = {
  authSecurity: {
    recentEventCount: number
    blockedEventCount: number
  }
  signupMail: {
    status: string
  }
  storageCleanup: {
    eligibleForPurgeCount: number
    blockedBySafetyThreshold: boolean
  }
  taskQueue: {
    readyPendingCount: number
    processingCount: number
    failedCount: number
    staleProcessingCount: number
  }
}

type AdminHubOperationalSnapshot = {
  posts: AdminHubPageDto<AdminHubPostListItem> | null
  systemHealth: AdminHubSystemHealthPayload | null
  dashboard: AdminHubDashboardSnapshotPayload | null
  fetchedAt: string | null
}

const EMPTY_OPERATIONAL_SNAPSHOT: AdminHubOperationalSnapshot = {
  posts: null,
  systemHealth: null,
  dashboard: null,
  fetchedAt: null,
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

const buildAdminHubPostListEndpoint = () => {
  const query = new URLSearchParams({
    page: "1",
    pageSize: "50",
    kw: "",
    sort: "CREATED_AT",
  })
  return `/post/api/v1/adm/posts?${query.toString()}`
}

const readAdminHubOperationalSnapshot = async (req: IncomingMessage): Promise<AdminHubOperationalSnapshot> => {
  const [posts, systemHealth, dashboard] = await Promise.all([
    readJsonIfOk<AdminHubPageDto<AdminHubPostListItem>>(req, buildAdminHubPostListEndpoint()),
    readJsonIfOk<AdminHubSystemHealthPayload>(req, "/system/api/v1/adm/health"),
    readJsonIfOk<AdminHubDashboardSnapshotPayload>(req, "/system/api/v1/adm/dashboard-snapshot"),
  ])

  return {
    posts,
    systemHealth,
    dashboard,
    fetchedAt: new Date().toISOString(),
  }
}

const DASHBOARD_DATA_MISSING_LABEL = "데이터 미수집"

const formatAdminHubDateTime = (value?: string) => {
  if (!value) return "-"
  return value.slice(0, 16).replace("T", " ")
}

const getSystemHealthStatusLabel = (value: string | null | undefined) => {
  const normalized = value?.trim()
  if (!normalized || normalized === "UNKNOWN") return "백엔드 확인 필요"
  if (normalized === "UP") return "서비스 정상"
  return normalized
}

const getSystemHealthTone = (value: string | null | undefined) => {
  const normalized = value?.trim()
  if (!normalized || normalized === "UNKNOWN") return "neutral" as const
  return normalized === "UP" ? ("good" as const) : ("warn" as const)
}

const getMailStatusLabel = (value: string | null | undefined) => {
  const normalized = value?.trim()
  if (normalized === "READY") return "전송 준비"
  if (normalized === "TEST_MODE") return "테스트 모드"
  if (normalized === "MISCONFIGURED") return "설정 누락"
  if (normalized === "QUEUE_LOCKED") return "큐 잠금"
  if (normalized === "CONNECTION_FAILED") return "연결 실패"
  if (normalized === "UNAVAILABLE") return "비활성"
  return normalized || DASHBOARD_DATA_MISSING_LABEL
}

const getMailStatusTone = (value: string | null | undefined) => {
  const normalized = value?.trim()
  return normalized === "READY" || normalized === "TEST_MODE"
    ? ("good" as const)
    : normalized
      ? ("warn" as const)
      : ("neutral" as const)
}

const getTaskQueueTone = (dashboard: AdminHubDashboardSnapshotPayload | null | undefined) => {
  if (!dashboard) return "neutral" as const
  if (dashboard.taskQueue.failedCount > 0 || dashboard.taskQueue.staleProcessingCount > 0) return "warn" as const
  if (dashboard.taskQueue.readyPendingCount === 0 && dashboard.taskQueue.processingCount === 0) return "good" as const
  return "neutral" as const
}

export const getServerSideProps: GetServerSideProps<AdminHubPageProps> = async ({ req, res }) => {
  const ssrStartedAt = performance.now()
  const hasAuthCookie = hasServerAuthCookie(req)
  const fallbackProfileSnapshot = resolvePublicAdminProfileSnapshot(req)
  const bootstrapResultPromise =
    hasAuthCookie
      ? timed(() =>
          readAdminProtectedBootstrap<AdminHubBootstrapPayload>(req, "/member/api/v1/adm/members/bootstrap", "/admin")
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
  let profileDurationMs = 0
  let profileDescription: string
  let profileSnapshot: AdminProfile
  let operationalSnapshot = EMPTY_OPERATIONAL_SNAPSHOT
  let operationalDurationMs = 0
  let operationalDescription = hasAuthCookie ? "unavailable" : "no-auth-cookie"

  if (bootstrapResult?.ok && bootstrapResult.value.ok) {
    baseProps = buildAdminPagePropsFromMember(bootstrapResult.value.value.member)
    profileSnapshot = bootstrapResult.value.value.profile
    profileDurationMs = bootstrapResult.durationMs
    profileDescription = "bootstrap"
  } else {
    const baseResultPromise = timed(() => getAdminPageProps(req))
    const adminProfileResultPromise = hasAuthCookie
      ? timed(() =>
          fetchServerAdminProfile(req, {
            timeoutMs: 900,
          })
        )
      : Promise.resolve({
          ok: true as const,
          value: fallbackProfileSnapshot.profile,
          durationMs: 0,
        })
    const [baseResult, adminProfileResult] = await Promise.all([baseResultPromise, adminProfileResultPromise])
    if (!baseResult.ok) throw baseResult.error
    if ("redirect" in baseResult.value) return baseResult.value
    if (!("props" in baseResult.value)) return baseResult.value
    baseProps = await baseResult.value.props
    authDurationMs = baseResult.durationMs
    authDescription = "fallback"
    profileSnapshot =
      adminProfileResult.ok && adminProfileResult.value
        ? adminProfileResult.value
        : fallbackProfileSnapshot.profile
    profileDurationMs = adminProfileResult.durationMs
    profileDescription =
      adminProfileResult.ok && adminProfileResult.value
        ? hasAuthCookie
          ? "ok"
          : fallbackProfileSnapshot.source
        : fallbackProfileSnapshot.source
  }

  if (hasAuthCookie) {
    const operationalResult = await timed(() => readAdminHubOperationalSnapshot(req))
    if (operationalResult.ok) {
      operationalSnapshot = operationalResult.value
      operationalDurationMs = operationalResult.durationMs
      operationalDescription = operationalSnapshot.fetchedAt ? "ok" : "empty"
    } else {
      operationalDurationMs = operationalResult.durationMs
      operationalDescription = "error"
    }
  }

  appendSsrDebugTiming(req, res, [
    {
      name: "admin-auth-session",
      durationMs: authDurationMs,
      description: authDescription,
    },
    {
      name: "admin-profile",
      durationMs: profileDurationMs,
      description: profileDescription,
    },
    {
      name: "admin-hub-operational",
      durationMs: operationalDurationMs,
      description: operationalDescription,
    },
    {
      name: "admin-ssr-total",
      durationMs: performance.now() - ssrStartedAt,
      description: "ready",
    },
  ])

  return {
    props: {
      ...baseProps,
      initialProfileSnapshot: profileSnapshot,
      initialOperationalSnapshot: operationalSnapshot,
    },
  }
}

const AdminHubPage: NextPage<AdminHubPageProps> = ({
  initialMember,
  initialProfileSnapshot,
  initialOperationalSnapshot,
}) => {
  const sessionMember = initialMember
  const adminProfile = initialProfileSnapshot
  const displayName = sessionMember?.nickname || sessionMember?.username || adminProfile?.nickname || adminProfile?.username || "관리자"
  const profileSnapshot = {
    profileImageDirectUrl: adminProfile?.profileImageDirectUrl || sessionMember?.profileImageDirectUrl || "",
    profileImageUrl: adminProfile?.profileImageUrl || sessionMember?.profileImageUrl || "",
    profileRole: adminProfile?.profileRole || sessionMember?.profileRole || "",
    profileBio: adminProfile?.profileBio || sessionMember?.profileBio || "",
    homeIntroTitle: adminProfile?.homeIntroTitle || sessionMember?.homeIntroTitle || "",
    homeIntroDescription:
      adminProfile?.homeIntroDescription || sessionMember?.homeIntroDescription || "",
    serviceLinks: adminProfile?.serviceLinks || sessionMember?.serviceLinks || [],
    contactLinks: adminProfile?.contactLinks || sessionMember?.contactLinks || [],
    modifiedAt: adminProfile?.modifiedAt || sessionMember?.modifiedAt,
  }
  const profileSrc = profileSnapshot.profileImageDirectUrl || profileSnapshot.profileImageUrl || ""

  const profileUpdatedText = profileSnapshot.modifiedAt
    ? profileSnapshot.modifiedAt.slice(0, 16).replace("T", " ")
    : "미확인"
  const profileChecklist = [
    Boolean(profileSrc),
    Boolean(profileSnapshot.profileRole?.trim()),
    Boolean(profileSnapshot.profileBio?.trim()),
    Boolean(profileSnapshot.homeIntroTitle?.trim()),
    Boolean(profileSnapshot.homeIntroDescription?.trim()),
  ]
  const profileCompletion = Math.round(
    (profileChecklist.filter(Boolean).length / Math.max(1, profileChecklist.length)) * 100
  )
  const linkCount = (profileSnapshot.serviceLinks?.length || 0) + (profileSnapshot.contactLinks?.length || 0)
  const recentWorkSummary = `최근 업데이트 ${profileUpdatedText} · 프로필 ${profileCompletion}% · 연결 ${linkCount}개`
  const postRows = initialOperationalSnapshot.posts?.content || []
  const totalPosts = initialOperationalSnapshot.posts?.pageable?.totalElements ?? postRows.length
  const publishedRows = postRows.filter((post) => post.published && post.tempDraft !== true)
  const draftRows = postRows.filter((post) => !post.published || post.tempDraft === true)
  const recentContentItems = postRows
    .slice()
    .sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime())
    .slice(0, 5)
    .map((post) => ({
      href: `/editor/${post.id}`,
      title: post.title?.trim() || "제목 없는 글",
      meta: `${formatAdminHubDateTime(post.modifiedAt)} · #${post.id}`,
      status: post.tempDraft ? "DRAFT" : post.published ? "PUBLISHED" : "PRIVATE",
      tone: post.published && post.tempDraft !== true ? ("good" as const) : ("neutral" as const),
    }))
  const dashboard = initialOperationalSnapshot.dashboard
  const serviceHealthTone = getSystemHealthTone(initialOperationalSnapshot.systemHealth?.status)
  const taskQueueTone = getTaskQueueTone(dashboard)
  const metrics = [
    {
      label: "POSTS",
      value: String(totalPosts),
      detail: "active list",
      tone: totalPosts > 0 ? ("good" as const) : ("neutral" as const),
    },
    {
      label: "PUBLISHED",
      value: String(publishedRows.length),
      detail: "loaded rows",
      tone: publishedRows.length > 0 ? ("good" as const) : ("neutral" as const),
    },
    {
      label: "DRAFTS",
      value: String(draftRows.length),
      detail: "loaded rows",
      tone: draftRows.length > 0 ? ("warn" as const) : ("neutral" as const),
    },
    {
      label: "EVENTS",
      value: dashboard ? String(dashboard.authSecurity.recentEventCount) : "-",
      detail: dashboard ? "security events" : DASHBOARD_DATA_MISSING_LABEL,
      tone: dashboard && dashboard.authSecurity.blockedEventCount > 0 ? ("warn" as const) : ("neutral" as const),
    },
  ]
  const serviceStatusItems = [
    {
      label: "Public API",
      value: getSystemHealthStatusLabel(initialOperationalSnapshot.systemHealth?.status),
      tone: serviceHealthTone,
    },
    {
      label: "Task Queue",
      value: dashboard ? `${dashboard.taskQueue.readyPendingCount} ready` : DASHBOARD_DATA_MISSING_LABEL,
      tone: taskQueueTone,
    },
    {
      label: "Signup Mail",
      value: getMailStatusLabel(dashboard?.signupMail.status),
      tone: getMailStatusTone(dashboard?.signupMail.status),
    },
    {
      label: "Storage",
      value: dashboard ? `${dashboard.storageCleanup.eligibleForPurgeCount} purge` : DASHBOARD_DATA_MISSING_LABEL,
      tone: dashboard?.storageCleanup.blockedBySafetyThreshold ? ("warn" as const) : ("neutral" as const),
    },
  ]
  const activityItems = [
    {
      label: "최근 업데이트",
      value: profileUpdatedText,
      tone: "neutral" as const,
    },
    {
      label: "프로필 완성도",
      value: `${profileCompletion}%`,
      tone: profileCompletion >= 80 ? ("good" as const) : ("warn" as const),
    },
    {
      label: "연결 채널",
      value: linkCount > 0 ? `${linkCount}개` : "없음",
      tone: linkCount > 0 ? ("good" as const) : ("warn" as const),
    },
  ]
  const recentWorkItems = [
    {
      label: "마지막 점검",
      value: profileUpdatedText,
      tone: "neutral" as const,
    },
    {
      label: "프로필 상태",
      value: profileCompletion >= 80 ? "정리 완료" : "보강 필요",
      tone: profileCompletion >= 80 ? ("good" as const) : ("warn" as const),
    },
    {
      label: "연결 채널",
      value: linkCount > 0 ? `${linkCount}개` : "없음",
      tone: linkCount > 0 ? ("good" as const) : ("warn" as const),
    },
  ]
  const primaryAction = {
    href: "/editor/new",
    cta: "작성",
    secondaryHref: "/admin/posts",
  }

  if (!sessionMember) return null

  return (
    <AdminShell currentSection="hub" member={sessionMember} profileSnapshot={initialProfileSnapshot}>
      <AdminHubSurface
        displayName={displayName}
        recentWorkSummary={recentWorkSummary}
        primaryAction={primaryAction}
        metrics={metrics}
        contentItems={recentContentItems}
        serviceStatusItems={serviceStatusItems}
        activityItems={activityItems}
      />
    </AdminShell>
  )
}

export default AdminHubPage
