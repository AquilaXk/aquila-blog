import type { IconName } from "src/components/icons/AppIcon"
import {
  DEFAULT_CONTACT_ITEM_ICON,
  DEFAULT_SERVICE_ITEM_ICON,
  isAllowedProfileLinkHref,
  normalizeProfileLinkHref,
  type ProfileCardLinkItem,
  type ProfileCardLinkSection,
} from "src/constants/profileCardLinks"
import type { AuthMember } from "src/hooks/useAuthSession"
import {
  type AboutProjectBlock,
  type AboutSectionBlock,
  buildProfileWorkspaceFromLegacy,
  normalizeProfileWorkspaceContent,
  type ProfileWorkspaceContent,
  type ProfileWorkspaceResponse,
} from "src/libs/profileWorkspace"

export type WorkspaceSectionId = "identity" | "about" | "home" | "links"
export type LinkTab = "service" | "contact"
export type PreviewMode = "draft" | "published"

export const WORKSPACE_SECTIONS: {
  id: WorkspaceSectionId
  label: string
}[] = [
  {
    id: "identity",
    label: "기본 정보",
  },
  {
    id: "about",
    label: "About 페이지",
  },
  {
    id: "home",
    label: "헤더 문구",
  },
  {
    id: "links",
    label: "외부 링크",
  },
]

const pickWorkspaceSectionContent = (
  content: ProfileWorkspaceContent,
  sectionId: WorkspaceSectionId
) => {
  switch (sectionId) {
    case "identity":
      return {
        profileImageUrl: content.profileImageUrl,
        profileRole: content.profileRole,
        profileBio: content.profileBio,
      }
    case "about":
      return {
        aboutHeadline: content.aboutHeadline,
        aboutRole: content.aboutRole,
        aboutBio: content.aboutBio,
        aboutSections: content.aboutSections,
        aboutProjectSectionTitle: content.aboutProjectSectionTitle,
        aboutProjects: content.aboutProjects,
      }
    case "home":
      return {
        blogTitle: content.blogTitle,
        homeIntroTitle: content.homeIntroTitle,
        homeIntroDescription: content.homeIntroDescription,
      }
    case "links":
      return {
        serviceLinks: content.serviceLinks,
        contactLinks: content.contactLinks,
      }
  }
}

export const serializeWorkspaceSection = (
  content: ProfileWorkspaceContent,
  sectionId: WorkspaceSectionId
) => JSON.stringify(pickWorkspaceSectionContent(normalizeProfileWorkspaceContent(content), sectionId))

export const moveListItem = <T,>(items: T[], index: number, direction: -1 | 1) => {
  const nextIndex = index + direction
  if (nextIndex < 0 || nextIndex >= items.length) return items
  const next = items.slice()
  const [item] = next.splice(index, 1)
  next.splice(nextIndex, 0, item)
  return next
}

const createLocalId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 9)}`

export const createBlankLinkItem = (section: LinkTab): ProfileCardLinkItem =>
  section === "service"
    ? { icon: DEFAULT_SERVICE_ITEM_ICON, label: "", href: "" }
    : { icon: DEFAULT_CONTACT_ITEM_ICON, label: "", href: "" }

export const createBlankAboutSection = (): AboutSectionBlock => ({
  id: createLocalId("about"),
  title: "",
  items: [""],
  dividerBefore: false,
})

export const createBlankAboutProject = (): AboutProjectBlock => ({
  id: createLocalId("project"),
  name: "",
  summary: "",
  role: "",
  href: "",
  linkLabel: "",
})

export const reorderListItem = <T,>(items: T[], fromIndex: number, toIndex: number) => {
  if (fromIndex === toIndex) return items
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= items.length || toIndex >= items.length) {
    return items
  }

  const next = items.slice()
  const [item] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, item)
  return next
}

export const validateLinkInputs = (
  section: ProfileCardLinkSection,
  sectionLabel: string,
  items: ProfileCardLinkItem[]
): string | null => {
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]
    const label = item.label.trim()
    const href = item.href.trim()
    const rowLabel = `${sectionLabel} ${index + 1}번 링크`

    if (!label && !href) {
      return `${rowLabel}이 비어 있습니다. 입력하거나 삭제해주세요.`
    }
    if (!label || !href) {
      return `${rowLabel}은 이름과 연결 주소를 모두 입력해야 합니다.`
    }
    if (!isAllowedProfileLinkHref(section, href)) {
      if (section === "service") {
        return `${rowLabel} 주소는 https:// 또는 http:// 형식만 허용됩니다.`
      }
      return `${rowLabel} 주소는 https://, http://, mailto:, tel: 형식만 허용됩니다.`
    }
  }

  return null
}

const getDefaultLinkIcon = (section: ProfileCardLinkSection): IconName =>
  section === "service" ? DEFAULT_SERVICE_ITEM_ICON : DEFAULT_CONTACT_ITEM_ICON

export const toPayloadLinks = (
  section: ProfileCardLinkSection,
  items: ProfileCardLinkItem[]
): ProfileCardLinkItem[] =>
  items
    .map((item) => ({
      icon: item.icon || getDefaultLinkIcon(section),
      label: item.label.trim(),
      href: normalizeProfileLinkHref(section, item.href),
    }))
    .filter((item) => item.label && item.href)

export const buildWorkspaceFallback = (
  member: AuthMember,
  initialWorkspace: ProfileWorkspaceResponse | null
): ProfileWorkspaceResponse => {
  if (initialWorkspace) {
    const draft = normalizeProfileWorkspaceContent({
      ...initialWorkspace.draft,
      blogDesign: initialWorkspace.draft.blogDesign || member.blogDesign || "legacy",
      legacyBlogScheme: initialWorkspace.draft.legacyBlogScheme || member.legacyBlogScheme || "dark",
    })
    const published = normalizeProfileWorkspaceContent({
      ...initialWorkspace.published,
      blogDesign: initialWorkspace.published.blogDesign || member.blogDesign || "legacy",
      legacyBlogScheme: initialWorkspace.published.legacyBlogScheme || member.legacyBlogScheme || "dark",
    })

    return {
      draft,
      published,
      lastDraftSavedAt: initialWorkspace.lastDraftSavedAt || member.modifiedAt || null,
      lastPublishedAt: initialWorkspace.lastPublishedAt || member.modifiedAt || null,
      dirtyFromPublished: initialWorkspace.dirtyFromPublished,
    }
  }

  const content = buildProfileWorkspaceFromLegacy(member)
  return {
    draft: content,
    published: content,
    lastDraftSavedAt: member.modifiedAt || null,
    lastPublishedAt: member.modifiedAt || null,
    dirtyFromPublished: false,
  }
}
