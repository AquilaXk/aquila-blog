import { useEffect } from "react"
import { useRouter } from "next/router"
import * as gtag from "src/libs/gtag"
import { useOptionalTrackingConsent } from "src/libs/privacy/optionalTrackingConsent"
import { CONFIG } from "site.config"

const useGtagEffect = () => {
  const router = useRouter()
  const optionalTrackingAllowed = useOptionalTrackingConsent()

  useEffect(() => {
    if (!(CONFIG.isProd && CONFIG?.googleAnalytics?.enable && optionalTrackingAllowed)) return

    const handleRouteChange = (url: string) => {
      gtag.pageview(url)
    }
    router.events.on("routeChangeComplete", handleRouteChange)
    return () => {
      router.events.off("routeChangeComplete", handleRouteChange)
    }
  }, [optionalTrackingAllowed, router.events])
  return null
}
export default useGtagEffect
