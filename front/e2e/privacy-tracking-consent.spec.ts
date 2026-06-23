import { expect, test, type Page, type Request } from "@playwright/test"
import { sanitizeRumUrlPath } from "../src/libs/rum/reportWebVital"

const OPTIONAL_TRACKING_CONSENT_STORAGE_KEY = "privacy.optionalTrackingConsent.v1"
const OPTIONAL_TRACKING_CONSENT_CHANGE_EVENT = "aquila:optional-tracking-consent-change"

const isOptionalTrackingRequest = (request: Request) => {
  const url = request.url()
  return [
    "/api/rum/vitals",
    "/api/rum/client-errors",
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

const writeConsentRecord = async (page: Page, state: "granted" | "denied", source = "settings") => {
  await page.evaluate(
    ({ eventName, key, source, state }) => {
      window.localStorage.setItem(
        key,
        JSON.stringify({
          version: 1,
          state,
          updatedAt: "2026-06-23T00:00:00.000Z",
          source,
          categories: {
            analytics: state === "granted",
            rum: state === "granted",
          },
        }),
      )
      window.dispatchEvent(new Event(eventName))
    },
    { eventName: OPTIONAL_TRACKING_CONSENT_CHANGE_EVENT, key: OPTIONAL_TRACKING_CONSENT_STORAGE_KEY, source, state },
  )
}

test("optional analytics and RUM stay silent before consent and after withdrawal", async ({ page }) => {
  const optionalTrackingRequests = collectOptionalTrackingRequests(page)

  await page.goto("/", { waitUntil: "domcontentloaded" })
  await waitForClientTrackingWindow(page)

  expect(optionalTrackingRequests, "pre-consent optional tracking requests").toEqual([])

  await writeConsentRecord(page, "granted")
  await page.reload({ waitUntil: "domcontentloaded" })
  await waitForClientTrackingWindow(page)

  await expect
    .poll(() => optionalTrackingRequests.length, {
      message: "post-consent optional tracking requests",
      timeout: 10000,
    })
    .toBeGreaterThan(0)

  optionalTrackingRequests.splice(0, optionalTrackingRequests.length)
  await writeConsentRecord(page, "denied")
  await page.waitForTimeout(100)
  const blockedTrackingResults = await page.evaluate(async () => {
    const fetchResponse = await window.fetch("/_vercel/insights/view", { method: "POST" })
    const clientErrorResponse = await window.fetch("/api/rum/client-errors", { method: "POST" })
    const beaconResult = window.navigator.sendBeacon("/_vercel/speed-insights/vitals", "{}")
    return { beaconResult, clientErrorStatus: clientErrorResponse.status, fetchStatus: fetchResponse.status }
  })

  expect(blockedTrackingResults).toEqual({ beaconResult: true, clientErrorStatus: 204, fetchStatus: 204 })
  expect(optionalTrackingRequests, "same-session post-withdrawal optional tracking requests").toEqual([])

  await page.reload({ waitUntil: "domcontentloaded" })
  await waitForClientTrackingWindow(page)

  expect(optionalTrackingRequests, "post-withdrawal optional tracking requests").toEqual([])
})

test("browser DNT surfaces block optional tracking even with granted consent", async ({ page }) => {
  await page.addInitScript(({ key }) => {
    Object.defineProperty(window, "doNotTrack", { configurable: true, value: "1" })
    Object.defineProperty(Navigator.prototype, "doNotTrack", { configurable: true, value: "yes" })
    Object.defineProperty(Navigator.prototype, "msDoNotTrack", { configurable: true, value: "1" })
    window.localStorage.setItem(
      key,
      JSON.stringify({
        version: 1,
        state: "granted",
        updatedAt: "2026-06-23T00:00:00.000Z",
        source: "settings",
        categories: {
          analytics: true,
          rum: true,
        },
      }),
    )
  }, { key: OPTIONAL_TRACKING_CONSENT_STORAGE_KEY })
  const optionalTrackingRequests = collectOptionalTrackingRequests(page)

  await page.goto("/", { waitUntil: "domcontentloaded" })
  await waitForClientTrackingWindow(page)

  const blockedTrackingResults = await page.evaluate(async () => {
    const fetchResponse = await window.fetch("/_vercel/insights/view", { method: "POST" })
    const beaconResult = window.navigator.sendBeacon("/_vercel/speed-insights/vitals", "{}")
    return { beaconResult, fetchStatus: fetchResponse.status }
  })
  expect(blockedTrackingResults).toEqual({ beaconResult: true, fetchStatus: 204 })
  expect(optionalTrackingRequests, "DNT optional tracking requests").toEqual([])
})

test("RUM attribution URL sanitizer drops non-http resource payloads", () => {
  expect(sanitizeRumUrlPath("https://cdn.example.com/assets/lcp.png?token=secret#hash")).toBe("/assets/lcp.png")
  expect(sanitizeRumUrlPath("/posts/123?draftToken=secret#comments")).toBe("/posts/123")
  expect(sanitizeRumUrlPath("data:image/svg+xml,<svg><text>secret</text></svg>")).toBeUndefined()
  expect(sanitizeRumUrlPath("mailto:user@example.com")).toBeUndefined()
  expect(sanitizeRumUrlPath("blob:https://www.aquilaxk.site/opaque-id")).toBeUndefined()
})
