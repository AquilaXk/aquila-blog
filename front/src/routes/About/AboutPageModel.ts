export type AboutListSection = {
  title: string
  items: string[]
  hasDivider: boolean
}

export type AboutTimelineItem = {
  label: string
  date: string
}

export type AboutProjectItem = {
  name: string
  summary: string
  role: string
  safeHref: string
  linkLabel: string
}

export const normalizeSectionTitle = (title: string) => title.replace(/\s+/g, "").toLowerCase()

export const isTimelineSection = (title: string) => /이력|자격|journey|timeline|credential/.test(normalizeSectionTitle(title))

export const parseTimelineItem = (item: string): AboutTimelineItem => {
  const match = item.match(/^(.*?)(?:\s*\[([0-9./-]+)\])?$/)
  return {
    label: (match?.[1] || item).trim(),
    date: (match?.[2] || "").trim(),
  }
}

export const isExternalHref = (href: string) =>
  href.startsWith("https://") || href.startsWith("http://") || href.startsWith("mailto:") || href.startsWith("tel:")
