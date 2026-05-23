import type { Page } from "@playwright/test"

export const MOBILE_VIEWPORT = { width: 393, height: 852 }
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

export const mockAnonymousSession = async (page: Page) => {
  await page.route("**/member/api/v1/auth/me", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ resultCode: "401-1", msg: "로그인 후 이용해주세요.", data: null }),
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

export const createExplorePage = (title: string, tag = "모바일테스트") => ({
  content: [
    {
      id: 1501,
      createdAt: "2026-03-20T00:00:00Z",
      modifiedAt: "2026-03-20T00:00:00Z",
      authorId: 1,
      authorName: "관리자",
      authorUsername: "aquila",
      authorProfileImgUrl: "/avatar.png",
      title,
      summary: "iPhone 15 Pro 레이아웃 회귀 자동화",
      tags: [tag],
      category: ["테스트"],
      published: true,
      listed: true,
      likesCount: 0,
      commentsCount: 0,
      hitCount: 0,
    },
  ],
  pageable: {
    pageNumber: 0,
    pageSize: 30,
    totalElements: 1,
    totalPages: 1,
  },
})

export const MOBILE_TAG_ENTRIES = Array.from({ length: 14 }, (_, index) => ({
  tag: `모바일태그${String(index + 1).padStart(2, "0")}`,
  count: 14 - index,
}))

export const ADMIN_MEMBER_FIXTURE = {
  id: 1,
  username: "aquila",
  nickname: "aquila",
  isAdmin: true,
  profileImageUrl: "/avatar.png",
  profileImageDirectUrl: "/avatar.png",
}

export const ADMIN_POST_FIXTURES = Array.from({ length: 6 }, (_, index) => ({
  id: 3200 + index,
  title: index === 0 ? "First fold 운영 점검" : `관리자 글 목록 회귀 ${index}`,
  authorName: "관리자",
  authorProfileImgUrl: "/avatar.png",
  published: index % 2 === 0,
  listed: index % 3 !== 0,
  tempDraft: false,
  createdAt: `2026-05-${String(10 + index).padStart(2, "0")}T01:00:00Z`,
  modifiedAt: `2026-05-${String(20 - index).padStart(2, "0")}T08:30:00Z`,
}))

export const createAdminPostPage = () => ({
  content: ADMIN_POST_FIXTURES,
  pageable: {
    pageNumber: 0,
    pageSize: 20,
    totalElements: ADMIN_POST_FIXTURES.length,
    totalPages: 1,
  },
})

export const mockAdminPostsWorkspaceEndpoints = async (page: Page) => {
  await page.route("**/member/api/v1/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(ADMIN_MEMBER_FIXTURE),
    })
  })

  await page.route("**/post/api/v1/adm/posts**", async (route) => {
    const url = new URL(route.request().url())

    if (url.pathname.endsWith("/bootstrap")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          member: ADMIN_MEMBER_FIXTURE,
          firstPage: createAdminPostPage(),
        }),
      })
      return
    }

    if (url.pathname.includes("/deleted")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          content: [],
          pageable: { pageNumber: 0, pageSize: 20, totalElements: 0, totalPages: 0 },
        }),
      })
      return
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(createAdminPostPage()),
    })
  })
}

export const mockFeedEndpoints = async (page: Page) => {
  await page.route("**/post/api/v1/posts/feed**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(createExplorePage("모바일 카드 overflow 회귀 점검")),
    })
  })

  await page.route("**/post/api/v1/posts/search**", async (route) => {
    const url = new URL(route.request().url())
    const kw = url.searchParams.get("kw") || ""
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(createExplorePage(kw ? `검색:${kw}` : "검색초기")),
    })
  })

  await page.route("**/post/api/v1/posts/explore**", async (route) => {
    const url = new URL(route.request().url())
    const tag = url.searchParams.get("tag") || "모바일테스트"
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(createExplorePage(`태그:${tag}`, tag)),
    })
  })

  await page.route("**/post/api/v1/posts/tags", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOBILE_TAG_ENTRIES),
    })
  })
}

