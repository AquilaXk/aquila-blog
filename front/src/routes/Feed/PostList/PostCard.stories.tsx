import type { Meta, StoryObj } from "@storybook/react"
import PostCard from "./PostCard"
import { TPost } from "src/types"

const basePost: TPost = {
  id: "503",
  slug: "kotlin-hexagonal-503",
  title: "[Kotlin] 강결합 이슈를 끊어낸 헥사고날 아키텍처 적용기",
  summary: "Java -> Kotlin 마이그레이션 중 발생한 연쇄 참조 문제를 헥사고날 아키텍처로 분리해 해결한 사례를 정리했습니다.",
  date: { start_date: "2026-03-17" },
  type: ["Post"],
  tags: ["Kotlin", "Architecture"],
  status: ["Public"],
  createdTime: "2026-03-17T08:11:00.000Z",
  modifiedTime: "2026-03-17T08:11:00.000Z",
  fullWidth: false,
  thumbnail: "https://www.aquilaxk.site/avatar.png",
  likesCount: 12,
  commentsCount: 3,
  hitCount: 920,
  author: [
    {
      id: "1",
      name: "aquila",
      profile_photo: "https://www.aquilaxk.site/avatar.png",
    },
  ],
}

const meta: Meta<typeof PostCard> = {
  title: "Feed/PostCard",
  component: PostCard,
  tags: ["autodocs"],
  args: {
    data: basePost,
    layout: "regular",
  },
}

export default meta

type Story = StoryObj<typeof PostCard>

export const Regular: Story = {}

export const Pinned: Story = {
  args: {
    layout: "pinned",
    data: {
      ...basePost,
      id: "455",
      title: "SSE 알림이 '되다 멈춘다'를 끝낸 방법",
      tags: ["Pinned", "SSE"],
    },
  },
}

export const NoThumbnail: Story = {
  args: {
    data: {
      ...basePost,
      id: "402",
      thumbnail: "",
      summary: "썸네일 없이도 카드 높이와 타이포 리듬이 안정적으로 유지되는지 확인합니다.",
    },
  },
}
