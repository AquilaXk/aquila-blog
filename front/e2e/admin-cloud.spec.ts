import { expect, test, type Page, type Route } from "@playwright/test"

const ADMIN_MEMBER = {
  id: 1,
  username: "qa-admin",
  nickname: "QA Admin",
  isAdmin: true,
  blogTitle: "AquilaLog",
}

const CLOUD_FILES = [
  {
    id: 101,
    ownerMemberId: 1,
    originalFilename: "운영 점검 리포트.pdf",
    contentType: "application/pdf",
    byteSize: 245_760,
    mediaKind: "DOCUMENT",
    folderPath: "/ops",
    createdAt: "2026-06-12T09:00:00Z",
    modifiedAt: "2026-06-12T09:00:00Z",
  },
  {
    id: 102,
    ownerMemberId: 1,
    originalFilename: "home-server-rack.png",
    contentType: "image/png",
    byteSize: 142_336,
    mediaKind: "PHOTO",
    folderPath: "/photos",
    createdAt: "2026-06-12T10:00:00Z",
    modifiedAt: "2026-06-12T10:00:00Z",
  },
  {
    id: 103,
    ownerMemberId: 1,
    originalFilename: "deploy-walkthrough.mp4",
    contentType: "video/mp4",
    byteSize: 8_388_608,
    mediaKind: "VIDEO",
    folderPath: "/video",
    createdAt: "2026-06-12T11:00:00Z",
    modifiedAt: "2026-06-12T11:00:00Z",
  },
]

const pixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/w8AAgMBAp6pW2kAAAAASUVORK5CYII=",
  "base64"
)

const fulfillJson = async (route: Route, body: unknown, status = 200) => {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  })
}

const setupAdminCloudMocks = async (page: Page) => {
  const requestedKinds: string[] = []
  const uploadedNames: string[] = []
  const deletedIds: string[] = []

  await page.route("**/_next/image**", async (route) => {
    await route.fulfill({ status: 200, contentType: "image/png", body: pixelPng })
  })

  await page.route("**/member/api/v1/auth/me", (route) => fulfillJson(route, ADMIN_MEMBER))

  await page.route("**/system/api/v1/adm/cloud/files/**", async (route) => {
    const request = route.request()
    const method = request.method()
    const url = new URL(request.url())
    const id = url.pathname.match(/\/files\/(\d+)$/)?.[1] ?? ""

    if (method === "DELETE" && id) {
      deletedIds.push(id)
      await fulfillJson(route, { resultCode: "200-1", msg: "클라우드 파일이 삭제되었습니다." })
      return
    }

    await route.fallback()
  })

  await page.route("**/system/api/v1/adm/cloud/files**", async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const id = url.pathname.match(/\/files\/(\d+)$/)?.[1] ?? ""
    const mediaKind = url.searchParams.get("mediaKind") || "ALL"

    if (request.method() === "DELETE" && id) {
      deletedIds.push(id)
      await fulfillJson(route, { resultCode: "200-1", msg: "클라우드 파일이 삭제되었습니다." })
      return
    }

    if (request.method() === "POST") {
      uploadedNames.push("신규 운영 문서.pdf")
      await fulfillJson(
        route,
        {
          resultCode: "201-1",
          msg: "클라우드 파일이 업로드되었습니다.",
          data: {
            ...CLOUD_FILES[0],
            id: 204,
            originalFilename: uploadedNames.at(-1) || "uploaded.pdf",
            createdAt: "2026-06-12T12:00:00Z",
            modifiedAt: "2026-06-12T12:00:00Z",
          },
        },
        201
      )
      return
    }

    requestedKinds.push(mediaKind)
    const keyword = (url.searchParams.get("kw") || "").toLowerCase()
    const files = CLOUD_FILES.filter((file) => {
      const kindMatches = mediaKind === "ALL" || file.mediaKind === mediaKind
      const keywordMatches = !keyword || file.originalFilename.toLowerCase().includes(keyword)
      return kindMatches && keywordMatches
    })
    await fulfillJson(route, { files })
  })

  await page.route("**/system/api/v1/adm/cloud/files/*/content", async (route) => {
    const url = new URL(route.request().url())
    const id = url.pathname.match(/\/files\/(\d+)\/content/)?.[1] ?? ""
    const file = CLOUD_FILES.find((item) => String(item.id) === id)
    const contentType = file?.contentType ?? "application/octet-stream"

    await route.fulfill({
      status: 200,
      contentType,
      body: contentType.startsWith("image/") ? pixelPng : Buffer.from("mock-private-cloud-content"),
      headers: {
        "accept-ranges": "bytes",
        "cache-control": "private, no-store, max-age=0",
      },
    })
  })

  return { requestedKinds, uploadedNames, deletedIds }
}

test.describe("관리자 클라우드", () => {
  test("파일 목록, 업로드, 삭제와 owner 전용 preview drawer가 동작한다", async ({ page }) => {
    const mocks = await setupAdminCloudMocks(page)

    await page.goto("/admin/cloud")

    await expect(page.getByRole("heading", { name: "관리자 클라우드" })).toBeVisible()
    await expect(page.getByRole("link", { name: "클라우드" })).toHaveAttribute("href", "/admin/cloud")
    await expect(page.locator("article").filter({ hasText: "운영 점검 리포트.pdf" })).toBeVisible()
    await expect(page.locator("article").filter({ hasText: "home-server-rack.png" })).toBeVisible()
    await expect(page.locator("article").filter({ hasText: "deploy-walkthrough.mp4" })).toBeVisible()
    await expect(page.getByText("계정 소유주만 볼 수 있음").first()).toBeVisible()

    await page.getByPlaceholder("파일명 검색").fill("deploy")
    await expect(page.locator("article").filter({ hasText: "deploy-walkthrough.mp4" })).toBeVisible()

    await page.getByRole("button", { name: "동영상" }).click()
    await expect.poll(() => mocks.requestedKinds).toContain("VIDEO")

    await page.getByLabel("클라우드 파일 업로드").setInputFiles({
      name: "신규 운영 문서.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 mock upload"),
    })
    await expect.poll(() => mocks.uploadedNames).toContain("신규 운영 문서.pdf")
    await expect(page.getByText("업로드 완료")).toBeVisible()

    await page.getByRole("button", { name: "전체" }).click()
    await page.getByPlaceholder("파일명 검색").fill("")
    await expect(page.locator("article").filter({ hasText: "운영 점검 리포트.pdf" })).toBeVisible()

    await page.getByRole("button", { name: "운영 점검 리포트.pdf 미리보기" }).click()
    await expect(page.getByRole("heading", { name: "문서 뷰어" })).toBeVisible()
    await expect(page.getByText("PDF.js canvas 렌더링")).toBeVisible()

    await page.getByRole("button", { name: "home-server-rack.png 미리보기" }).click()
    await expect(page.getByRole("heading", { name: "사진 보기" })).toBeVisible()
    await expect(page.getByAltText("home-server-rack.png")).toBeVisible()

    await page.getByRole("button", { name: "deploy-walkthrough.mp4 미리보기" }).click()
    await expect(page.getByRole("heading", { name: "동영상 플레이어" })).toBeVisible()
    await expect(page.getByText("IINA playback model")).toBeVisible()
    await expect(page.getByText("챕터 3개")).toBeVisible()
    await expect(page.getByRole("button", { name: "자막" })).toBeVisible()
    await expect(page.getByText("재생 기록 00:00")).toBeVisible()

    await page.getByRole("button", { name: "deploy-walkthrough.mp4 삭제" }).click()
    await expect.poll(() => mocks.deletedIds).toContain("103")
  })
})
