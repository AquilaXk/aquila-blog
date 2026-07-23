import { expect, test } from "@playwright/test"
import handler from "../../src/pages/api/rum/client-errors"
import { reportClientError } from "../../src/libs/rum/reportClientError"

test("reportClientError payload includes truncated requestId", () => {
  const previousWindow = (globalThis as { window?: unknown }).window
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    writable: true,
    value: {
      location: { pathname: "/settings/account" },
      __AQUILA_CLIENT_ERROR_REPORTS__: [] as Array<{ requestId?: string }>,
    },
  })

  try {
    const longId = `req-${"a".repeat(80)}`
    reportClientError({
      id: "err_test_1",
      boundary: "global",
      surface: "app",
      error: new Error("boom"),
      requestId: longId,
    })

    const latest = window.__AQUILA_CLIENT_ERROR_REPORTS__?.at(-1)
    expect(latest?.requestId).toBe(longId.slice(0, 64))
    expect(latest?.requestId?.length).toBe(64)
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

test("client-errors route allowlists and truncates requestId", () => {
  const logs: unknown[] = []
  const originalInfo = console.info
  console.info = (...args: unknown[]) => {
    logs.push(args)
  }

  try {
    const longId = `req-${"b".repeat(80)}`
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
          id: "err_route_1",
          boundary: "surface",
          surface: "editor",
          path: "/admin/posts",
          errorName: "ApiError",
          occurredAt: "2026-07-22T00:00:00.000Z",
          requestId: longId,
        },
      } as never,
      res as never,
    )

    expect(res.statusCode).toBe(204)
    expect(logs.length).toBe(1)
    const payload = (logs[0] as unknown[])[1] as { requestId?: string }
    expect(payload.requestId).toBe(longId.slice(0, 64))
  } finally {
    console.info = originalInfo
  }
})
