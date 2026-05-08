export type EditorMode = "create" | "edit"

export type PublishActionType = "create" | "modify" | "temp"

export type PostVisibility = "PRIVATE" | "PUBLIC_UNLISTED" | "PUBLIC_LISTED"

type LoadingKey = "" | "writePost" | "modifyPost" | "publishTempPost" | string

export type VisibilityFlags = {
  published: boolean
  listed: boolean
}

export const toVisibility = (published: boolean, listed: boolean): PostVisibility => {
  if (!published) return "PRIVATE"
  if (!listed) return "PUBLIC_UNLISTED"
  return "PUBLIC_LISTED"
}

export const toFlags = (visibility: PostVisibility): VisibilityFlags => {
  if (visibility === "PRIVATE") return { published: false, listed: false }
  if (visibility === "PUBLIC_UNLISTED") return { published: true, listed: false }
  return { published: true, listed: true }
}

export const getVisibilityLabel = (
  visibilityOrPublished: PostVisibility | boolean,
  listed?: boolean
) => {
  const visibility =
    typeof visibilityOrPublished === "boolean"
      ? toVisibility(visibilityOrPublished, Boolean(listed))
      : visibilityOrPublished

  if (visibility === "PRIVATE") return "비공개"
  if (visibility === "PUBLIC_UNLISTED") return "링크 공개"
  return "전체 공개"
}

export const deriveEditorContentMetrics = (content: string) => {
  const trimmedLength = content.trim().length
  const lineCount = content ? content.split("\n").length : 0
  const imageCount = (content.match(/!\[[^\]]*\]\([^)]+\)/g) || []).length

  return {
    trimmedLength,
    lineCount,
    imageCount,
  }
}

export const deriveComposeViewModel = ({
  editorMode,
  isTempDraftMode,
  postId,
  postTitle,
  postSummary,
  postTags,
  currentVisibilityText,
}: {
  editorMode: EditorMode
  isTempDraftMode: boolean
  postId: string
  postTitle: string
  postSummary: string
  postTags: string[]
  currentVisibilityText: string
}) => {
  const hasSelectedManagedPost = editorMode === "edit" && postId.trim().length > 0
  const trimmedPostTitle = postTitle.trim()
  const trimmedPostSummary = postSummary.trim()

  return {
    editorModeLabel: editorMode === "edit" ? "원고 편집" : "새 글",
    hasSelectedManagedPost,
    currentPostLabel: hasSelectedManagedPost
      ? `${trimmedPostTitle || "제목 없음"} · #${postId}`
      : trimmedPostTitle,
    selectedPostLabel: hasSelectedManagedPost
      ? `선택된 글 ID #${postId}`
      : "선택된 글이 없습니다.",
    tagSummaryText: postTags.length > 0 ? `${postTags.length}개 선택` : "미선택",
    composePageTitle: editorMode === "edit" ? "원고 편집" : "새 글",
    composeSurfaceSubtitle: hasSelectedManagedPost
      ? `#${postId} 원고를 다듬고 있습니다.`
      : "기술 원고를 차분하게 다듬는 공간입니다.",
    composeHeroSummary: [
      currentVisibilityText,
      trimmedPostSummary ? `요약 ${trimmedPostSummary.length}자` : "요약 자동",
      postTags.length > 0 ? `태그 ${postTags.length}개` : "태그 미설정",
    ],
    composeCallToActionLabel:
      editorMode === "create" ? "발행 준비" : isTempDraftMode ? "새 글 작성" : "수정 사항 확인",
  }
}

export const derivePublishActionViewModel = ({
  publishActionType,
  editorMode,
  loadingKey,
  hasEditorMinimumFields,
  hasPlaceholderIssue,
  isTempDraftMode,
}: {
  publishActionType: PublishActionType
  editorMode: EditorMode
  loadingKey: LoadingKey
  hasEditorMinimumFields: boolean
  hasPlaceholderIssue: boolean
  isTempDraftMode: boolean
}) => {
  const publishActionTriggerDisabled =
    loadingKey === "writePost" ||
    loadingKey === "modifyPost" ||
    loadingKey === "publishTempPost" ||
    loadingKey === "postTemp"

  return {
    publishActionTitle:
      publishActionType === "create"
        ? "발행 설정"
        : publishActionType === "modify"
          ? "수정 설정"
          : "새 글 작성",
    publishActionButtonText:
      publishActionType === "create"
        ? loadingKey === "writePost"
          ? "발행 중..."
          : "발행하기"
        : publishActionType === "modify"
          ? loadingKey === "modifyPost"
            ? "반영 중..."
            : "변경 반영"
          : loadingKey === "publishTempPost"
            ? "작성 중..."
            : "새 글 작성",
    publishActionButtonDisabled: isPublishActionDisabled({
      publishActionType,
      editorMode,
      loadingKey,
      hasEditorMinimumFields,
      hasPlaceholderIssue,
    }),
    publishActionTriggerDisabled,
    mobilePrimaryActionLabel:
      editorMode === "create"
        ? "발행 설정 열기"
        : isTempDraftMode
          ? "새 글 작성"
          : "수정 설정 열기",
    mobilePrimaryActionDisabled: publishActionTriggerDisabled,
  }
}

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
