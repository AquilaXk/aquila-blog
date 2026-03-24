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
    quickLinks: [
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
    ],
  },
}

export default meta

type Story = StoryObj<typeof AdminHubSurface>

export const Default: Story = {}
