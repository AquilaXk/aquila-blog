import { GetServerSideProps, NextPage } from "next"
import dynamic from "next/dynamic"
import type { AuthMember } from "src/hooks/useAuthSession"
import { type AdminProfile } from "src/hooks/useAdminProfile"
import { AdminPageProps, buildAdminPagePropsFromMember, getAdminPageProps, readAdminProtectedBootstrap } from "src/libs/server/adminPage"
import {
  fetchServerAdminProfile,
  hasServerAuthCookie,
  resolvePublicAdminProfileSnapshot,
} from "src/libs/server/adminProfile"
import { appendSsrDebugTiming, timed } from "src/libs/server/serverTiming"
import AdminShell from "src/routes/Admin/AdminShell"
import { type AdminHubNextAction } from "src/routes/Admin/AdminHubSurface"

const AdminHubSurface = dynamic(() => import("src/routes/Admin/AdminHubSurface"), {
  ssr: false,
  loading: () => <div aria-hidden="true" style={{ minHeight: "32rem" }} />,
})

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
  const sessionMember = initialMember
  const adminProfile = initialProfileSnapshot
  const displayName = sessionMember?.nickname || sessionMember?.username || adminProfile?.nickname || adminProfile?.username || "관리자"
  const displayNameInitial = displayName.slice(0, 2).toUpperCase()
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
  const summaryItems = [
    { label: "계정", value: displayName, tone: "neutral" as const },
    {
      label: "프로필",
      value: `${profileCompletion}%`,
      tone: profileCompletion >= 80 ? ("good" as const) : ("warn" as const),
    },
    {
      label: "소개",
      value: profileSnapshot.homeIntroTitle?.trim() && profileSnapshot.homeIntroDescription?.trim() ? "완료" : "필요",
      tone:
        profileSnapshot.homeIntroTitle?.trim() && profileSnapshot.homeIntroDescription?.trim()
          ? ("good" as const)
          : ("warn" as const),
    },
    {
      label: "채널",
      value: linkCount > 0 ? `${linkCount}개` : "없음",
      tone: linkCount > 0 ? ("good" as const) : ("warn" as const),
    },
    { label: "업데이트", value: profileUpdatedText, tone: "neutral" as const },
  ]

  const primaryAction = {
    href: "/editor/new",
    title: "새 글 작성",
    cta: "작성",
    secondaryHref: "/admin/posts",
    secondaryLabel: "목록",
  }

  const secondaryLinks = [
    {
      href: "/admin/profile",
      title: "프로필",
      cta: "프로필",
    },
    {
      href: "/admin/dashboard",
      title: "대시보드",
      cta: "대시보드",
    },
    {
      href: "/admin/tools",
      title: "운영 도구",
      cta: "도구",
    },
  ]

  const nextActionCandidates: Array<AdminHubNextAction | null> = [
    profileCompletion < 80
      ? {
          href: "/admin/profile",
          title: "프로필 보강",
          tone: "warn" as const,
        }
      : null,
    !(profileSnapshot.homeIntroTitle?.trim() && profileSnapshot.homeIntroDescription?.trim())
      ? {
          href: "/admin/profile",
          title: "소개 입력",
          tone: "warn" as const,
        }
      : null,
    linkCount === 0
      ? {
          href: "/admin/profile",
          title: "채널 추가",
          tone: "warn" as const,
        }
      : null,
    {
      href: "/editor/new",
      title: "새 글 작성",
      tone: "neutral" as const,
    },
    {
      href: "/admin/dashboard",
      title: "대시보드",
      tone: "neutral" as const,
    },
    {
      href: "/admin/tools",
      title: "운영 도구",
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
