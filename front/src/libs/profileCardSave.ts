import { ApiError } from "src/apis/backend/client"

const PROFILE_CARD_CONFLICT_RETRY_DELAY_MS = 700

const waitFor = (ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })

export const saveProfileCardWithConflictRetry = async <T>(
  request: () => Promise<T>,
  maxRetries: number = 1
): Promise<T> => {
  let lastError: unknown = null

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await request()
    } catch (error) {
      lastError = error

      const isConflict = error instanceof ApiError && error.status === 409
      if (!isConflict || attempt >= maxRetries) {
        throw error
      }

      await waitFor(PROFILE_CARD_CONFLICT_RETRY_DELAY_MS * (attempt + 1))
    }
  }

  throw lastError instanceof Error ? lastError : new Error("프로필 저장 충돌이 반복되었습니다.")
}
