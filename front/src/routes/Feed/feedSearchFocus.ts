export const FEED_SEARCH_INPUT_ID = "feed-search-input"

export const focusFeedSearchInput = (): boolean => {
  if (typeof document === "undefined") return false

  const input = document.getElementById(FEED_SEARCH_INPUT_ID)
  if (!(input instanceof HTMLInputElement)) return false

  input.focus({ preventScroll: false })
  return document.activeElement === input
}

export const waitForFeedSearchInputFocus = (maxAttempts = 90): Promise<boolean> =>
  new Promise((resolve) => {
    const tryFocus = (attempt = 0) => {
      if (focusFeedSearchInput()) {
        resolve(true)
        return
      }

      if (attempt >= maxAttempts) {
        resolve(false)
        return
      }

      window.setTimeout(() => {
        tryFocus(attempt + 1)
      }, 16)
    }

    tryFocus()
  })
