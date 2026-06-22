export type BrowserStorageArea = "cookie" | "localStorage" | "sessionStorage"

export type BrowserStorageRegistryEntry = {
  area: BrowserStorageArea
  key: string
  purpose: string
}

export const OPTIONAL_TRACKING_CONSENT_STORAGE_KEY = "privacy.optionalTrackingConsent.v1"
export const OPTIONAL_TRACKING_CONSENT_CHANGE_EVENT = "aquila:optional-tracking-consent-change"
export type OptionalTrackingConsentState = "granted" | "denied"

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

export const writeOptionalTrackingConsent = (state: OptionalTrackingConsentState) => {
  if (typeof window === "undefined") return

  try {
    window.localStorage.setItem(OPTIONAL_TRACKING_CONSENT_STORAGE_KEY, state)
    window.dispatchEvent(new Event(OPTIONAL_TRACKING_CONSENT_CHANGE_EVENT))
  } catch {
    // Optional analytics consent must never block the primary user flow.
  }
}

export const setOptionalTrackingConsent = (granted: boolean) => {
  writeOptionalTrackingConsent(granted ? "granted" : "denied")
}
