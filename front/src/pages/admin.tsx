import { useQuery } from "@tanstack/react-query"
import { GetServerSideProps, NextPage } from "next"
import { useMemo } from "react"
import { apiFetch } from "src/apis/backend/client"
import useAuthSession from "src/hooks/useAuthSession"
import { AdminPageProps, getAdminPageProps } from "src/libs/server/adminPage"
import AdminHubSurface, { type AdminHubNextAction } from "src/routes/Admin/AdminHubSurface"

type AdminHubSystemHealthPayload = {
  status?: string
}

type AdminHubTaskQueuePayload = {
  failedCount?: number
  staleProcessingCount?: number
}

export const getServerSideProps: GetServerSideProps<AdminPageProps> = async ({ req }) => {
  return await getAdminPageProps(req)
}

const AdminHubPage: NextPage<AdminPageProps> = ({ initialMember }) => {
  const { me, authStatus } = useAuthSession()
  const sessionMember = authStatus === "loading" ? initialMember : me
  const displayName = sessionMember?.nickname || sessionMember?.username || "관리자"
  const displayNameInitial = displayName.slice(0, 2).toUpperCase()
  const systemHealthQuery = useQuery({
    queryKey: ["admin", "hub", "system-health"],
    queryFn: (): Promise<AdminHubSystemHealthPayload> => apiFetch<AdminHubSystemHealthPayload>("/system/api/v1/adm/health"),
    enabled: Boolean(sessionMember?.isAdmin),
    staleTime: 30_000,
    gcTime: 120_000,
    retry: 1,
    refetchOnWindowFocus: false,
  })
  const taskQueueQuery = useQuery({
    queryKey: ["admin", "hub", "task-queue"],
    queryFn: (): Promise<AdminHubTaskQueuePayload> => apiFetch<AdminHubTaskQueuePayload>("/system/api/v1/adm/tasks"),
    enabled: Boolean(sessionMember?.isAdmin),
    staleTime: 30_000,
    gcTime: 120_000,
    retry: 1,
    refetchOnWindowFocus: false,
  })

  const profileSrc = useMemo(
    () => sessionMember?.profileImageDirectUrl || sessionMember?.profileImageUrl || "",
    [sessionMember?.profileImageDirectUrl, sessionMember?.profileImageUrl]
  )

  const profileUpdatedText = sessionMember?.modifiedAt
    ? sessionMember.modifiedAt.slice(0, 16).replace("T", " ")
    : "확인 전"
  const profileChecklist = [
    Boolean(profileSrc),
    Boolean(sessionMember?.profileRole?.trim()),
    Boolean(sessionMember?.profileBio?.trim()),
    Boolean(sessionMember?.homeIntroTitle?.trim()),
    Boolean(sessionMember?.homeIntroDescription?.trim()),
  ]
  const profileCompletion = Math.round(
    (profileChecklist.filter(Boolean).length / Math.max(1, profileChecklist.length)) * 100
  )
  const linkCount = (sessionMember?.serviceLinks?.length || 0) + (sessionMember?.contactLinks?.length || 0)
  const summaryItems = [
    { label: "현재 계정", value: displayName, tone: "neutral" as const },
    {
      label: "프로필 완성도",
      value: `${profileCompletion}%`,
      tone: profileCompletion >= 80 ? ("good" as const) : ("warn" as const),
    },
    {
      label: "홈 소개",
      value: sessionMember?.homeIntroTitle?.trim() && sessionMember?.homeIntroDescription?.trim() ? "준비됨" : "점검 필요",
      tone:
        sessionMember?.homeIntroTitle?.trim() && sessionMember?.homeIntroDescription?.trim()
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
    description: "임시글 준비부터 발행 직전 확인까지 한 흐름으로 이어집니다.",
    cta: "새 글 작성",
    secondaryHref: "/admin/posts",
    secondaryLabel: "글 관리",
  }

  const secondaryLinks = [
    {
      href: "/admin/profile",
      title: "프로필 관리",
      description: "소개, 홈 인트로, 링크, 이미지까지 공개 화면 기준으로 정리합니다.",
      cta: "프로필 정리",
    },
    {
      href: "/admin/tools",
      title: "운영 진단",
      description: "모니터링, 진단, 최근 실행 결과를 한 화면에서 점검합니다.",
      cta: "진단 열기",
    },
  ]

  const nextActionCandidates: Array<AdminHubNextAction | null> = [
    systemHealthQuery.data?.status && systemHealthQuery.data.status !== "UP"
      ? {
          href: "/admin/tools",
          title: "서비스 상태 확인",
          detail: `현재 상태가 ${systemHealthQuery.data.status}입니다. 운영 센터에서 시스템 상태와 모니터링을 먼저 점검하세요.`,
          tone: "warn" as const,
        }
      : null,
    (taskQueueQuery.data?.staleProcessingCount ?? 0) > 0
      ? {
          href: "/admin/tools",
          title: "작업 큐 stale 처리 점검",
          detail: `stale processing ${taskQueueQuery.data?.staleProcessingCount || 0}건이 남아 있습니다. 재처리 여부를 확인하세요.`,
          tone: "warn" as const,
        }
      : null,
    (taskQueueQuery.data?.failedCount ?? 0) > 0
      ? {
          href: "/admin/tools",
          title: "최근 실패 작업 확인",
          detail: `실패한 작업 ${taskQueueQuery.data?.failedCount || 0}건이 있습니다. 최근 실행 결과부터 확인하세요.`,
          tone: "warn" as const,
        }
      : null,
    profileCompletion < 80
      ? {
          href: "/admin/profile",
          title: "프로필 완성도 보강",
          detail: `현재 ${profileCompletion}% 상태입니다. 소개와 이미지를 먼저 정리하세요.`,
          tone: "warn" as const,
        }
      : null,
    !(sessionMember?.homeIntroTitle?.trim() && sessionMember?.homeIntroDescription?.trim())
      ? {
          href: "/admin/profile",
          title: "홈 소개 문구 채우기",
          detail: "첫 방문자가 블로그의 주제를 바로 이해할 수 있도록 인트로를 완성하세요.",
          tone: "warn" as const,
        }
      : null,
    linkCount === 0
      ? {
          href: "/admin/profile",
          title: "연결 채널 추가",
          detail: "연락처나 서비스 링크를 하나 이상 등록해 방문자 동선을 열어두세요.",
          tone: "warn" as const,
        }
      : null,
    {
      href: "/editor/new",
      title: "새 글 작성 시작",
      detail: "허브 점검이 끝났다면 바로 임시글부터 작성 흐름을 이어갈 수 있습니다.",
      tone: "neutral" as const,
    },
    systemHealthQuery.isSuccess && taskQueueQuery.isSuccess
      ? {
          href: "/admin/tools",
          title: "운영 센터 최근 결과 확인",
          detail: "오늘 진단/실행 기록과 갱신 상태를 한 번에 확인할 수 있습니다.",
          tone: "neutral" as const,
        }
      : null,
  ]

  const nextActions = nextActionCandidates.filter((item): item is AdminHubNextAction => Boolean(item)).slice(0, 3)

  if (!sessionMember) return null

  return (
    <AdminHubSurface
      displayName={displayName}
      displayNameInitial={displayNameInitial}
      profileSrc={profileSrc}
      profileRole={sessionMember.profileRole}
      profileBio={sessionMember.profileBio}
      summaryItems={summaryItems}
      nextActions={nextActions}
      primaryAction={primaryAction}
      secondaryLinks={secondaryLinks}
    />
  )
}

export default AdminHubPage
