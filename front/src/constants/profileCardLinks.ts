import type { IconName } from "src/components/icons/AppIcon"

export type ProfileCardLinkItem = {
  icon: IconName
  label: string
  href: string
}

export type ProfileCardLinkSection = "service" | "contact"
export type ProfileCardIconOption = { id: IconName; label: string }

export const DEFAULT_SERVICE_ITEM_ICON: IconName = "service"
export const DEFAULT_CONTACT_ITEM_ICON: IconName = "message"

const SERVICE_ICON_OPTIONS: ProfileCardIconOption[] = [
  { id: "service", label: "서비스" },
  { id: "briefcase", label: "업무" },
  { id: "laptop", label: "개발" },
  { id: "rocket", label: "프로젝트" },
  { id: "spark", label: "하이라이트" },
  { id: "search", label: "검색" },
  { id: "tag", label: "태그" },
  { id: "camera", label: "사진" },
  { id: "question", label: "질문" },
]

const CONTACT_ICON_OPTIONS: ProfileCardIconOption[] = [
  { id: "github", label: "GitHub" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "mail", label: "이메일" },
  { id: "message", label: "메시지" },
  { id: "kakao", label: "카카오" },
  { id: "instagram", label: "인스타그램" },
  { id: "globe", label: "웹사이트" },
  { id: "link", label: "링크" },
  { id: "phone", label: "전화" },
  { id: "bell", label: "알림" },
]

export const PROFILE_CARD_ICON_OPTIONS = [...SERVICE_ICON_OPTIONS, ...CONTACT_ICON_OPTIONS]

export const getProfileCardIconOptions = (section: ProfileCardLinkSection): ProfileCardIconOption[] =>
  section === "service" ? SERVICE_ICON_OPTIONS : CONTACT_ICON_OPTIONS

const KNOWN_ICON_NAMES = new Set<IconName>(PROFILE_CARD_ICON_OPTIONS.map((option) => option.id))
const SERVICE_LINK_PROTOCOLS = new Set(["http:", "https:"])
const CONTACT_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"])

const hasBlockedProtocol = (href: string) => /^(javascript|data|vbscript|file|blob):/i.test(href.trim())
const hasExplicitScheme = (href: string) => /^[a-z][a-z0-9+.-]*:/i.test(href.trim())
const looksLikeEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
const looksLikePhone = (value: string) => /^\+?[0-9][0-9\s\-()]{6,}$/.test(value)
const getAllowedProfileLinkProtocols = (section: ProfileCardLinkSection) =>
  section === "service" ? SERVICE_LINK_PROTOCOLS : CONTACT_LINK_PROTOCOLS

export const normalizeProfileLinkHref = (section: ProfileCardLinkSection, href: string): string => {
  const trimmed = href.trim()
  if (!trimmed) return ""
  if (hasBlockedProtocol(trimmed)) return trimmed
  if (hasExplicitScheme(trimmed)) return trimmed

  if (section === "contact") {
    if (looksLikeEmail(trimmed)) return `mailto:${trimmed}`
    if (looksLikePhone(trimmed)) return `tel:${trimmed.replace(/\s+/g, "")}`
  }

  return `https://${trimmed.replace(/^\/+/, "")}`
}

export const getRenderableProfileLinkHref = (
  section: ProfileCardLinkSection,
  href: string
): string | null => {
  const trimmed = normalizeProfileLinkHref(section, href)
  if (!trimmed || hasBlockedProtocol(trimmed)) return null

  try {
    const parsed = new URL(trimmed)
    return getAllowedProfileLinkProtocols(section).has(parsed.protocol) ? parsed.toString() : null
  } catch {
    return null
  }
}

export const isAllowedProfileLinkHref = (section: ProfileCardLinkSection, href: string): boolean =>
  getRenderableProfileLinkHref(section, href) !== null

export const normalizeProfileCardLinkItem = (
  item: Partial<ProfileCardLinkItem> | null | undefined,
  defaultIcon: IconName,
  section?: ProfileCardLinkSection
): ProfileCardLinkItem | null => {
  if (!item) return null

  const label = (item.label || "").trim()
  const rawHref = (item.href || "").trim()
  const href = section ? getRenderableProfileLinkHref(section, rawHref) || "" : rawHref
  if (!label || !href) return null

  const icon = item.icon && KNOWN_ICON_NAMES.has(item.icon) ? item.icon : defaultIcon

  return {
    icon,
    label,
    href,
  }
}
