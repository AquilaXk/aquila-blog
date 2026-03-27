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

  const primaryAction = {
    href: "/editor/new",
    title: "새 글 쓰기",
    description: "전용 편집 화면에서 초안을 시작하고, 작업 공간에서 이어서 관리합니다.",
    cta: "글 쓰기 시작",
    secondaryHref: "/admin/posts",
    secondaryLabel: "기존 글 관리",
  }

  const secondaryLinks = [
    {
      href: "/admin/profile",
      title: "프로필 관리",
      description: "사진, 소개, 링크를 정리합니다.",
      cta: "프로필 정리",
    },
    {
      href: "/admin/tools",
      title: "운영 진단",
      description: "상태 확인과 진단 작업을 엽니다.",
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
      profileUpdatedText={profileUpdatedText}
      primaryAction={primaryAction}
      secondaryLinks={secondaryLinks}
    />
  )
}

export default AdminHubPage
