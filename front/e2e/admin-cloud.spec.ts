import { expect, test, type Page, type Route } from "@playwright/test"

const ADMIN_MEMBER = {
  id: 1,
  username: "qa-admin",
  nickname: "QA Admin",
  isAdmin: true,
  blogTitle: "AquilaLog",
}

type CloudFileFixture = {
  id: number
  ownerMemberId: number
  originalFilename: string
  contentType: string
  byteSize: number
  mediaKind: "DOCUMENT" | "PHOTO" | "VIDEO"
  folderPath: string
  createdAt: string
  modifiedAt: string
}

const CLOUD_FILES: CloudFileFixture[] = [
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

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const fulfillJson = async (route: Route, body: unknown, status = 200) => {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  })
}

const getUploadName = (route: Route) => {
  const body = route.request().postDataBuffer()
  const bodyText = body?.toString("utf8") ?? ""
  return bodyText.match(/filename="([^"]+)"/)?.[1] ?? "uploaded.pdf"
}

const getUploadFileMetadata = (name: string) => {
  const lowerName = name.toLowerCase()
  if (lowerName.endsWith(".png") || lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) {
    return { contentType: "image/png", mediaKind: "PHOTO" as const }
  }
  if (lowerName.endsWith(".mp4") || lowerName.endsWith(".mov")) {
    return { contentType: "video/mp4", mediaKind: "VIDEO" as const }
  }
  return { contentType: "application/pdf", mediaKind: "DOCUMENT" as const }
}

const normalizeFolderPathParam = (value: string) => value.trim().replace(/^\/+|\/+$/g, "")

