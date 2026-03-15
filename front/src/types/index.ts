import { NextPage } from "next"
import { AppProps } from "next/app"
import { EmotionCache } from "@emotion/cache"
import { ExtendedRecordMap } from "notion-types"
import { ReactElement, ReactNode } from "react"

// TODO: refactor types
export type NextPageWithLayout<PageProps = {}> = NextPage<PageProps> & {
  getLayout?: (page: ReactElement) => ReactNode
}

export type AppPropsWithLayout = AppProps & {
  Component: NextPageWithLayout
  emotionCache?: EmotionCache
}

export type TPostStatus = "Private" | "Public" | "PublicOnDetail"
export type TPostType = "Post" | "Paper" | "Page"

export type TPost = {
  id: string
  date: { start_date: string }
  type: TPostType[]
  slug: string
  tags?: string[]
  category?: string[]
  summary?: string
  author?: {
    id: string
    name: string
    profile_photo?: string
  }[]
  title: string
  status: TPostStatus[]
  createdTime: string
  modifiedTime?: string
  fullWidth: boolean
  thumbnail?: string
  likesCount?: number
  commentsCount?: number
  hitCount?: number
  actorHasLiked?: boolean
  actorCanModify?: boolean
  actorCanDelete?: boolean
}

export type PostDetail = TPost & {
  content: string
  recordMap?: ExtendedRecordMap
}

export type TPostComment = {
  id: number
  createdAt: string
  modifiedAt: string
  authorId: number
  authorName: string
  authorUsername?: string
  authorProfileImageUrl: string
  authorProfileImageDirectUrl?: string
  postId: number
  parentCommentId?: number | null
  content: string
  actorCanModify: boolean
  actorCanDelete: boolean
}

export type TMemberNotificationType = "COMMENT_REPLY" | "POST_COMMENT"

export type TMemberNotification = {
  id: number
  type: TMemberNotificationType
  createdAt: string
  actorId: number
  actorName: string
  actorProfileImageUrl: string
  postId: number
  commentId: number
  postTitle: string
  commentPreview: string
  message: string
  isRead: boolean
}

export type TMemberNotificationStreamPayload = {
  notification: TMemberNotification
  unreadCount: number
}

export type TPosts = TPost[]

export type TTags = {
  [tagName: string]: number
}
export type TCategories = {
  [category: string]: number
}

export type SchemeType = "light" | "dark"
