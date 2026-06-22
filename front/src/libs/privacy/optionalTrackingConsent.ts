import { useEffect, useState } from "react"
import {
  OPTIONAL_TRACKING_CONSENT_CHANGE_EVENT,
  hasOptionalTrackingConsent,
} from "src/libs/privacy/browserStorageRegistry"

export const useOptionalTrackingConsent = () => {
  const [optionalTrackingAllowed, setOptionalTrackingAllowed] = useState(false)

  useEffect(() => {
    const syncConsentState = () => {
      setOptionalTrackingAllowed(hasOptionalTrackingConsent())
    }

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
