import { CONFIG } from "site.config"
import type { IconName } from "src/components/icons/AppIcon"
import {
  DEFAULT_CONTACT_ITEM_ICON,
  DEFAULT_SERVICE_ITEM_ICON,
  getRenderableProfileLinkHref,
  normalizeProfileCardLinkItem,
  ProfileCardLinkItem,
} from "src/constants/profileCardLinks"

type ProfileLinkSource = {
  serviceLinks?: ProfileCardLinkItem[]
  contactLinks?: ProfileCardLinkItem[]
}

const normalizeLinkList = (
  items: ProfileCardLinkItem[] | undefined,
  defaultIcon: IconName,
  section: "service" | "contact"
): ProfileCardLinkItem[] =>
  (items || [])
    .map((item) => normalizeProfileCardLinkItem(item, defaultIcon, section))
    .filter((item): item is ProfileCardLinkItem => item !== null)

const buildFallbackServiceLinks = (): ProfileCardLinkItem[] =>
  normalizeLinkList(
    (CONFIG.projects || []).map((project) => ({
      icon: DEFAULT_SERVICE_ITEM_ICON,
      label: project.name,
      href: project.href,
    })),
    DEFAULT_SERVICE_ITEM_ICON,
    "service"
  )

const buildFallbackContactLinks = (): ProfileCardLinkItem[] => {
  const links: ProfileCardLinkItem[] = []

  if (CONFIG.profile.github) {
    links.push({
      icon: "github",
      label: "github",
      href: `https://github.com/${CONFIG.profile.github}`,
    })
  }

  if (CONFIG.profile.instagram) {
    links.push({
      icon: "instagram",
      label: "instagram",
      href: `https://www.instagram.com/${CONFIG.profile.instagram}`,
    })
  }

  if (CONFIG.profile.email) {
    links.push({
      icon: "mail",
      label: "email",
      href: `mailto:${CONFIG.profile.email}`,
    })
  }

  if (CONFIG.profile.linkedin) {
    links.push({
      icon: "linkedin",
      label: "linkedin",
      href: `https://www.linkedin.com/in/${CONFIG.profile.linkedin}`,
    })
  }

  return links
}

const FALLBACK_SERVICE_LINKS = buildFallbackServiceLinks()
const FALLBACK_CONTACT_LINKS = normalizeLinkList(buildFallbackContactLinks(), DEFAULT_CONTACT_ITEM_ICON, "contact")

export const resolveServiceLinks = (source?: ProfileLinkSource | null): ProfileCardLinkItem[] => {
  if (!source || source.serviceLinks === undefined) return FALLBACK_SERVICE_LINKS
  const links = normalizeLinkList(source?.serviceLinks, DEFAULT_SERVICE_ITEM_ICON, "service")
  return links
}

export const resolveContactLinks = (source?: ProfileLinkSource | null): ProfileCardLinkItem[] => {
  if (!source || source.contactLinks === undefined) return FALLBACK_CONTACT_LINKS
  const links = normalizeLinkList(source?.contactLinks, DEFAULT_CONTACT_ITEM_ICON, "contact")
  return links
}

export const resolveRenderableProfileLinkHref = (
  section: "service" | "contact",
  href: string
): string | null => getRenderableProfileLinkHref(section, href)
