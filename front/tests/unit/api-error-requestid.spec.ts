import { expect, test } from "@playwright/test"
import { ApiError, ApiTimeoutError, apiFetch } from "../../src/apis/backend/client"

test("ApiError.requestId keeps constructor value and normalizes blanks", () => {
  expect(new ApiError(500, "/x", "", "req-abc").requestId).toBe("req-abc")
  expect(new ApiError(500, "/x", "", "  req-abc  ").requestId).toBe("req-abc")
  expect(new ApiError(500, "/x", "").requestId).toBeNull()
  expect(new ApiError(500, "/x", "", "   ").requestId).toBeNull()
  expect(new ApiTimeoutError("/x", 1_000).requestId).toBeNull()
})

test("apiFetch fills ApiError.requestId from x-request-id response header", async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ msg: "권한이 없습니다." }), {
      status: 403,
      headers: {
        "content-type": "application/json",
        "x-request-id": "  7f3c2a1b-4d5e-6789-abcd-ef0123456789  ",
      },
    })) as typeof fetch

  try {
    await apiFetch("/member/api/v1/auth/me")
    throw new Error("expected apiFetch to reject")
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).requestId).toBe("7f3c2a1b-4d5e-6789-abcd-ef0123456789")
    expect((error as ApiError).userMessage).toBe("권한이 없습니다.")
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("apiFetch sets ApiError.requestId null when x-request-id is absent", async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ msg: "권한이 없습니다." }), {
      status: 403,
      headers: {
        "content-type": "application/json",
      },
    })) as typeof fetch

  try {
    await apiFetch("/member/api/v1/auth/me")
    throw new Error("expected apiFetch to reject")
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).requestId).toBeNull()
  } finally {
    globalThis.fetch = originalFetch
  }
})
