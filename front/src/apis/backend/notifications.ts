import { apiFetch } from "src/apis/backend/client"
import { TMemberNotification } from "src/types"
import { asOpenApiPath } from "./openapiContract"

type NotificationSnapshotResponse = {
  items: TMemberNotification[]
  unreadCount: number
}

type UnreadCountResponse = {
  unreadCount: number
}

type ReadMutationResponse = {
  resultCode: string
  msg: string
  data: {
    updated?: boolean
    updatedCount?: number
  }
}

const NOTIFICATIONS_API_PATH = asOpenApiPath("/member/api/v1/notifications")
const NOTIFICATIONS_SNAPSHOT_API_PATH = asOpenApiPath("/member/api/v1/notifications/snapshot")
const NOTIFICATIONS_UNREAD_COUNT_API_PATH = asOpenApiPath("/member/api/v1/notifications/unread-count")
const NOTIFICATIONS_READ_ALL_API_PATH = asOpenApiPath("/member/api/v1/notifications/read-all")
const NOTIFICATIONS_STREAM_API_PATH = asOpenApiPath("/member/api/v1/notifications/stream")

export const getNotifications = () => apiFetch<TMemberNotification[]>(NOTIFICATIONS_API_PATH)

export const getNotificationSnapshot = () =>
  apiFetch<NotificationSnapshotResponse>(NOTIFICATIONS_SNAPSHOT_API_PATH)

export const getUnreadNotificationCount = async () => {
  const response = await apiFetch<UnreadCountResponse>(NOTIFICATIONS_UNREAD_COUNT_API_PATH)
  return response.unreadCount
}

export const markNotificationRead = (id: number) =>
  apiFetch<ReadMutationResponse>(`/member/api/v1/notifications/${id}/read`, {
    method: "POST",
  })

export const markAllNotificationsRead = () =>
  apiFetch<ReadMutationResponse>(NOTIFICATIONS_READ_ALL_API_PATH, {
    method: "POST",
  })

export const buildNotificationStreamUrl = () =>
  NOTIFICATIONS_STREAM_API_PATH
