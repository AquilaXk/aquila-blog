import type { Page } from "@playwright/test"
import { AVATAR_PNG, mockAvatarAsset } from "./smokeFixtures"

export type ReleaseUiQaViewport = {
  name: string
  width: number
  height: number
  deviceClass: "mobile" | "tablet" | "desktop"
}

export const RELEASE_UI_QA_VIEWPORTS: ReleaseUiQaViewport[] = [
  { name: "narrow-320", width: 320, height: 740, deviceClass: "mobile" },
  { name: "android-360", width: 360, height: 800, deviceClass: "mobile" },
  { name: "iphone-390", width: 390, height: 844, deviceClass: "mobile" },
  { name: "tablet-768", width: 768, height: 1024, deviceClass: "tablet" },
  { name: "desktop-1024", width: 1024, height: 768, deviceClass: "desktop" },
  { name: "desktop-1440", width: 1440, height: 900, deviceClass: "desktop" },
]

export const RELEASE_UI_QA_FLOW_GROUPS = [
  "anonymous-public-navigation",
  "author-new-post-autosave-refresh-recover-upload-preview-publish-edit-cache",
  "failure-timeout-401-409-413-429-500-offline-slow3g-upload-disconnect",
] as const

export const RELEASE_UI_QA_TAGS = Array.from(
  { length: 20 },
  (_, index) => `release-qa-tag-${String(index + 1).padStart(2, "0")}`
)

export const RELEASE_UI_QA_LONG_URL =
  "https://www.aquilaxk.site/releases/preflight/very-long-url/" +
  "device-ui-qa-matrix-with-keyboard-scroll-restoration-and-overflow-checks"

export const RELEASE_UI_QA_IMAGE_PATHS = Array.from(
  { length: 20 },
  (_, index) => `/qa/release-image-${String(index + 1).padStart(2, "0")}.png`
)

export const RELEASE_UI_QA_COMMENTS = Array.from({ length: 100 }, (_, index) => ({
  id: 9000 + index,
  authorId: 2000 + index,
  authorName: `QA 댓글 작성자 ${String(index + 1).padStart(3, "0")}`,
  authorProfileImageDirectUrl: "/avatar.png",
  content:
    index % 10 === 0
      ? `긴 댓글 ${index + 1}: 모바일 줄바꿈과 comment list virtualization 없이도 overflow가 없어야 합니다. ${RELEASE_UI_QA_LONG_URL}`
      : `댓글 ${index + 1}: release UI QA matrix fixture`,
  createdAt: "2026-06-20T00:00:00Z",
  modifiedAt: "2026-06-20T00:00:00Z",
  parentCommentId: null,
  actorCanModify: false,
  actorCanDelete: false,
}))

const releaseUiQaImageMarkdown = RELEASE_UI_QA_IMAGE_PATHS.map(
  (imagePath, index) => `![release QA image ${index + 1}](${imagePath})`
).join("\n\n")

export const RELEASE_UI_QA_DETAIL_CONTENT = [
  "# Release UI QA Matrix",
  "",
  "긴 summary와 viewport edge case를 한 번에 검증하기 위한 fixture입니다.",
  "",
  `긴 URL: ${RELEASE_UI_QA_LONG_URL}`,
  "",
  "| viewport | flow | expected | owner | note |",
  "| --- | --- | --- | --- | --- |",
  "| 320 | public detail | table scroll shell keeps content inside viewport | frontend | narrow mobile |",
  "| 390 | comments | 100 comments preserve readable rhythm | frontend | iPhone class |",
  "| 768 | editor preview | markdown preview keeps two-pane controls reachable | frontend | tablet |",
  "| 1440 | home rail | dense tags do not create orphan columns | frontend | desktop |",
  "",
  "```mermaid",
  "flowchart LR",
  "  Draft[Draft autosave] --> Refresh[Refresh]",
  "  Refresh --> Recover[Recover draft]",
  "  Recover --> Publish[Publish]",
  "  Publish --> Cache[Cache visible]",
  "```",
  "",
  "$$",
  "LCP = renderStart + resourceLoad + layoutStability",
  "$$",
  "",
  releaseUiQaImageMarkdown,
].join("\n")

export const RELEASE_UI_QA_POST_ID = 95600

export const RELEASE_UI_QA_DETAIL_POST = {
  id: RELEASE_UI_QA_POST_ID,
  createdAt: "2026-06-20T00:00:00Z",
  modifiedAt: "2026-06-20T00:00:00Z",
  authorId: 1,
  authorName: "관리자",
  authorUsername: "aquila",
  authorProfileImageDirectUrl: "/avatar.png",
  title:
    "출시 전 실제 기기 UI QA 매트릭스 긴 제목 줄바꿈 회귀 확인용 제목입니다 ".repeat(3).trim(),
  summary:
    "긴 summary, tag 20개, 긴 URL, 넓은 table, Mermaid, 수식, 이미지 20개, 댓글 100개 fixture를 모두 포함한 release QA 게시글입니다.",
  content: RELEASE_UI_QA_DETAIL_CONTENT,
  tags: RELEASE_UI_QA_TAGS,
  category: ["Release QA"],
  published: true,
  listed: true,
  likesCount: 3,
  commentsCount: RELEASE_UI_QA_COMMENTS.length,
  hitCount: 100,
  actorHasLiked: false,
  actorCanModify: false,
  actorCanDelete: false,
}

export const RELEASE_UI_QA_FEED_PAGE = {
  content: [
    {
      ...RELEASE_UI_QA_DETAIL_POST,
      authorProfileImgUrl: "/avatar.png",
      content: undefined,
    },
  ],
  pageable: {
    pageNumber: 0,
    pageSize: 30,
    totalElements: 1,
    totalPages: 1,
  },
}

export const mockReleaseUiQaEndpoints = async (page: Page) => {
  await mockAvatarAsset(page)

  await page.route("**/qa/release-image-*.png", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/png",
      body: AVATAR_PNG,
    })
  })

  await page.route("**/member/api/v1/auth/me", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ resultCode: "401-1", msg: "로그인 후 이용해주세요.", data: null }),
    })
  })

  await page.route("**/post/api/v1/posts/feed**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(RELEASE_UI_QA_FEED_PAGE),
    })
  })

  await page.route("**/post/api/v1/posts/search**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(RELEASE_UI_QA_FEED_PAGE),
    })
  })

  await page.route("**/post/api/v1/posts/explore**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(RELEASE_UI_QA_FEED_PAGE),
    })
  })

  await page.route("**/post/api/v1/posts/tags", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(RELEASE_UI_QA_TAGS.map((tag, index) => ({ tag, count: 20 - index }))),
    })
  })

  await page.route(`**/post/api/v1/posts/${RELEASE_UI_QA_POST_ID}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(RELEASE_UI_QA_DETAIL_POST),
    })
  })

  await page.route(`**/post/api/v1/posts/${RELEASE_UI_QA_POST_ID}/hit**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        resultCode: "200-1",
        msg: "ok",
        data: { hitCount: RELEASE_UI_QA_DETAIL_POST.hitCount + 1 },
      }),
    })
  })

  await page.route(`**/post/api/v1/posts/${RELEASE_UI_QA_POST_ID}/comments`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(RELEASE_UI_QA_COMMENTS),
    })
  })
}
