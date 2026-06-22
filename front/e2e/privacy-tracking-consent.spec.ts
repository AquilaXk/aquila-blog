import { expect, test, type Page, type Request } from "@playwright/test"

const OPTIONAL_TRACKING_CONSENT_STORAGE_KEY = "privacy.optionalTrackingConsent.v1"
const OPTIONAL_TRACKING_CONSENT_CHANGE_EVENT = "aquila:optional-tracking-consent-change"

const isOptionalTrackingRequest = (request: Request) => {
  const url = request.url()
  return [
    "/api/rum/vitals",
    "/_vercel/insights",
    "/_vercel/speed-insights",
    "vitals.vercel-insights.com",
    "vercel-insights.com",
    "googletagmanager.com",
    "google-analytics.com",
  ].some((token) => url.includes(token))
}

const collectOptionalTrackingRequests = (page: Page) => {
  const requests: string[] = []
  page.on("request", (request) => {
    if (isOptionalTrackingRequest(request)) {
      requests.push(request.url())
    }
  })
  return requests
}

const waitForClientTrackingWindow = async (page: Page) => {
  await expect(page.locator("main")).toBeVisible()
  await page.waitForTimeout(1000)
}

test("optional analytics and RUM stay silent before consent and after withdrawal", async ({ page }) => {
  const optionalTrackingRequests = collectOptionalTrackingRequests(page)

  await page.goto("/", { waitUntil: "domcontentloaded" })
  await waitForClientTrackingWindow(page)

  expect(optionalTrackingRequests, "pre-consent optional tracking requests").toEqual([])

  await page.evaluate(
    ({ key, eventName }) => {
      window.localStorage.setItem(key, "granted")
      window.dispatchEvent(new Event(eventName))
    },
    { key: OPTIONAL_TRACKING_CONSENT_STORAGE_KEY, eventName: OPTIONAL_TRACKING_CONSENT_CHANGE_EVENT },
  )
  await page.reload({ waitUntil: "domcontentloaded" })
  await waitForClientTrackingWindow(page)

  await expect
    .poll(() => optionalTrackingRequests.length, {
      message: "post-consent optional tracking requests",
      timeout: 10000,
    })
    .toBeGreaterThan(0)

  optionalTrackingRequests.splice(0, optionalTrackingRequests.length)
  await page.evaluate(
    ({ key, eventName }) => {
      window.localStorage.setItem(key, "denied")
      window.dispatchEvent(new Event(eventName))
    },
    { key: OPTIONAL_TRACKING_CONSENT_STORAGE_KEY, eventName: OPTIONAL_TRACKING_CONSENT_CHANGE_EVENT },
  )
  await page.reload({ waitUntil: "domcontentloaded" })
  await waitForClientTrackingWindow(page)

  expect(optionalTrackingRequests, "post-withdrawal optional tracking requests").toEqual([])
})
