export type EditorMode = "create" | "edit"

export type PublishActionType = "create" | "modify" | "temp"

type LoadingKey = "" | "writePost" | "modifyPost" | "publishTempPost" | string

export type EditorPersistenceStateParams = {
  editorMode: EditorMode
  hasSelectedManagedPost: boolean
  hasEditorDraftContent: boolean
  editorStateFingerprint: string
  serverBaselineFingerprint: string
  localDraftFingerprint: string
  localDraftSavedAt: string
  loadingKey: LoadingKey
  publishNoticeTone?: "idle" | "loading" | "success" | "error"
}

export const deriveEditorPersistenceState = ({
  editorMode,
  hasSelectedManagedPost,
  hasEditorDraftContent,
  editorStateFingerprint,
  serverBaselineFingerprint,
  localDraftFingerprint,
  localDraftSavedAt,
  loadingKey,
  publishNoticeTone = "idle",
}: EditorPersistenceStateParams) => {
  const isSaving =
    loadingKey === "writePost" || loadingKey === "modifyPost" || loadingKey === "publishTempPost"
  const isPersistedEditBaseline =
    editorMode === "edit" &&
    hasSelectedManagedPost &&
    editorStateFingerprint === serverBaselineFingerprint
  const isAutoSavedCreateDraft =
    editorMode === "create" &&
    editorStateFingerprint === localDraftFingerprint &&
    Boolean(localDraftSavedAt)

  const text = isSaving
    ? "저장 중"
    : hasEditorDraftContent
      ? isPersistedEditBaseline
        ? "저장됨"
        : isAutoSavedCreateDraft
          ? "자동 저장됨"
          : "저장되지 않은 변경"
      : ""

  const tone =
    isSaving
      ? "loading"
      : text === "저장됨" || text === "자동 저장됨" || publishNoticeTone === "success"
        ? "success"
        : "idle"

  return {
    text,
    tone,
    isPersistedEditBaseline,
    isAutoSavedCreateDraft,
  }
}

export const isPublishActionDisabled = ({
  publishActionType,
  editorMode,
  loadingKey,
  hasEditorMinimumFields,
  hasPlaceholderIssue,
}: {
  publishActionType: PublishActionType
  editorMode: EditorMode
  loadingKey: LoadingKey
  hasEditorMinimumFields: boolean
  hasPlaceholderIssue: boolean
}) => {
  if (!hasEditorMinimumFields || hasPlaceholderIssue) return true

  if (publishActionType === "create") {
    return editorMode !== "create" || loadingKey === "writePost"
  }

  if (publishActionType === "modify") {
    return editorMode !== "edit" || loadingKey === "modifyPost"
  }

  return editorMode !== "edit" || loadingKey === "publishTempPost"
}
