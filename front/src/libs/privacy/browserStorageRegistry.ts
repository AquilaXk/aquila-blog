export type BrowserStorageArea = "cookie" | "localStorage" | "sessionStorage"

export type BrowserStorageRegistryEntry = {
  area: BrowserStorageArea
  key: string
  purpose: string
}

export const OPTIONAL_TRACKING_CONSENT_STORAGE_KEY = "privacy.optionalTrackingConsent.v1"
export const OPTIONAL_TRACKING_CONSENT_CHANGE_EVENT = "aquila:optional-tracking-consent-change"
export type OptionalTrackingConsentState = "granted" | "denied"

type OptionalTrackingWindow = Window & {
  dataLayer?: unknown[]
  ga?: unknown
  gtag?: unknown
  si?: unknown
  siq?: unknown[]
  va?: unknown
  vam?: unknown
  vaq?: unknown[]
}

const optionalTrackingUrlTokens = [
  "/api/rum/vitals",
  "/_vercel/insights",
  "/_vercel/speed-insights",
  "vitals.vercel-insights.com",
  "vercel-insights.com",
  "googletagmanager.com",
  "google-analytics.com",
]

const optionalTrackingScriptSelectors = [
  "script[src*='/_vercel/insights']",
  "script[src*='/_vercel/speed-insights']",
  "script[src*='vercel-scripts.com/v1/script']",
  "script[src*='vercel-scripts.com/v1/speed-insights']",
  "script[src*='googletagmanager.com/gtag/js']",
  "script#ga",
]

let originalFetch: typeof window.fetch | null = null
let originalSendBeacon: typeof window.navigator.sendBeacon | null = null
let denyGuardInstalled = false

export const registeredBrowserStorageKeys: BrowserStorageRegistryEntry[] = [
  { area: "localStorage", key: OPTIONAL_TRACKING_CONSENT_STORAGE_KEY, purpose: "optional-tracking-consent" },
  { area: "cookie", key: "scheme", purpose: "theme-preference" },
  { area: "sessionStorage", key: "__aquila_client_runtime_recovery__", purpose: "runtime-recovery-prefix" },
  { area: "sessionStorage", key: "feed.explorer.restore", purpose: "feed-restore-prefix" },
  { area: "localStorage", key: "admin.editor.localDraft.v1", purpose: "editor-local-draft" },
]

export const hasOptionalTrackingConsent = () => {
  if (typeof window === "undefined") return false

  try {
    return window.localStorage.getItem(OPTIONAL_TRACKING_CONSENT_STORAGE_KEY) === "granted"
  } catch {
    return false
  }
}

const optionalTrackingUrl = (input: RequestInfo | URL) => {
  if (typeof input === "string") return input
  if (input instanceof URL) return input.toString()
  return input.url
}

const isOptionalTrackingUrl = (input: RequestInfo | URL) => {
  const url = optionalTrackingUrl(input)
  return optionalTrackingUrlTokens.some((token) => url.includes(token))
}

const shouldBlockOptionalTrackingRequest = (input: RequestInfo | URL) => {
  return !hasOptionalTrackingConsent() && isOptionalTrackingUrl(input)
}

export const installOptionalTrackingDenyGuard = () => {
  if (typeof window === "undefined" || denyGuardInstalled) return

  denyGuardInstalled = true
  originalFetch = window.fetch.bind(window)
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (shouldBlockOptionalTrackingRequest(input)) {
      return Promise.resolve(new Response(null, { status: 204 }))
    }
    return originalFetch!(input, init)
  }) as typeof window.fetch

  originalSendBeacon = window.navigator.sendBeacon.bind(window.navigator)
  window.navigator.sendBeacon = ((url: string | URL, data?: BodyInit | null) => {
    if (shouldBlockOptionalTrackingRequest(url)) {
      return true
    }
    return originalSendBeacon!(url, data)
  }) as typeof window.navigator.sendBeacon
}

export const disableOptionalTrackingRuntime = () => {
  if (typeof window === "undefined") return

  for (const selector of optionalTrackingScriptSelectors) {
    document.querySelectorAll(selector).forEach((script) => script.remove())
  }

  const trackingWindow = window as OptionalTrackingWindow
  trackingWindow.dataLayer = []
  delete trackingWindow.ga
  delete trackingWindow.gtag
  delete trackingWindow.si
  delete trackingWindow.siq
  delete trackingWindow.va
  delete trackingWindow.vam
  delete trackingWindow.vaq
}

export const writeOptionalTrackingConsent = (state: OptionalTrackingConsentState) => {
  if (typeof window === "undefined") return

  try {
    window.localStorage.setItem(OPTIONAL_TRACKING_CONSENT_STORAGE_KEY, state)
    if (state === "denied") {
      disableOptionalTrackingRuntime()
    }
    window.dispatchEvent(new Event(OPTIONAL_TRACKING_CONSENT_CHANGE_EVENT))
  } catch {
    // Optional analytics consent must never block the primary user flow.
  }
}

export const setOptionalTrackingConsent = (granted: boolean) => {
  writeOptionalTrackingConsent(granted ? "granted" : "denied")
}
