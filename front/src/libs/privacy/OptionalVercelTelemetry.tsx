import { Analytics } from "@vercel/analytics/next"
import { SpeedInsights } from "@vercel/speed-insights/next"
import { useRouter } from "next/router"
import { hasOptionalTrackingConsent } from "src/libs/privacy/optionalTrackingConsentCore"

const SENSITIVE_SIGNUP_ROUTES = new Set(["/signup/verify", "/signup/social/complete"])

type VercelTelemetryEvent = {
  url: string
}

const resolveTelemetryPathname = (url: string): string => {
  try {
    return new URL(url, "https://aquila.local").pathname
  } catch {
    return url.split(/[?#]/, 1)[0] ?? ""
  }
}

const filterSensitiveSignupTelemetry = <T extends VercelTelemetryEvent>(event: T): T | null =>
  !hasOptionalTrackingConsent() || SENSITIVE_SIGNUP_ROUTES.has(resolveTelemetryPathname(event.url))
    ? null
    : {
        ...event,
        url: resolveTelemetryPathname(event.url),
      }

export const OptionalVercelTelemetry = () => {
  const router = useRouter()
  if (SENSITIVE_SIGNUP_ROUTES.has(router.pathname)) return null

  return (
    <>
      <Analytics beforeSend={filterSensitiveSignupTelemetry} />
      <SpeedInsights beforeSend={filterSensitiveSignupTelemetry} />
    </>
  )
}
