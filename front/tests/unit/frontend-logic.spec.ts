import { expect, test } from "@playwright/test"
import { readFileSync } from "node:fs"
import path from "node:path"
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
import { getSearchDebounceMs } from "../../src/hooks/useDebouncedValue"
import {
  DASHBOARD_COLLECTION_FAILED_LABEL,
  DASHBOARD_DATA_MISSING_LABEL,
  formatDashboardFreshnessLabel,
  isDashboardQueryCollectionFailed,
  resolveDashboardCollectionLabel,
  resolveDashboardDataUpdatedAt,
} from "../../src/routes/Admin/AdminDashboardWorkspaceModel"
import { normalizeApiRequestPath } from "../../src/libs/backend/requestPath"
import { parseMarkdownSegments } from "../../src/libs/markdown/renderingSegmentModel"
import {
  hasOptionalTrackingConsent,
  OPTIONAL_TRACKING_CONSENT_STORAGE_KEY,
  readOptionalTrackingConsent,
} from "../../src/libs/privacy/optionalTrackingConsentCore"
import { normalizeNextPath } from "../../src/libs/router"
import {
  isCloudSearchPending,
  resolveCloudEmptyTitle,
  shouldShowCloudEmptyLoading,
} from "../../src/routes/Admin/AdminCloudWorkspaceModel"

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
    expect(buildFeedCursorPath({ sortMode: "views", pageSize: 24 })).toBe(
      "/post/api/v1/posts/feed/cursor?sort=HIT_COUNT&pageSize=24"
    )
  })

  test("search debounce delay adapts by keyword length", () => {
    expect(getSearchDebounceMs("")).toBe(0)
    expect(getSearchDebounceMs("  ")).toBe(0)
    expect(getSearchDebounceMs("한")).toBe(120)
    expect(getSearchDebounceMs("검색어")).toBe(180)
    expect(getSearchDebounceMs("프로젝트스크린샷")).toBe(240)
  })

  test("cloud empty state follows debounced search and fetch status", () => {
    const baseInput = {
      activeUploadCount: 0,
      debouncedKeyword: "",
      filter: "ALL" as const,
      isError: false,
      isFetching: false,
      isLoading: false,
      keyword: "",
    }

    expect(isCloudSearchPending("deploy", "depl")).toBe(true)
    expect(isCloudSearchPending("deploy", "deploy")).toBe(false)

    expect(
      resolveCloudEmptyTitle({
        ...baseInput,
        keyword: "deploy",
      })
    ).toBe("검색 중입니다.")

    expect(
      resolveCloudEmptyTitle({
        ...baseInput,
        debouncedKeyword: "deploy",
        keyword: "deploy",
      })
    ).toBe("선택한 조건에 맞는 파일이 없습니다.")

    expect(
      resolveCloudEmptyTitle({
        ...baseInput,
        debouncedKeyword: "deploy",
        isFetching: true,
        keyword: "deploy",
      })
    ).toBe("검색 중입니다.")

    expect(
      resolveCloudEmptyTitle({
        ...baseInput,
        debouncedKeyword: "deploy",
        keyword: "",
      })
    ).toBe("검색 중입니다.")

    expect(shouldShowCloudEmptyLoading({ filesCount: 0, isLoading: false, isSearchPending: true })).toBe(true)
    expect(shouldShowCloudEmptyLoading({ filesCount: 2, isLoading: false, isSearchPending: true })).toBe(false)
  })

  test("dashboard freshness uses min dataUpdatedAt as HH:mm 기준", () => {
    const older = Date.UTC(2026, 6, 22, 2, 5, 0)
    const newer = Date.UTC(2026, 6, 22, 2, 17, 0)
    expect(resolveDashboardDataUpdatedAt(0, newer, older)).toBe(older)
    expect(formatDashboardFreshnessLabel(older)).toMatch(/^\d{2}:\d{2} 기준$/)
    expect(resolveDashboardCollectionLabel({ isError: true, hasData: true })).toBe(
      DASHBOARD_COLLECTION_FAILED_LABEL
    )
    expect(resolveDashboardCollectionLabel({ isError: false, isRefetchError: true, hasData: true })).toBe(
      DASHBOARD_COLLECTION_FAILED_LABEL
    )
    expect(resolveDashboardCollectionLabel({ isError: false, hasData: false })).toBe(
      DASHBOARD_DATA_MISSING_LABEL
    )
    expect(resolveDashboardCollectionLabel({ isError: false, hasData: true })).toBeNull()
    expect(isDashboardQueryCollectionFailed({ isError: false, isRefetchError: true })).toBe(true)
    expect(isDashboardQueryCollectionFailed({ isError: true, isRefetchError: false })).toBe(true)
    expect(isDashboardQueryCollectionFailed({ isError: false, isRefetchError: false })).toBe(false)
  })

  test("dashboard collection failure flags stay scoped per query", () => {
    const pageSource = readFileSync(
      path.resolve(__dirname, "../../src/routes/Admin/AdminDashboardWorkspacePage.tsx"),
      "utf8"
    )
    const viewSource = readFileSync(
      path.resolve(__dirname, "../../src/routes/Admin/AdminDashboardWorkspaceView.tsx"),
      "utf8"
    )

    expect(pageSource).toContain("healthCollectionFailed = isDashboardQueryCollectionFailed(systemHealthQuery)")
    expect(pageSource).toContain("snapshotCollectionFailed = isDashboardQueryCollectionFailed(dashboardSnapshotQuery)")
    expect(pageSource).toContain("collectionFailed = healthCollectionFailed || snapshotCollectionFailed")
    expect(pageSource).toContain("isManualRefreshing")
    expect(pageSource).toContain("isRefreshing = isManualRefreshing")
    expect(pageSource).not.toContain("isRefreshing = systemHealthQuery.isFetching")
    expect(viewSource).toContain("snapshotCollectionFailed")
    expect(viewSource).not.toMatch(/Public read latency[\s\S]*collectionFailed \?/)
    expect(viewSource).not.toMatch(/Live logs[\s\S]*collectionFailed \?/)
  })
})
