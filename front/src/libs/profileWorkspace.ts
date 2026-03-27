import type { ProfileCardLinkItem } from "src/constants/profileCardLinks"

export type AboutSectionBlock = {
  id: string
  title: string
  items: string[]
  dividerBefore: boolean
}

export type ProfileWorkspaceContent = {
  profileImageUrl: string
  profileRole: string
  profileBio: string
  aboutRole: string
  aboutBio: string
  aboutSections: AboutSectionBlock[]
  blogTitle: string
  homeIntroTitle: string
  homeIntroDescription: string
  serviceLinks: ProfileCardLinkItem[]
  contactLinks: ProfileCardLinkItem[]
}

export type ProfileWorkspaceResponse = {
  draft: ProfileWorkspaceContent
  published: ProfileWorkspaceContent
  lastDraftSavedAt?: string | null
  lastPublishedAt?: string | null
  dirtyFromPublished: boolean
}

type LegacyProfileLike = {
  profileImageDirectUrl?: string
  profileImageUrl?: string
  profileRole?: string
  profileBio?: string
  aboutRole?: string
  aboutBio?: string
  aboutDetails?: string
  aboutSections?: AboutSectionBlock[]
  blogTitle?: string
  homeIntroTitle?: string
  homeIntroDescription?: string
  serviceLinks?: ProfileCardLinkItem[]
  contactLinks?: ProfileCardLinkItem[]
}

export const parseLegacyAboutDetails = (raw: string): AboutSectionBlock[] => {
  const lines = raw.split(/\r?\n/).map((line) => line.trim())
  const sections: AboutSectionBlock[] = []
  let current: AboutSectionBlock | null = null
  let nextSectionHasDivider = false

  const pushCurrent = () => {
    if (!current) return
    const normalizedTitle = current.title.trim()
    const normalizedItems = current.items.map((item) => item.trim()).filter(Boolean)
    if (!normalizedTitle && normalizedItems.length === 0) {
      current = null
      return
    }
    sections.push({
      id: current.id || `legacy-${sections.length + 1}`,
      title: normalizedTitle,
      items: normalizedItems,
      dividerBefore: current.dividerBefore,
    })
    current = null
  }

  for (const line of lines) {
    if (!line) continue
    if (line === "---") {
      pushCurrent()
      nextSectionHasDivider = true
      continue
    }

    const markdownHeadingMatch = line.match(/^#{1,3}\s+(.+)$/)
    if (markdownHeadingMatch) {
      pushCurrent()
      current = {
        id: `legacy-${sections.length + 1}`,
        title: markdownHeadingMatch[1].trim(),
        items: [],
        dividerBefore: nextSectionHasDivider,
      }
      nextSectionHasDivider = false
      continue
    }

    if (!current) {
      current = {
        id: `legacy-${sections.length + 1}`,
        title: line,
        items: [],
        dividerBefore: nextSectionHasDivider,
      }
      nextSectionHasDivider = false
      continue
    }

    const plainHeadingLike =
      !line.startsWith("- ") &&
      current.items.length > 0 &&
      line.length <= 24 &&
      !/\d{4}[./-]\d{1,2}/.test(line) &&
      !/[,:;)]$/.test(line)
    if (plainHeadingLike) {
      pushCurrent()
      current = {
        id: `legacy-${sections.length + 1}`,
        title: line,
        items: [],
        dividerBefore: nextSectionHasDivider,
      }
      nextSectionHasDivider = false
      continue
    }

    const itemText = line.startsWith("- ") ? line.slice(2).trim() : line
    if (!itemText) continue
    current.items.push(itemText)
  }

  pushCurrent()
  return sections
}

export const buildLegacyAboutDetails = (sections: AboutSectionBlock[]): string => {
  const normalizedSections = normalizeProfileWorkspaceContent({
    profileImageUrl: "",
    profileRole: "",
    profileBio: "",
    aboutRole: "",
    aboutBio: "",
    aboutSections: sections,
    blogTitle: "",
    homeIntroTitle: "",
    homeIntroDescription: "",
    serviceLinks: [],
    contactLinks: [],
  }).aboutSections
  const lines: string[] = []

  normalizedSections.forEach((section, index) => {
    if (section.dividerBefore && lines.length > 0) {
      if (lines.at(-1)) lines.push("")
      lines.push("---", "")
    } else if (index > 0 && lines.at(-1)) {
      lines.push("")
    }

    if (section.title) lines.push(`## ${section.title}`)
    section.items.forEach((item) => {
      lines.push(`- ${item}`)
    })
    lines.push("")
  })

  while (lines.length > 0 && !lines.at(-1)) {
    lines.pop()
  }

  return lines.join("\n")
}

const normalizeLinkItems = (items: ProfileCardLinkItem[] | undefined): ProfileCardLinkItem[] =>
  (items || [])
    .map((item) => ({
      icon: item.icon,
      label: (item.label || "").trim(),
      href: (item.href || "").trim(),
    }))
    .filter((item) => item.label && item.href)

export const normalizeProfileWorkspaceContent = (
  content: ProfileWorkspaceContent
): ProfileWorkspaceContent => ({
  profileImageUrl: (content.profileImageUrl || "").trim(),
  profileRole: (content.profileRole || "").trim(),
  profileBio: (content.profileBio || "").trim(),
  aboutRole: (content.aboutRole || "").trim(),
  aboutBio: (content.aboutBio || "").trim(),
  aboutSections: (content.aboutSections || [])
    .map((section, index) => ({
      id: (section.id || "").trim() || `section-${index + 1}`,
      title: (section.title || "").trim(),
      items: (section.items || []).map((item) => item.trim()).filter(Boolean),
      dividerBefore: Boolean(section.dividerBefore),
    }))
    .filter((section) => section.title || section.items.length > 0),
  blogTitle: (content.blogTitle || "").trim(),
  homeIntroTitle: (content.homeIntroTitle || "").trim(),
  homeIntroDescription: (content.homeIntroDescription || "").trim(),
  serviceLinks: normalizeLinkItems(content.serviceLinks),
  contactLinks: normalizeLinkItems(content.contactLinks),
})

export const serializeProfileWorkspaceContent = (content: ProfileWorkspaceContent) =>
  JSON.stringify(normalizeProfileWorkspaceContent(content))

export const buildProfileWorkspaceFromLegacy = (
  value: LegacyProfileLike | null | undefined
): ProfileWorkspaceContent =>
  normalizeProfileWorkspaceContent({
    profileImageUrl: value?.profileImageDirectUrl || value?.profileImageUrl || "",
    profileRole: value?.profileRole || "",
    profileBio: value?.profileBio || "",
    aboutRole: value?.aboutRole || "",
    aboutBio: value?.aboutBio || "",
    aboutSections:
      value?.aboutSections && value.aboutSections.length > 0
        ? value.aboutSections
        : parseLegacyAboutDetails(value?.aboutDetails || ""),
    blogTitle: value?.blogTitle || "",
    homeIntroTitle: value?.homeIntroTitle || "",
    homeIntroDescription: value?.homeIntroDescription || "",
    serviceLinks: value?.serviceLinks || [],
    contactLinks: value?.contactLinks || [],
  })
