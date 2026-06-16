import { EventEmitter } from "node:events"
import { expect, test } from "@playwright/test"
import handler from "../src/pages/api/backend/[...path]"

type CapturedFetch = {
  url: string
  headers: Headers
}

const createMockResponse = () => {
  const response = {
    statusCode: 200,
    headers: new Map<string, string | string[]>(),
    ended: false,
    status(code: number) {
      this.statusCode = code
      return this
    },
    setHeader(key: string, value: string | string[]) {
      this.headers.set(key, value)
      return this
    },
    write() {
      return true
    },
    end() {
      this.ended = true
      return this
    },
    json(body: unknown) {
      this.setHeader("content-type", "application/json")
      this.end()
      return body
    },
  }
  return response
}

const invokeBackendProxy = async (headers: Record<string, string | string[]>) => {
  const previousBackendUrl = process.env.BACKEND_INTERNAL_URL
  const previousFetch = globalThis.fetch
  const captured: CapturedFetch[] = []
  process.env.BACKEND_INTERNAL_URL = "http://backend.internal"
  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    captured.push({
      url: String(url),
      headers: new Headers(init?.headers),
    })
    return new Response(null, { status: 204 })
  }) as typeof fetch

  try {
    const req = Object.assign(new EventEmitter(), {
      method: "GET",
      headers,
      query: { path: ["member", "api", "v1", "auth", "login"] },
      url: "/api/backend/member/api/v1/auth/login",
      socket: { remoteAddress: "10.0.0.8" },
      pause() {
        return this
      },
    })
    const res = createMockResponse()

    await handler(req as never, res as never)

    return { captured, res }
  } finally {
    if (previousBackendUrl === undefined) delete process.env.BACKEND_INTERNAL_URL
    else process.env.BACKEND_INTERNAL_URL = previousBackendUrl
    globalThis.fetch = previousFetch
  }
}

test.describe("backend proxy forwarded header boundary", () => {
  test("strips spoofable forwarding headers before upstream fetch", async () => {
    const { captured, res } = await invokeBackendProxy({
      host: "www.aquilaxk.site",
      cookie: "accessToken=token",
      "x-forwarded-for": "203.0.113.9",
      "x-forwarded-host": "evil.example",
      "x-forwarded-proto": "http",
      "x-real-ip": "203.0.113.10",
      "cf-connecting-ip": "203.0.113.11",
      "true-client-ip": "203.0.113.12",
      forwarded: "for=203.0.113.13;proto=http;host=evil.example",
    })

    expect(res.statusCode).toBe(204)
    expect(captured).toHaveLength(1)
    const headers = captured[0].headers

    expect(headers.get("cookie")).toBe("accessToken=token")
    expect(headers.get("x-forwarded-host")).toBe("www.aquilaxk.site")
    expect(headers.get("x-forwarded-proto")).toBe("https")
    expect(headers.get("x-forwarded-for")).toBe("10.0.0.8")
    expect(headers.get("x-real-ip")).toBeNull()
    expect(headers.get("cf-connecting-ip")).toBeNull()
    expect(headers.get("true-client-ip")).toBeNull()
    expect(headers.get("forwarded")).toBeNull()
  })
})
