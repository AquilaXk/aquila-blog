import { expect, test } from "@playwright/test"

import { isLegalReconsentGateUrl, isNavigationInterruptedError, resolveApiBaseUrl } from "./helpers/liveAuth"

test.describe("live auth navigation helper", () => {
  test("treats Playwright net ERR_ABORTED as a retriable navigation interruption", () => {
    const error = new Error(
      [
        "page.goto: net::ERR_ABORTED at https://blog.aquilaxk.site/editor/new",
        "Call log:",
        '  - navigating to "https://blog.aquilaxk.site/editor/new", waiting until "load"',
      ].join("\n")
    )

    expect(isNavigationInterruptedError(error)).toBe(true)
  })

  test("does not hide unrelated navigation failures", () => {
    const error = new Error("page.goto: net::ERR_NAME_NOT_RESOLVED at https://blog.aquilaxk.site/editor/new")

    expect(isNavigationInterruptedError(error)).toBe(false)
  })

  test("detects legal reconsent gate urls", () => {
    expect(isLegalReconsentGateUrl("https://blog.aquilaxk.site/settings/privacy?reconsent=required")).toBe(true)
    expect(isLegalReconsentGateUrl("https://blog.aquilaxk.site/settings/privacy")).toBe(false)
    expect(isLegalReconsentGateUrl("https://blog.aquilaxk.site/editor/new")).toBe(false)
  })

  test("uses the production web origin for the API while preserving localhost's explicit port", () => {
    expect(resolveApiBaseUrl("https://blog.aquilaxk.site/editor/new")).toBe("https://blog.aquilaxk.site")
    expect(resolveApiBaseUrl("https://www.aquilaxk.site/editor/new")).toBe("https://www.aquilaxk.site")
    expect(resolveApiBaseUrl("http://127.0.0.1:3100/editor/new")).toBe("http://127.0.0.1:8080")
  })
})
