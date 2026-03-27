import type { Meta, StoryObj } from "@storybook/react"
import AdminHubSurface from "./AdminHubSurface"

const meta: Meta<typeof AdminHubSurface> = {
  title: "Admin/AdminHubSurface",
  component: AdminHubSurface,
  tags: ["autodocs"],
  args: {
    displayName: "aquila",
    displayNameInitial: "AQ",
    profileSrc: "https://www.aquilaxk.site/avatar.png",
    profileRole: "Backend Developer",
    profileBio: "서버가 '펑' 터지기 전에\n멘탈이 먼저 '펑' 터지는 주니어의 기록",
    profileUpdatedText: "2026-03-24 14:05",
    primaryAction: {
      href: "/editor/new",
      title: "새 글 쓰기",
      description: "전용 편집 화면에서 초안을 시작하고, 작업 공간에서 이어서 관리합니다.",
      cta: "글 쓰기 시작",
      secondaryHref: "/admin/posts",
      secondaryLabel: "기존 글 관리",
    },
    secondaryLinks: [
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
    ],
  },
}

export default meta

type Story = StoryObj<typeof AdminHubSurface>

export const Default: Story = {}
