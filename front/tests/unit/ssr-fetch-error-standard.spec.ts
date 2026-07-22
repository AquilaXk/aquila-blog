import { expect, test } from "@playwright/test"
import type { IncomingMessage } from "http"
import { ApiError, ApiNetworkError, ApiTimeoutError } from "../../src/apis/backend/client"
import { readAdminProtectedBootstrap } from "../../src/libs/server/adminPage"
import { serverApiFetchJson } from "../../src/libs/server/backend"

const originalFetch = globalThis.fetch
const originalBackendInternalUrl = process.env.BACKEND_INTERNAL_URL
const originalNodeEnv = process.env.NODE_ENV

const createReq = (cookie = ""): IncomingMessage =>
  ({
    headers: { cookie },
    url: "/admin",
  }) as IncomingMessage

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })

test.beforeEach(() => {
  process.env.BACKEND_INTERNAL_URL = "http://backend.test"
  process.env.NODE_ENV = "test"
})

test.afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalBackendInternalUrl === undefined) delete process.env.BACKEND_INTERNAL_URL
  else process.env.BACKEND_INTERNAL_URL = originalBackendInternalUrl
  process.env.NODE_ENV = originalNodeEnv
})

test("serverApiFetchJson returns parsed JSON on success", async () => {
  globalThis.fetch = (async () => jsonResponse(200, { ok: true, value: 1 })) as typeof fetch

  await expect(serverApiFetchJson<{ ok: boolean; value: number }>(createReq(), "/member/api/v1/auth/me")).resolves.toEqual({
    ok: true,
    value: 1,
  })
})

test("serverApiFetchJson throws ApiError with status/body/userMessage on HTTP failure", async () => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ msg: "권한이 없습니다." }), {
      status: 403,
      headers: { "content-type": "application/json" },
    })) as typeof fetch

  try {
    await serverApiFetchJson(createReq(), "/system/api/v1/adm/bootstrap")
    throw new Error("expected ApiError")
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError)
    const apiError = error as ApiError
    expect(apiError.status).toBe(403)
    expect(apiError.userMessage).toBe("권한이 없습니다.")
    expect(apiError.body).toContain("권한이 없습니다.")
  }
})

test("serverApiFetchJson wraps JSON Content-Type parse failure as ApiError", async () => {
  globalThis.fetch = (async () =>
    new Response("{not-json", {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as typeof fetch

  try {
    await serverApiFetchJson(createReq(), "/member/api/v1/auth/me")
    throw new Error("expected ApiError")
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(200)
  }
})

test("serverApiFetchJson wraps transport TypeError as ApiNetworkError", async () => {
  globalThis.fetch = (async () => {
    throw new TypeError("fetch failed")
  }) as typeof fetch

  await expect(serverApiFetchJson(createReq(), "/member/api/v1/auth/me")).rejects.toBeInstanceOf(ApiNetworkError)
})

test("serverApiFetchJson wraps abort timeout as ApiTimeoutError", async () => {
  globalThis.fetch = ((_input, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(new DOMException("The operation was aborted.", "AbortError"))
      })
    })) as typeof fetch

  await expect(
    serverApiFetchJson(createReq(), "/member/api/v1/auth/me", { timeoutMs: 1 })
  ).rejects.toBeInstanceOf(ApiTimeoutError)
})

test("admin bootstrap 401 without auth cookie redirects to login", async () => {
  globalThis.fetch = (async () => jsonResponse(401, { msg: "unauthorized" })) as typeof fetch

  await expect(readAdminProtectedBootstrap(createReq(), "/member/api/v1/adm/members/bootstrap", "/admin")).resolves.toEqual({
    ok: false,
    destination: "/login?next=%2Fadmin",
  })
})

test("admin bootstrap 403 without auth cookie redirects home", async () => {
  globalThis.fetch = (async () => jsonResponse(403, { msg: "forbidden" })) as typeof fetch

  await expect(readAdminProtectedBootstrap(createReq(), "/member/api/v1/adm/members/bootstrap", "/admin")).resolves.toEqual({
    ok: false,
    destination: "/",
  })
})

test("admin bootstrap 5xx throws instead of destination null", async () => {
  globalThis.fetch = (async () => jsonResponse(503, { msg: "unavailable" })) as typeof fetch

  try {
    await readAdminProtectedBootstrap(createReq("apiKey=test"), "/member/api/v1/adm/members/bootstrap", "/admin")
    throw new Error("expected ApiError")
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(503)
  }
})

test("admin bootstrap network failure throws instead of destination null", async () => {
  globalThis.fetch = (async () => {
    throw new TypeError("fetch failed")
  }) as typeof fetch

  await expect(
    readAdminProtectedBootstrap(createReq("apiKey=test"), "/member/api/v1/adm/members/bootstrap", "/admin")
  ).rejects.toBeInstanceOf(ApiNetworkError)
})
