import { expect, test } from "@playwright/test"
import {
  captureEditorRouteNavigationIntent,
  defaultEditorRouteNavigationIntent,
  EDITOR_UNSAVED_CHANGES_MESSAGE,
  isEditorUnsavedDirtyLabel,
  isForcedEditorExitUrl,
  isSamePathEditorSurfaceNavigation,
  resolveEditorRouteNavigationRetry,
} from "../../src/routes/Admin/editorStudioUnsavedExitGuard"

test.describe("editor unsaved exit guard helpers", () => {
  test("treats dirty and in-flight save labels as unsaved", () => {
    expect(isEditorUnsavedDirtyLabel("저장되지 않은 변경")).toBe(true)
    expect(isEditorUnsavedDirtyLabel("저장 중")).toBe(true)
    expect(isEditorUnsavedDirtyLabel("자동 저장됨")).toBe(false)
    expect(isEditorUnsavedDirtyLabel("저장됨")).toBe(false)
    expect(isEditorUnsavedDirtyLabel("")).toBe(false)
  })

  test("allows forced login redirects without blocking", () => {
    expect(isForcedEditorExitUrl("/login")).toBe(true)
    expect(isForcedEditorExitUrl("/login?next=%2Feditor%2F1")).toBe(true)
    expect(isForcedEditorExitUrl("/editor/1")).toBe(false)
    expect(isForcedEditorExitUrl("/admin/posts")).toBe(false)
  })

  test("allows same-pathname surface query updates without treating them as leaving", () => {
    expect(
      isSamePathEditorSurfaceNavigation(
        "/editor/1?surface=compose",
        "/editor/1?surface=manage"
      )
    ).toBe(true)
    expect(
      isSamePathEditorSurfaceNavigation("/editor/1?surface=compose", "/editor/1")
    ).toBe(true)
    expect(
      isSamePathEditorSurfaceNavigation("/editor/1?surface=compose", "/editor/2?surface=manage")
    ).toBe(false)
    expect(isSamePathEditorSurfaceNavigation("/editor/1", "/admin/posts")).toBe(false)
  })

  test("keeps a stable user-facing unsaved message", () => {
    expect(EDITOR_UNSAVED_CHANGES_MESSAGE).toContain("저장되지 않은 변경")
  })

  test("captures push and replace navigation intent with transition options", () => {
    expect(captureEditorRouteNavigationIntent("push")).toEqual({ method: "push" })
    expect(captureEditorRouteNavigationIntent("replace", { shallow: true, scroll: false })).toEqual({
      method: "replace",
      shallow: true,
      scroll: false,
    })
  })

  test("retries blocked navigation with the captured method and options", () => {
    expect(resolveEditorRouteNavigationRetry("/admin/posts", null)).toEqual({
      url: "/admin/posts",
      method: "push",
      options: {},
    })
    expect(
      resolveEditorRouteNavigationRetry("/editor/1?panel=preview", {
        method: "replace",
        shallow: true,
        scroll: false,
      })
    ).toEqual({
      url: "/editor/1?panel=preview",
      method: "replace",
      options: { shallow: true, scroll: false },
    })
    expect(
      resolveEditorRouteNavigationRetry("/editor/2", defaultEditorRouteNavigationIntent())
    ).toEqual({
      url: "/editor/2",
      method: "push",
      options: {},
    })
  })
})
