import { expect, test, type Page, type Route } from "@playwright/test"
import { writeFileSync } from "node:fs"

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
  {
    id: 104,
    ownerMemberId: 1,
    originalFilename: "[첨부1] NCS기반 채용 직무설명자료_2026년 제3회 식약처 공무원(일반직) 경력경쟁채용시험 공고문_게시.pdf",
    contentType: "application/pdf",
    byteSize: 1_004_544,
    mediaKind: "DOCUMENT",
    folderPath: "/",
    createdAt: "2026-06-13T02:20:00Z",
    modifiedAt: "2026-06-13T02:20:00Z",
  },
]

const pixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/w8AAgMBAp6pW2kAAAAASUVORK5CYII=",
  "base64"
)

const minimalPdf = Buffer.from(
  [
    "%PDF-1.4",
    "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj",
    "2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj",
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 220 120]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj",
    "4 0 obj<</Length 44>>stream",
    "BT /F1 18 Tf 24 68 Td (Aquila PDF Preview) Tj ET",
    "endstream endobj",
    "5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj",
    "xref",
    "0 6",
    "0000000000 65535 f ",
    "0000000010 00000 n ",
    "0000000056 00000 n ",
    "0000000111 00000 n ",
    "0000000231 00000 n ",
    "0000000325 00000 n ",
    "trailer<</Root 1 0 R/Size 6>>",
    "startxref",
    "395",
    "%%EOF",
  ].join("\n")
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

