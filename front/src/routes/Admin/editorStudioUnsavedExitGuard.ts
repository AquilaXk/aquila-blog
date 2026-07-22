export const EDITOR_UNSAVED_CHANGES_MESSAGE =
  "저장되지 않은 변경이 있습니다. 이 페이지를 나가면 변경 내용이 사라질 수 있습니다."

export const isEditorUnsavedDirtyLabel = (persistenceText: string) =>
  persistenceText === "저장되지 않은 변경"

/** Next router / hard login redirects that must not be blocked by the exit guard. */
export const isForcedEditorExitUrl = (url: string) => {
  const path = url.split(/[?#]/)[0] || ""
  return path === "/login" || path.startsWith("/login/")
}

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
