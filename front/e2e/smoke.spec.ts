import { expect, test } from "@playwright/test"
import { existsSync, readdirSync, readFileSync } from "fs"
import path from "path"
import { resolveStaticAdminProfileSeed } from "../src/libs/server/postDetailPage"

test.describe("core smoke source boundaries", () => {
  test("Markdown renderer pipeline은 facade/component/parser/style module로 분리된다", () => {
  const markdownRoot = path.resolve(__dirname, "../src/libs/markdown")
  const requiredModules = [
    "MarkdownRendererInline.tsx",
    "MarkdownRendererImage.tsx",
    "MarkdownRendererTable.tsx",
    "MarkdownRendererSegments.tsx",
    "renderingCodeModel.ts",
    "renderingHtmlModel.ts",
    "renderingImageModel.ts",
    "renderingMarkdownModel.ts",
    "renderingNormalizeModel.ts",
    "renderingSegmentModel.ts",
    "renderingTypes.ts",
    "components/MarkdownRendererRootBaseStyles.ts",
    "components/MarkdownRendererRootCardStyles.ts",
    "components/MarkdownRendererRootCodeStyles.ts",
    "components/MarkdownRendererRootMermaidStyles.ts",
    "components/MarkdownRendererRootTableToggleStyles.ts",
    "components/MarkdownRendererRootCalloutStyles.ts",
  ]

  for (const sourcePath of requiredModules) {
    expect(existsSync(path.join(markdownRoot, sourcePath)), sourcePath).toBe(true)
  }

  const pipelineSourceFiles = [
    "MarkdownRenderer.tsx",
    "components/MarkdownRendererRoot.tsx",
    "rendering.ts",
    ...requiredModules,
  ]
  const oversizedFiles = pipelineSourceFiles
    .map((sourcePath) => path.join(markdownRoot, sourcePath))
    .map((sourcePath) => ({
      sourcePath: path.relative(markdownRoot, sourcePath),
      lineCount: readFileSync(sourcePath, "utf8").split("\n").length,
    }))
    .filter(({ lineCount }) => lineCount >= 1000)

  expect(oversizedFiles).toEqual([])

  const rendererSource = readFileSync(path.join(markdownRoot, "MarkdownRenderer.tsx"), "utf8")
  const rootSource = readFileSync(path.join(markdownRoot, "components/MarkdownRendererRoot.tsx"), "utf8")
  const renderingSource = readFileSync(path.join(markdownRoot, "rendering.ts"), "utf8")

  expect(rendererSource).toContain("resolveMarkdownRenderModel")
  expect(rendererSource).not.toContain("const MarkdownTableRenderer =")
  expect(rendererSource).not.toContain("const MarkdownImageFigure =")
  expect(rootSource).toContain("markdownRendererRootCodeStyles")
  expect(rootSource).not.toContain(".aq-callout.aq-admonition-tip")
  expect(renderingSource).toContain("resolveMarkdownRenderModel")
  expect(renderingSource).not.toContain("const parseCalloutHeader =")
  expect(renderingSource).not.toContain("const normalizeSplitInlineColorQuotedEmphasis =")
})

  test("Markdown runtime effects는 Mermaid/Prism side effect module로 분리된다", () => {
  const markdownRoot = path.resolve(__dirname, "../src/libs/markdown")
  const requiredModules = [
    "mermaidRuntimeConfig.ts",
    "mermaidRuntimeMutations.ts",
    "mermaidRuntimeOverlay.ts",
    "mermaidRuntimeRender.ts",
    "mermaidRuntimeSanitize.ts",
    "mermaidRuntimeTypes.ts",
    "prismEffectRuntime.ts",
  ]

  for (const sourcePath of requiredModules) {
    expect(existsSync(path.join(markdownRoot, sourcePath)), sourcePath).toBe(true)
  }

  const runtimeSourceFiles = [
    "hooks/useMermaidEffect.ts",
    "hooks/usePrismEffect.ts",
    "prismRuntime.ts",
    ...requiredModules,
  ]
  const oversizedFiles = runtimeSourceFiles
    .map((sourcePath) => path.join(markdownRoot, sourcePath))
    .filter((sourcePath) => existsSync(sourcePath))
    .map((sourcePath) => ({
      sourcePath: path.relative(markdownRoot, sourcePath),
      lineCount: readFileSync(sourcePath, "utf8").split("\n").length,
    }))
    .filter(({ lineCount }) => lineCount > 600)

  expect(oversizedFiles).toEqual([])

  const mermaidHookSource = readFileSync(path.join(markdownRoot, "hooks/useMermaidEffect.ts"), "utf8")
  const prismHookSource = readFileSync(path.join(markdownRoot, "hooks/usePrismEffect.ts"), "utf8")

  expect(mermaidHookSource).toContain("createMermaidRuntimeController")
  expect(mermaidHookSource).not.toContain("const openMermaidOverlay =")
  expect(mermaidHookSource).not.toContain("const renderMermaidBlocks =")
  expect(mermaidHookSource).not.toContain("const sanitizeRenderableMermaidSource =")
  expect(prismHookSource).toContain("createPrismEffectRuntime")
  expect(prismHookSource).not.toContain("const extractLanguageFromClassList =")
  expect(prismHookSource).not.toContain("const highlightBlocks =")
})

  test("admin workspace pages는 orchestration과 section/style module로 분리된다", () => {
  const adminRoot = path.resolve(__dirname, "../src/routes/Admin")
  const pageRoot = path.resolve(__dirname, "../src/pages/admin")
  const requiredModules = [
    "AdminPostsWorkspacePageCommands.ts",
    "AdminPostsWorkspacePageSections.tsx",
    "AdminProfileWorkspacePage.tsx",
    "AdminProfileWorkspaceSections.tsx",
    "AdminProfileWorkspace.styles.tokens.ts",
    "AdminProfileWorkspace.styles.layout.ts",
    "AdminProfileWorkspace.styles.sections.ts",
    "AdminToolsWorkspacePage.tsx",
    "AdminToolsWorkspaceSections.tsx",
    "AdminToolsWorkspace.styles.tokens.ts",
    "AdminToolsWorkspace.styles.layout.ts",
    "AdminDashboardWorkspacePage.tsx",
    "AdminDashboardWorkspaceSections.tsx",
  ]

  for (const sourcePath of requiredModules) {
    expect(existsSync(path.join(adminRoot, sourcePath)), sourcePath).toBe(true)
  }

  const boundedSourceFiles = [
    "AdminPostsWorkspacePage.tsx",
    "AdminProfileWorkspace.styles.ts",
    "AdminProfileWorkspace.styles.tokens.ts",
    "AdminProfileWorkspace.styles.layout.ts",
    "AdminProfileWorkspace.styles.sections.ts",
    "AdminToolsWorkspace.styles.ts",
    "AdminToolsWorkspace.styles.tokens.ts",
    "AdminToolsWorkspace.styles.layout.ts",
    "AdminDashboardWorkspace.styles.ts",
  ].map((sourcePath) => path.join(adminRoot, sourcePath))

  boundedSourceFiles.push(
    path.join(pageRoot, "dashboard.tsx"),
    path.join(pageRoot, "profile.tsx"),
    path.join(pageRoot, "tools.tsx")
  )

  const oversizedFiles = boundedSourceFiles
    .filter((sourcePath) => existsSync(sourcePath))
    .map((sourcePath) => ({
      sourcePath: path.relative(path.resolve(__dirname, "../src"), sourcePath),
      lineCount: readFileSync(sourcePath, "utf8").split("\n").length,
    }))
    .filter(({ lineCount }) => lineCount > 700)

  expect(oversizedFiles).toEqual([])

  const adminWorkspaceFilesOverThousand = readdirSync(adminRoot)
    .filter((sourcePath) => /^Admin(?:Posts|Profile|Tools|Dashboard)Workspace.*\.(?:ts|tsx)$/.test(sourcePath))
    .map((sourcePath) => path.join(adminRoot, sourcePath))
    .map((sourcePath) => ({
      sourcePath: path.relative(adminRoot, sourcePath),
      lineCount: readFileSync(sourcePath, "utf8").split("\n").length,
    }))
    .filter(({ lineCount }) => lineCount >= 1000)

  expect(adminWorkspaceFilesOverThousand).toEqual([])

  const postsPageSource = readFileSync(path.join(adminRoot, "AdminPostsWorkspacePage.tsx"), "utf8")
  const postsPageViewSource = readFileSync(path.join(adminRoot, "AdminPostsWorkspacePageView.tsx"), "utf8")
  const profilePageSource = readFileSync(path.join(pageRoot, "profile.tsx"), "utf8")
  const toolsPageSource = readFileSync(path.join(pageRoot, "tools.tsx"), "utf8")
  const dashboardPageSource = readFileSync(path.join(pageRoot, "dashboard.tsx"), "utf8")

  expect(postsPageSource).toContain("buildPostsWorkspacePageCommands")
  expect(postsPageSource).toContain("AdminPostsWorkspacePageView")
  expect(postsPageViewSource).toContain("AdminPostsWorkspacePageSections")
  expect(postsPageViewSource).toContain("AdminPostsWorkspaceList")
  expect(profilePageSource).toContain("AdminProfileWorkspacePage")
  expect(toolsPageSource).toContain("AdminToolsWorkspacePage")
  expect(dashboardPageSource).toContain("AdminDashboardWorkspacePage")
})

  test("public detail and feed file boundaries는 route/data/section/style module로 분리된다", () => {
  const detailRoot = path.resolve(__dirname, "../src/routes/Detail/PostDetail")
  const feedRoot = path.resolve(__dirname, "../src/routes/Feed")
  const requiredDetailModules = [
    "PostDetailTocModel.ts",
    "PostDetailRailModel.ts",
    "PostDetailRelatedSection.tsx",
    "PostDetail.styles.ts",
    "CommentBox/CommentBox.styles.ts",
  ]
  const requiredFeedModules = [
    "FeedExplorerRestoreModel.ts",
    "FeedExplorer.styles.ts",
  ]

  for (const sourcePath of requiredDetailModules) {
    expect(existsSync(path.join(detailRoot, sourcePath)), sourcePath).toBe(true)
  }
  for (const sourcePath of requiredFeedModules) {
    expect(existsSync(path.join(feedRoot, sourcePath)), sourcePath).toBe(true)
  }

  const boundedSourceFiles = [
    path.join(detailRoot, "index.tsx"),
    path.join(detailRoot, "CommentBox/index.tsx"),
    path.join(detailRoot, "PostHeader.tsx"),
    path.join(feedRoot, "FeedExplorer.tsx"),
    path.join(feedRoot, "PostList/index.tsx"),
    path.join(feedRoot, "PostList/PostCard.tsx"),
  ]

  const oversizedBudgetFiles = boundedSourceFiles
    .filter((sourcePath) => existsSync(sourcePath))
    .map((sourcePath) => ({
      sourcePath: path.relative(path.resolve(__dirname, "../src"), sourcePath),
      lineCount: readFileSync(sourcePath, "utf8").split("\n").length,
    }))
    .filter(({ sourcePath, lineCount }) =>
      sourcePath.endsWith("PostDetail/index.tsx") ? lineCount > 900 : lineCount > 700
    )

  expect(oversizedBudgetFiles).toEqual([])

  const collectSourceFiles = (root: string) =>
    readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
      const sourcePath = path.join(root, entry.name)
      if (entry.isDirectory()) return collectSourceFiles(sourcePath)
      return /\.(?:ts|tsx)$/.test(entry.name) ? [sourcePath] : []
    })

  const publicFilesOverThousand = [...collectSourceFiles(detailRoot), ...collectSourceFiles(feedRoot)]
    .map((sourcePath) => ({
      sourcePath: path.relative(path.resolve(__dirname, "../src"), sourcePath),
      lineCount: readFileSync(sourcePath, "utf8").split("\n").length,
    }))
    .filter(({ lineCount }) => lineCount >= 1000)

  expect(publicFilesOverThousand).toEqual([])

  const detailPageSource = readFileSync(path.join(detailRoot, "index.tsx"), "utf8")
  const commentBoxSource = readFileSync(path.join(detailRoot, "CommentBox/index.tsx"), "utf8")
  const feedExplorerSource = readFileSync(path.join(feedRoot, "FeedExplorer.tsx"), "utf8")

  expect(detailPageSource).toContain("collectTocFromArticle")
  expect(detailPageSource).toContain("RelatedPostsSection")
  expect(detailPageSource).not.toContain("const StyledWrapper = styled.div")
  expect(commentBoxSource).toContain("CommentBox.styles")
  expect(commentBoxSource).not.toContain("const StyledWrapper = styled.section")
  expect(feedExplorerSource).toContain("FeedExplorerRestoreModel")
  expect(feedExplorerSource).not.toContain("const ExplorerCard = styled.section")
})

  test("public detail/feed residual file boundaries는 600 line companion budget을 유지한다", () => {
  const detailRoot = path.resolve(__dirname, "../src/routes/Detail/PostDetail")
  const feedPostListRoot = path.resolve(__dirname, "../src/routes/Feed/PostList")
  const requiredDetailModules = [
    "PostHeader.styles.ts",
    "PostDetailSection.styles.ts",
    "usePostDetailEngagementActions.ts",
    "usePostDetailRelatedPosts.ts",
  ]

  for (const sourcePath of requiredDetailModules) {
    expect(existsSync(path.join(detailRoot, sourcePath)), sourcePath).toBe(true)
  }

  const boundedSourceFiles = [
    path.join(detailRoot, "index.tsx"),
    path.join(detailRoot, "PostDetail.styles.ts"),
    path.join(detailRoot, "PostHeader.tsx"),
    path.join(detailRoot, "PostDetailSection.styles.ts"),
    path.join(detailRoot, "PostHeader.styles.ts"),
    path.join(detailRoot, "CommentBox/index.tsx"),
    path.join(feedPostListRoot, "index.tsx"),
  ]

  const oversizedBudgetFiles = boundedSourceFiles
    .filter((sourcePath) => existsSync(sourcePath))
    .map((sourcePath) => ({
      sourcePath: path.relative(path.resolve(__dirname, "../src"), sourcePath),
      lineCount: readFileSync(sourcePath, "utf8").split("\n").length,
    }))
    .filter(({ lineCount }) => lineCount > 600)

  expect(oversizedBudgetFiles).toEqual([])

  const detailPageSource = readFileSync(path.join(detailRoot, "index.tsx"), "utf8")
  const postHeaderSource = readFileSync(path.join(detailRoot, "PostHeader.tsx"), "utf8")
  const postDetailStylesSource = readFileSync(path.join(detailRoot, "PostDetail.styles.ts"), "utf8")

  expect(detailPageSource).toContain("usePostDetailEngagementActions")
  expect(detailPageSource).toContain("usePostDetailRelatedPosts")
  expect(postHeaderSource).toContain("PostHeader.styles")
  expect(postHeaderSource).not.toContain("const StyledWrapper = styled.header")
  expect(postDetailStylesSource).toContain("PostDetailSection.styles")
  expect(postDetailStylesSource).not.toContain("export const RelatedSection = styled.section")
})

  test("app shell and auth file boundaries는 data/view/style module로 분리된다", () => {
  const sourceRoot = path.resolve(__dirname, "../src")
  const headerRoot = path.join(sourceRoot, "layouts/RootLayout/Header")
  const authRoot = path.join(sourceRoot, "components/auth")
  const adminRoot = path.join(sourceRoot, "routes/Admin")
  const requiredModules = [
    path.join(headerRoot, "NotificationBellModel.ts"),
    path.join(headerRoot, "NotificationBellPanel.tsx"),
    path.join(headerRoot, "NotificationBell.styles.ts"),
    path.join(authRoot, "AuthEntryModalModel.ts"),
    path.join(authRoot, "AuthEntryModal.styles.ts"),
    path.join(sourceRoot, "routes/About/AboutPageModel.ts"),
    path.join(sourceRoot, "routes/About/AboutPageView.tsx"),
    path.join(sourceRoot, "routes/About/AboutPage.styles.ts"),
    path.join(adminRoot, "AdminProfileWorkspacePageModel.ts"),
    path.join(adminRoot, "AdminProfileWorkspaceSectionRenderer.tsx"),
  ]

  for (const sourcePath of requiredModules) {
    expect(existsSync(sourcePath), path.relative(sourceRoot, sourcePath)).toBe(true)
  }

  const boundedSourceFiles = [
    path.join(headerRoot, "NotificationBell.tsx"),
    path.join(headerRoot, "NavBar.tsx"),
    path.join(authRoot, "AuthEntryModal.tsx"),
    path.join(sourceRoot, "pages/login.tsx"),
    path.join(sourceRoot, "pages/signup.tsx"),
    path.join(sourceRoot, "pages/signup/verify.tsx"),
    path.join(sourceRoot, "pages/about.tsx"),
    path.join(sourceRoot, "routes/About/AboutPageModel.ts"),
    path.join(sourceRoot, "routes/About/AboutPageView.tsx"),
    path.join(sourceRoot, "routes/About/AboutPage.styles.ts"),
    path.join(adminRoot, "AdminProfileWorkspacePage.tsx"),
    path.join(adminRoot, "AdminProfileWorkspaceSections.tsx"),
  ]

  const oversizedBudgetFiles = boundedSourceFiles
    .filter((sourcePath) => existsSync(sourcePath))
    .map((sourcePath) => ({
      sourcePath: path.relative(sourceRoot, sourcePath),
      lineCount: readFileSync(sourcePath, "utf8").split("\n").length,
    }))
    .filter(({ lineCount }) => lineCount > 700)

  expect(oversizedBudgetFiles).toEqual([])

  const collectSourceFiles = (root: string): string[] =>
    readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
      const sourcePath = path.join(root, entry.name)
      if (entry.isDirectory()) return collectSourceFiles(sourcePath)
      return /\.(?:ts|tsx)$/.test(entry.name) ? [sourcePath] : []
    })

  const appShellAuthFilesOverThousand = [
    ...collectSourceFiles(headerRoot),
    ...collectSourceFiles(authRoot),
    path.join(sourceRoot, "pages/about.tsx"),
    path.join(sourceRoot, "pages/login.tsx"),
    path.join(sourceRoot, "pages/signup.tsx"),
    path.join(sourceRoot, "pages/signup/verify.tsx"),
    path.join(adminRoot, "AdminProfileWorkspacePage.tsx"),
    path.join(adminRoot, "AdminProfileWorkspaceSections.tsx"),
    ...readdirSync(adminRoot)
      .filter((sourcePath) => /^AdminProfileWorkspace.*\.(?:ts|tsx)$/.test(sourcePath))
      .map((sourcePath) => path.join(adminRoot, sourcePath)),
  ]
    .filter((sourcePath, index, all) => all.indexOf(sourcePath) === index)
    .filter((sourcePath) => existsSync(sourcePath))
    .map((sourcePath) => ({
      sourcePath: path.relative(sourceRoot, sourcePath),
      lineCount: readFileSync(sourcePath, "utf8").split("\n").length,
    }))
    .filter(({ lineCount }) => lineCount >= 1000)

  expect(appShellAuthFilesOverThousand).toEqual([])

  const notificationSource = readFileSync(path.join(headerRoot, "NotificationBell.tsx"), "utf8")
  const notificationStateSource = readFileSync(path.join(headerRoot, "useNotificationBellState.ts"), "utf8")
  const authModalSource = readFileSync(path.join(authRoot, "AuthEntryModal.tsx"), "utf8")
  const aboutPageSource = readFileSync(path.join(sourceRoot, "pages/about.tsx"), "utf8")
  const adminProfilePageSource = readFileSync(path.join(adminRoot, "AdminProfileWorkspacePage.tsx"), "utf8")
  const adminProfileSectionsSource = readFileSync(path.join(adminRoot, "AdminProfileWorkspaceSections.tsx"), "utf8")

  expect(notificationSource).toContain("NotificationBellPanel")
  expect(notificationStateSource).toContain("NotificationBellModel")
  expect(notificationSource).not.toContain("const StyledWrapper = styled.div")
  expect(authModalSource).toContain("AuthEntryModalModel")
  expect(authModalSource).not.toContain("const Backdrop = styled.div")
  expect(aboutPageSource).toContain("AboutPageView")
  expect(aboutPageSource).not.toContain("const StyledWrapper = styled.div")
  expect(adminProfilePageSource).toContain("AdminProfileWorkspacePageModel")
  expect(adminProfileSectionsSource).toContain("renderAdminProfileWorkspaceSection")
})

  test("backend posts API client는 dto/mapper/request/cache module로 분리된다", () => {
  const backendApiRoot = path.resolve(__dirname, "../src/apis/backend")
  const postsModuleRoot = path.join(backendApiRoot, "posts")
  const requiredModules = [
    path.join(postsModuleRoot, "PostApiDtos.ts"),
    path.join(postsModuleRoot, "PostApiMappers.ts"),
    path.join(postsModuleRoot, "PostApiRequests.ts"),
    path.join(postsModuleRoot, "PostApiRequestModel.ts"),
    path.join(postsModuleRoot, "PostApiDetailRequests.ts"),
    path.join(postsModuleRoot, "PostApiCache.ts"),
  ]

  for (const sourcePath of requiredModules) {
    expect(existsSync(sourcePath), path.relative(backendApiRoot, sourcePath)).toBe(true)
  }

  const boundedSourceFiles = [
    path.join(backendApiRoot, "posts.ts"),
    path.join(backendApiRoot, "client.ts"),
    path.join(postsModuleRoot, "PostApiRequests.ts"),
  ]

  const oversizedBudgetFiles = boundedSourceFiles
    .filter((sourcePath) => existsSync(sourcePath))
    .map((sourcePath) => ({
      sourcePath: path.relative(backendApiRoot, sourcePath),
      lineCount: readFileSync(sourcePath, "utf8").split("\n").length,
    }))
    .filter(({ lineCount }) => lineCount > 600)

  expect(oversizedBudgetFiles).toEqual([])

  const collectSourceFiles = (root: string): string[] =>
    readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
      const sourcePath = path.join(root, entry.name)
      if (entry.isDirectory()) return collectSourceFiles(sourcePath)
      return /\.(?:ts|tsx)$/.test(entry.name) ? [sourcePath] : []
    })

  const apiClientFilesOverThousand = collectSourceFiles(backendApiRoot)
    .map((sourcePath) => ({
      sourcePath: path.relative(backendApiRoot, sourcePath),
      lineCount: readFileSync(sourcePath, "utf8").split("\n").length,
    }))
    .filter(({ lineCount }) => lineCount >= 1000)

  expect(apiClientFilesOverThousand).toEqual([])

  const postsFacadeSource = readFileSync(path.join(backendApiRoot, "posts.ts"), "utf8")
  expect(postsFacadeSource).toContain("PostApiRequests")
  expect(postsFacadeSource).toContain("PostApiMappers")
  expect(postsFacadeSource).toContain("PostApiCache")
  expect(postsFacadeSource).not.toContain("type ApiPostDto =")
  expect(postsFacadeSource).not.toContain("const toPost =")
  expect(postsFacadeSource).not.toContain("export const invalidatePublicPostReadCaches =")
})

