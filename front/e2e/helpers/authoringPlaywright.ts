import { expect, test as base, type Page } from "@playwright/test"

const AUTHORING_GOTO_RETRY_ATTEMPTS = 4
const AUTHORING_GOTO_RETRY_DELAY_MS = 160

const isRetryableNavigationError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  return (
    message.includes("ERR_CONNECTION_REFUSED") ||
    message.includes("ECONNREFUSED") ||
    message.includes("ECONNRESET")
  )
}

const waitForRetryDelay = (attempt: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, AUTHORING_GOTO_RETRY_DELAY_MS * (attempt + 1))
  })

const patchGotoWithRetry = (page: Page) => {
  const originalGoto = page.goto.bind(page)
  const gotoWithRetry: Page["goto"] = async (url, options) => {
    for (let attempt = 0; attempt < AUTHORING_GOTO_RETRY_ATTEMPTS; attempt += 1) {
      try {
        return await originalGoto(url, options)
      } catch (error) {
        const isLastAttempt = attempt === AUTHORING_GOTO_RETRY_ATTEMPTS - 1
        if (isLastAttempt || !isRetryableNavigationError(error)) throw error
        await waitForRetryDelay(attempt)
      }
    }
    throw new Error("page.goto retry loop exited without returning")
  }
  page.goto = gotoWithRetry
}

const test = base.extend({
  page: async ({ page }, use) => {
    patchGotoWithRetry(page)
    await use(page)
  },
})

export { expect, test }
export type {
  ConsoleMessage,
  Locator,
  Page,
  Route,
} from "@playwright/test"
