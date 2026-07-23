import type { AdminProfile } from "src/hooks/useAdminProfile"
import type { BlogDesignType, LegacyBlogScheme, SchemeType } from "src/types"

export type PublicBlogAppearance = {
  blogDesign: BlogDesignType
  scheme: SchemeType
  legacyBlogScheme: LegacyBlogScheme
}

const normalizeBlogDesign = (_value: unknown): BlogDesignType => "legacy"

const normalizeLegacyBlogScheme = (value: unknown): LegacyBlogScheme => (value === "light" ? "light" : "dark")

export const resolvePublicBlogAppearance = (
  profile: Pick<AdminProfile, "blogDesign" | "legacyBlogScheme"> | null | undefined
): PublicBlogAppearance => {
  const blogDesign = normalizeBlogDesign(profile?.blogDesign)
  const legacyBlogScheme = normalizeLegacyBlogScheme(profile?.legacyBlogScheme)

  return {
    blogDesign,
    legacyBlogScheme,
    scheme: legacyBlogScheme,
  }
}
