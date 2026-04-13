import { GetServerSideProps, NextPage } from "next"
import type { AuthMember } from "src/hooks/useAuthSession"
import useAuthSession from "src/hooks/useAuthSession"
import { useAdminProfile, type AdminProfile } from "src/hooks/useAdminProfile"
import { AdminPageProps, buildAdminPagePropsFromMember, getAdminPageProps, readAdminProtectedBootstrap } from "src/libs/server/adminPage"
import {
  fetchServerAdminProfile,
  hasServerAuthCookie,
  resolvePublicAdminProfileSnapshot,
} from "src/libs/server/adminProfile"
import { appendSsrDebugTiming, timed } from "src/libs/server/serverTiming"
import AdminShell from "src/routes/Admin/AdminShell"
import AdminHubSurface, { type AdminHubNextAction } from "src/routes/Admin/AdminHubSurface"

type AdminHubPageProps = AdminPageProps & {
  initialProfileSnapshot: AdminProfile
}

type AdminHubBootstrapPayload = {
  member: AuthMember
  profile: AdminProfile
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
      name: "admin-ssr-total",
      durationMs: performance.now() - ssrStartedAt,
      description: "ready",
    },
  ])

  return {
    props: {
      ...baseProps,
      initialProfileSnapshot: profileSnapshot,
    },
  }
}

const AdminHubPage: NextPage<AdminHubPageProps> = ({ initialMember, initialProfileSnapshot }) => {
  const { me, authStatus } = useAuthSession()
  const adminProfile = useAdminProfile(initialProfileSnapshot)
  const sessionMember = authStatus === "loading" || authStatus === "unavailable" ? initialMember : me || initialMember
  const displayName =
    sessionMember?.nickname || sessionMember?.username || adminProfile?.nickname || adminProfile?.username || "관리자"
  const displayNameInitial = displayName.slice(0, 2).toUpperCase()
  const profileSnapshot = {
    profileImageDirectUrl:
      adminProfile?.profileImageDirectUrl || sessionMember?.profileImageDirectUrl || initialProfileSnapshot.profileImageDirectUrl || "",
    profileImageUrl:
      adminProfile?.profileImageUrl || sessionMember?.profileImageUrl || initialProfileSnapshot.profileImageUrl || "",
    profileRole: adminProfile?.profileRole || sessionMember?.profileRole || initialProfileSnapshot.profileRole || "",
    profileBio: adminProfile?.profileBio || sessionMember?.profileBio || initialProfileSnapshot.profileBio || "",
    homeIntroTitle:
      adminProfile?.homeIntroTitle || sessionMember?.homeIntroTitle || initialProfileSnapshot.homeIntroTitle || "",
    homeIntroDescription:
      adminProfile?.homeIntroDescription || sessionMember?.homeIntroDescription || initialProfileSnapshot.homeIntroDescription || "",
    serviceLinks: adminProfile?.serviceLinks || sessionMember?.serviceLinks || initialProfileSnapshot.serviceLinks || [],
    contactLinks: adminProfile?.contactLinks || sessionMember?.contactLinks || initialProfileSnapshot.contactLinks || [],
    modifiedAt: adminProfile?.modifiedAt || sessionMember?.modifiedAt || initialProfileSnapshot.modifiedAt,
  }
  const profileSrc = profileSnapshot.profileImageDirectUrl || profileSnapshot.profileImageUrl || ""

  const profileUpdatedText = profileSnapshot.modifiedAt
    ? profileSnapshot.modifiedAt.slice(0, 16).replace("T", " ")
    : "확인 전"
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
  const summaryItems = [
    { label: "현재 계정", value: displayName, tone: "neutral" as const },
    {
      label: "프로필 완성도",
      value: `${profileCompletion}%`,
      tone: profileCompletion >= 80 ? ("good" as const) : ("warn" as const),
    },
    {
      label: "홈 소개",
      value: profileSnapshot.homeIntroTitle?.trim() && profileSnapshot.homeIntroDescription?.trim() ? "준비됨" : "점검 필요",
      tone:
        profileSnapshot.homeIntroTitle?.trim() && profileSnapshot.homeIntroDescription?.trim()
          ? ("good" as const)
          : ("warn" as const),
    },
    {
      label: "연결 채널",
      value: linkCount > 0 ? `${linkCount}개` : "미등록",
      tone: linkCount > 0 ? ("good" as const) : ("warn" as const),
    },
    { label: "마지막 업데이트", value: profileUpdatedText, tone: "neutral" as const },
  ]

  const primaryAction = {
    href: "/editor/new",
    title: "글 작성",
    cta: "새 글 작성",
    secondaryHref: "/admin/posts",
    secondaryLabel: "글 관리",
  }

  const secondaryLinks = [
    {
      href: "/admin/profile",
      title: "프로필 관리",
      cta: "프로필 정리",
    },
    {
      href: "/admin/dashboard",
      title: "운영 대시보드",
      cta: "대시보드 열기",
    },
    {
      href: "/admin/tools",
      title: "운영 진단",
      cta: "진단 열기",
    },
  ]

  const nextActionCandidates: Array<AdminHubNextAction | null> = [
    profileCompletion < 80
      ? {
          href: "/admin/profile",
          title: "프로필 완성도 보강",
          tone: "warn" as const,
        }
      : null,
    !(profileSnapshot.homeIntroTitle?.trim() && profileSnapshot.homeIntroDescription?.trim())
      ? {
          href: "/admin/profile",
          title: "홈 소개 문구 채우기",
          tone: "warn" as const,
        }
      : null,
    linkCount === 0
      ? {
          href: "/admin/profile",
          title: "연결 채널 추가",
          tone: "warn" as const,
        }
      : null,
    {
      href: "/editor/new",
      title: "새 글 작성 시작",
      tone: "neutral" as const,
    },
    {
      href: "/admin/dashboard",
      title: "운영 대시보드 확인",
      tone: "neutral" as const,
    },
    {
      href: "/admin/tools",
      title: "운영 진단 열기",
      tone: "neutral" as const,
    },
  ]

  const nextActions = nextActionCandidates.filter((item): item is AdminHubNextAction => Boolean(item)).slice(0, 3)

  if (!sessionMember) return null

  return (
    <AdminShell currentSection="hub" member={sessionMember}>
      <AdminHubSurface
        displayName={displayName}
        displayNameInitial={displayNameInitial}
        profileSrc={profileSrc}
        profileRole={profileSnapshot.profileRole}
        profileBio={profileSnapshot.profileBio}
        summaryItems={summaryItems}
        nextActions={nextActions}
        primaryAction={primaryAction}
        secondaryLinks={secondaryLinks}
      />
    </AdminShell>
  )
}

export default AdminHubPage
