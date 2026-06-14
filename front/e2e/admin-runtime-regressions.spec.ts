import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { expect, test } from "@playwright/test"

const readFrontSource = (relativePath: string) =>
  readFileSync(path.resolve(__dirname, "../src", relativePath), "utf8")

test.describe("관리자 런타임 회귀 계약", () => {
  test("운영 브라우저 API는 로그인과 관리자 요청을 same-origin 백엔드 프록시로 보낸다", () => {
    const clientSource = readFrontSource("apis/backend/client.ts")
    const proxySourcePath = path.resolve(__dirname, "../src/pages/api/backend/[...path].ts")

    expect(clientSource).toContain('const BROWSER_BACKEND_PROXY_PREFIX = "/api/backend"')
    expect(clientSource).toContain("const shouldUseBrowserBackendProxy = (safePath: string) =>")
    expect(clientSource).toContain('process.env.NODE_ENV === "production"')
    expect(clientSource).toContain("safePath.startsWith(\"/member/api/v1/auth/\")")
    expect(clientSource).toContain("safePath.startsWith(\"/system/api/v1/adm/\")")
    expect(clientSource).toContain("return `${BROWSER_BACKEND_PROXY_PREFIX}${safePath}`")

    expect(existsSync(proxySourcePath)).toBe(true)
    const proxySource = readFileSync(proxySourcePath, "utf8")
    expect(proxySource).toContain("bodyParser: false")
    expect(proxySource).toContain("normalizeApiRequestPath")
    expect(proxySource).toContain("resolveServerApiBaseUrl")
    expect(proxySource).toContain('headers.set("X-Forwarded-Host"')
    expect(proxySource).toContain('duplex: "half"')
  })

  test("클라우드 목록과 업로드는 프록시 가능한 URL 생성기를 공유한다", () => {
    const cloudSource = readFrontSource("apis/backend/cloud.ts")

    expect(cloudSource).toContain('import { apiFetch, getApiRequestUrl } from "./client"')
    expect(cloudSource).toContain("getApiRequestUrl(`/system/api/v1/adm/cloud/files/${fileId}/content`)")
    expect(cloudSource).not.toContain("getApiBaseUrl")
  })

  test("새로고침 전 첫 페인트는 저장된 테마나 시스템 다크 모드를 먼저 적용한다", () => {
    const documentSource = readFrontSource("pages/_document.tsx")
    const schemeSource = readFrontSource("hooks/useScheme.ts")

    expect(documentSource).toContain("AQUILA_SCHEME_BOOTSTRAP_SCRIPT")
    expect(documentSource).toContain('document.documentElement.dataset.aquilaScheme = nextScheme')
    expect(documentSource).toContain("prefers-color-scheme: dark")
    expect(documentSource).toContain("colorScheme = nextScheme")
    expect(schemeSource).toContain("resolveInitialBrowserScheme")
    expect(schemeSource).toContain('window.matchMedia?.("(prefers-color-scheme: dark)")?.matches')
  })
})
