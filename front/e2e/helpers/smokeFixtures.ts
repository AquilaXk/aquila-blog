import type { Page } from "@playwright/test"

export const AVATAR_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlH0WkAAAAASUVORK5CYII="
export const AVATAR_PNG = Buffer.from(AVATAR_PNG_BASE64, "base64")

export const mockAvatarAsset = async (page: Page) => {
  await page.route("**/avatar.png", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/png",
      body: AVATAR_PNG,
    })
  })
}

export const addPublicAboutSnapshotCookie = async (page: Page) => {
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

export const createExplorePost = (overrides: Partial<Record<string, unknown>> & { title: string }) => ({
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

export const createExplorePage = (
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

export const mockFeedEndpoints = async (page: Page) => {
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

