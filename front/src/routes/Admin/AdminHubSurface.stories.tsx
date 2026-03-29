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
    summaryItems: [
      { label: "현재 계정", value: "aquila" },
      { label: "프로필 완성도", value: "80%", tone: "good" },
      { label: "홈 소개", value: "준비됨", tone: "good" },
      { label: "연결 채널", value: "4개", tone: "neutral" },
      { label: "마지막 업데이트", value: "2026-03-24 14:05" },
    ],
    nextActions: [
      {
        href: "/admin/profile",
        title: "프로필 완성도 보강",
        detail: "공개 프로필과 홈 소개를 먼저 정리하세요.",
        tone: "warn",
      },
      {
        href: "/editor/new",
        title: "새 글 작성 시작",
        detail: "허브 점검이 끝났다면 바로 임시글 작성으로 이어집니다.",
        tone: "neutral",
      },
    ],
    primaryAction: {
      href: "/editor/new",
      title: "새 글 쓰기",
      description: "",
      cta: "글 쓰기 시작",
      secondaryHref: "/admin/posts",
      secondaryLabel: "기존 글 관리",
    },
    secondaryLinks: [
      {
        href: "/admin/profile",
        title: "프로필 관리",
        description: "",
        cta: "프로필 정리",
      },
      {
        href: "/admin/tools",
        title: "운영 진단",
        description: "",
        cta: "진단 열기",
      },
    ],
  },
}

export default meta

type Story = StoryObj<typeof AdminHubSurface>

export const Default: Story = {}
