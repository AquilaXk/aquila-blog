export type StaticAdminProfileSeedSource = "published" | "static-fallback"
export type PublicAdminProfileSource =
  | StaticAdminProfileSeedSource
  | "cookie-snapshot"

export const shouldRefetchAdminProfileSource = (
  source?: PublicAdminProfileSource | null
) => source !== "published"
