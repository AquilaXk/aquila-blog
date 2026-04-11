type ThemeLike = {
  colors: Record<string, string>
  scheme?: "light" | "dark"
}

export const TABLE_SHARED_RADIUS_PX = 12
export const TABLE_SHARED_MARGIN_Y = "1rem"

export const getTableChromePalette = (theme: ThemeLike) => ({
  border: theme.colors.gray6,
  background: theme.scheme === "dark" ? "rgba(15, 18, 24, 0.9)" : "rgba(255, 255, 255, 0.94)",
  shadow: theme.scheme === "dark" ? "0 1px 2px rgba(2, 6, 23, 0.2)" : "0 1px 2px rgba(15, 23, 42, 0.04)",
  hoverBorder: "rgba(59, 130, 246, 0.18)",
  hoverRing: "0 0 0 1px rgba(59, 130, 246, 0.08)",
  headerBackground: theme.colors.gray3,
  headerRule: theme.scheme === "dark" ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.16)",
})
