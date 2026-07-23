type LivePoliteness = "polite" | "assertive"

let liveRegion: HTMLDivElement | null = null

const visuallyHiddenStyles: Partial<CSSStyleDeclaration> = {
  position: "absolute",
  width: "1px",
  height: "1px",
  padding: "0",
  margin: "-1px",
  overflow: "hidden",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
  border: "0",
}

const ensureLiveRegion = (politeness: LivePoliteness) => {
  if (typeof document === "undefined") return null

  if (!liveRegion) {
    liveRegion = document.createElement("div")
    liveRegion.setAttribute("aria-live", politeness)
    liveRegion.setAttribute("aria-atomic", "true")
    Object.assign(liveRegion.style, visuallyHiddenStyles)
    document.body.appendChild(liveRegion)
  }

  liveRegion.setAttribute("aria-live", politeness)
  return liveRegion
}

/** Announces a short result message through a shared aria-live region. */
export const announceLive = (message: string, politeness: LivePoliteness = "polite") => {
  const region = ensureLiveRegion(politeness)
  if (!region) return

  region.textContent = ""
  window.requestAnimationFrame(() => {
    region.textContent = message
  })
}
