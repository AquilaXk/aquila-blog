export const EDITOR_UNSAVED_CHANGES_MESSAGE =
  "저장되지 않은 변경이 있습니다. 이 페이지를 나가면 변경 내용이 사라질 수 있습니다."

export const isEditorUnsavedDirtyLabel = (persistenceText: string) =>
  persistenceText === "저장되지 않은 변경"

/** Next router / hard login redirects that must not be blocked by the exit guard. */
export const isForcedEditorExitUrl = (url: string) => {
  const path = url.split(/[?#]/)[0] || ""
  return path === "/login" || path.startsWith("/login/")
}
