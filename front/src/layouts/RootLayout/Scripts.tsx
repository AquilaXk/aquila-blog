import Script from "next/script"
import { useOptionalTrackingConsent } from "src/libs/privacy/optionalTrackingConsent"
import { CONFIG } from "site.config"

const Scripts: React.FC = () => {
  const optionalTrackingAllowed = useOptionalTrackingConsent()

  return (
    <>
      {CONFIG?.googleAnalytics?.enable === true && optionalTrackingAllowed && (
        <>
          <Script
            strategy="lazyOnload"
            src={`https://www.googletagmanager.com/gtag/js?id=${CONFIG.googleAnalytics.config.measurementId}`}
          />
          <Script strategy="lazyOnload" id="ga">
            {`window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${CONFIG.googleAnalytics.config.measurementId}', {
              page_path: window.location.pathname,
          });`}
          </Script>
        </>
      )}
    </>
  )
}

export default Scripts
