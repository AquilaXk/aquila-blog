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
    expect(source).toContain("export const AdminWorkspaceHero = styled.section`")
  })

  test("dashboard context rail yields priority earlier on tablet widths", () => {
    const source = readFileSync(path.resolve(__dirname, "../src/pages/admin/dashboard.tsx"), "utf8")

    expect(source).toContain('"/system/api/v1/adm/dashboard-snapshot"')
    expect(source).toContain("grid-template-columns: repeat(2, minmax(0, 1fr));")
    expect(source).toContain("@media (max-width: 1180px) {\n    grid-template-columns: 1fr;")
    expect(source).toContain("const grafanaPanelsCanEmbed = env.monitoringEmbedIsPublicGrafana && Boolean(grafanaDashboardUrl)")
    expect(source).toContain("private Grafana 대시보드라 iframe 대신 링크로만 제공합니다.")
    expect(source).toContain("<strong>최근 실패</strong>")
    expect(source).toContain("<strong>런북</strong>")
    expect(source).toContain("<strong>즉시 이동</strong>")
    expect(source).toContain("<ContextGrid>")
    expect(source).toContain("const ContextLinkGrid = styled(AdminInfoList)`")
    expect(source).toContain("const CompactPanelCard = styled(PanelCard)`")
    expect(source).toContain("const CompactPanelSummary = styled.div`")
    expect(source).toContain("const SnapshotLeadBody = styled(PanelBody)`")
    expect(source).toContain("const LeadMetaGrid = styled.div`")
    expect(source).toContain("const InsightLink = styled(AdminTextActionLink)`")
    expect(source).toContain("<AdditionalPanelsSection>")
    expect(source).toContain("const PrioritySummary = styled.div`")
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
    expect(toolsSource).toContain('const [activeSection, setActiveSection] = useState<SectionKey>("diagnostics")')
    expect(toolsSource).not.toContain("<WorkspaceIntroCard>")
    expect(toolsSource).toContain("<DetailsPanel open={isMutationExpanded}>")
    expect(toolsSource).not.toContain('<SectionNav aria-label="운영 섹션">')
    expect(toolsSource).not.toContain("const SectionNav = styled(AdminWorkspaceSectionNav)`")
    expect(toolsSource).not.toContain("const SectionNavButton = styled(AdminWorkspaceSectionNavButton)``")
  })

  test("tools workspace uses detail-like hero copy and ops rail labels", () => {
    const toolsSource = readFileSync(path.resolve(__dirname, "../src/pages/admin/tools.tsx"), "utf8")

    expect(toolsSource).toContain("문제 확인과 복구를 같은 흐름에서 처리합니다")
    expect(toolsSource).toContain(
      "메일, 작업 큐, 정리 상태, 보안 이벤트처럼 장애와 직접 연결되는 항목만 우선 다룹니다."
    )
    expect(toolsSource).toContain("<h3>실행 전 체크</h3>")
    expect(toolsSource).toContain("<h3>위험 액션</h3>")
    expect(toolsSource).toContain("<h3>런북/장애 문서</h3>")
    expect(toolsSource).toContain("&:focus-visible {")
    expect(toolsSource).toContain("box-shadow: ${({ theme }) => adminInteractiveFocusRing(theme)};")
  })

  test("admin utility bar keeps explicit current-view context and tablet compact nav without extra account CTA", () => {
    const source = readFileSync(path.resolve(__dirname, "../src/routes/Admin/AdminUtilityBar.tsx"), "utf8")

    expect(source).toContain("<CurrentViewChip aria-label=\"현재 화면\">")
    expect(source).toContain("@media (max-width: 1100px) {")
    expect(source).toContain("<CompactNav aria-label=\"관리자 바로가기\">")
    expect(source).not.toContain("프로필 설정")
    expect(source).not.toContain("운영 도구 바로가기")
    expect(source).not.toContain("ProfileImage")
    expect(source).not.toContain('<AppIcon name="camera" />')
  })

  test("admin shell sidebar uses member profile identity before current task and nav", () => {
    const source = readFileSync(path.resolve(__dirname, "../src/routes/Admin/AdminShell.tsx"), "utf8")

    expect(source).toContain('import ProfileImage from "src/components/ProfileImage"')
    expect(source).toContain('import { useAdminProfile } from "src/hooks/useAdminProfile"')
    expect(source).toContain('const sidebarIdentityName = (adminProfile?.blogTitle || "AquilaLog").trim()')
    expect(source).toContain("adminProfile?.profileImageDirectUrl ||")
    expect(source).toContain("adminProfile?.profileImageUrl ||")
    expect(source).toContain('<SidebarPrimaryAction title="새 글 작성">')
    expect(source).toContain("<SidebarSectionLabel>관리 메뉴</SidebarSectionLabel>")
    expect(source.indexOf('<SidebarPrimaryAction title="새 글 작성">')).toBeLessThan(
      source.indexOf("<SidebarNavSection>")
    )
    expect(source).not.toContain('<SidebarStatusCard aria-label="현재 화면">')
    expect(source).not.toContain("SidebarCardTitle")
    expect(source).not.toContain("<strong>AquilaLog</strong>")
    expect(source).not.toContain('<AppIcon name="service" />')
  })

  test("admin hub removes duplicated status and shortcut rails in favor of a single primary workflow", () => {
    const source = readFileSync(path.resolve(__dirname, "../src/routes/Admin/AdminHubSurface.tsx"), "utf8")

    expect(source).toContain('aria-label="최근 작업 상태"')
    expect(source).toContain('aria-label="최근 작업 이어가기"')
    expect(source).toContain("최근에 확인한 상태와 이어서 처리할 작업을 함께 봅니다.")
    expect(source).toContain("const RecentWorkSummary = styled.div`")
    expect(source).not.toContain("<h2>체크</h2>")
    expect(source).not.toContain("<h2>바로가기</h2>")
    expect(source).not.toContain("<h2>상태</h2>")
    expect(source).not.toContain("StatusDot")
  })

  test("shared admin landing primitives expose a dedicated lead sentence style", () => {
    const source = readFileSync(path.resolve(__dirname, "../src/routes/Admin/AdminSurfacePrimitives.tsx"), "utf8")

    expect(source).toContain("export const AdminLandingSectionLead = styled.p`")
    expect(source).toContain("font-size: 0.86rem;")
    expect(source).toContain("line-height: 1.58;")
    expect(source).toContain("color: ${({ theme }) => theme.colors.gray10};")
  })
})
