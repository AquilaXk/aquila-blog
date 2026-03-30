import { expect, test } from "@playwright/test"
import {
  canProbeNotificationStreamRecovery,
  createNotificationStreamRecoveryState,
  markNotificationPollingFallbackEntered,
  recordNotificationStreamFailure,
  resetNotificationStreamFailures,
  shouldSwitchNotificationStreamToPolling,
} from "src/layouts/RootLayout/Header/notificationStreamRecovery"

test.describe("notification stream recovery", () => {
  test("짧은 시간 내 SSE 오류가 연속 발생하면 polling fallback으로 내려갈 수 있다", () => {
    const nowMs = 10_000
    let state = createNotificationStreamRecoveryState()

    state = recordNotificationStreamFailure(state, nowMs)
    expect(shouldSwitchNotificationStreamToPolling(state, nowMs)).toBe(false)

    state = recordNotificationStreamFailure(state, nowMs + 2_000)
    expect(shouldSwitchNotificationStreamToPolling(state, nowMs + 2_000)).toBe(true)
  })

  test("오래된 SSE 오류는 fallback 판정 창에서 제외된다", () => {
    const nowMs = 20_000
    let state = createNotificationStreamRecoveryState()

    state = recordNotificationStreamFailure(state, nowMs)
    state = recordNotificationStreamFailure(state, nowMs + 25_000)

    expect(shouldSwitchNotificationStreamToPolling(state, nowMs + 25_000)).toBe(false)
  })

  test("polling fallback 후 충분히 시간이 지나면 SSE 복귀 probe를 허용한다", () => {
    const enteredAt = 30_000
    const state = markNotificationPollingFallbackEntered(createNotificationStreamRecoveryState(), enteredAt)

    expect(
      canProbeNotificationStreamRecovery({
        state,
        nowMs: enteredAt + 60_000,
        enabled: true,
        isDocumentVisible: true,
        preferPolling: false,
        streamMode: "poll",
        notificationAccessState: "ready",
      })
    ).toBe(false)

    expect(
      canProbeNotificationStreamRecovery({
        state,
        nowMs: enteredAt + 120_000,
        enabled: true,
        isDocumentVisible: true,
        preferPolling: false,
        streamMode: "poll",
        notificationAccessState: "ready",
      })
    ).toBe(true)
  })

  test("성공적으로 열린 뒤에는 빠른 fallback 실패 창을 비운다", () => {
    const nowMs = 40_000
    let state = createNotificationStreamRecoveryState()
    state = recordNotificationStreamFailure(state, nowMs)
    state = recordNotificationStreamFailure(state, nowMs + 1_000)

    expect(shouldSwitchNotificationStreamToPolling(state, nowMs + 1_000)).toBe(true)

    state = resetNotificationStreamFailures(state)

    expect(shouldSwitchNotificationStreamToPolling(state, nowMs + 1_000)).toBe(false)
  })
})
