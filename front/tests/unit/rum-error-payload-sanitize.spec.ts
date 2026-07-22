import { expect, test } from "@playwright/test"
import { ApiError } from "../../src/apis/backend/client"
import {
  extractStackTop,
  resolveErrorMessageFromUnknown,
  sanitizeErrorMessage,
  toUrlPathOnly,
} from "../../src/libs/rum/errorPayloadSanitize"
import handler from "../../src/pages/api/rum/client-errors"
import { reportClientError } from "../../src/libs/rum/reportClientError"

test("sanitizeErrorMessage strips url/email and truncates to 200 chars", () => {
  const long = `boom https://evil.example/a?token=1 contact me@example.com ${"x".repeat(250)}`
  const sanitized = sanitizeErrorMessage(long)
  expect(sanitized).not.toContain("https://")
  expect(sanitized).not.toContain("me@example.com")
  expect(sanitized).toContain("[url]")
  expect(sanitized).toContain("[email]")
  expect(sanitized.length).toBeLessThanOrEqual(200)
})

test("extractStackTop keeps only top 5 basename frames", () => {
  const error = new Error("render failed")
  error.stack = [
    "Error: render failed",
    "    at Object.render (https://cdn.example.com/assets/app.js:12:3)",
    "    at run (https://cdn.example.com/chunk/page.js:45:1)",
    "    at nested (https://cdn.example.com/chunk/page.js:90:2)",
    "    at deep (https://cdn.example.com/chunk/page.js:100:2)",
    "    at deeper (https://cdn.example.com/chunk/page.js:110:2)",
    "    at deepest (https://cdn.example.com/chunk/page.js:120:2)",
    "    at ignored (https://cdn.example.com/chunk/page.js:130:2)",
  ].join("\n")

  const stackTop = extractStackTop(error)
  const frames = stackTop.split("|")
  expect(frames).toHaveLength(5)
  expect(frames[0]).toBe("Object.render@app.js:12")
  expect(stackTop).not.toContain("https://")
  expect(stackTop).not.toContain("deepest")
})

test("reportClientError fills sanitized payload fields and category", () => {
  const previousWindow = (globalThis as { window?: unknown }).window
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    writable: true,
    value: {
      location: { pathname: "/posts/1" },
      __AQUILA_CLIENT_ERROR_REPORTS__: [] as Array<Record<string, unknown>>,
    },
  })

  try {
    const error = new ApiError(
      500,
      "https://api.example.com/post/api/v1/posts/1?token=secret",
      JSON.stringify({ msg: "서버 오류" }),
      "req-abc"
    )
    error.stack = "Error: 서버 오류\n    at fetchPost (https://cdn.example.com/app.js:9:1)"

    reportClientError({
      id: "err_payload_1",
      boundary: "global",
      surface: "app",
      error,
      requestId: "req-abc",
    })

    const latest = window.__AQUILA_CLIENT_ERROR_REPORTS__?.at(-1)
    expect(latest).toMatchObject({
      id: "err_payload_1",
      requestId: "req-abc",
      category: "server",
      errorMessage: "서버 오류",
      stackTop: "fetchPost@app.js:9",
    })
    expect(JSON.stringify(latest)).not.toContain("token=secret")
    expect(resolveErrorMessageFromUnknown(error)).toBe("서버 오류")
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

test("client-errors route allowlists and truncates expanded fields", () => {
  const logs: unknown[] = []
  const originalInfo = console.info
  console.info = (...args: unknown[]) => {
    logs.push(args)
  }

  try {
    const res = {
      statusCode: 200,
      setHeader() {
        return undefined
      },
      status(code: number) {
        this.statusCode = code
        return this
      },
      json() {
        return this
      },
      end() {
        return this
      },
    }

    handler(
      {
        method: "POST",
        body: {
          id: "err_route_expand_1",
          boundary: "global",
          surface: "app",
          path: "/posts/1",
          errorName: "ApiError",
          occurredAt: "2026-07-22T00:00:00.000Z",
          requestId: "req-1",
          errorMessage: `fail https://evil.example/x ${"y".repeat(220)}`,
          stackTop: "fn@app.js:1|other@page.js:2",
          category: "server",
          status: 503,
          url: "/post/api/v1/posts/1",
        },
      } as never,
      res as never,
    )

    expect(res.statusCode).toBe(204)
    expect(logs.length).toBe(1)
    const payload = (logs[0] as unknown[])[1] as {
      errorMessage?: string
      stackTop?: string
      category?: string
      status?: number
      url?: string
    }
    expect(payload.category).toBe("server")
    expect(payload.status).toBe(503)
    expect(payload.url).toBe("/post/api/v1/posts/1")
    expect(payload.stackTop).toBe("fn@app.js:1|other@page.js:2")
    expect(payload.errorMessage).toContain("[url]")
    expect(payload.errorMessage?.length).toBeLessThanOrEqual(200)
    expect(payload.errorMessage).not.toContain("https://")
  } finally {
    console.info = originalInfo
  }
})

test("toUrlPathOnly drops query string", () => {
  expect(toUrlPathOnly("https://api.example.com/post/api/v1/posts/1?x=1")).toBe(
    "/post/api/v1/posts/1"
  )
  expect(toUrlPathOnly("/member/api/v1/auth/me?next=/home")).toBe("/member/api/v1/auth/me")
})
