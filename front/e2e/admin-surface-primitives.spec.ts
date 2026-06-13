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
    const workspaceSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/AdminDashboardWorkspacePage.tsx"),
      "utf8",
    )
    const viewSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/AdminDashboardWorkspaceView.tsx"),
      "utf8",
    )
    const layoutStyleSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/AdminDashboardWorkspace.styles.layout.ts"),
      "utf8",
    )
    const priorityStyleSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/AdminDashboardWorkspace.styles.priority.ts"),
      "utf8",
    )

    expect(workspaceSource).toContain('"/system/api/v1/adm/dashboard-snapshot"')
    expect(workspaceSource).toContain("const grafanaPanelsCanEmbed = env.monitoringEmbedIsPublicGrafana && Boolean(grafanaDashboardUrl)")
    expect(workspaceSource).toContain("private Grafana 대시보드라 iframe 대신 링크로만 제공합니다.")
    expect(viewSource).toContain("<strong>최근 실패</strong>")
    expect(viewSource).toContain("<strong>런북</strong>")
    expect(viewSource).toContain("<strong>즉시 이동</strong>")
    expect(viewSource).toContain("<ContextGrid>")
    expect(viewSource).toContain("<AdditionalPanelsSection>")
    expect(layoutStyleSource).toContain("grid-template-columns: repeat(2, minmax(0, 1fr));")
    expect(layoutStyleSource).toContain("@media (max-width: 1180px) {\n    grid-template-columns: 1fr;")
    expect(priorityStyleSource).toContain("export const ContextLinkGrid = styled(AdminInfoList)`")
    expect(layoutStyleSource).toContain("export const CompactPanelCard = styled(PanelCard)`")
    expect(layoutStyleSource).toContain("export const CompactPanelSummary = styled.div`")
    expect(layoutStyleSource).toContain("export const SnapshotLeadBody = styled(PanelBody)`")
    expect(layoutStyleSource).toContain("export const LeadMetaGrid = styled.div`")
    expect(priorityStyleSource).toContain("export const InsightLink = styled(AdminTextActionLink)`")
    expect(priorityStyleSource).toContain("export const PrioritySummary = styled.div`")
    expect(priorityStyleSource).toContain("export const PriorityLink = styled(AdminTextActionLink)`")
    expect(`${layoutStyleSource}\n${priorityStyleSource}`).not.toContain("${AdminInfoPanelCard}")
    expect(`${layoutStyleSource}\n${priorityStyleSource}`).not.toContain("${AdminInfoLinkCard}")
  })

  test("posts/tools reuse shared badge and action primitives", () => {
    const postsListSource = readFileSync(path.resolve(__dirname, "../src/routes/Admin/AdminPostsWorkspaceList.tsx"), "utf8")
    const postsListStyleSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/AdminPostsWorkspaceList.styles.ts"),
      "utf8",
    )
    const toolsPageSource = readFileSync(path.resolve(__dirname, "../src/routes/Admin/AdminToolsWorkspacePage.tsx"), "utf8")
    const toolsExecutionSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/AdminToolsExecutionSection.tsx"),
      "utf8",
    )
    const toolsTokenStyleSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/AdminToolsWorkspace.styles.tokens.ts"),
      "utf8",
    )
    const toolsLayoutStyleSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/AdminToolsWorkspace.styles.layout.ts"),
      "utf8",
    )

    expect(postsListStyleSource).toContain("export const VisibilityBadge = styled(AdminStatusPill)<{ \"data-tone\": string }>`")
    expect(postsListStyleSource).toContain("export const RowPrimaryButton = styled(AdminTextActionButton)`")
    expect(postsListStyleSource).toContain("export const RowActions = styled(AdminInlineActionRow)``")
    expect(postsListSource).toContain("VisibilityBadge,")

    expect(toolsTokenStyleSource).toContain("export const StatusBadge = styled(AdminStatusPill)`")
    expect(toolsTokenStyleSource).toContain("export const FreshnessBadge = styled(AdminStatusPill)`")
    expect(toolsLayoutStyleSource).toContain("export const ActionRowButton = styled(AdminActionCardButton)``")
    expect(toolsPageSource).toContain("const [isMutationExpanded, setIsMutationExpanded] = useState(false)")
    expect(toolsPageSource).toContain('const [activeSection, setActiveSection] = useState<SectionKey>("diagnostics")')
    expect(`${toolsPageSource}\n${toolsExecutionSource}`).not.toContain("<WorkspaceIntroCard>")
    expect(toolsExecutionSource).toContain("<DetailsPanel open={isMutationExpanded}>")
    expect(`${toolsPageSource}\n${toolsExecutionSource}`).not.toContain('<SectionNav aria-label="운영 섹션">')
    expect(`${toolsTokenStyleSource}\n${toolsLayoutStyleSource}`).not.toContain("const SectionNav = styled(AdminWorkspaceSectionNav)`")
    expect(`${toolsTokenStyleSource}\n${toolsLayoutStyleSource}`).not.toContain("const SectionNavButton = styled(AdminWorkspaceSectionNavButton)``")
  })

  test("large admin pages move style-heavy surface definitions out of orchestration pages", () => {
    const profileSource = readFileSync(path.resolve(__dirname, "../src/pages/admin/profile.tsx"), "utf8")
    const profileSectionSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/AdminProfileWorkspaceSections.tsx"),
      "utf8",
    )
    const toolsSource = readFileSync(path.resolve(__dirname, "../src/pages/admin/tools.tsx"), "utf8")
    const dashboardSource = readFileSync(path.resolve(__dirname, "../src/pages/admin/dashboard.tsx"), "utf8")
    const profileLayoutStyles = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/AdminProfileWorkspace.styles.layout.ts"),
      "utf8",
    )
    const profileSectionStyles = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/AdminProfileWorkspace.styles.sections.ts"),
      "utf8",
    )
    const profileLinkStyles = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/AdminProfileWorkspace.styles.links.ts"),
      "utf8",
    )
    const toolsLayoutStyles = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/AdminToolsWorkspace.styles.layout.ts"),
      "utf8",
    )
    const dashboardLayoutStyles = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/AdminDashboardWorkspace.styles.layout.ts"),
      "utf8",
    )
    const dashboardPriorityStyles = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/AdminDashboardWorkspace.styles.priority.ts"),
      "utf8",
    )

    expect(profileSectionSource).toContain('from "src/routes/Admin/AdminProfileWorkspace.styles"')
    expect(toolsSource).toContain('from "src/routes/Admin/AdminToolsWorkspace.styles"')
    expect(dashboardSource).toContain('from "src/routes/Admin/AdminDashboardWorkspace.styles"')

    expect(profileSource).not.toContain("const PreviewRail = styled(")
    expect(profileSource).not.toContain("const ModalOverlay = styled.div`")
    expect(profileSource).not.toContain("const LinkRowCard = styled.div`")
    expect(toolsSource).not.toContain("const ExecutionLayout = styled.div`")
    expect(toolsSource).not.toContain("const ResultPanel = styled.pre`")
    expect(toolsSource).not.toContain("const WorkspaceSection = styled.section`")
    expect(dashboardSource).not.toContain("const PanelGrid = styled.section`")
    expect(dashboardSource).not.toContain("const PriorityTable = styled.table`")
    expect(dashboardSource).not.toContain("const ServiceRail = styled.section`")

    expect(profileSectionStyles).toContain("export const PreviewRail = styled(AdminStickyRail)`")
    expect(`${profileLayoutStyles}\n${profileLinkStyles}`).toContain("export const LinkRowCard = styled.div`")
    expect(toolsLayoutStyles).toContain("export const ExecutionLayout = styled.div`")
    expect(toolsLayoutStyles).toContain("export const ResultPanel = styled.pre`")
    expect(dashboardLayoutStyles).toContain("export const PanelGrid = styled.section`")
    expect(dashboardPriorityStyles).toContain("export const PriorityTable = styled.table`")

    expect(profileSource.split("\n").length).toBeLessThan(2600)
    expect(toolsSource.split("\n").length).toBeLessThan(2100)
    expect(dashboardSource.split("\n").length).toBeLessThan(1050)
  })

  test("posts workspace splits repeated UI regions out of the orchestration page", () => {
    const postsSource = readFileSync(path.resolve(__dirname, "../src/routes/Admin/AdminPostsWorkspacePageView.tsx"), "utf8")
    const controllerSource = readFileSync(path.resolve(__dirname, "../src/routes/Admin/AdminPostsWorkspacePage.tsx"), "utf8")
    const recentWorkSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/AdminPostsWorkspaceRecentWork.tsx"),
      "utf8",
    )
    const filterSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/AdminPostsWorkspaceFilterToolbar.tsx"),
      "utf8",
    )
    const listSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/AdminPostsWorkspaceList.tsx"),
      "utf8",
    )
    const feedbackSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/AdminPostsWorkspaceFeedbackLayer.tsx"),
      "utf8",
    )

    expect(postsSource).toContain('import { AdminPostsWorkspaceRecentWork } from "./AdminPostsWorkspaceRecentWork"')
    expect(postsSource).toContain('import { AdminPostsWorkspaceFilterToolbar } from "./AdminPostsWorkspaceFilterToolbar"')
    expect(postsSource).toContain('import { AdminPostsWorkspaceList } from "./AdminPostsWorkspaceList"')
    expect(postsSource).toContain('import { AdminPostsWorkspaceFeedbackLayer } from "./AdminPostsWorkspaceFeedbackLayer"')
    expect(postsSource).toContain("<AdminPostsWorkspaceRecentWork")
    expect(postsSource).toContain("<AdminPostsWorkspaceFilterToolbar")
    expect(postsSource).toContain("<AdminPostsWorkspaceList")
    expect(postsSource).toContain("<AdminPostsWorkspaceFeedbackLayer")
    expect(controllerSource).not.toContain("const renderRecentEdited = () =>")
    expect(postsSource).not.toContain("const RecentPostList = styled.ul`")
    expect(postsSource).not.toContain("const DesktopListTable = styled.table`")
    expect(postsSource).not.toContain("const ToastViewport = styled.div`")
    expect(controllerSource.length).toBeLessThan(76000)

    expect(recentWorkSource).toContain("export const AdminPostsWorkspaceRecentWork")
    expect(filterSource).toContain("export const AdminPostsWorkspaceFilterToolbar")
    expect(listSource).toContain("export const AdminPostsWorkspaceList")
    expect(feedbackSource).toContain("export const AdminPostsWorkspaceFeedbackLayer")
  })

  test("remaining admin pages avoid oversized slab card radii", () => {
    const dashboardSource = readFileSync(path.resolve(__dirname, "../src/pages/admin/dashboard.tsx"), "utf8")
    const profileSource = readFileSync(path.resolve(__dirname, "../src/pages/admin/profile.tsx"), "utf8")
    const toolsSource = readFileSync(path.resolve(__dirname, "../src/pages/admin/tools.tsx"), "utf8")
    const dashboardStyleSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/AdminDashboardWorkspace.styles.ts"),
      "utf8",
    )
    const profileStyleSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/AdminProfileWorkspace.styles.ts"),
      "utf8",
    )
    const toolsStyleSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/AdminToolsWorkspace.styles.ts"),
      "utf8",
    )

    for (const source of [dashboardSource, profileSource, toolsSource, dashboardStyleSource, profileStyleSource, toolsStyleSource]) {
      expect(source).not.toContain("border-radius: 28px;")
      expect(source).not.toContain("border-radius: 30px;")
      expect(source).not.toContain("border-radius: 32px;")
    }
  })

  test("tools workspace uses detail-like hero copy and ops rail labels", () => {
    const toolsPageSource = readFileSync(path.resolve(__dirname, "../src/routes/Admin/AdminToolsWorkspacePage.tsx"), "utf8")
    const toolsSectionsSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/AdminToolsWorkspaceSections.tsx"),
      "utf8",
    )
    const toolsDiagnosticsSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/AdminToolsDiagnosticsSection.tsx"),
      "utf8",
    )
    const toolsExecutionSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/AdminToolsExecutionSection.tsx"),
      "utf8",
    )
    const toolsExecutionRailSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/AdminToolsExecutionRail.tsx"),
      "utf8",
    )
    const toolsResultsSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/AdminToolsResultsPanel.tsx"),
      "utf8",
    )
    const toolsTokenStyleSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/AdminToolsWorkspace.styles.tokens.ts"),
      "utf8",
    )
    const toolsLayoutStyleSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/AdminToolsWorkspace.styles.layout.ts"),
      "utf8",
    )

    const toolsSurfaceSource = `${toolsPageSource}\n${toolsSectionsSource}\n${toolsDiagnosticsSource}\n${toolsExecutionSource}`

    expect(toolsSectionsSource).toContain("<h1>운영 도구</h1>")
    expect(toolsTokenStyleSource).toContain("grid-template-columns: repeat(auto-fit, minmax(13.5rem, 1fr));")
    expect(toolsDiagnosticsSource).toContain("<h2>메일과 큐</h2>")
    expect(toolsExecutionSource).toContain("<h2>정리와 보안</h2>")
    expect(toolsResultsSource).toContain("<h2>최근 진단 결과</h2>")
    expect(toolsSurfaceSource).not.toContain("<h2>진단</h2>")
    expect(toolsSurfaceSource).not.toContain("<h2>실행</h2>")
    expect(toolsSurfaceSource).not.toContain("<h2>최근 실행 결과</h2>")
    expect(toolsSurfaceSource).not.toContain("<h2>실데이터 테스트</h2>")
    expect(`${toolsTokenStyleSource}\n${toolsLayoutStyleSource}`).toContain("AdminStickyRail,")
    expect(toolsLayoutStyleSource).toContain("export const ExecutionLayout = styled.div`")
    expect(toolsLayoutStyleSource).toContain("export const ExecutionRail = styled(AdminStickyRail)`")
    expect(toolsExecutionRailSource).toContain("<h3>실행 전 체크</h3>")
    expect(toolsExecutionRailSource).toContain("<h3>위험 액션</h3>")
    expect(toolsExecutionRailSource).toContain("<h3>런북/장애 문서</h3>")
    expect(toolsSurfaceSource).not.toContain("메일, 작업 큐, 정리 상태, 보안 이벤트처럼 장애와 직접 연결되는 항목만 우선 다룹니다.")
    expect(toolsSurfaceSource).not.toContain("운영 변경 없이 현재 상태와 영향 범위를 먼저 다시 확인합니다.")
    expect(toolsSurfaceSource).not.toContain("<ExecutionGrid>")
    expect(toolsSurfaceSource).not.toContain("requestIdleCallback")
    expect(toolsSurfaceSource).not.toContain("isWorkspaceReady")
    expect(toolsLayoutStyleSource).toContain("&:focus-visible {")
    expect(toolsLayoutStyleSource).toContain("box-shadow: ${({ theme }) => adminInteractiveFocusRing(theme)};")
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
    expect(source).toContain("profileSnapshot?: AdminShellProfileSnapshot | null")
    expect(source).toContain('const sidebarIdentityName = (profileSnapshot?.blogTitle || member.blogTitle || "AquilaLog").trim()')
    expect(source).toContain("profileSnapshot?.profileImageDirectUrl ||")
    expect(source).toContain("profileSnapshot?.profileImageUrl ||")
    expect(source).toContain("member.profileImageDirectUrl ||")
    expect(source).not.toContain('import { useAdminProfile } from "src/hooks/useAdminProfile"')
    expect(source).toContain('<SidebarPrimaryAction title="새 글 작성">')
    expect(source).not.toContain("<SidebarSectionLabel>관리 메뉴</SidebarSectionLabel>")
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
    const sectionSource = readFileSync(path.resolve(__dirname, "../src/routes/Admin/AdminHubSurface.sections.tsx"), "utf8")
    const styleSource = readFileSync(path.resolve(__dirname, "../src/routes/Admin/AdminHubSurface.styles.ts"), "utf8")

    expect(sectionSource).toContain('aria-label="최근 작업 상태"')
    expect(sectionSource).toContain('aria-label="최근 작업 이어가기"')
    expect(styleSource).toContain("export const RecentWorkSummary = styled.div`")
    expect(styleSource).toContain("export const BorderlessPanel = styled.div`")
    expect(styleSource).toContain("export const BorderlessMetricRow = styled.div`")
    expect(sectionSource).not.toContain("<h2>체크</h2>")
    expect(sectionSource).not.toContain("<h2>바로가기</h2>")
    expect(sectionSource).not.toContain("<h2>상태</h2>")
    expect(sectionSource).not.toContain("최근에 확인한 상태와 이어서 처리할 작업을 함께 봅니다.")
    expect(`${source}\n${sectionSource}\n${styleSource}`).not.toContain("StatusDot")
    expect(styleSource).not.toContain("border-radius: 24px;")
  })

  test("shared admin landing primitives expose a dedicated lead sentence style", () => {
    const source = readFileSync(path.resolve(__dirname, "../src/routes/Admin/AdminSurfacePrimitives.tsx"), "utf8")

    expect(source).toContain("export const AdminLandingSectionLead = styled.p`")
    expect(source).toContain("font-size: 0.86rem;")
    expect(source).toContain("line-height: 1.58;")
    expect(source).toContain("color: ${({ theme }) => adminMutedText(theme)};")
  })
})
