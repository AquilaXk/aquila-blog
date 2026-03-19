import { apiFetch } from "src/apis/backend/client"
import { TMemberNotification } from "src/types"

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

export const getNotifications = () => apiFetch<TMemberNotification[]>("/member/api/v1/notifications")

export const getNotificationSnapshot = () =>
  apiFetch<NotificationSnapshotResponse>("/member/api/v1/notifications/snapshot")

export const getUnreadNotificationCount = async () => {
  const response = await apiFetch<UnreadCountResponse>("/member/api/v1/notifications/unread-count")
  return response.unreadCount
}

export const markNotificationRead = (id: number) =>
  apiFetch<ReadMutationResponse>(`/member/api/v1/notifications/${id}/read`, {
    method: "POST",
  })

export const markAllNotificationsRead = () =>
  apiFetch<ReadMutationResponse>("/member/api/v1/notifications/read-all", {
    method: "POST",
  })

export const buildNotificationStreamUrl = () =>
  "/member/api/v1/notifications/stream"