export type MockDetailOverrides = {
  id?: number
  title?: string
  content?: string
  likesCount?: number
  commentsCount?: number
  hitCount?: number
  actorHasLiked?: boolean
  actorCanModify?: boolean
  actorCanDelete?: boolean
}

export const DETAIL_CONTENT = [
  "| 항목 | 설명 |",
  "| --- | --- |",
  "| 증상 | iPhone 15 Pro에서 가로 스크롤 없이 본문에 맞춰 표시되어야 한다 |",
  "| 원인 | 레이아웃 폭 계산/스크롤 컨테이너 처리 불일치 |",
  "",
  "| 단계 | 핵심 요소 | 설명 |",
  "| --- | --- | --- |",
  "| 연결 | WebSocket | 실시간 양방향 채널을 유지한다 |",
  "| 인증 | STOMP CONNECT | 토큰 검증 시점을 분리한다 |",
  "",
  "```kotlin",
  "fun ensureMobileLayout(width: Int) = if (width <= 393) \"safe\" else \"ok\"",
  "```",
].join("\n")

export const mockDetailEndpoint = async (page: Page, overrides: MockDetailOverrides = {}) => {
  const {
    id: overrideId,
    title: overrideTitle,
    content: overrideContent,
    likesCount: overrideLikesCount,
    commentsCount: overrideCommentsCount,
    hitCount: overrideHitCount,
    actorHasLiked: overrideActorHasLiked,
    actorCanModify: overrideActorCanModify,
    actorCanDelete: overrideActorCanDelete,
  } = overrides
  const postId = overrideId ?? 990
  await page.route(`**/post/api/v1/posts/${postId}**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: postId,
        createdAt: "2026-03-21T00:00:00Z",
        modifiedAt: "2026-03-21T00:00:00Z",
        authorId: 1,
        authorName: "관리자",
        authorUsername: "aquila",
        authorProfileImageDirectUrl: "/avatar.png",
        title: overrideTitle ?? "모바일 테이블/코드블록 회귀 테스트",
        content: overrideContent ?? DETAIL_CONTENT,
        tags: ["모바일"],
        category: ["프론트"],
        published: true,
        listed: true,
        likesCount: overrideLikesCount ?? 0,
        commentsCount: overrideCommentsCount ?? 0,
        hitCount: overrideHitCount ?? 0,
        actorHasLiked: overrideActorHasLiked ?? false,
        actorCanModify: overrideActorCanModify ?? false,
        actorCanDelete: overrideActorCanDelete ?? false,
      }),
    })
  })

  await page.route(`**/post/api/v1/posts/${postId}/hit**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        resultCode: "200-1",
        msg: "ok",
        data: { hitCount: (overrides.hitCount ?? 0) + 1 },
      }),
    })
  })
}

