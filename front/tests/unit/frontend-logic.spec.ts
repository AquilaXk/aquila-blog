import { expect, test } from "@playwright/test"
import { ApiError } from "../../src/apis/backend/client"
import {
  isDefinitiveStaleVideoUploadSessionError,
  isExplicitUploadAbort,
} from "../../src/apis/backend/cloud"
import {
  buildExploreCursorPath,
  buildFeedCursorPath,
  toValidPage,
  toValidPageSize,
} from "../../src/apis/backend/posts/PostApiRequestModel"
import { shouldFetchAuthSession } from "../../src/hooks/useAuthSession"
import { normalizeApiRequestPath } from "../../src/libs/backend/requestPath"
import { parseMarkdownSegments } from "../../src/libs/markdown/renderingSegmentModel"
import {
  hasOptionalTrackingConsent,
  OPTIONAL_TRACKING_CONSENT_STORAGE_KEY,
  readOptionalTrackingConsent,
} from "../../src/libs/privacy/optionalTrackingConsentCore"
import { normalizeNextPath } from "../../src/libs/router"

const createStorage = (): Storage => {
  const store = new Map<string, string>()
  return {
    get length() {
      return store.size
    },
    clear() {
      store.clear()
    },
    getItem(key: string) {
      return store.get(key) ?? null
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null
    },
    removeItem(key: string) {
      store.delete(key)
    },
    setItem(key: string, value: string) {
      store.set(key, value)
    },
  }
}

const setGlobal = (key: "window" | "navigator", value: unknown) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, key)
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value,
    writable: true,
  })
  return () => {
    if (previous) {
      Object.defineProperty(globalThis, key, previous)
    } else {
      delete (globalThis as Record<string, unknown>)[key]
    }
  }
}

const withBrowserState = (run: (storage: Storage, navigatorValue: { globalPrivacyControl?: boolean }) => void) => {
  const storage = createStorage()
  const navigatorValue = {
    doNotTrack: "0",
    globalPrivacyControl: false,
    sendBeacon: () => true,
  }
  const restoreWindow = setGlobal("window", {
    dispatchEvent: () => true,
    localStorage: storage,
    location: { origin: "http://localhost" },
    navigator: navigatorValue,
  })
  const restoreNavigator = setGlobal("navigator", navigatorValue)

  try {
    run(storage, navigatorValue)
  } finally {
    restoreNavigator()
    restoreWindow()
  }
}

