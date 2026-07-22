import { expect, test, type Page } from "@playwright/test"
import { DESKTOP_VIEWPORT } from "./helpers/adaptivityFixtures"
import { ADMIN_MEMBER_FIXTURE, mockAvatarAsset } from "./helpers/mobileLayoutFixtures"

const POST_ID = 1253
const OTHER_POST_ID = 1254
const POST_TITLE = "상세 삭제 ConfirmDialog E2E"
const OTHER_POST_TITLE = "다른 글 상세"

const postDetailFixture = (id: number, title: string) => ({
  id,
  createdAt: "2026-07-22T00:00:00Z",
  modifiedAt: "2026-07-22T00:00:00Z",
  authorId: 1,
  authorName: "관리자",
  authorUsername: "aquila",
  authorProfileImageDirectUrl: "/avatar.png",
  title,
  content: "본문",
  tags: ["삭제테스트"],
  category: [],
  published: true,
  listed: true,
  likesCount: 0,
  commentsCount: 0,
  hitCount: 1,
  actorHasLiked: false,
  actorCanModify: true,
  actorCanDelete: true,
})

const mockDeletablePostDetail = async (
  page: Page,
  options?: { postId?: number; title?: string }
) => {
  const postId = options?.postId ?? POST_ID
  const title = options?.title ?? POST_TITLE

  await mockAvatarAsset(page)

  await page.route("**/member/api/v1/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(ADMIN_MEMBER_FIXTURE),
    })
  })

  await page.route(`**/post/api/v1/posts/${postId}`, async (route) => {
    if (route.request().method() === "DELETE") {
      await route.continue()
      return
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(postDetailFixture(postId, title)),
    })
  })

  await page.route(`**/post/api/v1/posts/${postId}/hit`, async (route) => {
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
}

const openDeleteConfirm = async (page: Page) => {
  await page.setViewportSize(DESKTOP_VIEWPORT)
  await mockDeletablePostDetail(page)
  await page.goto(`/posts/${POST_ID}`)
  await expect(page.getByRole("heading", { name: POST_TITLE })).toBeVisible()

  const deleteTrigger = page.getByRole("button", { name: "삭제", exact: true })
  await expect(deleteTrigger).toBeVisible()
  await deleteTrigger.click()

  const dialog = page.getByRole("dialog", { name: "글을 삭제할까요?" })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText("삭제 후에는 삭제 글 목록에서 복구할 수 있습니다.")).toBeVisible()
  await expect(dialog.getByText(POST_TITLE, { exact: true })).toBeVisible()
  return dialog
}

test.describe("post detail delete confirm", () => {
  test("삭제 취소는 ConfirmDialog를 닫고 상세에 남는다", async ({ page }) => {
    const dialog = await openDeleteConfirm(page)

    await dialog.getByRole("button", { name: "취소" }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page).toHaveURL(new RegExp(`/posts/${POST_ID}$`))
    await expect(page.getByRole("heading", { name: POST_TITLE })).toBeVisible()
  })

  test("DELETE 실패는 오류 알림을 남기고 모달에서 재시도할 수 있다", async ({ page }) => {
    let deleteAttempts = 0
    const dialog = await openDeleteConfirm(page)

    await page.route(`**/post/api/v1/posts/${POST_ID}`, async (route) => {
      if (route.request().method() !== "DELETE") {
        await route.fallback()
        return
      }

      deleteAttempts += 1
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          resultCode: "500-1",
          msg: "서버가 바쁩니다.",
        }),
      })
    })

    await dialog.getByRole("button", { name: "삭제 확정" }).click()
    await expect(dialog.getByRole("alert")).toHaveText("서버가 바쁩니다.")
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole("button", { name: "삭제 확정" })).toBeEnabled()

    await dialog.getByRole("button", { name: "삭제 확정" }).click()
    await expect.poll(() => deleteAttempts).toBe(2)
    await expect(dialog.getByRole("alert")).toHaveText("서버가 바쁩니다.")
  })

  test("DELETE 성공은 홈으로 hard navigation 한다", async ({ page }) => {
    await page.route("**/post/api/v1/posts/feed**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          content: [],
          pageable: { pageNumber: 0, pageSize: 30, totalElements: 0, totalPages: 0 },
        }),
      })
    })
    await page.route("**/post/api/v1/posts/tags", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      })
    })

    const dialog = await openDeleteConfirm(page)

    await page.route(`**/post/api/v1/posts/${POST_ID}`, async (route) => {
      if (route.request().method() !== "DELETE") {
        await route.fallback()
        return
      }

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

    await dialog.getByRole("button", { name: "삭제 확정" }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(dialog).toHaveCount(0)
  })

  test("다른 글로 이동하면 삭제 ConfirmDialog 상태가 리셋된다", async ({ page }) => {
    let otherPostDeleteRequests = 0
    const dialog = await openDeleteConfirm(page)

    await mockDeletablePostDetail(page, { postId: OTHER_POST_ID, title: OTHER_POST_TITLE })
    await page.route(`**/post/api/v1/posts/${OTHER_POST_ID}`, async (route) => {
      if (route.request().method() === "DELETE") {
        otherPostDeleteRequests += 1
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            resultCode: "200-1",
            msg: "ok",
            data: null,
          }),
        })
        return
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(postDetailFixture(OTHER_POST_ID, OTHER_POST_TITLE)),
      })
    })

    await page.goto(`/posts/${OTHER_POST_ID}`)
    await expect(page.getByRole("heading", { name: OTHER_POST_TITLE })).toBeVisible()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByRole("dialog", { name: "글을 삭제할까요?" })).toHaveCount(0)
    expect(otherPostDeleteRequests).toBe(0)
  })
})
