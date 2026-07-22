import { expect, test } from "@playwright/test"
import {
  activateScheduledForcedEditorExitIfMatching,
  allowForcedEditorExitRoute,
  captureEditorRouteNavigationIntent,
  clearActiveForcedEditorExitUrl,
  clearForcedEditorExitUrl,
  clearScheduledForcedEditorExitUrl,
  defaultEditorRouteNavigationIntent,
  EDITOR_UNSAVED_CHANGES_MESSAGE,
  isEditorStudioBootstrapNavigation,
  isEditorUnsavedDirtyByFingerprint,
  isForcedEditorExitUrl,
  isSamePathEditorSurfaceNavigation,
  markForcedEditorExitUrl,
  scheduleForcedEditorExitUrl,
  resolveEditorRouteNavigationRetry,
  restoreEditorUrlAfterBlockedHistoryPop,
  shouldBlockEditorBeforeUnload,
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
    clearForcedEditorExitUrl()
    expect(isForcedEditorExitUrl("/login")).toBe(true)
    expect(isForcedEditorExitUrl("/login?next=%2Feditor%2F1")).toBe(true)
    expect(isForcedEditorExitUrl("/editor/1")).toBe(false)
    expect(isForcedEditorExitUrl("/admin/posts")).toBe(false)
  })

  test("allows marked admin-loss home redirect but not ordinary home navigation", () => {
    clearForcedEditorExitUrl()
    expect(isForcedEditorExitUrl("/")).toBe(false)
    expect(isForcedEditorExitUrl("/?utm=1")).toBe(false)

    markForcedEditorExitUrl("/")
    expect(isForcedEditorExitUrl("/")).toBe(true)
    expect(isForcedEditorExitUrl("/?utm=1")).toBe(true)
    expect(isForcedEditorExitUrl("/admin/posts")).toBe(false)
    expect(isForcedEditorExitUrl("/login")).toBe(true)

    clearForcedEditorExitUrl()
    expect(isForcedEditorExitUrl("/")).toBe(false)
  })

  test("scheduled forced exit does not bypass until router navigation activates it", () => {
    clearForcedEditorExitUrl()
    scheduleForcedEditorExitUrl("/")

    // Async gap before router.replace: user click to `/` must stay guarded.
    expect(isForcedEditorExitUrl("/")).toBe(false)
    expect(isForcedEditorExitUrl("/?utm=1")).toBe(false)

    activateScheduledForcedEditorExitIfMatching("/")
    expect(isForcedEditorExitUrl("/")).toBe(true)

    clearForcedEditorExitUrl()
  })

  test("clears stale scheduled mark when forced redirect never reaches router", () => {
    clearForcedEditorExitUrl()
    scheduleForcedEditorExitUrl("/")
    clearScheduledForcedEditorExitUrl()

    expect(isForcedEditorExitUrl("/")).toBe(false)
    markForcedEditorExitUrl("/")
    expect(allowForcedEditorExitRoute("/")).toBe(true)
    expect(isForcedEditorExitUrl("/")).toBe(false)
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

  test("allows studio bootstrap navigation from /editor/new to /editor/{id}", () => {
    expect(isEditorStudioBootstrapNavigation("/editor/new", "/editor/42")).toBe(true)
    expect(
      isEditorStudioBootstrapNavigation("/editor/new?source=local-draft", "/editor/42?returnTo=%2Fadmin%2Fposts")
    ).toBe(true)
    expect(isEditorStudioBootstrapNavigation("/editor/new", "/editor/new")).toBe(false)
    expect(isEditorStudioBootstrapNavigation("/editor/new", "/admin/posts")).toBe(false)
    expect(isEditorStudioBootstrapNavigation("/editor/1", "/editor/2")).toBe(false)
  })

  test("active clear on route abort preserves scheduled forced-exit marks", () => {
    clearForcedEditorExitUrl()
    markForcedEditorExitUrl("/")
    scheduleForcedEditorExitUrl("/")
    // Unrelated abort must drop only the in-flight active mark.
    clearActiveForcedEditorExitUrl()
    expect(isForcedEditorExitUrl("/")).toBe(false)

    activateScheduledForcedEditorExitIfMatching("/")
    expect(isForcedEditorExitUrl("/")).toBe(true)

    clearForcedEditorExitUrl()
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

  test("consumes forced-exit mark on clean early-return navigation paths", () => {
    clearForcedEditorExitUrl()
    markForcedEditorExitUrl("/")

    expect(allowForcedEditorExitRoute("/")).toBe(true)
    expect(isForcedEditorExitUrl("/")).toBe(false)
    expect(allowForcedEditorExitRoute("/")).toBe(false)

    markForcedEditorExitUrl("/")
    expect(allowForcedEditorExitRoute("/admin/posts")).toBe(false)
    expect(isForcedEditorExitUrl("/")).toBe(true)
    clearForcedEditorExitUrl()
  })

  test("skips beforeunload prompt when forced-exit bypass is active", () => {
    expect(shouldBlockEditorBeforeUnload(true, false)).toBe(true)
    expect(shouldBlockEditorBeforeUnload(true, true)).toBe(false)
    expect(shouldBlockEditorBeforeUnload(false, false)).toBe(false)
    expect(shouldBlockEditorBeforeUnload(false, true)).toBe(false)
  })

  test("restores editor URL after a blocked history pop with preserved Next history state", () => {
    const calls: Array<{ state: unknown; url: string }> = []
    const editorNextState = {
      url: "/editor/1?surface=compose",
      as: "/editor/1?surface=compose",
      options: {},
      __N: true,
      key: "editor-key",
    }
    const destinationState = {
      url: "/admin/posts",
      as: "/admin/posts",
      options: {},
      __N: true,
      key: "dest-key",
    }
    const history = {
      state: destinationState,
      pushState: (state: unknown, _unused: string, url?: string | URL | null) => {
        calls.push({ state, url: String(url ?? "") })
      },
    }

    restoreEditorUrlAfterBlockedHistoryPop(
      "/editor/1?surface=compose",
      history,
      editorNextState
    )
    expect(calls).toEqual([{ state: editorNextState, url: "/editor/1?surface=compose" }])

    calls.length = 0
    restoreEditorUrlAfterBlockedHistoryPop("/editor/1", history)
    expect(calls).toEqual([{ state: destinationState, url: "/editor/1" }])

    expect(() => restoreEditorUrlAfterBlockedHistoryPop("/editor/1", null)).not.toThrow()
  })
})
