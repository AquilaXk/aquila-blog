import { FEED_EXPLORER_RESTORE_KEY_PREFIX } from "src/libs/feed/feedRestoreCache"

export type BrowserStorageArea = "cookie" | "localStorage" | "sessionStorage"

export type BrowserStorageRegistryEntry = {
  area: BrowserStorageArea
  key: string
  purpose: string
  required: boolean
  retention: string
  deletion: string
  stores: string
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
  {
    area: "cookie",
    key: "apiKey",
    purpose: "auth-session",
    required: true,
    retention: "session or 30 days when keep-signed-in is enabled",
    deletion: "logout, session revocation, account deletion, or browser cookie deletion",
    stores: "member api key token value",
  },
  {
    area: "cookie",
    key: "accessToken",
    purpose: "auth-session",
    required: true,
    retention: "session or access-token TTL when keep-signed-in is enabled",
    deletion: "logout, refresh rotation, session revocation, or browser cookie deletion",
    stores: "JWT access token",
  },
  {
    area: "cookie",
    key: "refreshToken",
    purpose: "auth-session",
    required: true,
    retention: "session or 30 days when keep-signed-in is enabled",
    deletion: "logout, refresh rotation, session revocation, or browser cookie deletion",
    stores: "opaque refresh token; server stores only hash",
  },
  {
    area: "cookie",
    key: "sessionKey",
    purpose: "auth-session",
    required: true,
    retention: "session or 30 days when keep-signed-in is enabled",
    deletion: "logout, session revocation, account deletion, or browser cookie deletion",
    stores: "member session identifier",
  },
  {
    area: "cookie",
    key: "signup_session",
    purpose: "signup-verification-session",
    required: true,
    retention: "signup verification TTL",
    deletion: "signup completion, cancellation, expiry, or browser cookie deletion",
    stores: "opaque signup verification session id",
  },
  {
    area: "cookie",
    key: "scheme",
    purpose: "theme-preference",
    required: false,
    retention: "until changed or browser cookie deletion",
    deletion: "theme toggle overwrite or browser cookie deletion",
    stores: "light or dark theme preference",
  },
  {
    area: "cookie",
    key: "admin_profile_snapshot_v1",
    purpose: "admin-profile-snapshot",
    required: false,
    retention: "short-lived SSR snapshot cache",
    deletion: "snapshot refresh or browser cookie deletion",
    stores: "public admin profile display snapshot",
  },
  {
    area: "cookie",
    key: "admin_tools_mail_snapshot_v1",
    purpose: "admin-mail-tool-snapshot",
    required: false,
    retention: "short-lived admin tool snapshot cache",
    deletion: "snapshot refresh or browser cookie deletion",
    stores: "admin mail tool diagnostic snapshot",
  },
  {
    area: "localStorage",
    key: OPTIONAL_TRACKING_CONSENT_STORAGE_KEY,
    purpose: "optional-tracking-consent",
    required: false,
    retention: "until consent is changed, withdrawn, or browser storage is cleared",
    deletion: "privacy settings change or browser storage deletion",
    stores: "granted or denied optional tracking consent state",
  },
  {
    area: "localStorage",
    key: "auth.login.keepSignedIn",
    purpose: "login-preference",
    required: false,
    retention: "until login preference changes or browser storage is cleared",
    deletion: "login preference change or browser storage deletion",
    stores: "boolean remember-login preference",
  },
  {
    area: "localStorage",
    key: "auth.login.ipSecurityOn",
    purpose: "login-security-preference",
    required: false,
    retention: "until login preference changes or browser storage is cleared",
    deletion: "login preference change or browser storage deletion",
    stores: "boolean IP security preference",
  },
  {
    area: "localStorage",
    key: "admin.editor.localDraft.v1",
    purpose: "editor-local-draft",
    required: false,
    retention: "7 days from savedAt or until manually cleared",
    deletion: "manual clear, successful publish, TTL expiry, or browser storage deletion",
    stores: "draft title, markdown content, summary, thumbnail URL, tags, category, visibility, savedAt",
  },
  {
    area: "localStorage",
    key: "admin.editor.customTags",
    purpose: "editor-custom-tag-catalog",
    required: false,
    retention: "until catalog changes or browser storage is cleared",
    deletion: "catalog overwrite or browser storage deletion",
    stores: "admin-provided tag labels",
  },
  {
    area: "localStorage",
    key: "admin.editor.customCategories",
    purpose: "editor-custom-category-catalog",
    required: false,
    retention: "until catalog changes or browser storage is cleared",
    deletion: "catalog overwrite or browser storage deletion",
    stores: "admin-provided category labels",
  },
  {
    area: "localStorage",
    key: "admin.contentStudio.listConditions.v1",
    purpose: "admin-list-preference",
    required: false,
    retention: "until list preference changes or browser storage is cleared",
    deletion: "list preference overwrite or browser storage deletion",
    stores: "admin post list filter and sorting conditions",
  },
  {
    area: "localStorage",
    key: "editor.actual-preview.v1:",
    purpose: "editor-preview-prefix",
    required: false,
    retention: "until preview snapshot is replaced or browser storage is cleared",
    deletion: "preview overwrite or browser storage deletion",
    stores: "editor actual-preview snapshot by post id",
  },
  {
    area: "localStorage",
    key: "aquila-cloud-video-upload-session",
    purpose: "cloud-video-upload-session-prefix",
    required: false,
    retention: "until upload completes, is cancelled, becomes stale, or browser storage is cleared",
    deletion: "upload completion, cancellation, stale session cleanup, or browser storage deletion",
    stores: "resumable cloud video upload session id keyed by file metadata",
  },
  {
    area: "sessionStorage",
    key: "auth.signupMailCooldown.v1",
    purpose: "signup-mail-cooldown",
    required: false,
    retention: "until cooldown expiry or browser tab session ends",
    deletion: "cooldown expiry, tab close, or browser storage deletion",
    stores: "hashed email key to cooldown expiry timestamp map",
  },
  {
    area: "sessionStorage",
    key: "auth:me:anon-probe-suppress-until:v1",
    purpose: "anonymous-auth-probe-suppression",
    required: false,
    retention: "5 minutes or browser tab session end",
    deletion: "auth success, TTL expiry, tab close, or browser storage deletion",
    stores: "timestamp until anonymous auth/me probe should be suppressed",
  },
  {
    area: "sessionStorage",
    key: "header.auth-shell.v1",
    purpose: "header-auth-shell-snapshot",
    required: false,
    retention: "browser tab session",
    deletion: "tab close, auth state refresh, or browser storage deletion",
    stores: "authenticated/admin booleans for first paint",
  },
  {
    area: "sessionStorage",
    key: "member.notification.lastEventId.v1",
    purpose: "notification-sse-resume",
    required: false,
    retention: "browser tab session",
    deletion: "tab close, logout, stream reset, or browser storage deletion",
    stores: "last notification SSE event id",
  },
  {
    area: "sessionStorage",
    key: "member.notification.snapshot.v1",
    purpose: "notification-snapshot",
    required: false,
    retention: "browser tab session",
    deletion: "tab close, notification refresh, logout, or browser storage deletion",
    stores: "notification list snapshot and unread count",
  },
  {
    area: "sessionStorage",
    key: "admin.tools.resultsFilter.v1",
    purpose: "admin-tools-filter",
    required: false,
    retention: "browser tab session",
    deletion: "tab close, filter overwrite, or browser storage deletion",
    stores: "admin tools result filter mode",
  },
  {
    area: "sessionStorage",
    key: "posts:public-cursor-disabled:v1",
    purpose: "public-posts-cursor-fallback",
    required: false,
    retention: "browser tab session",
    deletion: "tab close or browser storage deletion",
    stores: "boolean cursor endpoint fallback flag",
  },
  {
    area: "sessionStorage",
    key: "posts:runtime-endpoints:v1",
    purpose: "posts-runtime-endpoint-trace",
    required: false,
    retention: "browser tab session, capped to last 60 entries",
    deletion: "tab close or browser storage deletion",
    stores: "recent posts endpoint mode diagnostics",
  },
  {
    area: "sessionStorage",
    key: "__aquila_client_runtime_recovery__",
    purpose: "runtime-recovery-prefix",
    required: false,
    retention: "browser tab session",
    deletion: "tab close or browser storage deletion",
    stores: "client runtime recovery marker and reason",
  },
  {
    area: "sessionStorage",
    key: FEED_EXPLORER_RESTORE_KEY_PREFIX,
    purpose: "feed-restore-prefix",
    required: false,
    retention: "browser tab session",
    deletion: "tab close, feed restore cleanup, or browser storage deletion",
    stores: "feed explorer scroll, query, and snapshot restoration state",
  },
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
