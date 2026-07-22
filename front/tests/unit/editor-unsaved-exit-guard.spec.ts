import { expect, test } from "@playwright/test"
import {
  captureEditorRouteNavigationIntent,
  defaultEditorRouteNavigationIntent,
  EDITOR_UNSAVED_CHANGES_MESSAGE,
  isEditorUnsavedDirtyByFingerprint,
  isForcedEditorExitUrl,
  isSamePathEditorSurfaceNavigation,
  resolveEditorRouteNavigationRetry,
  restoreEditorUrlAfterBlockedHistoryPop,
} from "../../src/routes/Admin/editorStudioUnsavedExitGuard"

test.describe("editor unsaved exit guard helpers", () => {
  test("detects dirty from fingerprint diffs even when title and body are empty", () => {
    const pristine = '{"title":"","content":"","meta":"pristine"}'
    const metaOnly = '{"title":"","content":"","meta":"tags-changed"}'
    const clearedEdit = '{"title":"","content":"","meta":"cleared"}'
    const serverBaseline = '{"title":"Saved","content":"Body","meta":"ok"}'
    const localSaved = '{"title":"Draft","content":"","meta":"ok"}'

    expect(
      isEditorUnsavedDirtyByFingerprint({
        isSaving: false,
        editorMode: "create",
        hasSelectedManagedPost: false,
        editorStateFingerprint: pristine,
        serverBaselineFingerprint: "",
        localDraftFingerprint: "",
        localDraftSavedAt: "",
        pristineCreateFingerprint: pristine,
      })
    ).toBe(false)

    expect(
      isEditorUnsavedDirtyByFingerprint({
        isSaving: false,
        editorMode: "create",
        hasSelectedManagedPost: false,
        editorStateFingerprint: metaOnly,
        serverBaselineFingerprint: "",
        localDraftFingerprint: "",
        localDraftSavedAt: "",
        pristineCreateFingerprint: pristine,
      })
    ).toBe(true)

    expect(
      isEditorUnsavedDirtyByFingerprint({
        isSaving: false,
        editorMode: "edit",
        hasSelectedManagedPost: true,
        editorStateFingerprint: clearedEdit,
        serverBaselineFingerprint: serverBaseline,
        localDraftFingerprint: "",
        localDraftSavedAt: "",
        pristineCreateFingerprint: pristine,
      })
    ).toBe(true)

    expect(
      isEditorUnsavedDirtyByFingerprint({
        isSaving: false,
        editorMode: "create",
        hasSelectedManagedPost: false,
        editorStateFingerprint: localSaved,
        serverBaselineFingerprint: "",
        localDraftFingerprint: localSaved,
        localDraftSavedAt: "2026-07-22T01:00:00.000Z",
        pristineCreateFingerprint: pristine,
      })
    ).toBe(false)

    // Unrestored local draft metadata must not make pristine /editor/new dirty
    // (that would block the automatic replace to /editor/{id}).
    expect(
      isEditorUnsavedDirtyByFingerprint({
        isSaving: false,
        editorMode: "create",
        hasSelectedManagedPost: false,
        editorStateFingerprint: pristine,
        serverBaselineFingerprint: "",
        localDraftFingerprint: localSaved,
        localDraftSavedAt: "2026-07-22T01:00:00.000Z",
        pristineCreateFingerprint: pristine,
      })
    ).toBe(false)

    expect(
      isEditorUnsavedDirtyByFingerprint({
        isSaving: false,
        editorMode: "create",
        hasSelectedManagedPost: false,
        editorStateFingerprint: metaOnly,
        serverBaselineFingerprint: "",
        localDraftFingerprint: localSaved,
        localDraftSavedAt: "2026-07-22T01:00:00.000Z",
        pristineCreateFingerprint: pristine,
      })
    ).toBe(true)

    expect(
      isEditorUnsavedDirtyByFingerprint({
        isSaving: true,
        editorMode: "create",
        hasSelectedManagedPost: false,
        editorStateFingerprint: pristine,
        serverBaselineFingerprint: "",
        localDraftFingerprint: "",
        localDraftSavedAt: "",
        pristineCreateFingerprint: pristine,
      })
    ).toBe(true)
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

  test("restores editor URL after a blocked history pop without guessing direction", () => {
    const calls: string[] = []
    const history = {
      pushState: (_state: unknown, _unused: string, url?: string | URL | null) => {
        calls.push(String(url ?? ""))
      },
    }

    restoreEditorUrlAfterBlockedHistoryPop("/editor/1?surface=compose", history)
    expect(calls).toEqual(["/editor/1?surface=compose"])
    expect(() => restoreEditorUrlAfterBlockedHistoryPop("/editor/1", null)).not.toThrow()
  })
})