test.describe("frontend pure logic contracts", () => {
  test("safe redirect paths reject external and data-route inputs", () => {
    expect(normalizeNextPath("/admin/posts?tag=release")).toBe("/admin/posts?tag=release")
    expect(normalizeNextPath("//evil.example/path", "/")).toBe("/")
    expect(normalizeNextPath("https://evil.example/path", "/")).toBe("/")
    expect(normalizeNextPath("/_next/data/build-id/posts/42.json?next=https%3A%2F%2Fevil.example&tag=qa")).toBe(
      "/posts/42?tag=qa"
    )
  })

  test("backend request paths stay allow-listed and relative", () => {
    expect(normalizeApiRequestPath("/post/api/v1/posts/feed/cursor?cursor=abc")).toBe(
      "/post/api/v1/posts/feed/cursor?cursor=abc"
    )
    expect(normalizeApiRequestPath("/signup/api/v1/email/start")).toBe("/signup/api/v1/email/start")
    expect(() => normalizeApiRequestPath("https://api.example.com/member/api/v1/auth/me")).toThrow(
      /Absolute URL/
    )
    expect(() => normalizeApiRequestPath("/post/api/v1/%E0%A4%A/admin")).toThrow(/Path traversal/)
    expect(() => normalizeApiRequestPath("/internal/health")).toThrow(/allow-listed/)
  })

  test("markdown card URLs keep safe values and strip unsafe values", () => {
    const segments = parseMarkdownSegments(`<!-- aq-bookmark {"thumbnailUrl":"javascript:alert(1)"} -->
:::bookmark javascript:alert(1)
Unsafe
description
:::

<!-- aq-embed {"embedUrl":"https://www.youtube.com/embed/abc"} -->
:::embed https://www.youtube.com/watch?v=abc
Safe
caption
:::`)

    const bookmark = segments.find((segment) => segment.type === "bookmark")
    const embed = segments.find((segment) => segment.type === "embed")

    expect(bookmark).toMatchObject({ type: "bookmark", url: "" })
    expect(bookmark).not.toHaveProperty("thumbnailUrl")
    expect(embed).toMatchObject({
      type: "embed",
      embedUrl: "https://www.youtube.com/embed/abc",
      url: "https://www.youtube.com/watch?v=abc",
    })
  })

  test("upload recovery predicates separate stale sessions from transient failures", () => {
    expect(isDefinitiveStaleVideoUploadSessionError(new ApiError(404, "/upload-session", ""))).toBe(true)
    expect(isDefinitiveStaleVideoUploadSessionError(new ApiError(410, "/upload-session", ""))).toBe(true)
    expect(isDefinitiveStaleVideoUploadSessionError(new ApiError(503, "/upload-session", ""))).toBe(false)

    const abortController = new AbortController()
    abortController.abort()
    expect(isExplicitUploadAbort(new Error("network closed"), abortController.signal)).toBe(true)
    expect(isExplicitUploadAbort(new DOMException("Upload aborted", "AbortError"))).toBe(true)
    expect(isExplicitUploadAbort(new Error("network closed"))).toBe(false)
  })

  test("optional tracking consent respects stored state and browser opt-out", () => {
    withBrowserState((storage, navigatorValue) => {
      expect(readOptionalTrackingConsent()).toBeNull()

      storage.setItem(
        OPTIONAL_TRACKING_CONSENT_STORAGE_KEY,
        JSON.stringify({
          categories: { analytics: true, rum: true },
          source: "settings",
          state: "granted",
          updatedAt: "2026-06-29T00:00:00.000Z",
          version: 1,
        })
      )

      expect(readOptionalTrackingConsent()).toMatchObject({ state: "granted" })
      expect(hasOptionalTrackingConsent()).toBe(true)
      navigatorValue.globalPrivacyControl = true
      expect(hasOptionalTrackingConsent()).toBe(false)
    })
  })

  test("auth session fetch decision preserves cached anonymous and member states", () => {
    expect(
      shouldFetchAuthSession({
        anonymousProbeSuppressed: false,
        hasCachedAnonymousSnapshot: false,
        hasCachedMemberSnapshot: true,
        hasCachedSnapshot: true,
        serverProbeSnapshot: false,
      })
    ).toBe(true)
    expect(
      shouldFetchAuthSession({
        anonymousProbeSuppressed: false,
        hasCachedAnonymousSnapshot: true,
        hasCachedMemberSnapshot: false,
        hasCachedSnapshot: true,
        serverProbeSnapshot: false,
      })
    ).toBe(false)
    expect(
      shouldFetchAuthSession({
        anonymousProbeSuppressed: true,
        hasCachedAnonymousSnapshot: false,
        hasCachedMemberSnapshot: false,
        hasCachedSnapshot: false,
        serverProbeSnapshot: undefined,
      })
    ).toBe(false)
    expect(
      shouldFetchAuthSession({
        anonymousProbeSuppressed: false,
        hasCachedAnonymousSnapshot: false,
        hasCachedMemberSnapshot: false,
        hasCachedSnapshot: false,
        serverProbeSnapshot: true,
      })
    ).toBe(true)
  })

  test("post pagination builders clamp page size and trim cursors", () => {
    expect(toValidPage(Number.NaN)).toBe(1)
    expect(toValidPage(-5)).toBe(1)
    expect(toValidPageSize(99)).toBe(30)
    expect(toValidPageSize(-5)).toBe(1)
    expect(buildFeedCursorPath({ cursor: "  abc  ", order: "asc", pageSize: 99 })).toBe(
      "/post/api/v1/posts/feed/cursor?sort=CREATED_AT_ASC&pageSize=30&cursor=abc"
    )
    expect(buildExploreCursorPath({ cursor: "", tag: "  TypeScript  ", pageSize: 2 })).toBe(
      "/post/api/v1/posts/explore/cursor?tag=TypeScript&sort=CREATED_AT&pageSize=2"
    )
  })
})
