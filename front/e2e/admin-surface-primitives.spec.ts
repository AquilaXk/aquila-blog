import { readFileSync } from "node:fs"
import path from "node:path"
import { expect, test } from "@playwright/test"

test.describe("admin surface primitives contract", () => {
  test("shared admin primitives own focus-visible and mobile snap contracts", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/AdminSurfacePrimitives.tsx"),
      "utf8",
    )

    expect(source).toContain("export const adminInteractiveFocusRing = (theme: Theme) =>")
    expect(source).toContain("scroll-snap-type: x proximity;")
    expect(source).toContain("scroll-snap-align: start;")
    expect(source).toContain("box-shadow: ${({ theme }) => adminInteractiveFocusRing(theme)};")
    expect(source).toContain("export const AdminWorkspaceSectionNavButton = styled.button`")
    expect(source).toContain("export const AdminInfoLinkCard = styled.a<{ $withIcon?: boolean }>`")
    expect(source).toContain('export const AdminStatusPill = styled.span<{ $size?: "sm" | "md" }>`')
    expect(source).toContain("export const AdminTextActionButton = styled.button`")
    expect(source).toContain("export const AdminTextActionLink = styled.a`")
    expect(source).toContain("export const AdminActionCardButton = styled.button`")
  })

  test("dashboard context rail yields priority earlier on tablet widths", () => {
    const source = readFileSync(path.resolve(__dirname, "../src/pages/admin/dashboard.tsx"), "utf8")

    expect(source).toContain("grid-template-columns: repeat(2, minmax(0, 1fr));")
    expect(source).toContain("@media (max-width: 1180px) {\n    grid-template-columns: 1fr;")
    expect(source).toContain("const DASHBOARD_FIRST_FOLD_PANEL_LIMIT = 0")
    expect(source).toContain("<ContextSection>")
    expect(source).toContain("const ContextLinkGrid = styled(AdminInfoList)`")
    expect(source).toContain("<AdditionalPanelsSection>")
    expect(source).toContain("const PriorityBadge = styled(AdminStatusPill)`")
    expect(source).toContain("const PriorityLink = styled(AdminTextActionLink)`")
  })

  test("posts/tools reuse shared badge and action primitives", () => {
    const postsSource = readFileSync(path.resolve(__dirname, "../src/routes/Admin/AdminPostsWorkspacePage.tsx"), "utf8")
    const toolsSource = readFileSync(path.resolve(__dirname, "../src/pages/admin/tools.tsx"), "utf8")

    expect(postsSource).toContain("const VisibilityBadge = styled(AdminStatusPill)<{ \"data-tone\": string }>`")
    expect(postsSource).toContain("const RowPrimaryButton = styled(AdminTextActionButton)`")
    expect(postsSource).toContain("const RowActions = styled(AdminInlineActionRow)``")

    expect(toolsSource).toContain("const StatusBadge = styled(AdminStatusPill)`")
    expect(toolsSource).toContain("const FreshnessBadge = styled(AdminStatusPill)`")
    expect(toolsSource).toContain("const ActionRowButton = styled(AdminActionCardButton)``")
    expect(toolsSource).toContain("const [isMutationExpanded, setIsMutationExpanded] = useState(false)")
    expect(toolsSource).toContain("<DetailsPanel open={isMutationExpanded}>")
  })

  test("admin utility bar keeps explicit current-view/account controls instead of ambiguous icon chips", () => {
    const source = readFileSync(path.resolve(__dirname, "../src/routes/Admin/AdminUtilityBar.tsx"), "utf8")

    expect(source).toContain("<CurrentViewChip aria-label=\"현재 화면\">")
    expect(source).toContain("프로필 설정")
    expect(source).not.toContain("운영 도구 바로가기")
    expect(source).not.toContain("ProfileImage")
    expect(source).not.toContain('<AppIcon name="camera" />')
  })

  test("admin hub removes duplicated status and shortcut rails in favor of a single primary workflow", () => {
    const source = readFileSync(path.resolve(__dirname, "../src/routes/Admin/AdminHubSurface.tsx"), "utf8")

    expect(source).toContain("const quickLinks: QuickLinkItem[] = [")
    expect(source).toContain('aria-label="허브 빠른 이동"')
    expect(source).toContain("새 초안을 열고 바로 편집 화면으로 이동합니다.")
    expect(source).not.toContain("<h2>체크</h2>")
    expect(source).not.toContain("<h2>바로가기</h2>")
    expect(source).not.toContain("<h2>상태</h2>")
    expect(source).not.toContain("StatusDot")
  })
})
