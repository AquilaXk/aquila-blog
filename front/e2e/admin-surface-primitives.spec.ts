import { readFileSync } from "node:fs"
import path from "node:path"
import { expect, test } from "@playwright/test"

const getRelativeLuminance = (hexColor: string) => {
  const [red, green, blue] = hexColor
    .replace("#", "")
    .match(/.{2}/g)!
    .map((channel) => {
      const value = Number.parseInt(channel, 16) / 255
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    })

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

const getContrastRatio = (foreground: string, background: string) => {
  const [lighter, darker] = [getRelativeLuminance(foreground), getRelativeLuminance(background)].sort((a, b) => b - a)
  return (lighter + 0.05) / (darker + 0.05)
}

test.describe("관리자 표면 공통 계약", () => {
  test("관리자 표면은 MYBOX형 화이트 우선 시스템 테마 토큰을 공유한다", () => {
    const colorTokenSource = readFileSync(path.resolve(__dirname, "../src/routes/Admin/adminColorTokens.ts"), "utf8")
    const shellSource = readFileSync(path.resolve(__dirname, "../src/routes/Admin/AdminShell.tsx"), "utf8")
    const rootLayoutSource = readFileSync(path.resolve(__dirname, "../src/layouts/RootLayout/index.tsx"), "utf8")
    const utilitySource = readFileSync(path.resolve(__dirname, "../src/routes/Admin/AdminUtilityBar.tsx"), "utf8")
    const cloudStyleSource = readFileSync(path.resolve(__dirname, "../src/routes/Admin/AdminCloudWorkspace.styles.ts"), "utf8")
    const cloudPageSource = readFileSync(path.resolve(__dirname, "../src/routes/Admin/AdminCloudWorkspacePage.tsx"), "utf8")
    const primitiveSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/AdminSurfacePrimitives.tsx"),
      "utf8",
    )
    const hubStyleSource = readFileSync(path.resolve(__dirname, "../src/routes/Admin/AdminHubSurface.styles.ts"), "utf8")

    expect(colorTokenSource).toContain("export const adminSystemThemeVariables =")
    expect(colorTokenSource).toContain('theme.scheme === "dark" ? adminDarkThemeVariables : adminLightThemeVariables')
    expect(colorTokenSource).toContain("--admin-primary: #4f7cff;")
    expect(colorTokenSource).toContain("--admin-primary: #6f95ff;")
    expect(colorTokenSource).toContain("--admin-accent-text: #315fd8;")
    expect(colorTokenSource).toContain("--admin-control-text: #101214;")
    expect(colorTokenSource).toContain("--admin-text-muted: #566273;")
    expect(colorTokenSource).toContain('export const adminTextMuted = "var(--admin-text-muted, #566273)"')
    expect(colorTokenSource).toContain('export const adminSurface = "var(--admin-surface')
    expect(colorTokenSource).toContain('export const adminSurfaceAccent = "var(--admin-surface-accent, #edf3ff)"')
    expect(colorTokenSource).toContain('export const adminAccentText = "var(--admin-accent-text, #315fd8)"')
    expect(colorTokenSource).toContain("export const adminGold = adminAccentText")
    expect(colorTokenSource).toContain('export const adminTeal = "var(--admin-primary')
    expect(colorTokenSource).toContain('export const usesDarkAdminSurface = (theme: Theme) => theme.scheme !== "light"')
    expect(colorTokenSource).not.toContain("#4f74ff")

    expect(rootLayoutSource).toContain('const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/")')
    expect(rootLayoutSource).toContain('const isDesignAwareRoute = !isAdminRoute && pathname[1] !== "_" && pathname !== "/sitemap.xml"')
    expect(rootLayoutSource).toContain("const effectiveScheme = scheme")
    expect(rootLayoutSource).toContain('const effectiveBlogDesign = "legacy"')
    expect(rootLayoutSource).not.toContain("publicAppearance.scheme")
    expect(shellSource).toContain("${({ theme }) => adminSystemThemeVariables(theme)}")
    expect(shellSource).toContain("grid-template-columns: 17.5rem minmax(0, 1fr);")
    expect(shellSource).toContain("width: 100%;")
    expect(shellSource).not.toContain("width: 100vw;")
    expect(shellSource).toContain("background: ${adminAppBackground};")
    expect(shellSource).not.toContain("border-radius: 14px;")

    expect(utilitySource).toContain("border-bottom: 1px solid ${adminBorder};")
    expect(utilitySource).not.toContain("backdrop-filter")
    expect(utilitySource).not.toContain("border-radius: 14px;")

    expect(cloudStyleSource).toContain("background: ${surface};")
    expect(cloudStyleSource).toContain("grid-template-columns: minmax(0, 1fr) minmax(18rem, 21rem);")
    expect(cloudPageSource).toContain('선택한 조건에 맞는 파일이 없습니다.')
    expect(cloudPageSource).not.toContain("아직 올린 파일이 없습니다.")

    expect(primitiveSource).toContain("adminPlainSurface(theme)")
    expect(primitiveSource).not.toContain("linear-gradient")
    expect(hubStyleSource).not.toContain("transform: translateY")
  })

  test("관리자 프로필은 대표 제목과 내부 섹션 제목 텍스트를 중복하지 않는다", () => {
    const profileSectionSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/AdminProfileWorkspaceSections.tsx"),
      "utf8",
    )
    const profileModelSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/AdminProfileWorkspaceModel.ts"),
      "utf8",
    )

    expect(profileSectionSource).toContain("<h1>프로필</h1>")
    expect(profileModelSource).toContain('label: "기본 정보"')
    expect(profileModelSource).not.toContain('label: "프로필"')
  })

  test("관리자 공통 프리미티브는 포커스 표시와 모바일 스냅 계약을 가진다", () => {
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
    const actionButtonBlock = source.match(/export const AdminActionCardButton = styled\.button`[\s\S]*?`\n/)?.[0] ?? ""
    expect(actionButtonBlock).toContain("background: ${({ theme }) => adminRaisedSurface(theme)};")
    expect(actionButtonBlock).toContain("background: ${({ theme }) => adminAccentSurface(theme)};")
    expect(actionButtonBlock).not.toContain("background: transparent;")
    expect(source).toContain("export const AdminWorkspaceHero = styled.section`")
  })

  test("대시보드 컨텍스트 레일은 태블릿 폭에서 우선 영역을 먼저 노출한다", () => {
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

  test("글 관리와 운영 도구는 공통 배지와 액션 프리미티브를 재사용한다", () => {
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

  test("큰 관리자 페이지는 스타일 정의를 오케스트레이션 페이지 밖으로 분리한다", () => {
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

  test("글 관리 작업공간은 반복 UI 영역을 페이지에서 분리한다", () => {
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

  test("나머지 관리자 페이지는 과도한 카드 반경을 쓰지 않는다", () => {
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

  test("운영 도구 작업공간은 상세형 대표 문구와 작업 레일 라벨을 사용한다", () => {
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

  test("관리자 상단 바는 현재 화면 맥락과 태블릿 축약 내비게이션만 유지한다", () => {
    const source = readFileSync(path.resolve(__dirname, "../src/routes/Admin/AdminUtilityBar.tsx"), "utf8")

    expect(source).toContain("<CurrentViewChip aria-label=\"현재 화면\">")
    expect(source).toContain("@media (max-width: 1100px) {")
    expect(source).toContain("<CompactNav aria-label=\"관리자 바로가기\">")
    expect(source).not.toContain("프로필 설정")
    expect(source).not.toContain("운영 도구 바로가기")
    expect(source).not.toContain("ProfileImage")
    expect(source).not.toContain('<AppIcon name="camera" />')
  })

  test("관리자 사이드바는 현재 작업보다 사용자 정체성을 먼저 보여준다", () => {
    const source = readFileSync(path.resolve(__dirname, "../src/routes/Admin/AdminShell.tsx"), "utf8")

    expect(source).toContain('import ProfileImage from "src/components/ProfileImage"')
    expect(source).toContain("profileSnapshot?: AdminShellProfileSnapshot | null")
    expect(source).toContain('const sidebarIdentityName = (member.nickname || member.username || "관리자").trim()')
    expect(source).toContain("member.profileImageDirectUrl ||")
    expect(source.indexOf("member.profileImageDirectUrl ||")).toBeLessThan(
      source.indexOf("profileSnapshot?.profileImageDirectUrl ||")
    )
    expect(source).not.toContain('const sidebarIdentityName = (profileSnapshot?.blogTitle || member.blogTitle || "AquilaLog").trim()')
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

  test("관리자 MYBOX 색상 토큰은 brown gold 계열 대신 neutral blue accent를 사용한다", () => {
    const tokenSource = readFileSync(path.resolve(__dirname, "../src/routes/Admin/adminColorTokens.ts"), "utf8")
    const shellSource = readFileSync(path.resolve(__dirname, "../src/routes/Admin/AdminShell.tsx"), "utf8")

    expect(tokenSource).not.toContain("#b9954f")
    expect(tokenSource).not.toContain("#9d7d3f")
    expect(tokenSource).not.toContain("#6f5524")
    expect(tokenSource).not.toContain("#f7f1e3")
    expect(tokenSource).not.toContain("#2d291a")
    expect(tokenSource).toContain("--admin-primary: #4f7cff;")
    expect(tokenSource).toContain("--admin-primary-hover: #5f8aff;")
    expect(getContrastRatio("#315fd8", "#edf3ff")).toBeGreaterThanOrEqual(4.5)
    expect(getContrastRatio("#101214", "#5f8aff")).toBeGreaterThanOrEqual(4.5)
    expect(shellSource).toContain("adminAccentText")
    expect(shellSource).not.toContain("adminGold")
  })

  test("관리자 허브는 중복 상태와 바로가기 레일 대신 주요 작업 흐름 하나를 둔다", () => {
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

  test("공통 관리자 랜딩 프리미티브는 전용 리드 문장 스타일을 제공한다", () => {
    const source = readFileSync(path.resolve(__dirname, "../src/routes/Admin/AdminSurfacePrimitives.tsx"), "utf8")

    expect(source).toContain("export const AdminLandingSectionLead = styled.p`")
    expect(source).toContain("font-size: 0.86rem;")
    expect(source).toContain("line-height: 1.58;")
    expect(source).toContain("color: ${({ theme }) => adminMutedText(theme)};")
  })
})
