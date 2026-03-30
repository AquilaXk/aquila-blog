export const SSE_FAST_FALLBACK_WINDOW_MS = 20_000
export const SSE_FAST_FALLBACK_FAILURE_THRESHOLD = 2
export const SSE_RECOVERY_PROBE_MS = 120_000

export type NotificationStreamRecoveryState = {
  recentFailureTimestamps: number[]
  pollingFallbackEnteredAt: number
}

export const createNotificationStreamRecoveryState = (): NotificationStreamRecoveryState => ({
  recentFailureTimestamps: [],
  pollingFallbackEnteredAt: 0,
})

const pruneFailureTimestamps = (timestamps: number[], nowMs: number) =>
  timestamps.filter((timestamp) => nowMs - timestamp <= SSE_FAST_FALLBACK_WINDOW_MS)

export const recordNotificationStreamFailure = (
  state: NotificationStreamRecoveryState,
  nowMs: number
): NotificationStreamRecoveryState => ({
  ...state,
  recentFailureTimestamps: [...pruneFailureTimestamps(state.recentFailureTimestamps, nowMs), nowMs],
})

export const shouldSwitchNotificationStreamToPolling = (
  state: NotificationStreamRecoveryState,
  nowMs: number
) => pruneFailureTimestamps(state.recentFailureTimestamps, nowMs).length >= SSE_FAST_FALLBACK_FAILURE_THRESHOLD

export const resetNotificationStreamFailures = (
  state: NotificationStreamRecoveryState
): NotificationStreamRecoveryState => ({
  ...state,
  recentFailureTimestamps: [],
})

export const markNotificationPollingFallbackEntered = (
  state: NotificationStreamRecoveryState,
  nowMs: number
): NotificationStreamRecoveryState => ({
  ...state,
  pollingFallbackEnteredAt: nowMs,
})

type CanProbeNotificationStreamRecoveryParams = {
  state: NotificationStreamRecoveryState
  nowMs: number
  enabled: boolean
  isDocumentVisible: boolean
  preferPolling: boolean
  streamMode: "sse" | "poll"
  notificationAccessState: "pending" | "ready" | "blocked"
}

export const canProbeNotificationStreamRecovery = ({
  state,
  nowMs,
  enabled,
  isDocumentVisible,
  preferPolling,
  streamMode,
  notificationAccessState,
}: CanProbeNotificationStreamRecoveryParams) => {
  if (!enabled || preferPolling || !isDocumentVisible) return false
  if (streamMode !== "poll" || notificationAccessState !== "ready") return false
  if (state.pollingFallbackEnteredAt <= 0) return false
  return nowMs - state.pollingFallbackEnteredAt >= SSE_RECOVERY_PROBE_MS
}