const getUploadTextField = (route: Route, fieldName: string) => {
  const body = route.request().postDataBuffer()
  const bodyText = body?.toString("utf8") ?? ""
  const match = bodyText.match(new RegExp(`name="${fieldName}"\\r?\\n\\r?\\n([^\\r\\n]*)`))
  return match?.[1] ?? ""
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

const expectPdfPreviewFitsDetailPanel = async (page: Page, previewName: string | RegExp) => {
  await expect
    .poll(async () => {
      const detailPanelBox = await page.getByLabel("클라우드 상세정보").boundingBox()
      const pdfCanvasBox = await page.getByLabel(previewName).boundingBox()
      if (!detailPanelBox || !pdfCanvasBox) return false
      return pdfCanvasBox.width <= detailPanelBox.width
    })
    .toBe(true)
}

const setupAdminCloudMocks = async (
  page: Page,
  options: {
    contentDelayMs?: number
    failDeleteIds?: string[]
    failList?: boolean
    failUploadStatusByName?: Record<string, number>
    failUploadOnceNames?: string[]
    failUploadNames?: string[]
    failVideoPartOnceNumber?: number
    failVideoSessionGetOnceStatus?: number
    initialFiles?: CloudFileFixture[]
    listDelayMs?: number
    lookupOnlyFiles?: CloudFileFixture[]
    normalizeVideoSessionFilename?: boolean
    uploadResponseFilenames?: Record<string, string>
    videoCompletedFileId?: number
    videoSessionStatus?: "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "EXPIRED"
  } = {}
) => {
  const requestedKinds: string[] = []
  const requestedFolderPaths: string[] = []
  const uploadedNames: string[] = []
  const uploadedClientFilenames: string[] = []
  const videoSessionCreates: string[] = []
  const videoSessionGets: string[] = []
  const videoPartNumbers: number[] = []
  const videoCompletes: string[] = []
  const videoCancels: string[] = []
  const deletedIds: string[] = []
  const requestedContentIds: string[] = []
  const externalPlaybackTokenRequests: string[] = []
  const uploadedFiles: CloudFileFixture[] = []
  const failedDeleteIds = new Set(options.failDeleteIds ?? [])
  const failedUploadNames = new Set(options.failUploadNames ?? [])
  const failUploadOnceNames = new Set(options.failUploadOnceNames ?? [])
  const failedVideoPartOnceNumbers = new Set<number>()
  let didFailVideoSessionGet = false
  const initialFiles = options.initialFiles ?? CLOUD_FILES
  const lookupOnlyFiles = options.lookupOnlyFiles ?? []
  let videoSessionFilename = "대용량 교육 영상.mp4"
  let videoSessionByteSize = 101 * 1024 * 1024
  let nextUploadId = 204

  await page.route("**/_next/image**", async (route) => {
    await route.fulfill({ status: 200, contentType: "image/png", body: pixelPng })
  })

  await page.route("**/member/api/v1/auth/me", (route) => fulfillJson(route, ADMIN_MEMBER))

  await page.route("**/system/api/v1/adm/cloud/files/video-upload-sessions**", async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const sessionMatch = url.pathname.match(/\/video-upload-sessions\/(\d+)/)
    const sessionId = sessionMatch?.[1] ?? "301"
    const sessionBody = {
      id: Number(sessionId),
      ownerMemberId: 1,
      originalFilename: videoSessionFilename,
      contentType: "video/mp4",
      byteSize: videoSessionByteSize,
      folderPath: "/",
      partSizeBytes: 67_108_864,
      totalParts: 2,
      uploadedParts: videoPartNumbers,
      status: options.videoSessionStatus ?? "IN_PROGRESS",
      expiresAt: "2026-06-13T12:00:00Z",
      completedFileId: options.videoCompletedFileId ?? null,
    }

    if (request.method() === "POST" && url.pathname.endsWith("/video-upload-sessions")) {
      const payload = JSON.parse(request.postData() || "{}") as { originalFilename?: string; byteSize?: number }
      videoSessionCreates.push(payload.originalFilename || "")
      videoSessionFilename = payload.originalFilename || videoSessionFilename
      if (options.normalizeVideoSessionFilename) {
        videoSessionFilename = videoSessionFilename.normalize("NFC")
      }
      videoSessionByteSize = payload.byteSize || videoSessionByteSize
      await fulfillJson(
        route,
        {
          resultCode: "201-1",
          msg: "created",
          data: { ...sessionBody, originalFilename: videoSessionFilename, byteSize: videoSessionByteSize },
        },
        201
      )
      return
    }

    if (request.method() === "GET" && sessionMatch) {
      videoSessionGets.push(sessionId)
      if (options.failVideoSessionGetOnceStatus && !didFailVideoSessionGet) {
        didFailVideoSessionGet = true
        await fulfillJson(
          route,
          { resultCode: `${options.failVideoSessionGetOnceStatus}-1`, msg: "temporary session lookup failure" },
          options.failVideoSessionGetOnceStatus
        )
        return
      }
      await fulfillJson(route, {
        ...sessionBody,
        originalFilename: videoSessionFilename,
        byteSize: videoSessionByteSize,
        uploadedParts: [...videoPartNumbers],
      })
      return
    }

    if (request.method() === "PUT" && url.pathname.includes("/parts/")) {
      const partNumber = Number(url.pathname.match(/\/parts\/(\d+)$/)?.[1] || 0)
      if (
        options.failVideoPartOnceNumber === partNumber &&
        !failedVideoPartOnceNumbers.has(partNumber)
      ) {
        failedVideoPartOnceNumbers.add(partNumber)
        await fulfillJson(route, { msg: "transient video part failure" }, 503)
        return
      }
      videoPartNumbers.push(partNumber)
      const byteSize = request.postDataBuffer()?.byteLength ?? 0
      await fulfillJson(route, {
        session: { ...sessionBody, uploadedParts: [...videoPartNumbers] },
        part: { partNumber, byteSize },
      })
      return
    }

    if (request.method() === "POST" && url.pathname.endsWith("/complete")) {
      videoCompletes.push(sessionId)
      const uploaded = {
        id: nextUploadId++,
        ownerMemberId: 1,
        originalFilename: videoSessionFilename,
        contentType: "video/mp4",
        byteSize: videoSessionByteSize,
        mediaKind: "VIDEO" as const,
        folderPath: "/",
        createdAt: "2026-06-12T12:00:00Z",
        modifiedAt: "2026-06-12T12:00:00Z",
      }
      uploadedFiles.unshift(uploaded)
      await fulfillJson(route, { resultCode: "200-1", msg: "completed", data: uploaded })
      return
    }

    if (request.method() === "DELETE" && sessionMatch) {
      videoCancels.push(sessionId)
      await fulfillJson(route, { resultCode: "200-1", msg: "cancelled" })
      return
    }

    await route.fallback()
  })

  await page.route("**/system/api/v1/adm/cloud/files/*/external-playback-token", async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const id = url.pathname.match(/\/files\/(\d+)\/external-playback-token$/)?.[1] ?? ""
    if (request.method() !== "POST" || !id) {
      await route.fallback()
      return
    }

    externalPlaybackTokenRequests.push(id)
    await fulfillJson(
      route,
      {
        resultCode: "201-1",
        msg: "외부 재생 token이 발급되었습니다.",
        data: {
          fileId: Number(id),
          token: `external-token-${id}`,
          expiresAt: "2026-06-26T12:05:00Z",
          contentPath: `/system/api/v1/adm/cloud/files/${id}/external-content?token=external-token-${id}`,
        },
      },
      201
    )
  })

  await page.route("**/system/api/v1/adm/cloud/files/**", async (route) => {
    const request = route.request()
    const method = request.method()
    const url = new URL(request.url())
    const id = url.pathname.match(/\/files\/(\d+)$/)?.[1] ?? ""
    if (url.pathname.includes("/video-upload-sessions")) {
      await route.fallback()
      return
    }
    if (url.pathname.includes("/external-playback-token")) {
      await route.fallback()
      return
    }

    if (method === "GET" && id) {
      const file = [...uploadedFiles, ...lookupOnlyFiles, ...initialFiles].find((item) => String(item.id) === id)
      if (!file) {
        await fulfillJson(route, { resultCode: "404-1", msg: "클라우드 파일을 찾을 수 없습니다." }, 404)
        return
      }
      await fulfillJson(route, file)
      return
    }

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
    if (url.pathname.includes("/video-upload-sessions")) {
      await route.fallback()
      return
    }
    if (url.pathname.includes("/external-playback-token")) {
      await route.fallback()
      return
    }
    const mediaKind = url.searchParams.get("mediaKind") || "ALL"
    const folderPath = normalizeFolderPathParam(url.searchParams.get("folderPath") || "")

    if (request.method() === "GET" && id) {
      const file = [...uploadedFiles, ...lookupOnlyFiles, ...initialFiles].find((item) => String(item.id) === id)
      if (!file) {
        await fulfillJson(route, { resultCode: "404-1", msg: "클라우드 파일을 찾을 수 없습니다." }, 404)
        return
      }
      await fulfillJson(route, file)
      return
    }

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
      const clientFilename = getUploadTextField(route, "clientFilename")
      const metadata = getUploadFileMetadata(uploadedName)

      if (failedUploadNames.has(uploadedName) || failUploadOnceNames.has(uploadedName)) {
        failUploadOnceNames.delete(uploadedName)
        const status = options.failUploadStatusByName?.[uploadedName] ?? 500
        const message =
          status === 413
            ? "파일 용량이 너무 큽니다. 50MB 이하 파일로 다시 시도해주세요."
            : "외장 스토리지 저장에 실패했습니다."
        await fulfillJson(route, { resultCode: `${status}-1`, msg: message }, status)
        return
      }

      if (uploadedName.includes("취소할")) await delay(700)

      const uploaded = {
        id: nextUploadId++,
        ownerMemberId: 1,
        originalFilename: options.uploadResponseFilenames?.[uploadedName] ?? uploadedName,
        contentType: metadata.contentType,
        byteSize: route.request().postDataBuffer()?.byteLength ?? 0,
        mediaKind: metadata.mediaKind,
        folderPath: "/",
        createdAt: "2026-06-12T12:00:00Z",
        modifiedAt: "2026-06-12T12:00:00Z",
      }

      uploadedNames.push(uploadedName)
      uploadedClientFilenames.push(clientFilename)
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
      if (options.listDelayMs) await delay(options.listDelayMs)
      await fulfillJson(route, { resultCode: "500-1", msg: "클라우드 파일 목록 조회에 실패했습니다." }, 500)
      return
    }

    if (options.listDelayMs) await delay(options.listDelayMs)
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
    requestedContentIds.push(id)
    const file = [...uploadedFiles, ...initialFiles].find((item) => String(item.id) === id)
    const contentType = file?.contentType ?? "application/octet-stream"
    const body = contentType === "application/pdf"
      ? minimalPdf
      : contentType.startsWith("image/")
        ? pixelPng
        : Buffer.from("mock-private-cloud-content")

    if (options.contentDelayMs) await delay(options.contentDelayMs)
    await route.fulfill({
      status: 200,
      contentType,
      body,
      headers: {
        "accept-ranges": "bytes",
        "cache-control": "private, no-store, max-age=0",
      },
    })
  })

  return {
    requestedKinds,
    requestedFolderPaths,
    uploadedNames,
    uploadedClientFilenames,
    videoSessionCreates,
    videoSessionGets,
    videoPartNumbers,
    videoCompletes,
    videoCancels,
    deletedIds,
    requestedContentIds,
    externalPlaybackTokenRequests,
  }
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
      if (
        message.type() === "warning" &&
        (message.text().includes("standardFontDataUrl") || message.text().includes("ZapfDingbats"))
      ) {
        browserErrors.push(message.text())
      }
    })
    await page.addInitScript(() => {
      Object.assign(window, { __adminCloudCopiedText: "" })
      const clipboard = {
        writeText: async (text: string) => {
          Object.assign(window, { __adminCloudCopiedText: text })
        },
      }
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: clipboard,
      })
    })

    await page.goto("/admin/cloud")

    await expect(page.getByRole("heading", { name: "미디어 라이브러리" })).toBeVisible()
    await expect(page.getByText("Storage")).toBeVisible()
    await expect(page.getByRole("button", { name: "파일을 끌어놓거나 클릭해 업로드" })).toBeVisible()
    await expect(page.getByRole("link", { name: "클라우드" }).first()).toHaveAttribute("href", "/admin/cloud")
    await expect(page.getByRole("row", { name: /운영 점검 리포트\.pdf/ })).toBeVisible()
    await expect(page.getByRole("row", { name: /home-server-rack\.png/ })).toBeVisible()
    await expect(page.getByRole("row", { name: /deploy-walkthrough\.mp4/ })).toBeVisible()
    await expect(page.getByText("표시할 파일이 없습니다.")).toHaveCount(0)
    await expect(page.getByLabel("클라우드 상세정보")).toHaveCount(0)
    await expect(page.getByRole("button", { name: "운영 점검 리포트.pdf 즐겨찾기 (준비 중)" })).toBeDisabled()
    await expect(page.getByText("문", { exact: true })).toHaveCount(0)
    await expect(page.getByText("PDF").first()).toBeVisible()
    await expect(page.getByLabel("관리자 검색")).toHaveCount(0)
    await expect(page.getByPlaceholder("관리자 메뉴 검색")).toHaveCount(0)

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
    await expect(page.getByText("신규 운영 문서.pdf 업로드 완료")).toHaveCount(0)
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

    await page.locator('button[title="운영 점검 리포트.pdf"]').click()
    await expect(page.getByRole("heading", { name: "문서 뷰어" })).toBeVisible()
    await expect(page.getByText("계정 소유주만 볼 수 있음").first()).toBeVisible()
    await expect(page.getByText("미리보기 완료")).toBeVisible()
    await expectPdfPreviewFitsDetailPanel(page, "운영 점검 리포트.pdf PDF 미리보기")
    await page.getByRole("button", { name: "상세 패널 닫기" }).click()
    await expect(page.getByLabel("클라우드 상세정보")).toHaveCount(0)
    await page.getByRole("button", { name: "상세 패널 보기" }).click()
    await expect(page.getByRole("heading", { name: "문서 뷰어" })).toBeVisible()
    await page.waitForTimeout(100)
    expect(browserErrors.filter((message) => message.includes("Worker was terminated"))).toEqual([])
    expect(browserErrors.filter((message) => message.includes("standardFontDataUrl"))).toEqual([])
    expect(browserErrors.filter((message) => message.includes("ZapfDingbats"))).toEqual([])

    await page.locator('button[title="home-server-rack.png"]').click()
    await expect(page.getByRole("heading", { name: "사진 보기" })).toBeVisible()
    await expect(page.getByAltText("home-server-rack.png")).toBeVisible()
    await expect(page.getByLabel("사진 썸네일")).toHaveCount(0)

    await page.locator('button[title="deploy-walkthrough.mp4"]').click()
    await expect(page.getByRole("heading", { name: "클라우드 동영상" })).toBeVisible()
    await expect(page.getByText("IINA playback model")).toHaveCount(0)
    await expect(page.getByRole("button", { name: "IINA 명령 복사" })).toBeVisible()
    await expect(page.getByRole("button", { name: "mpv 명령 복사" })).toBeVisible()
    await expect(page.getByText(/챕터 \d+개/)).toHaveCount(0)
    await expect(page.getByText(/재생 기록/)).toHaveCount(0)
    await expect(page.getByRole("button", { name: "자막" })).toHaveCount(0)

    const video = page.locator("video")
    await expect(video).toBeVisible()
    await page.getByRole("button", { name: "1.5x" }).click()
    await expect.poll(async () => video.evaluate((node) => (node as HTMLVideoElement).playbackRate)).toBe(1.5)
    await page.getByRole("button", { name: "IINA 명령 복사" }).click()
    await expect(page.getByRole("status")).toContainText("IINA 명령을 복사했습니다")
    await expect.poll(() => mocks.externalPlaybackTokenRequests).toEqual(["103"])
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as typeof window & { __adminCloudCopiedText?: string }).__adminCloudCopiedText || ""
        )
      )
      .toContain('iina "')
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as typeof window & { __adminCloudCopiedText?: string }).__adminCloudCopiedText || ""
        )
      )
      .toContain("/system/api/v1/adm/cloud/files/103/external-content?token=external-token-103")
    await page.getByRole("button", { name: "mpv 명령 복사" }).click()
    await expect(page.getByRole("status")).toContainText("mpv 명령을 복사했습니다")
    await expect.poll(() => mocks.externalPlaybackTokenRequests).toEqual(["103", "103"])

    await expect(page.getByRole("button", { name: "deploy-walkthrough.mp4 삭제" })).toHaveCount(0)
    await page.getByRole("checkbox", { name: "deploy-walkthrough.mp4 선택" }).check()
    await page.getByRole("button", { name: "선택 삭제" }).click()
    await expect(page.getByRole("dialog", { name: "파일 삭제" })).toBeVisible()
    expect(mocks.deletedIds).toEqual([])
    await page.getByRole("dialog", { name: "파일 삭제" }).getByRole("button", { name: "삭제" }).click()
    await expect.poll(() => mocks.deletedIds).toContain("103")
  })

  test("목록 로딩 중에도 클라우드 작업공간과 툴바를 유지한다", async ({ page }) => {
    await setupAdminCloudMocks(page, { listDelayMs: 450 })

    await page.goto("/admin/cloud")

    await expect(page.getByRole("heading", { name: "미디어 라이브러리" })).toBeVisible()
    await expect(page.locator('button[aria-label="파일 업로드"]').first()).toBeVisible()
    await expect(page.getByRole("status", { name: "파일 목록 로딩" })).toBeVisible()
    await expect(page.locator("[data-admin-cloud-skeleton-row]")).toHaveCount(3)
    await expect(page.getByText("파일을 불러오는 중입니다.")).toHaveCount(0)
    await expect(page.getByRole("row", { name: /운영 점검 리포트\.pdf/ })).toBeVisible()
    await expect(page.getByRole("status", { name: "파일 목록 로딩" })).toHaveCount(0)
  })

  test("100MB 초과 동영상은 resumable 세션과 조각 업로드로 처리한다", async ({ page }, testInfo) => {
    const mocks = await setupAdminCloudMocks(page)
    const largeVideo = Buffer.alloc(101 * 1024 * 1024)
    Buffer.from([0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70]).copy(largeVideo)
    const largeVideoPath = testInfo.outputPath("대용량 교육 영상.mp4")
    writeFileSync(largeVideoPath, largeVideo)

    await page.goto("/admin/cloud")
    await page.getByLabel("클라우드 파일 업로드").setInputFiles(largeVideoPath)

    await expect.poll(() => mocks.videoSessionCreates).toContain("대용량 교육 영상.mp4")
    await expect.poll(() => mocks.videoPartNumbers).toEqual([1, 2])
    await expect.poll(() => mocks.videoCompletes).toEqual(["301"])
    await expect(page.getByLabel("업로드 중인 파일").getByText("완료", { exact: true })).toBeVisible()
    await expect(page.getByRole("row", { name: /대용량 교육 영상\.mp4/ })).toBeVisible()
    expect(mocks.uploadedNames).not.toContain("대용량 교육 영상.mp4")
    expect(mocks.videoCancels).toEqual([])
  })

  test("대용량 동영상 part 실패 후 재시도는 기존 세션의 업로드된 조각부터 이어간다", async ({ page }, testInfo) => {
    const mocks = await setupAdminCloudMocks(page, { failVideoPartOnceNumber: 2 })
    const largeVideo = Buffer.alloc(101 * 1024 * 1024)
    Buffer.from([0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70]).copy(largeVideo)
    const largeVideoPath = testInfo.outputPath("대용량 교육 영상.mp4")
    writeFileSync(largeVideoPath, largeVideo)

    await page.goto("/admin/cloud")
    await page.getByLabel("클라우드 파일 업로드").setInputFiles(largeVideoPath)

    const uploadPanel = page.getByLabel("업로드 중인 파일")
    await expect(page.getByText(/대용량 교육 영상\.mp4 업로드 실패/)).toBeVisible()
    await expect(uploadPanel.getByRole("heading", { name: "항목 1개 업로드 실패/취소" })).toBeVisible()
    await expect
      .poll(() =>
        page.evaluate(() =>
          Object.entries(window.localStorage)
            .filter(([key]) => key.startsWith("aquila-cloud-video-upload-session"))
            .map(([, value]) => value)
        )
      )
      .toEqual(["301"])
    expect(mocks.videoSessionCreates).toEqual(["대용량 교육 영상.mp4"])
    expect(mocks.videoPartNumbers).toEqual([1])
    expect(mocks.videoCancels).toEqual([])

    await uploadPanel.getByRole("button", { name: "대용량 교육 영상.mp4 업로드 다시 시도" }).click()

    await expect.poll(() => mocks.videoSessionGets).toContain("301")
    await expect.poll(() => mocks.videoPartNumbers).toEqual([1, 2])
    await expect.poll(() => mocks.videoCompletes).toEqual(["301"])
    expect(mocks.videoSessionCreates).toEqual(["대용량 교육 영상.mp4"])
    expect(mocks.videoCancels).toEqual([])
  })

  test("대용량 동영상 재시도는 서버 정규화 파일명 세션을 버리지 않는다", async ({ page }, testInfo) => {
    const mocks = await setupAdminCloudMocks(page, {
      failVideoPartOnceNumber: 2,
      normalizeVideoSessionFilename: true,
    })
    const largeVideo = Buffer.alloc(101 * 1024 * 1024)
    Buffer.from([0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70]).copy(largeVideo)
    const nfcFilename = "대용량 교육 영상.mp4"
    const nfdFilename = nfcFilename.normalize("NFD")
    const largeVideoPath = testInfo.outputPath(nfdFilename)
    writeFileSync(largeVideoPath, largeVideo)

    await page.goto("/admin/cloud")
    await page.getByLabel("클라우드 파일 업로드").setInputFiles(largeVideoPath)

    const uploadPanel = page.getByLabel("업로드 중인 파일")
    await expect(uploadPanel.getByRole("heading", { name: "항목 1개 업로드 실패/취소" })).toBeVisible()
    await uploadPanel.getByRole("button", { name: `${nfdFilename} 업로드 다시 시도` }).click()

    await expect.poll(() => mocks.videoSessionGets).toContain("301")
    await expect.poll(() => mocks.videoPartNumbers).toEqual([1, 2])
    await expect.poll(() => mocks.videoCompletes).toEqual(["301"])
    expect(mocks.videoSessionCreates).toEqual([nfdFilename])
    expect(mocks.videoCancels).toEqual([])
  })

  test("대용량 동영상 세션 조회 일시 실패는 저장된 세션을 지우지 않는다", async ({ page }, testInfo) => {
    const mocks = await setupAdminCloudMocks(page, {
      failVideoPartOnceNumber: 2,
      failVideoSessionGetOnceStatus: 503,
    })
    const largeVideo = Buffer.alloc(101 * 1024 * 1024)
    Buffer.from([0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70]).copy(largeVideo)
    const largeVideoPath = testInfo.outputPath("대용량 교육 영상.mp4")
    writeFileSync(largeVideoPath, largeVideo)

    await page.goto("/admin/cloud")
    await page.getByLabel("클라우드 파일 업로드").setInputFiles(largeVideoPath)

    const uploadPanel = page.getByLabel("업로드 중인 파일")
    await expect(page.getByText(/대용량 교육 영상\.mp4 업로드 실패/)).toBeVisible()
    await uploadPanel.getByRole("button", { name: "대용량 교육 영상.mp4 업로드 다시 시도" }).click()
    await expect(page.getByText(/대용량 교육 영상\.mp4 업로드 실패: 서버 오류가 발생했습니다/)).toBeVisible()
    await expect
      .poll(() =>
        page.evaluate(() =>
          Object.entries(window.localStorage)
            .filter(([key]) => key.startsWith("aquila-cloud-video-upload-session"))
            .map(([, value]) => value)
        )
      )
      .toEqual(["301"])
    expect(mocks.videoSessionCreates).toEqual(["대용량 교육 영상.mp4"])
    expect(mocks.videoCancels).toEqual([])

    await uploadPanel.getByRole("button", { name: "대용량 교육 영상.mp4 업로드 다시 시도" }).click()
    await expect.poll(() => mocks.videoSessionGets).toEqual(["301", "301"])
    await expect.poll(() => mocks.videoPartNumbers).toEqual([1, 2])
    await expect.poll(() => mocks.videoCompletes).toEqual(["301"])
  })

  test("대용량 동영상 완료 세션은 completedFileId로 복구하고 재업로드하지 않는다", async ({ page }, testInfo) => {
    const completedVideo: CloudFileFixture = {
      id: 205,
      ownerMemberId: 1,
      originalFilename: "대용량 교육 영상.mp4",
      contentType: "video/mp4",
      byteSize: 101 * 1024 * 1024,
      mediaKind: "VIDEO",
      folderPath: "/",
      createdAt: "2026-06-12T12:00:00Z",
      modifiedAt: "2026-06-12T12:00:00Z",
    }
    const mocks = await setupAdminCloudMocks(page, {
      lookupOnlyFiles: [completedVideo],
      videoCompletedFileId: completedVideo.id,
      videoSessionStatus: "COMPLETED",
    })
    const largeVideo = Buffer.alloc(101 * 1024 * 1024)
    Buffer.from([0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70]).copy(largeVideo)
    const largeVideoPath = testInfo.outputPath("대용량 교육 영상.mp4")
    writeFileSync(largeVideoPath, largeVideo)

    await page.goto("/admin/cloud")
    await page.evaluate(() => {
      const originalGetItem = Storage.prototype.getItem
      Storage.prototype.getItem = function getItemWithCompletedVideoSession(key: string) {
        if (key.startsWith("aquila-cloud-video-upload-session")) return "301"
        return originalGetItem.call(this, key)
      }
    })
    await page.getByLabel("클라우드 파일 업로드").setInputFiles(largeVideoPath)

    await expect.poll(() => mocks.videoSessionGets).toEqual(["301"])
    await expect(page.getByLabel("업로드 중인 파일").getByText("완료", { exact: true })).toBeVisible()
    await expect(page.getByRole("row", { name: /대용량 교육 영상\.mp4/ })).toBeVisible()
    expect(mocks.videoSessionCreates).toEqual([])
    expect(mocks.videoPartNumbers).toEqual([])
    expect(mocks.videoCompletes).toEqual([])
    expect(mocks.videoCancels).toEqual([])
  })

  test("사진 선택 시 상세 패널은 이미지 요청을 즉시 시작하고 텍스트 로딩 상태를 숨긴다", async ({ page }) => {
    const mocks = await setupAdminCloudMocks(page, { contentDelayMs: 450 })

    await page.addInitScript(() => {
      Object.assign(window, { __adminCloudPhotoLoadingTextSeen: false })

      const markIfLoadingTextExists = () => {
        if (document.body?.textContent?.includes("사진을 불러오는 중입니다.")) {
          Object.assign(window, { __adminCloudPhotoLoadingTextSeen: true })
        }
      }

      const startObserver = () => {
        markIfLoadingTextExists()
        new MutationObserver(markIfLoadingTextExists).observe(document.documentElement, {
          characterData: true,
          childList: true,
          subtree: true,
        })
      }

      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", startObserver, { once: true })
      } else {
        startObserver()
      }
    })

    await page.goto("/admin/cloud")
    await page.locator('button[title="home-server-rack.png"]').click()

    await expect(page.getByRole("heading", { name: "사진 보기" })).toBeVisible()
    await expect(page.getByText("사진을 불러오는 중입니다.")).toHaveCount(0)
    await expect.poll(() => mocks.requestedContentIds).toContain("102")
    await expect(page.getByAltText("home-server-rack.png")).toBeVisible()
    await expect(page.getByLabel("home-server-rack.png 사진 미리보기")).toHaveAttribute("aria-busy", "false")
    await expect.poll(() => page.evaluate(() => Boolean((window as any).__adminCloudPhotoLoadingTextSeen))).toBe(false)
    await expect(page.getByText("사진을 불러오는 중입니다.")).toHaveCount(0)
  })

  test("개별 삭제 없이 선택 삭제 모달은 확인 전 API 호출을 막고 툴바 레이아웃을 유지한다", async ({ page }) => {
    const mocks = await setupAdminCloudMocks(page, { initialFiles: CLOUD_FILES })

    await page.goto("/admin/cloud")

    const longFileRow = page.getByRole("row", { name: /NCS기반 채용 직무설명자료.*게시\.pdf/ })
    await expect(longFileRow).toBeVisible()
    await expect(longFileRow.getByRole("button", { name: /삭제/ })).toHaveCount(0)
    await longFileRow.getByRole("checkbox", { name: /NCS기반 채용 직무설명자료.*게시\.pdf 선택/ }).check()
    await page.getByRole("button", { name: "선택 삭제" }).click()

    const dialog = page.getByRole("dialog", { name: "파일 삭제" })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText(/NCS기반 채용 직무설명자료.*게시\.pdf/)).toBeVisible()
    await expect(dialog.getByRole("button", { name: "취소" })).toBeFocused()
    await page.keyboard.press("Tab")
    await expect(dialog.getByRole("button", { name: "삭제" })).toBeFocused()
    await page.keyboard.press("Tab")
    await expect(dialog.getByRole("button", { name: "취소" })).toBeFocused()
    expect(mocks.deletedIds).toEqual([])

    const uploadButton = page.locator('button[aria-label="파일 업로드"]').first()
    await expect(uploadButton).toHaveCSS("white-space", "nowrap")
    const uploadButtonBox = await uploadButton.boundingBox()
    expect(uploadButtonBox).not.toBeNull()
    expect(uploadButtonBox!.height).toBeLessThanOrEqual(38)

    await dialog.getByRole("button", { name: "취소" }).click()
    await expect(dialog).toHaveCount(0)
    expect(mocks.deletedIds).toEqual([])

    await page.getByRole("button", { name: "선택 삭제" }).click()
    await expect(page.getByRole("dialog", { name: "파일 삭제" })).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(page.getByRole("dialog", { name: "파일 삭제" })).toHaveCount(0)
    expect(mocks.deletedIds).toEqual([])

    await page.getByRole("button", { name: "선택 삭제" }).click()
    await page.getByRole("dialog", { name: "파일 삭제" }).getByRole("button", { name: "삭제" }).click()
    await expect.poll(() => mocks.deletedIds).toContain("104")
    await expect(page.getByRole("status").filter({ hasText: /삭제 완료/ })).toBeVisible()
    await expect(page.getByRole("row", { name: /NCS기반 채용 직무설명자료.*게시\.pdf/ })).toHaveCount(0)
  })

  test("긴 파일명과 업로드 완료 상태는 목록과 하단 업로드 패널에서 겹치지 않는다", async ({ page }) => {
    const mocks = await setupAdminCloudMocks(page, { initialFiles: CLOUD_FILES })

    await page.goto("/admin/cloud")

    const longFileRow = page.getByRole("row", { name: /NCS기반 채용 직무설명자료.*게시\.pdf/ })
    await expect(longFileRow).toBeVisible()
    const longFileName = longFileRow.locator('button[title$="게시.pdf"]')
    await expect(longFileName).toHaveAttribute("title", /게시\.pdf$/)
    await expect(longFileRow.getByLabel("문서")).toHaveText("PDF")
    await expect(longFileRow.getByRole("button", { name: /미리보기/ })).toHaveCount(0)

    await longFileName.click()
    await expect(page.getByRole("heading", { name: "문서 뷰어" })).toBeVisible()
    await expectPdfPreviewFitsDetailPanel(page, /NCS기반 채용 직무설명자료.*PDF 미리보기/)

    await page.getByLabel("클라우드 파일 업로드").setInputFiles({
      name: "★2026년 제3회 식약처 공무원(일반직) 경력경쟁채용시험 공고문_게시_긴파일명_상태겹침방지.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 long upload"),
    })
    await expect.poll(() => mocks.uploadedClientFilenames).toContain(
      "★2026년 제3회 식약처 공무원(일반직) 경력경쟁채용시험 공고문_게시_긴파일명_상태겹침방지.pdf"
    )

    const uploadPanel = page.getByLabel("업로드 중인 파일")
    await expect(uploadPanel.getByText(/상태겹침방지\.pdf/)).toBeVisible()
    const donePill = uploadPanel.getByText("완료", { exact: true })
    await expect(donePill).toBeVisible()
    await expect(page.getByText(/상태겹침방지\.pdf 업로드 완료/)).toHaveCount(0)
    const queueItemBox = await uploadPanel.getByText(/상태겹침방지\.pdf/).boundingBox()
    const donePillBox = await donePill.boundingBox()
    expect(queueItemBox).not.toBeNull()
    expect(donePillBox).not.toBeNull()
    expect(queueItemBox!.x + queueItemBox!.width).toBeLessThanOrEqual(donePillBox!.x + 2)
  })

  test("선택된 긴 PDF 행은 이름 셀 안의 종류 배지와 파일명 포커스가 명확하다", async ({ page }) => {
    await setupAdminCloudMocks(page, { initialFiles: CLOUD_FILES })

    await page.goto("/admin/cloud")

    const selectedRow = page.getByRole("row", { name: /운영 점검 리포트\.pdf/ })
    await expect(selectedRow).toBeVisible()
    await selectedRow.locator('button[title="운영 점검 리포트.pdf"]').click()
    const nameCell = selectedRow.locator("td").nth(2)
    const typeBadge = selectedRow.getByLabel("문서")
    await expect(typeBadge).toHaveText("PDF")
    await expect(nameCell.getByLabel("문서")).toBeVisible()

    const badgeBox = await typeBadge.boundingBox()
    const thumbnailBox = await selectedRow.locator('[data-kind="DOCUMENT"]').first().boundingBox()
    const selectedRowBox = await selectedRow.boundingBox()
    const selectedAccentCell = selectedRow.locator("td").first()
    expect(badgeBox).not.toBeNull()
    expect(thumbnailBox).not.toBeNull()
    expect(selectedRowBox).not.toBeNull()
    expect(badgeBox!.width).toBeGreaterThan(30)
    expect(badgeBox!.height).toBeGreaterThan(18)
    expect(thumbnailBox!.width).toBeGreaterThan(40)
    expect(thumbnailBox!.x).toBeGreaterThan(selectedRowBox!.x)
    await expect(selectedAccentCell).toHaveCSS("border-left-color", "rgb(88, 166, 255)")

    const nameButton = selectedRow.locator('button[title="운영 점검 리포트.pdf"]')
    await nameButton.focus()
    await expect(nameButton).toHaveCSS("outline-style", "none")
    await expect(nameButton).toHaveCSS("border-radius", "0px")
    await expect(nameButton).toHaveCSS("box-shadow", /rgb\(88, 166, 255\)/)

    await expect(selectedRow.getByRole("button", { name: /미리보기/ })).toHaveCount(0)
    await expect(selectedRow.getByRole("button", { name: "운영 점검 리포트.pdf 삭제" })).toHaveCount(0)
  })

  test("파일이 많은 목록은 상세정보를 드로어로 열어 목록 폭을 유지한다", async ({ page }) => {
    const manyFiles = Array.from({ length: 9 }, (_, index): CloudFileFixture => ({
      id: 300 + index,
      ownerMemberId: 1,
      originalFilename: `density-${index + 1}.png`,
      contentType: "image/png",
      byteSize: 32_768 + index,
      mediaKind: "PHOTO",
      folderPath: "/photos",
      createdAt: "2026-06-12T10:00:00Z",
      modifiedAt: "2026-06-12T10:00:00Z",
    }))
    await setupAdminCloudMocks(page, { initialFiles: manyFiles })

    await page.goto("/admin/cloud")

    const tableBoxBefore = await page.getByRole("table").boundingBox()
    await expect(page.getByLabel("클라우드 상세정보")).toHaveCount(0)
    await page.locator('button[title="density-1.png"]').click()

    const detailPanel = page.getByLabel("클라우드 상세정보")
    await expect(detailPanel).toBeVisible()
    await expect(detailPanel).toHaveCSS("position", "fixed")
    const tableBoxAfter = await page.getByRole("table").boundingBox()
    expect(tableBoxBefore).not.toBeNull()
    expect(tableBoxAfter).not.toBeNull()
    expect(Math.abs(tableBoxAfter!.width - tableBoxBefore!.width)).toBeLessThanOrEqual(2)
  })

  test("작은 화면 첫 진입은 상세정보 드로어로 파일 목록을 가리지 않는다", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await setupAdminCloudMocks(page, { initialFiles: CLOUD_FILES.slice(0, 2) })

    await page.goto("/admin/cloud")

    const firstRow = page.getByRole("row", { name: /운영 점검 리포트\.pdf/ })
    await expect(firstRow).toBeVisible()
    await expect(firstRow).not.toHaveAttribute("data-selected", "true")
    await expect(page.getByLabel("클라우드 상세정보")).toHaveCount(0)
    await page.locator('button[title="운영 점검 리포트.pdf"]').click()
    await expect(page.getByLabel("클라우드 상세정보")).toHaveCSS("position", "fixed")
  })

  test("작은 화면 빈 목록의 첫 업로드는 열린 상세정보를 유지한다", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await setupAdminCloudMocks(page, { initialFiles: [] })

    await page.goto("/admin/cloud")
    await page.getByLabel("클라우드 파일 업로드").setInputFiles({
      name: "모바일 첫 업로드.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 first mobile upload"),
    })

    await expect(page.getByRole("row", { name: /모바일 첫 업로드\.pdf/ })).toBeVisible()
    await expect(page.getByLabel("클라우드 상세정보")).toHaveCSS("position", "fixed")
    await expect(page.getByLabel("클라우드 상세정보").getByText("모바일 첫 업로드.pdf")).toBeVisible()
  })

  test("관리자 클라우드 진입만으로 알림 snapshot 백그라운드 요청을 시작하지 않는다", async ({ page }) => {
    let snapshotRequestCount = 0
    await page.addInitScript(() => {
      window.requestIdleCallback = (callback) => {
        window.setTimeout(() => callback({ didTimeout: false, timeRemaining: () => 50 }), 0)
        return 1
      }
      window.cancelIdleCallback = () => {}
    })
    await setupAdminCloudMocks(page, { initialFiles: CLOUD_FILES })
    await page.route("**/member/api/v1/notifications/snapshot", async (route) => {
      snapshotRequestCount += 1
      await route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({ resultCode: "502-1", msg: "bad gateway" }),
      })
    })

    await page.goto("/admin/cloud")
    await expect(page.getByRole("heading", { name: "미디어 라이브러리" })).toBeVisible()
    await page.waitForTimeout(250)

    expect(snapshotRequestCount).toBe(0)
  })

  test("선택 삭제 일부 실패 시 성공 항목만 목록에서 제거하고 실패 알림을 유지한다", async ({ page }) => {
    const mocks = await setupAdminCloudMocks(page, { failDeleteIds: ["102"] })

    await page.goto("/admin/cloud")

    await page.getByRole("checkbox", { name: "운영 점검 리포트.pdf 선택" }).check()
    await page.getByRole("checkbox", { name: "home-server-rack.png 선택" }).check()
    await page.getByRole("button", { name: "선택 삭제" }).click()
    await expect(page.getByRole("dialog", { name: "파일 삭제" })).toBeVisible()
    expect(mocks.deletedIds).toEqual([])
    await page.getByRole("dialog", { name: "파일 삭제" }).getByRole("button", { name: "삭제" }).click()

    await expect.poll(() => mocks.deletedIds).toContain("101")
    await expect(page.getByRole("status").filter({ hasText: "1개 삭제 완료, 1개 실패" })).toBeVisible()
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

  test("클라우드 업로드 413 실패는 파일 용량 안내를 표시한다", async ({ page }) => {
    await setupAdminCloudMocks(page, {
      failUploadNames: ["대용량 포트폴리오.pdf"],
      failUploadStatusByName: {
        "대용량 포트폴리오.pdf": 413,
      },
      initialFiles: [],
    })

    await page.goto("/admin/cloud")

    await page.getByLabel("클라우드 파일 업로드").setInputFiles({
      name: "대용량 포트폴리오.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 oversized upload"),
    })

    const uploadPanel = page.getByLabel("업로드 중인 파일")
    await expect(uploadPanel.getByRole("heading", { name: "항목 1개 업로드 실패/취소" })).toBeVisible()
    await expect(uploadPanel.getByText(/파일 용량이 너무 큽니다/)).toBeVisible()
  })

  test("업로드 재시도 성공 시 이전 실패 알림은 작업 영역에 남지 않는다", async ({ page }) => {
    await setupAdminCloudMocks(page, {
      failUploadOnceNames: ["재시도 성공 문서.pdf"],
      initialFiles: [],
    })

    await page.goto("/admin/cloud")

    await page.getByLabel("클라우드 파일 업로드").setInputFiles({
      name: "재시도 성공 문서.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 retry upload"),
    })

    const uploadPanel = page.getByLabel("업로드 중인 파일")
    await expect(page.getByText(/재시도 성공 문서\.pdf 업로드 실패/)).toBeVisible()
    await uploadPanel.getByRole("button", { name: "재시도 성공 문서.pdf 업로드 다시 시도" }).click()

    await expect(uploadPanel.getByText("완료", { exact: true })).toBeVisible()
    await expect(page.getByText(/재시도 성공 문서\.pdf 업로드 실패/)).toHaveCount(0)
    await expect(page.getByText("재시도 성공 문서.pdf 업로드 완료")).toHaveCount(0)
    await expect(page.getByRole("row", { name: /재시도 성공 문서\.pdf/ })).toBeVisible()
  })

  test("PDF 파일명은 업로드 직후 클라이언트 원본명으로 보이고 렌더링 지연 문구를 노출하지 않는다", async ({ page }) => {
    const sourceName = "★2026년 제3회 식약처 공무원(일반직) 경력경쟁채용시험 공고문_게시.pdf"
    const damagedServerName = "_2026__ __3__ ___________________.pdf"
    await setupAdminCloudMocks(page, {
      initialFiles: [],
      uploadResponseFilenames: {
        [sourceName]: damagedServerName,
      },
    })

    await page.goto("/admin/cloud")
    await page.getByLabel("클라우드 파일 업로드").setInputFiles({
      name: sourceName,
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 filename fallback"),
    })

    await expect(page.getByLabel("업로드 중인 파일").getByText(sourceName)).toBeVisible()
    const escapedSourceName = sourceName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    await expect(page.getByRole("row", { name: new RegExp(escapedSourceName) })).toBeVisible()
    await expect(page.getByRole("row", { name: /___________________\.pdf/ })).toHaveCount(0)
    await expect(page.getByRole("heading", { name: "문서 뷰어" })).toBeVisible()
    await expect(page.getByLabel("클라우드 상세정보").getByText(sourceName)).toBeVisible()
    await expect(page.getByText(/렌더링 중|렌더링 대기|렌더링 준비|미리보기 준비|미리보기 대기/)).toHaveCount(0)
  })

  test("서버가 정상 정규화한 업로드 파일명은 클라이언트 원본명으로 덮어쓰지 않는다", async ({ page }) => {
    const clientName = "서버 정규화    문서.pdf"
    const serverName = "서버 정규화 문서.pdf"
    await setupAdminCloudMocks(page, {
      initialFiles: [],
      uploadResponseFilenames: {
        [clientName]: serverName,
      },
    })

    await page.goto("/admin/cloud")
    await page.getByLabel("클라우드 파일 업로드").setInputFiles({
      name: clientName,
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 normalized filename"),
    })

    await expect(page.getByRole("row", { name: new RegExp(serverName) })).toBeVisible()
    await expect(page.getByRole("row", { name: /서버 정규화 {4}문서\.pdf/ })).toHaveCount(0)
    await expect(page.getByLabel("클라우드 상세정보").getByText(serverName)).toBeVisible()
  })

  test("손상된 서버 응답의 클라이언트 파일명 fallback은 보이지 않는 제어문자를 제거한다", async ({ page }) => {
    const clientName = "보고서\u202Ecod.exe.pdf"
    const displayName = "보고서cod.exe.pdf"
    await setupAdminCloudMocks(page, {
      initialFiles: [],
      uploadResponseFilenames: {
        [clientName]: "______.pdf",
      },
    })

    await page.goto("/admin/cloud")
    await page.getByLabel("클라우드 파일 업로드").setInputFiles({
      name: clientName,
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 sanitized fallback filename"),
    })

    await expect(page.getByRole("row", { name: new RegExp(displayName) })).toBeVisible()
    await expect(page.getByRole("row", { name: /보고서.*cod\.exe\.pdf/ })).toHaveCount(1)
    await expect(page.getByLabel("클라우드 상세정보").getByText(displayName)).toBeVisible()
  })
})
