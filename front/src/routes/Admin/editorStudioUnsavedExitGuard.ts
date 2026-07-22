export const EDITOR_UNSAVED_CHANGES_MESSAGE =
  "저장되지 않은 변경이 있습니다. 이 페이지를 나가면 변경 내용이 사라질 수 있습니다."

export type EditorUnsavedDirtyFingerprintInput = {
  isSaving: boolean
  editorMode: "create" | "edit"
  hasSelectedManagedPost: boolean
  editorStateFingerprint: string
  serverBaselineFingerprint: string
  localDraftFingerprint: string
  localDraftSavedAt: string
  pristineCreateFingerprint: string
}

/**
 * Dirty for exit-guard purposes: compare fingerprints, not persistence display text.
 * Empty title+body must still block when meta (or cleared edit baseline) differs.
 *
 * Create-mode local drafts: `localDraftSavedAt` alone means "restore available", not that
 * the draft is loaded into the editor. Only use the local-draft fingerprint as baseline
 * after the editor has left the pristine create state (restored, autosaved, or edited).
 */
export const isEditorUnsavedDirtyByFingerprint = ({
  isSaving,
  editorMode,
  hasSelectedManagedPost,
  editorStateFingerprint,
  serverBaselineFingerprint,
  localDraftFingerprint,
  localDraftSavedAt,
  pristineCreateFingerprint,
}: EditorUnsavedDirtyFingerprintInput): boolean => {
  if (isSaving) return true

  if (editorMode === "edit") {
    if (hasSelectedManagedPost) {
      return editorStateFingerprint !== serverBaselineFingerprint
    }
    return editorStateFingerprint !== pristineCreateFingerprint
  }

  const hasActiveLocalDraftBaseline =
    Boolean(localDraftSavedAt) && editorStateFingerprint !== pristineCreateFingerprint
  if (hasActiveLocalDraftBaseline) {
    return editorStateFingerprint !== localDraftFingerprint
  }
  return editorStateFingerprint !== pristineCreateFingerprint
}

const editorRoutePathname = (url: string) => url.split(/[?#]/)[0] || ""

/**
 * Explicit forced-exit bypass for non-login destinations (e.g. admin-loss → `/`).
 * Login stays URL-based; home must not bypass on ordinary user clicks.
 */
let forcedEditorExitPath: string | null = null

/** Mark the next matching navigation as a forced exit (admin-loss redirect, etc.). */
export const markForcedEditorExitUrl = (url: string) => {
  forcedEditorExitPath = editorRoutePathname(url)
}

/** Clear a pending forced-exit mark (tests / cleanup). */
export const clearForcedEditorExitUrl = () => {
  forcedEditorExitPath = null
}

/** Consume the mark once the matching forced navigation is allowed through. */
export const consumeForcedEditorExitUrl = (url: string) => {
  const path = editorRoutePathname(url)
  if (forcedEditorExitPath !== null && path === forcedEditorExitPath) {
    forcedEditorExitPath = null
  }
}

/** Next router / hard login / marked forced redirects that must not be blocked. */
export const isForcedEditorExitUrl = (url: string) => {
  const path = editorRoutePathname(url)
  if (path === "/login" || path.startsWith("/login/")) return true
  return forcedEditorExitPath !== null && path === forcedEditorExitPath
}

/** Same-pathname query/hash updates (compose/manage surface sync) are not leaving. */
export const isSamePathEditorSurfaceNavigation = (currentUrl: string, nextUrl: string) =>
  editorRoutePathname(currentUrl) === editorRoutePathname(nextUrl)

export type EditorRouteNavigationMethod = "push" | "replace"

export type EditorRouteNavigationIntent = {
  method: EditorRouteNavigationMethod
  shallow?: boolean
  scroll?: boolean
}

export type EditorRouteNavigationRetry = {
  url: string
  method: EditorRouteNavigationMethod
  options: { shallow?: boolean; scroll?: boolean }
}

type EditorRouteTransitionOptions = {
  shallow?: boolean
  scroll?: boolean
}

export const defaultEditorRouteNavigationIntent = (): EditorRouteNavigationIntent => ({
  method: "push",
})

export const captureEditorRouteNavigationIntent = (
  method: EditorRouteNavigationMethod,
  options?: EditorRouteTransitionOptions
): EditorRouteNavigationIntent => ({
  method,
  ...(typeof options?.shallow === "boolean" ? { shallow: options.shallow } : {}),
  ...(typeof options?.scroll === "boolean" ? { scroll: options.scroll } : {}),
})

export const buildEditorRouteNavigationOptions = (
  intent: EditorRouteNavigationIntent
): EditorRouteNavigationRetry["options"] => {
  const options: EditorRouteNavigationRetry["options"] = {}
  if (typeof intent.shallow === "boolean") options.shallow = intent.shallow
  if (typeof intent.scroll === "boolean") options.scroll = intent.scroll
  return options
}

export const resolveEditorRouteNavigationRetry = (
  url: string,
  intent: EditorRouteNavigationIntent | null | undefined
): EditorRouteNavigationRetry => {
  const resolvedIntent = intent ?? defaultEditorRouteNavigationIntent()
  return {
    url,
    method: resolvedIntent.method,
    options: buildEditorRouteNavigationOptions(resolvedIntent),
  }
}

type EditorHistoryLike = Pick<History, "pushState"> & { readonly state?: unknown }

/**
 * After beforePopState blocks a dirty pop, restore the editor URL with pushState.
 * Confirm leave then uses history.back() — the blocked destination sits under the
 * restored entry, so no back/forward guessing or cross-session idx stamps are needed.
 *
 * Always pass a captured Next.js history state (from before the pop). `pushState(null)`
 * makes later Back restore URL-only without re-rendering the editor.
 */
export const restoreEditorUrlAfterBlockedHistoryPop = (
  editorAsPath: string,
  history: EditorHistoryLike | null | undefined = typeof globalThis !== "undefined"
    ? (globalThis as typeof globalThis & { window?: Window }).window?.history
    : undefined,
  historyState?: unknown
) => {
  const state = typeof historyState !== "undefined" ? historyState : (history?.state ?? null)
  history?.pushState(state, "", editorAsPath)
}
