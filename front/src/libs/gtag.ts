import { CONFIG } from "site.config"
export const GA_TRACKING_ID = CONFIG.googleAnalytics.config.measurementId

// https://developers.google.com/analytics/devguides/collection/gtagjs/pages
export const pageview = (url: string) => {
  if (typeof window !== "object") return
  window.gtag("config", GA_TRACKING_ID, {
    page_path: url,
  })
}

// https://developers.google.com/analytics/devguides/collection/gtagjs/events
type GTagEvent = {
  action: string
  category?: string
  label?: string
  value?: number
}

export const event = ({
  action,
  category,
  label,
  value,
}: GTagEvent) => {
  if (typeof window !== "object") return
  window.gtag("event", action, {
    event_category: category,
    event_label: label,
    value,
  })
}
