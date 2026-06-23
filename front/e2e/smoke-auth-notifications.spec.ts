import { expect, test } from "@playwright/test"
import { readFileSync } from "fs"
import path from "path"
import {
  mockAvatarAsset,
  mockFeedEndpoints,
} from "./helpers/smokeFixtures"

test.beforeEach(async ({ page }) => {
  await mockAvatarAsset(page)
})

test.describe("core smoke auth and notifications", () => {
  test("로그인 화면은 활성 소셜 provider가 없으면 빈 소셜 로그인 섹션을 렌더하지 않는다", async () => {
  const loginSource = readFileSync(path.resolve(__dirname, "../src/pages/login.tsx"), "utf8")
  const loginFormSource = readFileSync(path.resolve(__dirname, "../src/components/auth/LoginPageForm.tsx"), "utf8")

  expect(loginSource).toContain("const hasSocialItems = socialItems.length > 0")
  expect(loginSource).toContain("if (!hasSocialItems || showSocialAuth")
  expect(loginFormSource).toContain("{hasSocialItems ? (")
})

  test("로그인 화면은 visible 페이지 제목을 h1로 노출한다", async ({ page }) => {
  await page.goto("/login")

  const heading = page.getByRole("heading", { name: "로그인", level: 1 })
  await expect(heading).toBeVisible()
  await expect(page.locator("h1")).toHaveCount(1)
})

  test("로그인 정책 토글값은 요청 바디에 반영되고 재진입 시 복원된다", async ({ page }) => {
  const loginBodies: Array<{ rememberMe?: boolean; ipSecurity?: boolean }> = []

  await page.route("**/member/api/v1/auth/login", async (route) => {
    const body = route.request().postData()
    if (body) loginBodies.push(JSON.parse(body))

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        resultCode: "200-1",
        msg: "ok",
        data: {},
      }),
    })
  })

  await page.route("**/member/api/v1/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 1,
        username: "aquila",
        nickname: "aquila",
        profileImageUrl: "/avatar.png",
        profileImageDirectUrl: "/avatar.png",
        role: "ROLE_ADMIN",
      }),
    })
  })

  await page.goto("/login?next=%2Flogin")

  await page.locator("#email").fill("qa-login@example.com")
  await page.locator("#password").fill("Abcd1234!")

  await page.getByRole("button", { name: "로그인 상태 유지" }).click()
  await page.getByRole("button", { name: "IP보안 ON/OFF" }).click()
  await page.getByRole("button", { name: "로그인", exact: true }).click()

  await expect.poll(() => loginBodies.length).toBe(1)
  expect(loginBodies[0]?.rememberMe).toBe(false)
  expect(loginBodies[0]?.ipSecurity).toBe(true)

  await page.reload()

  await page.locator("#email").fill("qa-login@example.com")
  await page.locator("#password").fill("Abcd1234!")
  await page.getByRole("button", { name: "로그인", exact: true }).click()

  await expect.poll(() => loginBodies.length).toBe(2)
  expect(loginBodies[1]?.rememberMe).toBe(false)
  expect(loginBodies[1]?.ipSecurity).toBe(true)
})

  test("비로그인 상태에서 좋아요 클릭 시 로그인 페이지로 이동한다", async ({ page }) => {
  await page.route("**/post/api/v1/posts/101", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 101,
        createdAt: "2026-03-16T00:00:00Z",
        modifiedAt: "2026-03-16T00:00:00Z",
        authorId: 1,
        authorName: "관리자",
        authorUsername: "aquila",
        authorProfileImageDirectUrl: "/avatar.png",
        title: "좋아요 이동 테스트",
        content: "본문",
        tags: [],
        category: [],
        published: true,
        listed: true,
        likesCount: 0,
        commentsCount: 0,
        hitCount: 0,
        actorHasLiked: false,
        actorCanModify: false,
        actorCanDelete: false,
      }),
    })
  })

  await page.route("**/post/api/v1/posts/101/hit", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        resultCode: "200-1",
        msg: "ok",
        data: { hitCount: 1 },
      }),
    })
  })

  await page.goto("/posts/101")
  await page.locator('button[aria-label^="좋아요"]:visible').first().click()

  await expect(page).toHaveURL(/\/login\?/)
})

  test("인증 사용자 알림 패널은 ESC로 닫히고 포커스가 트리거로 복귀한다", async ({ page }) => {
  await mockFeedEndpoints(page)

  await page.route("**/member/api/v1/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 1,
        username: "aquila",
        nickname: "관리자",
        isAdmin: true,
      }),
    })
  })

  const snapshotPayload = {
    items: [
      {
        id: 1,
        type: "POST_COMMENT",
        createdAt: "2026-03-16T00:00:00Z",
        actorId: 2,
        actorName: "유저",
        actorProfileImageUrl: "/avatar.png",
        postId: 101,
        commentId: 77,
        postTitle: "알림 테스트 글",
        commentPreview: "테스트 댓글",
        message: "댓글이 등록되었습니다.",
        isRead: false,
      },
    ],
    unreadCount: 1,
  }

  await page.route("**/member/api/v1/notifications/snapshot", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(snapshotPayload),
    })
  })

  await page.route("**/member/api/v1/notifications/unread-count", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ unreadCount: 1 }),
    })
  })

  await page.route("**/member/api/v1/notifications", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(snapshotPayload.items),
    })
  })

  await page.route("**/member/api/v1/notifications/stream**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: "event: heartbeat\ndata: {}\n\n",
    })
  })

  await page.context().addCookies([
    {
      name: "apiKey",
      value: "e2e-session",
      url: "http://127.0.0.1:3000",
    },
  ])

  await page.goto("/")
  await expect(page.getByRole("button", { name: "전체보기" })).toBeVisible()

  const bellTrigger = page.getByRole("button", { name: "알림" })
  await expect(bellTrigger).toBeVisible()
  await bellTrigger.click()
  await expect(page.getByRole("dialog", { name: "알림 목록" })).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog", { name: "알림 목록" })).toHaveCount(0)
  await expect(bellTrigger).toBeFocused()
})

  test("로그인 실패 메시지가 상태코드 기준으로 표준화된다", async ({ page }) => {
  await page.route("**/member/api/v1/auth/login", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ resultCode: "401-1", msg: "invalid credentials" }),
    })
  })

  await page.goto("/login")
  await page.getByLabel("이메일").fill("wrong-user@example.com")
  await page.locator("#password").fill("wrong-password")
  await page.getByRole("button", { name: "로그인", exact: true }).click()

  await expect(page.getByText("이메일 또는 비밀번호가 올바르지 않습니다.")).toBeVisible()
})

  test("회원가입 화면은 현재 환경 정책에 맞게 렌더한다", async ({ page }) => {
  await page.goto("/signup")

  const disabledHeading = page.getByRole("heading", { level: 1, name: "회원가입 준비 중" })
  if (await disabledHeading.isVisible()) {
    await expect(disabledHeading).toBeVisible()
    await expect(page.getByText("회원가입은 출시 전 개인정보 처리 점검이 완료될 때까지 사용할 수 없습니다.")).toBeVisible()
    await expect(page.getByLabel("이메일")).toHaveCount(0)
    return
  }

  const signupForm = page.locator("form")
  await expect(page.getByRole("heading", { level: 1, name: "회원가입" })).toBeVisible()
  await expect(signupForm.getByRole("button", { name: "인증 메일 보내기" })).toBeDisabled()
  await expect(signupForm.getByRole("link", { name: "개인정보처리방침" })).toHaveAttribute("href", "/privacy")
  await expect(signupForm.getByRole("link", { name: "이용약관" })).toHaveAttribute("href", "/terms")
})
})
