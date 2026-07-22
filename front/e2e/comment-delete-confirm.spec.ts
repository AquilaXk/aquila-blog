import { expect, test, type Page } from "@playwright/test"
import { DESKTOP_VIEWPORT } from "./helpers/adaptivityFixtures"
import { ADMIN_MEMBER_FIXTURE, mockAvatarAsset } from "./helpers/mobileLayoutFixtures"

const POST_ID = 1254
const COMMENT_ID = 9101
const COMMENT_CONTENT = "삭제 확인이 필요한 대상 댓글입니다"
const POST_TITLE = "댓글 삭제 ConfirmDialog E2E"

const postDetailFixture = {
  id: POST_ID,
  createdAt: "2026-07-22T00:00:00Z",
  modifiedAt: "2026-07-22T00:00:00Z",
  authorId: 1,
  authorName: "관리자",
  authorUsername: "aquila",
  authorProfileImageDirectUrl: "/avatar.png",
  title: POST_TITLE,
  content: "본문",
  tags: ["댓글삭제"],
  category: [],
  published: true,
  listed: true,
  likesCount: 0,
  commentsCount: 1,
  hitCount: 1,
  actorHasLiked: false,
  actorCanModify: true,
  actorCanDelete: true,
}

const commentFixture = {
  id: COMMENT_ID,
  createdAt: "2026-07-22T01:00:00Z",
  modifiedAt: "2026-07-22T01:00:00Z",
  authorId: 1,
  authorName: "aquila",
  authorUsername: "aquila",
  authorProfileImageUrl: "/avatar.png",
  authorProfileImageDirectUrl: "/avatar.png",
  postId: POST_ID,
  parentCommentId: null,
  content: COMMENT_CONTENT,
  actorCanModify: true,
  actorCanDelete: true,
}

const mockCommentDetailPage = async (page: Page) => {
  await mockAvatarAsset(page)

  await page.route("**/member/api/v1/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(ADMIN_MEMBER_FIXTURE),
    })
  })

  await page.route(`**/post/api/v1/posts/${POST_ID}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(postDetailFixture),
    })
  })

  await page.route(`**/post/api/v1/posts/${POST_ID}/hit`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        resultCode: "200-1",
        msg: "ok",
        data: { hitCount: 2 },
      }),
    })
  })

  await page.route(`**/post/api/v1/posts/${POST_ID}/comments`, async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback()
      return
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([commentFixture]),
    })
  })
}

const openCommentDeleteConfirm = async (page: Page) => {
  await page.setViewportSize(DESKTOP_VIEWPORT)
  await mockCommentDetailPage(page)
  await page.goto(`/posts/${POST_ID}`)
  await expect(page.getByRole("heading", { name: POST_TITLE })).toBeVisible()

  const commentsSection = page.locator('[data-rum-section="comments"]')
  await commentsSection.scrollIntoViewIfNeeded()
  await expect(commentsSection.getByText(COMMENT_CONTENT)).toBeVisible()

  await commentsSection.getByRole("button", { name: "삭제", exact: true }).click()

  const dialog = page.getByRole("dialog", { name: "댓글을 삭제할까요?" })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText("삭제하면 되돌릴 수 없습니다. 대상 댓글 내용:")).toBeVisible()
  await expect(dialog.getByText(COMMENT_CONTENT, { exact: true })).toBeVisible()
  return dialog
}

test.describe("comment delete confirm and failure branches", () => {
  test("삭제 취소는 ConfirmDialog를 닫고 댓글을 유지한다", async ({ page }) => {
    const dialog = await openCommentDeleteConfirm(page)

    await dialog.getByRole("button", { name: "취소" }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.locator('[data-rum-section="comments"]').getByText(COMMENT_CONTENT)).toBeVisible()
  })

  test("DELETE 실패는 서버 msg를 해당 댓글 근처에 인라인으로 노출한다", async ({ page }) => {
    const dialog = await openCommentDeleteConfirm(page)

    await page.route(`**/post/api/v1/posts/${POST_ID}/comments/${COMMENT_ID}`, async (route) => {
      if (route.request().method() !== "DELETE") {
        await route.fallback()
        return
      }

      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({
          resultCode: "403-1",
          msg: "삭제 권한이 없습니다.",
        }),
      })
    })

    await dialog.getByRole("button", { name: "삭제 확정" }).click()
    await expect(dialog).toHaveCount(0)

    const commentBody = page.locator(`#comment-${COMMENT_ID}`)
    await expect(commentBody.getByRole("alert")).toHaveText("삭제 권한이 없습니다.")
  })

  test("작성 401은 AuthEntryModal을 열고 입력값을 보존한다", async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT)
    await mockCommentDetailPage(page)
    await page.goto(`/posts/${POST_ID}`)
    await expect(page.getByRole("heading", { name: POST_TITLE })).toBeVisible()

    const commentsSection = page.locator('[data-rum-section="comments"]')
    await commentsSection.scrollIntoViewIfNeeded()

    const draft = "세션 만료 후에도 남아야 하는 댓글 초안"
    const composer = commentsSection.locator("form.writeForm textarea")
    await expect(composer).toBeVisible()
    await composer.fill(draft)

    await page.route(`**/post/api/v1/posts/${POST_ID}/comments`, async (route) => {
      if (route.request().method() !== "POST") {
        await route.fallback()
        return
      }

      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({
          resultCode: "401-1",
          msg: "로그인이 필요합니다.",
        }),
      })
    })

    await commentsSection.locator("form.writeForm").getByRole("button", { name: "댓글 작성" }).click()

    const authDialog = page.getByRole("dialog", { name: "로그인" })
    await expect(authDialog).toBeVisible()
    await expect(authDialog.getByText("세션이 만료되었습니다. 다시 로그인해 주세요.")).toBeVisible()
    await expect(composer).toHaveValue(draft)
  })

  test("DELETE 성공은 ConfirmDialog를 닫고 댓글 목록을 갱신한다", async ({ page }) => {
    const dialog = await openCommentDeleteConfirm(page)
    let commentsEmpty = false

    await page.route(`**/post/api/v1/posts/${POST_ID}/comments/${COMMENT_ID}`, async (route) => {
      if (route.request().method() !== "DELETE") {
        await route.fallback()
        return
      }

      commentsEmpty = true
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          resultCode: "200-1",
          msg: "ok",
          data: null,
        }),
      })
    })

    await page.route(`**/post/api/v1/posts/${POST_ID}/comments`, async (route) => {
      if (route.request().method() !== "GET") {
        await route.fallback()
        return
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(commentsEmpty ? [] : [commentFixture]),
      })
    })

    await dialog.getByRole("button", { name: "삭제 확정" }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.locator('[data-rum-section="comments"]').getByText(COMMENT_CONTENT)).toHaveCount(0)
    await expect(page.locator('[data-rum-section="comments"]').getByText("첫 댓글을 남겨보세요.")).toBeVisible()
  })
})
