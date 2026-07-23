import type { Meta, StoryObj } from "@storybook/react"
import AdminHubSurface from "./AdminHubSurface"

const meta: Meta<typeof AdminHubSurface> = {
  title: "Admin/AdminHubSurface",
  component: AdminHubSurface,
  tags: ["autodocs"],
  args: {
    displayName: "aquila",
    recentWorkSummary: "최근 업데이트 2026-03-24 14:05 · 프로필 80% · 연결 4개",
    primaryAction: {
      href: "/editor/new",
      cta: "작성",
      secondaryHref: "/admin/posts",
    },
    metrics: [
      { label: "POSTS", value: "12", detail: "active list", tone: "good" },
      { label: "PUBLISHED", value: "9", detail: "loaded rows", tone: "good" },
      { label: "DRAFTS", value: "3", detail: "loaded rows", tone: "warn" },
      { label: "EVENTS", value: "0", detail: "security events", tone: "neutral" },
    ],
    contentItems: [
      { href: "/editor/1", title: "Spring Boot 운영 기록", meta: "2026-03-24 14:05 · #1", status: "PUBLISHED", tone: "good" },
      { href: "/editor/2", title: "Kotlin 트레이드오프 정리", meta: "2026-03-23 09:10 · #2", status: "DRAFT" },
    ],
    serviceStatusItems: [
      { label: "Public API", value: "서비스 정상", tone: "good" },
      { label: "Task Queue", value: "0 ready", tone: "good" },
      { label: "Signup Mail", value: "전송 준비", tone: "good" },
      { label: "Storage", value: "0 purge", tone: "neutral" },
    ],
    activityItems: [
      { label: "최근 업데이트", value: "2026-03-24 14:05" },
      { label: "프로필 완성도", value: "80%", tone: "good" },
      { label: "연결 채널", value: "4개", tone: "neutral" },
    ],
  },
}

export default meta

type Story = StoryObj<typeof AdminHubSurface>

export const Default: Story = {}
