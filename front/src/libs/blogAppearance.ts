import { CONFIG } from "site.config"
import type { AdminProfile } from "src/hooks/useAdminProfile"
import type { BlogDesignType, LegacyBlogScheme, SchemeType } from "src/types"

export type PublicBlogAppearance = {
  blogDesign: BlogDesignType
  scheme: SchemeType
  legacyBlogScheme: LegacyBlogScheme
}

const resolveConfigScheme = (): LegacyBlogScheme => (CONFIG.blog.scheme === "light" ? "light" : "dark")

const normalizeBlogDesign = (value: unknown): BlogDesignType => (value === "grid" ? "grid" : "legacy")

const normalizeLegacyBlogScheme = (value: unknown): LegacyBlogScheme => (value === "light" ? "light" : "dark")

export const resolvePublicBlogAppearance = (
  profile: Pick<AdminProfile, "blogDesign" | "legacyBlogScheme"> | null | undefined
): PublicBlogAppearance => {
  const blogDesign = normalizeBlogDesign(profile?.blogDesign)
  const legacyBlogScheme = normalizeLegacyBlogScheme(profile?.legacyBlogScheme || resolveConfigScheme())

  if (blogDesign === "grid") {
    return {
      blogDesign,
      legacyBlogScheme,
      scheme: "dark",
    }
  }

  return {
    blogDesign,
    legacyBlogScheme,
    scheme: legacyBlogScheme,
  }
}