const mockAvatarAsset = async (page: Page) => {
  await page.route("**/avatar.png", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/png",
      body: AVATAR_PNG,
    })
  })
}

const addPublicAboutSnapshotCookie = async (page: Page) => {
  await page.context().addCookies([
    {
      name: "admin_profile_snapshot_v1",
      value: encodeURIComponent(
        JSON.stringify({
          username: "aquila",
          name: "aquila",
          nickname: "aquila",
          modifiedAt: new Date().toISOString(),
          profileImageUrl: "/avatar.png",
          profileImageDirectUrl: "/avatar.png",
          profileRole: "Backend Developer",
          profileBio: "서버 안정성과 운영 복구를 함께 고민합니다.",
          aboutHeadline: "이유를 먼저 따지고, 운영 가능한 시스템을 설계합니다.",
          aboutRole: "Backend Developer",
          aboutBio:
            "안녕하세요, 백엔드 개발자 아퀼라입니다.\nJava, Kotlin, Spring Boot를 기반으로 견고한 시스템을 설계합니다.\n블로그에는 기술의 본질을 파고드는 과정을 기록하고 있습니다.",
          aboutSections: [
            {
              id: "journey",
              title: "이력",
              items: ["ADsP [2025.09.05]", "정보처리기사 [2025.09.12]", "독학사 컴퓨터공학 [2026.02.25]", "SQLD [2026.03.27]"],
              dividerBefore: false,
            },
            {
              id: "projects",
              title: "프로젝트",
              items: ["고구마마켓", "마음-온", "aquila-blog", "aquila-bank"],
              dividerBefore: false,
            },
          ],
          aboutProjectSectionTitle: "프로젝트",
          aboutProjects: [
            {
              id: "market",
              name: "고구마마켓",
              summary: "거래 흐름과 상태 전이를 직접 설계하며 커머스 도메인 감각을 다진 프로젝트입니다.",
              role: "Backend · 도메인 설계",
              href: "",
              linkLabel: "",
            },
            {
              id: "blog",
              name: "aquila-blog",
              summary: "글쓰기, 공개 렌더링, 운영 배포까지 직접 관리하는 개인 기술 블로그입니다.",
              role: "Full-stack · Editor/SSR/Deploy",
              href: "https://github.com/AquilaXk/aquila-blog",
              linkLabel: "aquila-blog",
            },
          ],
          serviceLinks: [{ icon: "service", label: "aquila-blog", href: "https://github.com/AquilaXk/aquila-blog" }],
          contactLinks: [{ icon: "github", label: "GitHub", href: "https://github.com/AquilaXk" }],
        })
      ),
      url: "http://127.0.0.1:3000",
    },
  ])
}

