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

  const quickLinks = [
    {
      href: "/admin/profile",
      title: "프로필 관리",
      description: "사진, 역할, 소개 문구를 정리합니다.",
      eyebrow: "Profile",
      cta: "프로필 열기",
    },
    {
      href: "/admin/posts/new",
      title: "글 작업실",
      description: "목록 관리와 작성/발행 흐름을 나눠 다룹니다.",
      eyebrow: "Content",
      cta: "글 작업실 열기",
    },
    {
      href: "/admin/tools",
      title: "운영 도구",
      description: "요약, 빠른 실행, 고급 진단을 확인합니다.",
      eyebrow: "Tools",
      cta: "도구 열기",
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
      quickLinks={quickLinks}
    />
  )
}

export default AdminHubPage
