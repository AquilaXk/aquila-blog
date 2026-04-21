import type { ProfileCardLinkItem } from "src/constants/profileCardLinks"

export type AboutSectionBlock = {
  id: string
  title: string
  items: string[]
  dividerBefore: boolean
}

export type AboutProjectBlock = {
  id: string
  name: string
  summary: string
  role: string
  href: string
  linkLabel: string
}

export type ProfileWorkspaceContent = {
  profileImageUrl: string
  profileRole: string
  profileBio: string
  aboutHeadline: string
  aboutRole: string
  aboutBio: string
  aboutSections: AboutSectionBlock[]
  aboutProjectSectionTitle: string
  aboutProjects: AboutProjectBlock[]
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
  aboutHeadline?: string
  aboutRole?: string
  aboutBio?: string
  aboutDetails?: string
  aboutSections?: AboutSectionBlock[]
  aboutProjectSectionTitle?: string
  aboutProjects?: AboutProjectBlock[]
  blogTitle?: string
  homeIntroTitle?: string
  homeIntroDescription?: string
  serviceLinks?: ProfileCardLinkItem[]
  contactLinks?: ProfileCardLinkItem[]
}

export const DEFAULT_ABOUT_HEADLINE = "이유를 먼저 따지고, 운영 가능한 시스템을 설계합니다."
export const DEFAULT_ABOUT_PROJECT_SECTION_TITLE = "프로젝트"
export const DEFAULT_ABOUT_PROJECTS: AboutProjectBlock[] = [
  {
    id: "project-1",
    name: "고구마마켓",
    summary: "거래 흐름과 상태 전이를 직접 설계하며 커머스 도메인 감각을 다진 프로젝트입니다.",
    role: "Backend · 도메인 설계",
    href: "",
    linkLabel: "",
  },
  {
    id: "project-2",
    name: "마음-온",
    summary: "사용자 감정 기록 흐름을 다루며 서비스 구조와 데이터 설계를 다듬은 프로젝트입니다.",
    role: "Backend · API 설계",
    href: "",
    linkLabel: "",
  },
  {
    id: "project-3",
    name: "aquila-blog",
    summary: "글쓰기, 공개 렌더링, 운영 배포까지 직접 관리하는 개인 기술 블로그입니다.",
    role: "Full-stack · Editor/SSR/Deploy",
    href: "https://github.com/AquilaXk/aquila-blog",
    linkLabel: "aquila-blog",
  },
  {
    id: "project-4",
    name: "aquila-bank",
    summary: "금융 도메인을 가정하고 계좌/거래 흐름을 모델링한 학습 프로젝트입니다.",
    role: "Backend · Transaction Flow",
    href: "https://github.com/AquilaXk/aquila-bank",
    linkLabel: "링크 보기",
  },
]

const normalizeSectionTitle = (title: string) => title.replace(/\s+/g, "").toLowerCase()

export const isAboutProjectSectionTitle = (title: string) => /프로젝트|project/.test(normalizeSectionTitle(title))

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
    aboutHeadline: "",
    aboutRole: "",
    aboutBio: "",
    aboutSections: sections,
    aboutProjectSectionTitle: "",
    aboutProjects: [],
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

const normalizeAboutProjects = (items: AboutProjectBlock[] | undefined): AboutProjectBlock[] =>
  (items || [])
    .map((item, index) => {
      const href = (item.href || "").trim()
      const linkLabel = (item.linkLabel || "").trim()
      return {
        id: (item.id || "").trim() || `project-${index + 1}`,
        name: (item.name || "").trim(),
        summary: (item.summary || "").trim(),
        role: (item.role || "").trim(),
        href,
        linkLabel: linkLabel || (href ? "링크 보기" : ""),
      }
    })
    .filter((item) => item.name || item.summary || item.role || item.href)

const deriveLegacyAboutProjects = (sections: AboutSectionBlock[]): AboutProjectBlock[] => {
  const projectSection = sections.find((section) => isAboutProjectSectionTitle(section.title))
  if (!projectSection) return []

  return normalizeAboutProjects(
    projectSection.items.map((name, index) => {
      const preset = DEFAULT_ABOUT_PROJECTS.find((item) => item.name.toLowerCase() === name.toLowerCase())
      return {
        ...(preset || {
          id: `project-${index + 1}`,
          name,
          summary: "",
          role: "",
          href: "",
          linkLabel: "",
        }),
        id: preset?.id || `project-${index + 1}`,
        name,
      }
    })
  )
}

export const normalizeProfileWorkspaceContent = (
  content: ProfileWorkspaceContent
): ProfileWorkspaceContent => {
  const normalizedSections = (content.aboutSections || [])
    .map((section, index) => ({
      id: (section.id || "").trim() || `section-${index + 1}`,
      title: (section.title || "").trim(),
      items: (section.items || []).map((item) => item.trim()).filter(Boolean),
      dividerBefore: Boolean(section.dividerBefore),
    }))
    .filter((section) => section.title || section.items.length > 0)
  const legacyProjectSectionTitle =
    normalizedSections.find((section) => isAboutProjectSectionTitle(section.title))?.title || ""
  const explicitAboutProjects = normalizeAboutProjects(content.aboutProjects)
  const aboutProjects =
    explicitAboutProjects.length > 0 ? explicitAboutProjects : deriveLegacyAboutProjects(normalizedSections)
  const aboutSections =
    aboutProjects.length > 0
      ? normalizedSections.filter((section) => !isAboutProjectSectionTitle(section.title))
      : normalizedSections

  return {
    profileImageUrl: (content.profileImageUrl || "").trim(),
    profileRole: (content.profileRole || "").trim(),
    profileBio: (content.profileBio || "").trim(),
    aboutHeadline: (content.aboutHeadline || "").trim(),
    aboutRole: (content.aboutRole || "").trim(),
    aboutBio: (content.aboutBio || "").trim(),
    aboutSections,
    aboutProjectSectionTitle: (content.aboutProjectSectionTitle || "").trim() || legacyProjectSectionTitle,
    aboutProjects,
    blogTitle: (content.blogTitle || "").trim(),
    homeIntroTitle: (content.homeIntroTitle || "").trim(),
    homeIntroDescription: (content.homeIntroDescription || "").trim(),
    serviceLinks: normalizeLinkItems(content.serviceLinks),
    contactLinks: normalizeLinkItems(content.contactLinks),
  }
}

export const serializeProfileWorkspaceContent = (content: ProfileWorkspaceContent) =>
  JSON.stringify(normalizeProfileWorkspaceContent(content))

export const buildProfileWorkspaceFromLegacy = (
  value: LegacyProfileLike | null | undefined
): ProfileWorkspaceContent =>
  normalizeProfileWorkspaceContent({
    profileImageUrl: value?.profileImageDirectUrl || value?.profileImageUrl || "",
    profileRole: value?.profileRole || "",
    profileBio: value?.profileBio || "",
    aboutHeadline: value?.aboutHeadline || "",
    aboutRole: value?.aboutRole || "",
    aboutBio: value?.aboutBio || "",
    aboutSections:
      value?.aboutSections && value.aboutSections.length > 0
        ? value.aboutSections
        : parseLegacyAboutDetails(value?.aboutDetails || ""),
    aboutProjectSectionTitle: value?.aboutProjectSectionTitle || "",
    aboutProjects: value?.aboutProjects || [],
    blogTitle: value?.blogTitle || "",
    homeIntroTitle: value?.homeIntroTitle || "",
    homeIntroDescription: value?.homeIntroDescription || "",
    serviceLinks: value?.serviceLinks || [],
    contactLinks: value?.contactLinks || [],
  })