export const captureLayoutSnapshot = async (page: Page) =>
  page.evaluate(() => {
    const viewportWidth = window.innerWidth
    const html = document.documentElement
    const body = document.body
    const cardRects = Array.from(document.querySelectorAll("a article")).map((el) =>
      (el as HTMLElement).getBoundingClientRect()
    )
    const firstCodeBlock = document.querySelector("pre")
    const tables = Array.from(document.querySelectorAll("table"))
    const firstTable = tables[0] ?? null
    const secondTable = tables[1] ?? null
    const firstTableHead = firstTable?.querySelector("thead") as HTMLElement | null
    const firstTableCell = firstTable?.querySelector("tbody td, tbody th") as HTMLElement | null
    const secondTableHead = secondTable?.querySelector("thead") as HTMLElement | null
    const secondTableCell = secondTable?.querySelector("tbody td, tbody th") as HTMLElement | null
    const tableScrolls = Array.from(document.querySelectorAll<HTMLElement>(".aq-table-scroll"))
    const firstTableScroll = tableScrolls[0] ?? null
    const secondTableScroll = tableScrolls[1] ?? null
    const firstCodeShell = document.querySelector(".aq-code-shell")
    const codeRect = firstCodeBlock ? (firstCodeBlock as HTMLElement).getBoundingClientRect() : null
    const tableRect = firstTable ? (firstTable as HTMLElement).getBoundingClientRect() : null
    const secondTableRect = secondTable ? (secondTable as HTMLElement).getBoundingClientRect() : null
    const firstTableScrollRect = firstTableScroll ? firstTableScroll.getBoundingClientRect() : null
    const secondTableScrollRect = secondTableScroll ? secondTableScroll.getBoundingClientRect() : null
    const codeStyle = firstCodeBlock ? window.getComputedStyle(firstCodeBlock as HTMLElement) : null
    const codeShellStyle = firstCodeShell ? window.getComputedStyle(firstCodeShell as HTMLElement) : null
    const firstTableScrollStyle = firstTableScroll ? window.getComputedStyle(firstTableScroll) : null
    const secondTableScrollStyle = secondTableScroll ? window.getComputedStyle(secondTableScroll) : null
    const codeShellElement = firstCodeShell as HTMLElement | null
    const codeShellScrollLeftBefore = codeShellElement?.scrollLeft ?? null
    if (codeShellElement) {
      const maxScrollX = Math.max(0, codeShellElement.scrollWidth - codeShellElement.clientWidth)
      codeShellElement.scrollLeft = Math.min(maxScrollX, 180)
    }
    const codeShellScrollLeftAfter = codeShellElement?.scrollLeft ?? null

    return {
      viewportWidth,
      htmlScrollWidth: html.scrollWidth,
      bodyScrollWidth: body.scrollWidth,
      maxCardRight: cardRects.length ? Math.max(...cardRects.map((rect) => rect.right)) : 0,
      minCardLeft: cardRects.length ? Math.min(...cardRects.map((rect) => rect.left)) : 0,
      firstCardWidth: cardRects[0]?.width ?? 0,
      codeRight: codeRect?.right ?? null,
      codeClientWidth: firstCodeBlock ? (firstCodeBlock as HTMLElement).clientWidth : null,
      codeScrollWidth: firstCodeBlock ? (firstCodeBlock as HTMLElement).scrollWidth : null,
      codeOverflowX: codeStyle?.overflowX ?? null,
      codeShellClientWidth: firstCodeShell ? (firstCodeShell as HTMLElement).clientWidth : null,
      codeShellScrollWidth: firstCodeShell ? (firstCodeShell as HTMLElement).scrollWidth : null,
      codeShellOverflowX: codeShellStyle?.overflowX ?? null,
      codeShellTouchAction: codeShellStyle?.touchAction ?? null,
      codeShellOverscrollBehaviorX: codeShellStyle?.overscrollBehaviorX ?? null,
      codeShellScrollLeftBefore,
      codeShellScrollLeftAfter,
      tableRight: tableRect?.right ?? null,
      secondTableRight: secondTableRect?.right ?? null,
      firstTableScrollRight: firstTableScrollRect?.right ?? null,
      secondTableScrollRight: secondTableScrollRect?.right ?? null,
      firstTableScrollClientWidth: firstTableScroll?.clientWidth ?? null,
      firstTableScrollWidth: firstTableScroll?.scrollWidth ?? null,
      secondTableScrollClientWidth: secondTableScroll?.clientWidth ?? null,
      secondTableScrollWidth: secondTableScroll?.scrollWidth ?? null,
      firstTableScrollOverflowX: firstTableScrollStyle?.overflowX ?? null,
      secondTableScrollOverflowX: secondTableScrollStyle?.overflowX ?? null,
      firstTableCellLabel: firstTableCell?.getAttribute("data-label") ?? null,
      firstTableHeadDisplay: firstTableHead ? window.getComputedStyle(firstTableHead).display : null,
      firstTableCellBeforeContent: firstTableCell
        ? window.getComputedStyle(firstTableCell, "::before").content
        : null,
      secondTableHeadDisplay: secondTableHead ? window.getComputedStyle(secondTableHead).display : null,
      secondTableCellBeforeContent: secondTableCell
        ? window.getComputedStyle(secondTableCell, "::before").content
        : null,
    }
  })
