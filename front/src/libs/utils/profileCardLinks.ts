import { CONFIG } from "site.config"
import type { IconName } from "src/components/icons/AppIcon"
import {
  DEFAULT_CONTACT_ITEM_ICON,
  DEFAULT_SERVICE_ITEM_ICON,
  normalizeProfileCardLinkItem,
  ProfileCardLinkItem,
} from "src/constants/profileCardLinks"

type ProfileLinkSource = {
  serviceLinks?: ProfileCardLinkItem[]
  contactLinks?: ProfileCardLinkItem[]
}

const buildFallbackServiceLinks = (): ProfileCardLinkItem[] =>
  (CONFIG.projects || [])
    .map((project) =>
      normalizeProfileCardLinkItem(
        {
          icon: DEFAULT_SERVICE_ITEM_ICON,
          label: project.name,
          href: project.href,
        },
        DEFAULT_SERVICE_ITEM_ICON
      )
    )
    .filter((item): item is ProfileCardLinkItem => item !== null)

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
const FALLBACK_CONTACT_LINKS = buildFallbackContactLinks()

const normalizeLinkList = (
  items: ProfileCardLinkItem[] | undefined,
  defaultIcon: IconName
): ProfileCardLinkItem[] =>
  (items || [])
    .map((item) => normalizeProfileCardLinkItem(item, defaultIcon))
    .filter((item): item is ProfileCardLinkItem => item !== null)

export const resolveServiceLinks = (source?: ProfileLinkSource | null): ProfileCardLinkItem[] => {
  if (!source || source.serviceLinks === undefined) return FALLBACK_SERVICE_LINKS
  const links = normalizeLinkList(source?.serviceLinks, DEFAULT_SERVICE_ITEM_ICON)
  return links
}

export const resolveContactLinks = (source?: ProfileLinkSource | null): ProfileCardLinkItem[] => {
  if (!source || source.contactLinks === undefined) return FALLBACK_CONTACT_LINKS
  const links = normalizeLinkList(source?.contactLinks, DEFAULT_CONTACT_ITEM_ICON)
  return links
}
