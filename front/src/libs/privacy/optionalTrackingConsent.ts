import { useEffect, useState } from "react"
import {
  OPTIONAL_TRACKING_CONSENT_CHANGE_EVENT,
  disableOptionalTrackingRuntime,
  hasOptionalTrackingConsent,
  installOptionalTrackingDenyGuard,
} from "src/libs/privacy/optionalTrackingConsentCore"

export const useOptionalTrackingConsent = () => {
  const [optionalTrackingAllowed, setOptionalTrackingAllowed] = useState(false)

  useEffect(() => {
    const syncConsentState = () => {
      const allowed = hasOptionalTrackingConsent()
      if (!allowed) {
        disableOptionalTrackingRuntime()
      }
      setOptionalTrackingAllowed(allowed)
    }

    installOptionalTrackingDenyGuard()
    syncConsentState()
    window.addEventListener("storage", syncConsentState)
    window.addEventListener(OPTIONAL_TRACKING_CONSENT_CHANGE_EVENT, syncConsentState)

    return () => {
      window.removeEventListener("storage", syncConsentState)
      window.removeEventListener(OPTIONAL_TRACKING_CONSENT_CHANGE_EVENT, syncConsentState)
    }
  }, [])

  return optionalTrackingAllowed
}
