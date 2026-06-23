export const OPTIONAL_TRACKING_CONSENT_STORAGE_KEY = "privacy.optionalTrackingConsent.v1"
export const OPTIONAL_TRACKING_CONSENT_CHANGE_EVENT = "aquila:optional-tracking-consent-change"

export type OptionalTrackingConsentState = "granted" | "denied"
export type OptionalTrackingConsentSource =
  | "settings"
  | "signup-email"
  | "signup-social"
  | "privacy-request"
  | "legal-reconsent"
  | "legacy-string"

export type OptionalTrackingConsentRecord = {
  version: 1
  state: OptionalTrackingConsentState
  updatedAt: string
  source: OptionalTrackingConsentSource
  categories: {
    analytics: boolean
    rum: boolean
  }
}

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
  "/api/rum/client-errors",
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

const parseLegacyConsentState = (raw: string): OptionalTrackingConsentState | null =>
  raw === "granted" || raw === "denied" ? raw : null

const createOptionalTrackingConsentRecord = (
  state: OptionalTrackingConsentState,
  source: OptionalTrackingConsentSource,
  updatedAt = new Date().toISOString(),
): OptionalTrackingConsentRecord => ({
  version: 1,
  state,
  updatedAt,
  source,
  categories: {
    analytics: state === "granted",
    rum: state === "granted",
  },
})

export const readOptionalTrackingConsent = (): OptionalTrackingConsentRecord | null => {
  if (typeof window === "undefined") return null

  try {
    const raw = window.localStorage.getItem(OPTIONAL_TRACKING_CONSENT_STORAGE_KEY)
    if (!raw) return null

    const legacyState = parseLegacyConsentState(raw)
    if (legacyState) {
      return createOptionalTrackingConsentRecord(legacyState, "legacy-string", "")
    }

    const parsed = JSON.parse(raw) as Partial<OptionalTrackingConsentRecord>
    if (parsed.version !== 1) return null
    if (parsed.state !== "granted" && parsed.state !== "denied") return null
    if (typeof parsed.updatedAt !== "string") return null
    if (typeof parsed.source !== "string") return null
    if (typeof parsed.categories?.analytics !== "boolean" || typeof parsed.categories?.rum !== "boolean") return null

    return {
      version: 1,
      state: parsed.state,
      updatedAt: parsed.updatedAt,
      source: parsed.source as OptionalTrackingConsentSource,
      categories: {
        analytics: parsed.categories.analytics,
        rum: parsed.categories.rum,
      },
    }
  } catch {
    return null
  }
}

export const hasBrowserPrivacyOptOutSignal = () => {
  if (typeof navigator === "undefined") return false

  const navigatorWithGpc = navigator as Navigator & { globalPrivacyControl?: boolean }
  return navigator.doNotTrack === "1" || navigatorWithGpc.globalPrivacyControl === true
}

export const hasOptionalTrackingConsent = () => {
  const consent = readOptionalTrackingConsent()
  if (!consent) return false
  if (hasBrowserPrivacyOptOutSignal()) return false
  return consent.state === "granted" && consent.categories.analytics && consent.categories.rum
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

export const writeOptionalTrackingConsent = (state: OptionalTrackingConsentState, source: OptionalTrackingConsentSource = "settings") => {
  if (typeof window === "undefined") return

  try {
    window.localStorage.setItem(OPTIONAL_TRACKING_CONSENT_STORAGE_KEY, JSON.stringify(createOptionalTrackingConsentRecord(state, source)))
    if (state === "denied") {
      disableOptionalTrackingRuntime()
    }
    window.dispatchEvent(new Event(OPTIONAL_TRACKING_CONSENT_CHANGE_EVENT))
  } catch {
    // Optional analytics consent must never block the primary user flow.
  }
}

export const setOptionalTrackingConsent = (granted: boolean, source: OptionalTrackingConsentSource = "settings") => {
  writeOptionalTrackingConsent(granted ? "granted" : "denied", source)
}
