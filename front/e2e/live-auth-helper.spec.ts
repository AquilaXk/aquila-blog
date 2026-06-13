import { expect, test } from "@playwright/test"

import { isNavigationInterruptedError } from "./helpers/liveAuth"

test.describe("live auth navigation helper", () => {
  test("treats Playwright net ERR_ABORTED as a retriable navigation interruption", () => {
    const error = new Error(
      [
        "page.goto: net::ERR_ABORTED at https://www.aquilaxk.site/editor/new",
        "Call log:",
        '  - navigating to "https://www.aquilaxk.site/editor/new", waiting until "load"',
      ].join("\n")
    )

    expect(isNavigationInterruptedError(error)).toBe(true)
  })

  test("does not hide unrelated navigation failures", () => {
    const error = new Error("page.goto: net::ERR_NAME_NOT_RESOLVED at https://www.aquilaxk.site/editor/new")

    expect(isNavigationInterruptedError(error)).toBe(false)
  })
})
