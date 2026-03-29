import { GetServerSideProps, NextPage } from "next"
import { useMemo } from "react"
import useAuthSession from "src/hooks/useAuthSession"
import { AdminPageProps, getAdminPageProps } from "src/libs/server/adminPage"
import AdminHubSurface from "src/routes/Admin/AdminHubSurface"

export const getServerSideProps: GetServerSideProps<AdminPageProps> = async ({ req }) => {
  return await getAdminPageProps(req)
}

const AdminHubPage: NextPage<AdminPageProps> = ({ initialMember }) => {
  const { me, authStatus } = useAuthSession()
  const sessionMember = authStatus === "loading" ? initialMember : me
  const displayName = sessionMember?.nickname || sessionMember?.username || "관리자"
  const displayNameInitial = displayName.slice(0, 2).toUpperCase()

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

  if (!sessionMember) return null

  return (
    <AdminHubSurface
      displayName={displayName}
      displayNameInitial={displayNameInitial}
      profileSrc={profileSrc}
      profileRole={sessionMember.profileRole}
      profileBio={sessionMember.profileBio}
      summaryItems={summaryItems}
      primaryAction={primaryAction}
      secondaryLinks={secondaryLinks}
    />
  )
}

export default AdminHubPage
