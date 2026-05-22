import type { SimpleIcon } from "simple-icons"
import AppIcon from "src/components/icons/AppIcon"

export const renderMonitoringBrand = (
  icon: SimpleIcon | undefined,
  fallbackIcon: "service" | undefined,
  title: string
) => {
  if (icon) {
    return (
      <svg viewBox="0 0 24 24" focusable="false" aria-label={title} style={{ width: "1.35rem", height: "1.35rem", color: `#${icon.hex}` }}>
        <path d={icon.path} fill="currentColor" />
      </svg>
    )
  }

  return <AppIcon name={fallbackIcon || "service"} aria-hidden="true" />
}
