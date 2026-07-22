import { expect, test } from "@playwright/test"
import {
  ApiError,
  ApiNetworkError,
  ApiTimeoutError,
} from "../../src/apis/backend/client"
import {
  reportApiError,
  shouldReportApiError,
  wasApiErrorReported,
} from "../../src/libs/rum/reportApiError"
import { reportClientError } from "../../src/libs/rum/reportClientError"

test("shouldReportApiError reports all 5xx and never 4xx", () => {
  expect(shouldReportApiError(new ApiError(500, "/x", ""))).toBe(true)
  expect(shouldReportApiError(new ApiError(503, "/x", ""))).toBe(true)
  expect(shouldReportApiError(new ApiError(400, "/x", ""))).toBe(false)
  expect(shouldReportApiError(new ApiError(404, "/x", ""))).toBe(false)
  expect(shouldReportApiError(new ApiError(429, "/x", ""))).toBe(false)
})

test("shouldReportApiError samples network and timeout at 10%", () => {
  expect(shouldReportApiError(new ApiNetworkError("/x"), () => 0.099)).toBe(true)
  expect(shouldReportApiError(new ApiNetworkError("/x"), () => 0.1)).toBe(false)
  expect(shouldReportApiError(new ApiTimeoutError("/x", 1_000), () => 0)).toBe(true)
  expect(shouldReportApiError(new ApiTimeoutError("/x", 1_000), () => 0.5)).toBe(false)
})

test("reportApiError records sanitized api payload once and skips boundary double report", () => {
  const previousWindow = (globalThis as { window?: unknown }).window
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    writable: true,
    value: {
      location: { pathname: "/settings" },
      __AQUILA_API_ERROR_REPORTS__: [] as Array<Record<string, unknown>>,
      __AQUILA_CLIENT_ERROR_REPORTS__: [] as Array<Record<string, unknown>>,
    },
  })

  try {
    const error = new ApiError(
      502,
      "https://api.example.com/post/api/v1/posts/9?draft=1",
      JSON.stringify({ msg: "실패 https://leak.example/a user@x.com" }),
      "req-502"
    )
    error.stack = "ApiError: boom\n    at load (https://cdn.example.com/bundle.js:3:4)"

    reportApiError(error, { random: () => 0 })
    reportApiError(error, { random: () => 0 })

    expect(wasApiErrorReported(error)).toBe(true)
    expect(window.__AQUILA_API_ERROR_REPORTS__).toHaveLength(1)
    expect(window.__AQUILA_API_ERROR_REPORTS__?.[0]).toMatchObject({
      category: "server",
      status: 502,
      url: "/post/api/v1/posts/9",
      requestId: "req-502",
      stackTop: "load@bundle.js:3",
    })
    expect(window.__AQUILA_API_ERROR_REPORTS__?.[0]?.errorMessage).toContain("[url]")
    expect(window.__AQUILA_API_ERROR_REPORTS__?.[0]?.errorMessage).toContain("[email]")
    expect(JSON.stringify(window.__AQUILA_API_ERROR_REPORTS__?.[0])).not.toContain("draft=1")

    reportClientError({
      id: "err_boundary_dup",
      boundary: "global",
      surface: "app",
      error,
    })
    expect(window.__AQUILA_CLIENT_ERROR_REPORTS__).toHaveLength(0)
  } finally {
    if (previousWindow === undefined) {
      delete (globalThis as { window?: unknown }).window
    } else {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        writable: true,
        value: previousWindow,
      })
    }
  }
})

test("reportApiError records network url path from ApiNetworkError", () => {
  const previousWindow = (globalThis as { window?: unknown }).window
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    writable: true,
    value: {
      location: { pathname: "/settings" },
      __AQUILA_API_ERROR_REPORTS__: [] as Array<Record<string, unknown>>,
    },
  })

  try {
    const error = new ApiNetworkError("https://api.example.com/post/api/v1/posts/3?draft=1")
    reportApiError(error, { random: () => 0 })

    expect(window.__AQUILA_API_ERROR_REPORTS__).toHaveLength(1)
    expect(window.__AQUILA_API_ERROR_REPORTS__?.[0]).toMatchObject({
      errorName: "ApiNetworkError",
      category: "network",
      url: "/post/api/v1/posts/3",
    })
    expect(JSON.stringify(window.__AQUILA_API_ERROR_REPORTS__?.[0])).not.toContain("draft=1")
  } finally {
    if (previousWindow === undefined) {
      delete (globalThis as { window?: unknown }).window
    } else {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        writable: true,
        value: previousWindow,
      })
    }
  }
})

test("reportApiError does not record 4xx", () => {
  const previousWindow = (globalThis as { window?: unknown }).window
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    writable: true,
    value: {
      location: { pathname: "/" },
      __AQUILA_API_ERROR_REPORTS__: [] as Array<Record<string, unknown>>,
    },
  })

  try {
    reportApiError(new ApiError(403, "/member/api/v1/auth/me", ""), { random: () => 0 })
    expect(window.__AQUILA_API_ERROR_REPORTS__).toHaveLength(0)
  } finally {
    if (previousWindow === undefined) {
      delete (globalThis as { window?: unknown }).window
    } else {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        writable: true,
        value: previousWindow,
      })
    }
  }
})