const createExplorePost = (overrides: Partial<Record<string, unknown>> & { title: string }) => ({
  id: 101,
  createdAt: "2026-03-16T00:00:00Z",
  modifiedAt: "2026-03-16T00:00:00Z",
  authorId: 1,
  authorName: "관리자",
  authorUsername: "aquila",
  authorProfileImgUrl: "/avatar.png",
  summary: "탐색 API 스모크",
  tags: ["테스트태그"],
  category: ["백엔드"],
  published: true,
  listed: true,
  likesCount: 0,
  commentsCount: 0,
  hitCount: 0,
  ...overrides,
})

const createExplorePage = (
  title: string,
  tag = "테스트태그",
  overrides: Partial<Record<string, unknown>> = {}
) => ({
  content: [
    createExplorePost({
      title,
      tags: [tag],
      ...overrides,
    }),
  ],
  pageable: {
    pageNumber: 0,
    pageSize: 30,
    totalElements: 1,
    totalPages: 1,
  },
})

const mockFeedEndpoints = async (page: Page) => {
  await page.route("**/post/api/v1/posts/feed**", async (route) => {
    const url = new URL(route.request().url())
    const sort = url.searchParams.get("sort") || "CREATED_AT"

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(createExplorePage(`정렬:${sort}`)),
    })
  })

  await page.route("**/post/api/v1/posts/search**", async (route) => {
    const url = new URL(route.request().url())
    const kw = url.searchParams.get("kw") || ""

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(createExplorePage(kw ? `검색:${kw}` : "초기목록")),
    })
  })

  await page.route("**/post/api/v1/posts/explore**", async (route) => {
    const url = new URL(route.request().url())
    const kw = url.searchParams.get("kw") || ""
    const tag = url.searchParams.get("tag") || ""
    const sort = url.searchParams.get("sort") || "CREATED_AT"
    const title = kw
      ? `검색:${kw}`
      : tag
        ? `태그:${tag}`
        : `정렬:${sort}`

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(createExplorePage(title, tag || "테스트태그")),
    })
  })

  await page.route("**/post/api/v1/posts/tags", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ tag: "테스트태그", count: 1 }]),
    })
  })
}

test.beforeEach(async ({ page }) => {
  await mockAvatarAsset(page)
})
})