const setupAdminCloudMocks = async (
  page: Page,
  options: {
    failDeleteIds?: string[]
    failList?: boolean
    failUploadNames?: string[]
    initialFiles?: CloudFileFixture[]
  } = {}
) => {
  const requestedKinds: string[] = []
  const requestedFolderPaths: string[] = []
  const uploadedNames: string[] = []
  const deletedIds: string[] = []
  const uploadedFiles: CloudFileFixture[] = []
  const failedDeleteIds = new Set(options.failDeleteIds ?? [])
  const failedUploadNames = new Set(options.failUploadNames ?? [])
  const initialFiles = options.initialFiles ?? CLOUD_FILES
  let nextUploadId = 204

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
      if (failedDeleteIds.has(id)) {
        await fulfillJson(route, { resultCode: "500-1", msg: "클라우드 파일 삭제에 실패했습니다." }, 500)
        return
      }
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
    const folderPath = normalizeFolderPathParam(url.searchParams.get("folderPath") || "")

    if (request.method() === "DELETE" && id) {
      if (failedDeleteIds.has(id)) {
        await fulfillJson(route, { resultCode: "500-1", msg: "클라우드 파일 삭제에 실패했습니다." }, 500)
        return
      }
      deletedIds.push(id)
      await fulfillJson(route, { resultCode: "200-1", msg: "클라우드 파일이 삭제되었습니다." })
      return
    }

    if (request.method() === "POST") {
      const uploadedName = getUploadName(route)
      const metadata = getUploadFileMetadata(uploadedName)

      if (failedUploadNames.has(uploadedName)) {
        await fulfillJson(route, { resultCode: "500-1", msg: "외장 스토리지 저장에 실패했습니다." }, 500)
        return
      }

      if (uploadedName.includes("취소할")) await delay(700)

      const uploaded = {
        id: nextUploadId++,
        ownerMemberId: 1,
        originalFilename: uploadedName,
        contentType: metadata.contentType,
        byteSize: route.request().postDataBuffer()?.byteLength ?? 0,
        mediaKind: metadata.mediaKind,
        folderPath: "/",
        createdAt: "2026-06-12T12:00:00Z",
        modifiedAt: "2026-06-12T12:00:00Z",
      }

      uploadedNames.push(uploadedName)
      if (!uploadedName.includes("취소할")) uploadedFiles.unshift(uploaded)

      try {
        await fulfillJson(
          route,
          {
            resultCode: "201-1",
            msg: "클라우드 파일이 업로드되었습니다.",
            data: uploaded,
          },
          201
        )
      } catch {
        // The page aborts the in-flight request when an active upload is cancelled.
      }
      return
    }

    if (options.failList) {
      await fulfillJson(route, { resultCode: "500-1", msg: "클라우드 파일 목록 조회에 실패했습니다." }, 500)
      return
    }

    requestedKinds.push(mediaKind)
    requestedFolderPaths.push(folderPath)
    const keyword = (url.searchParams.get("kw") || "").toLowerCase()
    const files = [...uploadedFiles, ...initialFiles].filter((file) => {
      const isDeleted = deletedIds.includes(String(file.id))
      const kindMatches = mediaKind === "ALL" || file.mediaKind === mediaKind
      const folderMatches = !folderPath || normalizeFolderPathParam(file.folderPath) === folderPath
      const keywordMatches = !keyword || file.originalFilename.toLowerCase().includes(keyword)
      return !isDeleted && kindMatches && folderMatches && keywordMatches
    })
    await fulfillJson(route, { files })
  })

  await page.route("**/system/api/v1/adm/cloud/files/*/content", async (route) => {
    const url = new URL(route.request().url())
    const id = url.pathname.match(/\/files\/(\d+)\/content/)?.[1] ?? ""
    const file = [...uploadedFiles, ...initialFiles].find((item) => String(item.id) === id)
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

  return { requestedKinds, requestedFolderPaths, uploadedNames, deletedIds }
}

test.describe("관리자 클라우드", () => {
  test("MYBOX형 파일 목록, 다중 업로드 큐, 취소, 삭제와 owner 전용 preview drawer가 동작한다", async ({ page }) => {
    const mocks = await setupAdminCloudMocks(page)
    const browserErrors: string[] = []

    page.on("pageerror", (error) => {
      browserErrors.push(error.message)
    })
    page.on("console", (message) => {
      if (message.type() === "error") browserErrors.push(message.text())
    })

    await page.goto("/admin/cloud")

    await expect(page.getByRole("heading", { name: "내 파일" })).toBeVisible()
    await expect(page.getByRole("link", { name: "클라우드" }).first()).toHaveAttribute("href", "/admin/cloud")
    await expect(page.getByRole("row", { name: /운영 점검 리포트\.pdf/ })).toBeVisible()
    await expect(page.getByRole("row", { name: /home-server-rack\.png/ })).toBeVisible()
    await expect(page.getByRole("row", { name: /deploy-walkthrough\.mp4/ })).toBeVisible()
    await expect(page.getByText("표시할 파일이 없습니다.")).toHaveCount(0)
    await expect(page.getByText("계정 소유주만 볼 수 있음").first()).toBeVisible()
    await expect(page.getByRole("button", { name: "운영 점검 리포트.pdf 즐겨찾기 (준비 중)" })).toBeDisabled()

    const searchInput = page.getByLabel("클라우드 파일 검색")
    await searchInput.fill("/photos")
    await expect.poll(() => mocks.requestedFolderPaths).toContain("photos")
    await expect(page.getByRole("row", { name: /home-server-rack\.png/ })).toBeVisible()
    await expect(page.getByRole("row", { name: /운영 점검 리포트\.pdf/ })).toHaveCount(0)

    await searchInput.fill("deploy")
    await expect(page.getByRole("row", { name: /deploy-walkthrough\.mp4/ })).toBeVisible()

    await page.getByLabel("파일 종류 필터").getByRole("button", { name: "동영상" }).click()
    await expect.poll(() => mocks.requestedKinds).toContain("VIDEO")
    await page.getByLabel("클라우드 파일 업로드").setInputFiles({
      name: "필터 제외 문서.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 filtered cache guard"),
    })
    await expect.poll(() => mocks.uploadedNames).toContain("필터 제외 문서.pdf")
    await expect(page.getByRole("row", { name: /필터 제외 문서\.pdf/ })).toHaveCount(0)

    await page.getByLabel("파일 종류 필터").getByRole("button", { name: "전체" }).click()
    await searchInput.fill("")
    await page.getByLabel("클라우드 파일 업로드").setInputFiles([
      {
        name: "신규 운영 문서.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.4 mock upload"),
      },
      {
        name: "배포 캡처.png",
        mimeType: "image/png",
        buffer: pixelPng,
      },
    ])

    const uploadPanel = page.getByLabel("업로드 중인 파일")
    await expect(uploadPanel).toHaveCSS("position", "fixed")
    await expect(uploadPanel).toHaveCSS("z-index", "29")
    await expect(uploadPanel.getByRole("heading", { name: /항목 .* 업로드/ })).toBeVisible()
    await expect(uploadPanel.getByText("신규 운영 문서.pdf")).toBeVisible()
    await expect(uploadPanel.getByText("배포 캡처.png")).toBeVisible()
    await expect.poll(() => mocks.uploadedNames).toEqual(
      expect.arrayContaining(["신규 운영 문서.pdf", "배포 캡처.png"])
    )
    await expect(uploadPanel.getByText("완료").first()).toBeVisible()
    await expect(page.getByRole("row", { name: /신규 운영 문서\.pdf/ })).toBeVisible()
    await expect(page.getByRole("row", { name: /배포 캡처\.png/ })).toBeVisible()

    await page.getByLabel("클라우드 파일 업로드").setInputFiles({
      name: "취소할 영상.mp4",
      mimeType: "video/mp4",
      buffer: Buffer.from("cancel this upload"),
    })
    await expect(uploadPanel.getByText("취소할 영상.mp4")).toBeVisible()
    await uploadPanel.getByRole("button", { name: "취소할 영상.mp4 업로드 취소" }).click()
    await expect(uploadPanel.getByText("취소됨")).toBeVisible()
    await expect(page.getByRole("row", { name: /취소할 영상\.mp4/ })).toHaveCount(0)
    await uploadPanel.getByRole("button", { name: "종료된 업로드 항목 지우기" }).click()
    await expect(page.getByLabel("업로드 중인 파일")).toHaveCount(0)

    await page.getByRole("button", { name: "운영 점검 리포트.pdf 미리보기" }).click()
    await expect(page.getByRole("heading", { name: "문서 뷰어" })).toBeVisible()
    await expect(page.getByText("PDF.js canvas 렌더링")).toBeVisible()
    await page.getByRole("button", { name: "상세 패널 닫기" }).click()
    await expect(page.getByLabel("클라우드 상세정보").getByText("파일 선택")).toBeVisible()
    await page.getByRole("button", { name: "상세 패널 보기" }).click()
    await expect(page.getByRole("heading", { name: "문서 뷰어" })).toBeVisible()
    await page.waitForTimeout(100)
    expect(browserErrors.filter((message) => message.includes("Worker was terminated"))).toEqual([])

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

  test("선택 삭제 일부 실패 시 성공 항목만 목록에서 제거하고 실패 알림을 유지한다", async ({ page }) => {
    const mocks = await setupAdminCloudMocks(page, { failDeleteIds: ["102"] })

    await page.goto("/admin/cloud")

    await page.getByRole("checkbox", { name: "운영 점검 리포트.pdf 선택" }).check()
    await page.getByRole("checkbox", { name: "home-server-rack.png 선택" }).check()
    await page.getByRole("button", { name: "선택 삭제" }).click()

    await expect.poll(() => mocks.deletedIds).toContain("101")
    await expect(page.getByText("1개 삭제 완료, 1개 실패")).toBeVisible()
    await expect(page.getByRole("row", { name: /운영 점검 리포트\.pdf/ })).toHaveCount(0)
    await expect(page.getByRole("row", { name: /home-server-rack\.png/ })).toBeVisible()
    await expect(page.getByRole("checkbox", { name: "home-server-rack.png 선택" })).toBeChecked()
  })

  test("빈 클라우드에서 업로드 중인 파일은 목록 작업공간 안에서 상태를 보여준다", async ({ page }) => {
    await setupAdminCloudMocks(page, { initialFiles: [] })

    await page.goto("/admin/cloud")

    await expect(page.getByText("표시할 파일이 없습니다.")).toBeVisible()

    await page.getByLabel("클라우드 파일 업로드").setInputFiles({
      name: "취소할 영상.mp4",
      mimeType: "video/mp4",
      buffer: Buffer.from("uploading item should replace empty state"),
    })

    const uploadPanel = page.getByLabel("업로드 중인 파일")
    await expect(uploadPanel).toHaveCSS("position", "fixed")
    await expect(uploadPanel.getByRole("heading", { name: /항목 .* 업로드/ })).toBeVisible()
    await expect(uploadPanel.getByText("취소할 영상.mp4")).toBeVisible()
    await expect(page.getByText("표시할 파일이 없습니다.")).toHaveCount(0)
    await expect(page.getByText("업로드 중인 파일이 있습니다.")).toBeVisible()

    await uploadPanel.getByRole("button", { name: "취소할 영상.mp4 업로드 취소" }).click()
    await expect(uploadPanel.getByText("취소됨")).toBeVisible()
  })

  test("클라우드 목록 조회 실패는 로딩 대신 오류와 다시 시도 액션을 보여준다", async ({ page }) => {
    await setupAdminCloudMocks(page, { failList: true })

    await page.goto("/admin/cloud")

    await expect(page.getByText("파일을 불러오는 중입니다.")).toHaveCount(0)
    await expect(page.getByText("파일 목록을 불러오지 못했습니다.")).toBeVisible()
    await expect(page.getByRole("button", { name: "파일 목록 다시 시도" })).toBeVisible()
  })

  test("클라우드 업로드 실패는 실패 사유와 재시도 버튼을 같은 항목에 남긴다", async ({ page }) => {
    await setupAdminCloudMocks(page, {
      failUploadNames: ["실패할 운영 문서.pdf"],
      initialFiles: [],
    })

    await page.goto("/admin/cloud")

    await page.getByLabel("클라우드 파일 업로드").setInputFiles({
      name: "실패할 운영 문서.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 failed upload"),
    })

    const uploadPanel = page.getByLabel("업로드 중인 파일")
    await expect(uploadPanel.getByText("실패할 운영 문서.pdf")).toBeVisible()
    await expect(uploadPanel.getByRole("heading", { name: "항목 1개 업로드 실패/취소" })).toBeVisible()
    await expect(uploadPanel.getByText(/서버 오류가 발생했습니다/)).toBeVisible()
    await expect(uploadPanel.getByRole("button", { name: "실패할 운영 문서.pdf 업로드 다시 시도" })).toBeVisible()
  })
})
