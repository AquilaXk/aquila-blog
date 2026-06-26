import { useCallback, useMemo, useState } from "react"
import { formatDate } from "src/libs/utils"
import { clampThumbnailZoom, DEFAULT_THUMBNAIL_ZOOM } from "src/libs/thumbnailFocus"
import { POST_IMAGE_UPLOAD_RULE_LABEL, PROFILE_IMAGE_UPLOAD_RULE_LABEL } from "src/libs/profileImageUpload"
import { WriterEditorHost } from "./WriterEditorHost"
import { EditorStudioThumbnailEditorPanel, EditorStudioThumbnailMetaPanel } from "./EditorStudioThumbnailPanels"
import { EditorStudioPublishModal } from "./EditorStudioPublishModal"
import { EditorStudioLegacyProfileSection } from "./EditorStudioLegacyProfileSection"
import { EditorStudioLegacyUtilityPanel } from "./EditorStudioLegacyUtilityPanel"
import { EditorStudioResultLogPanel } from "./EditorStudioResultLogPanel"
import { EditorStudioDeleteConfirmDialog } from "./EditorStudioDeleteConfirmDialog"
import { EditorStudioComposeWorkspace } from "./EditorStudioComposeWorkspace"
import { EditorStudioContentWorkspace } from "./EditorStudioContentWorkspace"
import { EditorStudioDedicatedEditorLoadingState, EditorStudioDedicatedEditorSurface } from "./EditorStudioDedicatedEditorSurface"
import { LIST_SORT_OPTIONS } from "./useEditorStudioListConditions"
import { deriveComposeViewModel, deriveEditorContentMetrics, deriveEditorPersistenceState, derivePublishActionViewModel, getVisibilityLabel, toFlags, type PublishActionType } from "./editorStudioState"
import { PREVIEW_SUMMARY_MAX_LENGTH, buildEditorStateFingerprint, detectPublishPlaceholderIssue, makePreviewSummary } from "./editorStudioMetaModel"
import { Main, HeroCard, HeroIntro, StudioStatusItem, StudioStatusStrip, WorkspaceGrid, WorkspaceMain } from "./EditorStudioWorkspaceControllerRoot.styles"
import { MARKDOWN_EDITOR_MERMAID_ENABLED, COMPOSE_MOBILE_STUDIO_STEPS, GLOBAL_NOTICE_IDLE_TEXT, MANAGE_MOBILE_STUDIO_STEPS, MOBILE_STUDIO_STEP_DESCRIPTION, MOBILE_STUDIO_STEP_LABEL, PREVIEW_CARD_VIEWPORT_ORDER, PREVIEW_CARD_VIEWPORTS, PUBLISH_VISIBILITY_OPTIONS, SHOW_LEGACY_CONTENT_STUDIO, SHOW_LEGACY_PROFILE_STUDIO, SHOW_LEGACY_UTILITY_STUDIO, TAG_RECOMMENDATION_IDLE_TEXT, getMobileStudioStepMoveLabel, recordEditorCommitDurationForRuntimeGuard, type MobileStudioStep, type NoticeTone, type PreviewViewportMode } from "./EditorStudioWorkspaceControllerRootModel"

type EditorStudioWorkspaceControllerRootViewProps = {
  props: Record<string, any>
}

export const EditorStudioWorkspaceControllerRootView = ({ props }: EditorStudioWorkspaceControllerRootViewProps) => {
  const {
    activeMetaPanel,
    addTagsToPost,
    addTagToPost,
    adminPostRows,
    adminPostTotal,
    adminPostViewRows,
    applyFirstBodyImageToThumbnail,
    applyListQuickPreset,
    clearLocalDraft,
    closeDeleteConfirm,
    closePublishModal,
    commentContent,
    commentId,
    commitPreviewThumbTransform,
    copyPostDetailLink,
    deferredPostContent,
    deferredContentDerived,
    deleteConfirmNotice,
    deleteConfirmState,
    deletePostsFromList,
    deletedListNotice,
    deleteTagFromCatalog,
    disabled,
    editorMode,
    finalizePreviewThumbPointer,
    globalNotice,
    handleMarkdownEditorChange,
    handleMarkdownEditorFileUpload,
    handleMarkdownEditorImageUpload,
    handleConfirmPublish,
    handleContinueSelectedPostEditing,
    handleCreateNewPostFromSelectedPanel,
    handleDeleteComment,
    handleDeleteSelectedPost,
    handleExitDedicatedEditor,
    handleFlushMarkdownReady,
    handleHitPost,
    handleLikePost,
    handleListComments,
    handleListPageChange,
    handleListPageSizeChange,
    handleListSortChange,
    handleLogout,
    handleLoadOrCreateTempPost,
    handleModifyComment,
    handlePreviewThumbPointerDown,
    handlePreviewThumbPointerMove,
    handleProfileImageSelected,
    handleReadComment,
    handleReadPostCount,
    handleReadSystemHealth,
    handleRecommendTags,
    handleRefreshAdminProfile,
    handleSelectedPostIdChange,
    handleThumbnailImageFileChange,
    handleThumbnailPaste,
    handleThumbnailUrlModalChange,
    handleTitleChange,
    handleTitleFieldRef,
    handleTitleKeyDown,
    handleUndoSoftDelete,
    handleUpdateMemberProfileCard,
    handleWriteComment,
    hardDeleteDeletedPostFromList,
    isAllVisiblePostsSelected,
    isCompactMobileLayout,
    isComposeAssistOpen,
    isComposeUtilityOpen,
    isDedicatedEditorRoute,
    isDedicatedNewEditorRoute,
    isDirectLoadOpen,
    isListAdvancedOpen,
    isMobileMetaEditorOpen,
    isMobileThumbnailEditorOpen,
    isNewEditorBootstrapPending,
    isPreviewThumbDragging,
    isPreviewThumbnailError,
    isPublishModalOpen,
    isSelectedToolsOpen,
    isTempDraftMode,
    knownTags,
    lastLocalDraftFingerprintRef,
    listKw,
    listPage,
    listPageSize,
    listQuickPreset,
    listScope,
    listSort,
    loadAdminPosts,
    loadPostForEditor,
    loadingKey,
    localDraftSavedAt,
    member,
    metaNotice,
    mobileComposeStep,
    mobileManageStep,
    modifiedSortOrder,
    openDeleteConfirm,
    openPostDetailRoute,
    openPublishModal,
    openThumbnailFileInput,
    postCategory,
    postContent,
    postId,
    postSummary,
    postTags,
    postThumbnailFocusX,
    postThumbnailFocusY,
    postThumbnailUrl,
    postThumbnailZoom,
    postTitle,
    postVersion,
    postVisibility,
    profileBioInput,
    profileImageFileInputRef,
    profileImageFileName,
    profileImageNotice,
    profileImgInputUrl,
    profileNotice,
    profileRoleInput,
    publishActionType,
    publishModalNotice,
    publishNotice,
    previewThumbFrameRef,
    previewThumbTransformRef,
    previewViewport,
    resolvedPreviewSummary,
    resetListFilters,
    resetThumbnailToAutoMode,
    removeTagFromPost,
    restoreDeletedPostFromList,
    restoreLocalDraft,
    result,
    safePreviewThumbnail,
    saveLocalDraft,
    selectedPostIdSet,
    selectedPostIds,
    serverBaselineEditorFingerprintRef,
    sessionMember,
    setActiveMetaPanel,
    setCommentContent,
    setCommentId,
    setIsComposeAssistOpen,
    setIsComposeUtilityOpen,
    setIsDirectLoadOpen,
    setIsMobileMetaEditorOpen,
    setIsMobileThumbnailEditorOpen,
    setIsPreviewThumbnailError,
    setIsSelectedToolsOpen,
    setListKw,
    setListScope,
    setMobileComposeStep,
    setMobileManageStep,
    setModifiedSortOrder,
    setPostId,
    setPostSummary,
    setPostVisibility,
    setPreviewViewport,
    setProfileBioInput,
    setProfileRoleInput,
    setSelectedPostIds,
    setTagDraft,
    softDeleteUndoState,
    studioSurface,
    tagDraft,
    tagRecommendationNotice,
    tagUsageMap,
    thumbnailImageFileInputRef,
    thumbnailImageFileName,
    toggleListAdvanced,
    togglePostSelection,
    toggleSelectAllVisiblePosts
  } = props
  const currentFlags = toFlags(postVisibility)
  const editorStateFingerprint = useMemo(
    () =>
      buildEditorStateFingerprint({
        title: postTitle,
        content: postContent,
        summary: postSummary,
        thumbnailUrl: postThumbnailUrl,
        thumbnailFocusX: postThumbnailFocusX,
        thumbnailFocusY: postThumbnailFocusY,
        thumbnailZoom: postThumbnailZoom,
        tags: postTags,
        category: postCategory,
        visibility: postVisibility,
      }),
    [
      postCategory,
      postContent,
      postSummary,
      postTags,
      postThumbnailFocusX,
      postThumbnailFocusY,
      postThumbnailZoom,
      postThumbnailUrl,
      postTitle,
      postVisibility,
    ]
  )
  const currentVisibilityText = getVisibilityLabel(currentFlags.published, currentFlags.listed)
  const composeViewModel = useMemo(
    () =>
      deriveComposeViewModel({
        editorMode,
        isTempDraftMode,
        postId,
        postTitle,
        postSummary,
        postTags,
        currentVisibilityText,
      }),
    [currentVisibilityText, editorMode, isTempDraftMode, postId, postSummary, postTags, postTitle]
  )
  const {
    editorModeLabel,
    hasSelectedManagedPost,
    currentPostLabel,
    selectedPostLabel,
    tagSummaryText,
    composePageTitle,
    composeSurfaceSubtitle,
    composeHeroSummary,
    composeCallToActionLabel,
  } = composeViewModel
  const hasListFiltersApplied =
    listKw.trim().length > 0 ||
    listQuickPreset !== "none" ||
    listPage !== "1" ||
    listPageSize !== "30" ||
    (listScope === "active" && listSort !== "CREATED_AT")
  const deferredContentMetrics = useMemo(
    () => deriveEditorContentMetrics(deferredPostContent),
    [deferredPostContent]
  )
  const contentLength = deferredContentMetrics.trimmedLength
  const lineCount = deferredContentMetrics.lineCount
  const imageCount = deferredContentMetrics.imageCount
  const hasEditorDraftContent = Boolean(postTitle.trim() || postContent.trim())
  const hasEditorMinimumFields = Boolean(postTitle.trim() && postContent.trim())
  const publishPlaceholderIssue = hasEditorMinimumFields
    ? detectPublishPlaceholderIssue(postContent)
    : null
  const editorPersistenceState = deriveEditorPersistenceState({
    editorMode,
    hasSelectedManagedPost,
    hasEditorDraftContent,
    editorStateFingerprint,
    serverBaselineFingerprint: serverBaselineEditorFingerprintRef.current,
    localDraftFingerprint: lastLocalDraftFingerprintRef.current,
    localDraftSavedAt,
    loadingKey,
    publishNoticeTone: publishNotice.tone,
  })
  const composeStatusText = editorPersistenceState.text
  const composeStatusTone = editorPersistenceState.tone
  const composeSummaryPreview = useMemo(
    () => postSummary.trim() || deferredContentDerived.summary,
    [deferredContentDerived.summary, postSummary]
  )
  const profilePreviewSrc = profileImgInputUrl.trim()
  const profileImageStatus = profilePreviewSrc ? "설정됨" : "기본 이미지 사용 중"
  const profileRoleStatus = profileRoleInput.trim() || "미설정"
  const profileBioStatus = profileBioInput.trim() || "미설정"
  const profileUpdatedText = sessionMember?.modifiedAt
    ? sessionMember.modifiedAt.slice(0, 16).replace("T", " ")
    : "확인 전"
  const profileImageHint = profileImageFileName
    ? `선택 파일: ${profileImageFileName}`
    : `${PROFILE_IMAGE_UPLOAD_RULE_LABEL} (선택 즉시 업로드)`
  const publishActionViewModel = derivePublishActionViewModel({
    publishActionType,
    editorMode,
    loadingKey,
    hasEditorMinimumFields,
    hasPlaceholderIssue: Boolean(publishPlaceholderIssue),
    isTempDraftMode,
  })
  const {
    publishActionTitle,
    publishActionButtonText,
    publishActionButtonDisabled,
    publishActionTriggerDisabled,
    mobilePrimaryActionLabel,
    mobilePrimaryActionDisabled,
  } = publishActionViewModel
  const activeMobileStudioStep = studioSurface === "manage" ? mobileManageStep : mobileComposeStep
  const mobileStudioSurfaceSteps =
    studioSurface === "manage"
      ? ([...MANAGE_MOBILE_STUDIO_STEPS] as MobileStudioStep[])
      : ([...COMPOSE_MOBILE_STUDIO_STEPS] as MobileStudioStep[])
  const mobileStudioStepIndex = mobileStudioSurfaceSteps.indexOf(activeMobileStudioStep)
  const mobileStudioPrevStep: MobileStudioStep | null =
    mobileStudioStepIndex > 0 ? mobileStudioSurfaceSteps[mobileStudioStepIndex - 1] ?? null : null
  const mobileStudioNextStep: MobileStudioStep | null =
    mobileStudioStepIndex < mobileStudioSurfaceSteps.length - 1
      ? mobileStudioSurfaceSteps[mobileStudioStepIndex + 1] ?? null
      : null
  const mobileStudioPrevStepLabel =
    mobileStudioPrevStep === null ? "이전 단계 없음" : getMobileStudioStepMoveLabel(mobileStudioPrevStep)
  const mobileStudioNextStepLabel =
    mobileStudioNextStep === null ? "마지막 단계" : `${MOBILE_STUDIO_STEP_LABEL[mobileStudioNextStep]} 단계로 이동`
  const setActiveMobileStudioStep = (step: MobileStudioStep) => {
    if (step === "query" || step === "list") {
      setMobileManageStep(step)
      return
    }
    setMobileComposeStep(step)
  }
  const isCompactManageSurface = isCompactMobileLayout && studioSurface === "manage"
  const showSelectedPanelInManageSurface = !isCompactMobileLayout || activeMobileStudioStep !== "list" || hasSelectedManagedPost
  const [previewNowIso] = useState(() => new Date().toISOString())
  const displayName = member.nickname || member.username || "관리자"
  const displayNameInitial = displayName.slice(0, 2).toUpperCase()
  const selectedPreviewViewport = previewViewport as PreviewViewportMode
  const previewViewportConfig = PREVIEW_CARD_VIEWPORTS[selectedPreviewViewport]
  const previewViewportOptions = PREVIEW_CARD_VIEWPORT_ORDER.map((viewport) => ({
    value: viewport,
    label: PREVIEW_CARD_VIEWPORTS[viewport].label,
  }))
  const previewVisibilityLabel = getVisibilityLabel(postVisibility)
  const previewThumbnailSrc = safePreviewThumbnail && !isPreviewThumbnailError ? safePreviewThumbnail : ""
  const shouldShowPublishModalNotice = publishModalNotice.tone !== "idle"
  const previewAuthorAvatarSrc = (
    profileImgInputUrl.trim() ||
    member.profileImageDirectUrl ||
    member.profileImageUrl ||
    ""
  ).trim()
  const previewDateText = formatDate(previewNowIso, "ko")

  const isCompactSplitPreview = false
  const shouldShowGlobalNotice =
    globalNotice.tone !== "idle" || globalNotice.text !== GLOBAL_NOTICE_IDLE_TEXT
  const shouldShowPublishNotice = publishNotice.tone !== "idle"
  const shouldShowTagRecommendationNotice =
    tagRecommendationNotice.tone !== "idle" || tagRecommendationNotice.text !== TAG_RECOMMENDATION_IDLE_TEXT
  const composeStatusEntries = [
    shouldShowPublishNotice
      ? {
          key: "publish",
          label: "발행 상태",
          tone: publishNotice.tone,
          text: publishNotice.text,
        }
      : null,
    shouldShowTagRecommendationNotice
      ? {
          key: "tags",
          label: "태그 상태",
          tone: tagRecommendationNotice.tone,
          text: tagRecommendationNotice.text,
        }
      : null,
    {
      key: "draft",
      label: "브라우저 임시저장",
      tone: localDraftSavedAt ? ("success" as NoticeTone) : ("idle" as NoticeTone),
      text: localDraftSavedAt
        ? `${localDraftSavedAt.slice(11, 16)} 저장본이 있습니다.`
        : "아직 브라우저 임시저장이 없습니다.",
    },
  ].filter(
    (
      item
    ): item is {
      key: string
      label: string
      tone: NoticeTone
      text: string
    } => Boolean(item)
  )
  const mobileComposeStatusPrimary = composeStatusEntries[0] ?? {
    key: "visibility",
    label: "공개 범위",
    tone: "idle" as NoticeTone,
    text: `${currentVisibilityText} · ${postSummary.trim() ? "요약 입력됨" : "요약 자동 생성"}`,
  }
  const mobileComposeStatusSecondary = composeStatusEntries.find((item) => item.key === "draft") ?? null
  const isThumbnailUploadDisabled = disabled("uploadThumbnail")
  const handleThumbnailZoomModalChange = useCallback(
    (nextZoom: number) => {
      commitPreviewThumbTransform({
        ...previewThumbTransformRef.current,
        zoom: clampThumbnailZoom(nextZoom),
      })
    },
    [commitPreviewThumbTransform, previewThumbTransformRef]
  )
  const resetThumbnailZoomInModal = useCallback(() => {
    commitPreviewThumbTransform({
      ...previewThumbTransformRef.current,
      zoom: DEFAULT_THUMBNAIL_ZOOM,
    })
  }, [commitPreviewThumbTransform, previewThumbTransformRef])
  const thumbnailEditorPanel = (
    <EditorStudioThumbnailEditorPanel
      finalizePreviewThumbPointer={finalizePreviewThumbPointer}
      handlePreviewThumbPointerDown={handlePreviewThumbPointerDown}
      handlePreviewThumbPointerMove={handlePreviewThumbPointerMove}
      isPreviewThumbDragging={isPreviewThumbDragging}
      isPreviewThumbnailError={isPreviewThumbnailError}
      postThumbnailZoom={postThumbnailZoom}
      previewThumbFrameRef={previewThumbFrameRef}
      safePreviewThumbnail={safePreviewThumbnail}
      setIsPreviewThumbnailError={setIsPreviewThumbnailError}
      onThumbnailZoomChange={handleThumbnailZoomModalChange}
      onResetThumbnailZoom={resetThumbnailZoomInModal}
    />
  )
  const previewMetaEditorPanel = (
    <EditorStudioThumbnailMetaPanel
      firstBodyImageUrl={deferredContentDerived.firstImage}
      isThumbnailUploadDisabled={isThumbnailUploadDisabled}
      isThumbnailUploading={loadingKey === "uploadThumbnail"}
      postThumbnailUrl={postThumbnailUrl}
      thumbnailImageFileName={thumbnailImageFileName}
      thumbnailUploadRuleLabel={POST_IMAGE_UPLOAD_RULE_LABEL}
      onApplyFirstBodyImage={applyFirstBodyImageToThumbnail}
      onOpenThumbnailFileInput={openThumbnailFileInput}
      onResetThumbnailToAutoMode={resetThumbnailToAutoMode}
      onThumbnailPaste={handleThumbnailPaste}
      onThumbnailUrlChange={handleThumbnailUrlModalChange}
    />
  )
  const editorPrimaryActionType: PublishActionType =
    editorMode === "create" ? "create" : isTempDraftMode ? "temp" : "modify"
  const isMarkdownEditorDisabled = loadingKey.length > 0
  const handleEditorCommitDuration = useCallback((actualDuration: number) => {
    recordEditorCommitDurationForRuntimeGuard(actualDuration)
  }, [])
  const dedicatedEditorCanvas = useMemo(
    () => (
      <WriterEditorHost
        canvasId="editor-dedicated-canvas"
        markdown={postContent}
        previewTitle={postTitle}
        previewSummary={resolvedPreviewSummary}
        onMarkdownChange={handleMarkdownEditorChange}
        onFlushMarkdownReady={handleFlushMarkdownReady}
        onImageUpload={handleMarkdownEditorImageUpload}
        onFileUpload={handleMarkdownEditorFileUpload}
        mermaidEnabled={MARKDOWN_EDITOR_MERMAID_ENABLED}
        disabled={isMarkdownEditorDisabled}
        onCommitDuration={handleEditorCommitDuration}
      />
    ),
    [
      handleMarkdownEditorChange,
      handleMarkdownEditorFileUpload,
      handleMarkdownEditorImageUpload,
      handleFlushMarkdownReady,
      handleEditorCommitDuration,
      isMarkdownEditorDisabled,
      postContent,
      postTitle,
      resolvedPreviewSummary,
    ]
  )
  const composeEditorCanvas = useMemo(
    () => (
      <WriterEditorHost
        canvasId="editor-compose-canvas"
        markdown={postContent}
        previewTitle={postTitle}
        previewSummary={resolvedPreviewSummary}
        onMarkdownChange={handleMarkdownEditorChange}
        onFlushMarkdownReady={handleFlushMarkdownReady}
        onImageUpload={handleMarkdownEditorImageUpload}
        onFileUpload={handleMarkdownEditorFileUpload}
        mermaidEnabled={MARKDOWN_EDITOR_MERMAID_ENABLED}
        disabled={isMarkdownEditorDisabled}
        onCommitDuration={handleEditorCommitDuration}
      />
    ),
    [
      handleMarkdownEditorChange,
      handleMarkdownEditorFileUpload,
      handleMarkdownEditorImageUpload,
      handleFlushMarkdownReady,
      handleEditorCommitDuration,
      isMarkdownEditorDisabled,
      postContent,
      postTitle,
      resolvedPreviewSummary,
    ]
  )
  const shouldShowEditorLoadingState =
    isDedicatedNewEditorRoute &&
    !postId.trim() &&
    (isNewEditorBootstrapPending || loadingKey === "postTemp")
  const shouldShowResultPanel = Boolean(loadingKey || result)
  const dedicatedEditorResultPanel = useMemo(
    () =>
      shouldShowResultPanel ? (
        <EditorStudioResultLogPanel
          idleDescription="원본 응답을 확인할 수 있습니다"
          idleTitle="최근 작업 응답"
          loadingDescription={(currentLoadingKey) => `실행 중: ${currentLoadingKey}`}
          loadingKey={loadingKey}
          loadingTitle="작업 응답 확인 중"
          result={result}
          variant="dedicated"
        />
      ) : null,
    [loadingKey, result, shouldShowResultPanel]
  )

  if (!sessionMember) {
    return null
  }

  if (shouldShowEditorLoadingState) {
    return <EditorStudioDedicatedEditorLoadingState />
  }

  if (isDedicatedEditorRoute) {
    return (
      <EditorStudioDedicatedEditorSurface
        thumbnailImageFileInputRef={thumbnailImageFileInputRef}
        onThumbnailImageFileChange={handleThumbnailImageFileChange}
        onExit={handleExitDedicatedEditor}
        saveStateText={composeStatusText}
        saveStateTone={composeStatusTone}
        primaryActionDisabled={publishActionTriggerDisabled}
        primaryActionLabel="발행 설정"
        onPrimaryAction={() => openPublishModal(editorPrimaryActionType)}
        isCompactSplitPreview={isCompactSplitPreview}
        postTags={postTags}
        tagDraft={tagDraft}
        onTagDraftChange={setTagDraft}
        onAddTags={addTagsToPost}
        onAddTag={addTagToPost}
        onRemoveTag={removeTagFromPost}
        isRecommendTagsDisabled={disabled("recommendTags") || !postContent.trim()}
        isRecommendTagsLoading={loadingKey === "recommendTags"}
        onRecommendTags={() => void handleRecommendTags()}
        titleInputRef={handleTitleFieldRef}
        postTitle={postTitle}
        onPostTitleChange={handleTitleChange}
        onPostTitleKeyDown={handleTitleKeyDown}
        postContent={postContent}
        postSummary={postSummary}
        onPostSummaryChange={setPostSummary}
        postVisibility={postVisibility}
        onPostVisibilityChange={setPostVisibility}
        editorCanvas={dedicatedEditorCanvas}
        showPublishNotice={shouldShowPublishNotice}
        publishNoticeTone={publishNotice.tone}
        publishNoticeText={publishNotice.text}
        resultPanel={dedicatedEditorResultPanel}
        publishModal={
          isPublishModalOpen ? (
            <EditorStudioPublishModal
              closeToggleLabel="닫기"
              displayName={displayName}
              displayNameInitial={displayNameInitial}
              isCompactMobileLayout={isCompactMobileLayout}
              isMobileMetaEditorOpen={isMobileMetaEditorOpen}
              isMobileThumbnailEditorOpen={isMobileThumbnailEditorOpen}
              loadingKey={loadingKey}
              modalNotice={publishModalNotice}
              postThumbnailFocusX={postThumbnailFocusX}
              postThumbnailFocusY={postThumbnailFocusY}
              postThumbnailZoom={postThumbnailZoom}
              postTitle={postTitle}
              postVisibility={postVisibility}
              previewAuthorAvatarSrc={previewAuthorAvatarSrc}
              previewDateText={previewDateText}
              previewFrameStyle={{ maxWidth: `${previewViewportConfig.cardWidth}px` }}
              previewKicker="카드 미리보기"
              previewMetaEditorPanel={previewMetaEditorPanel}
              previewSummary={resolvedPreviewSummary}
              previewSummaryFallback="요약을 비워두면 본문에서 자동 생성한 요약이 카드에 반영됩니다."
              previewThumbnailSrc={previewThumbnailSrc}
              previewViewport={previewViewport}
              previewViewportLabel={previewViewportConfig.label}
              previewViewportOptions={previewViewportOptions}
              previewVisibilityLabel={previewVisibilityLabel}
              publishActionButtonDisabled={publishActionButtonDisabled}
              publishActionButtonText={publishActionButtonText}
              publishActionTitle={publishActionTitle}
              shouldShowNotice={shouldShowPublishModalNotice}
              thumbnailEditorPanel={thumbnailEditorPanel}
              variant="drawer"
              visibilityOptions={PUBLISH_VISIBILITY_OPTIONS}
              onClose={closePublishModal}
              onConfirmPublish={() => void handleConfirmPublish()}
              onPostVisibilityChange={setPostVisibility}
              onPreviewThumbnailError={() => setIsPreviewThumbnailError(true)}
              onPreviewViewportChange={setPreviewViewport}
              onToggleMobileMetaEditor={() => setIsMobileMetaEditorOpen((current: boolean) => !current)}
              onToggleMobileThumbnailEditor={() => setIsMobileThumbnailEditorOpen((current: boolean) => !current)}
            />
          ) : null
        }
      />
    )
  }

  return (
    <Main>
      <HeroCard data-compact-manage={isCompactManageSurface}>
        <HeroIntro data-compact-manage={isCompactManageSurface}>
          <h1>{composePageTitle}</h1>
          <p>제목과 본문에 집중하고, 발행 전 설정은 오른쪽에서 차분하게 마무리합니다.</p>
          <StudioStatusStrip aria-label="글 작업실 상태 요약">
            <StudioStatusItem>
              <span>현재 작업</span>
              <strong>{composePageTitle}</strong>
            </StudioStatusItem>
            {currentPostLabel ? (
              <StudioStatusItem>
                <span>원고</span>
                <strong>{currentPostLabel}</strong>
              </StudioStatusItem>
            ) : null}
            <StudioStatusItem data-optional="true">
              <span>공개 범위</span>
              <strong>{currentVisibilityText}</strong>
            </StudioStatusItem>
            {composeStatusText ? (
              <StudioStatusItem data-optional="true">
                <span>저장 상태</span>
                <strong>{composeStatusText}</strong>
              </StudioStatusItem>
            ) : null}
          </StudioStatusStrip>
        </HeroIntro>
      </HeroCard>

      <WorkspaceGrid>
        <WorkspaceMain>
          {SHOW_LEGACY_PROFILE_STUDIO && (
            <EditorStudioLegacyProfileSection
              displayName={displayName}
              displayNameInitial={displayNameInitial}
              isProfileCardUpdateDisabled={disabled("admMemberProfileCardUpdate")}
              isProfileImageUploadDisabled={disabled("admMemberProfileImgUpdate")}
              isProfileImageUploading={loadingKey === "admMemberProfileImgUpdate"}
              isProfileRefreshDisabled={disabled("admMemberProfileRefresh")}
              profileBioInput={profileBioInput}
              profileBioStatus={profileBioStatus}
              profileImageFileInputRef={profileImageFileInputRef}
              profileImageHint={profileImageHint}
              profileImageNotice={profileImageNotice}
              profileImageStatus={profileImageStatus}
              profileNotice={profileNotice}
              profilePreviewSrc={profilePreviewSrc}
              profileRoleInput={profileRoleInput}
              profileRoleStatus={profileRoleStatus}
              profileUpdatedText={profileUpdatedText}
              onProfileBioChange={setProfileBioInput}
              onProfileImageSelected={handleProfileImageSelected}
              onProfileRoleChange={setProfileRoleInput}
              onRefreshAdminProfile={handleRefreshAdminProfile}
              onUpdateMemberProfileCard={() => void handleUpdateMemberProfileCard()}
            />
          )}

          {SHOW_LEGACY_CONTENT_STUDIO && (
            <EditorStudioContentWorkspace
              shouldShowGlobalNotice={shouldShowGlobalNotice}
              globalNotice={globalNotice}
              mobileStudioSurfaceSteps={mobileStudioSurfaceSteps}
              activeMobileStudioStep={activeMobileStudioStep}
              mobileStudioStepLabels={MOBILE_STUDIO_STEP_LABEL}
              mobileStudioStepDescriptions={MOBILE_STUDIO_STEP_DESCRIPTION}
              mobileStudioPrevStep={mobileStudioPrevStep}
              mobileStudioNextStep={mobileStudioNextStep}
              mobileStudioPrevStepLabel={mobileStudioPrevStepLabel}
              mobileStudioNextStepLabel={mobileStudioNextStepLabel}
              isCompactMobileLayout={isCompactMobileLayout}
              onMobileStepChange={setActiveMobileStudioStep}
              listScope={listScope}
              listKeyword={listKw}
              listQuickPreset={listQuickPreset}
              hasListFiltersApplied={hasListFiltersApplied}
              isListAdvancedOpen={isListAdvancedOpen}
              listPage={listPage}
              listPageSize={listPageSize}
              listSort={listSort}
              listSortOptions={LIST_SORT_OPTIONS}
              isListRefreshDisabled={disabled("postList")}
              isTempPostDisabled={disabled("postTemp")}
              onListScopeChange={setListScope}
              onListKeywordChange={setListKw}
              onRefreshList={() => void loadAdminPosts()}
              onLoadOrCreateTempPost={() => void handleLoadOrCreateTempPost()}
              onApplyQuickPreset={applyListQuickPreset}
              onResetFilters={resetListFilters}
              onToggleListAdvanced={toggleListAdvanced}
              onListPageChange={handleListPageChange}
              onListPageSizeChange={handleListPageSizeChange}
              onListSortChange={handleListSortChange}
              selectedPostIds={selectedPostIds}
              adminPostTotal={adminPostTotal}
              adminPostRows={adminPostRows}
              adminPostViewRows={adminPostViewRows}
              isAllVisiblePostsSelected={isAllVisiblePostsSelected}
              selectedPostIdSet={selectedPostIdSet}
              editorMode={editorMode}
              postId={postId}
              loadingKey={loadingKey}
              modifiedSortOrder={modifiedSortOrder}
              deletedListNotice={deletedListNotice}
              onToggleSelectAllVisiblePosts={toggleSelectAllVisiblePosts}
              onClearSelection={() => setSelectedPostIds([])}
              onRequestDeletePosts={(ids, headline) => openDeleteConfirm(ids, headline)}
              onTogglePostSelection={togglePostSelection}
              onToggleModifiedSortOrder={() => setModifiedSortOrder((prev: "desc" | "asc") => (prev === "desc" ? "asc" : "desc"))}
              onEditPost={(row) => {
                setPostId(String(row.id))
                void loadPostForEditor(String(row.id))
              }}
              onOpenPostDetail={(id) => void openPostDetailRoute(id)}
              onCopyPostDetailLink={(id, title) => void copyPostDetailLink(id, title)}
              onRestoreDeletedPost={(row) => void restoreDeletedPostFromList(row)}
              onHardDeletePost={(row) => void hardDeleteDeletedPostFromList(row)}
              showSelectedPanelInManageSurface={showSelectedPanelInManageSurface}
              hasSelectedManagedPost={hasSelectedManagedPost}
              editorModeLabel={editorModeLabel}
              selectedPostLabel={selectedPostLabel}
              postTitle={postTitle}
              postVersion={postVersion}
              isTempDraftMode={isTempDraftMode}
              postVisibility={postVisibility}
              currentVisibilityText={currentVisibilityText}
              isContinueEditingDisabled={editorMode !== "edit" || disabled("modifyPost")}
              isCreateNewPostDisabled={loadingKey.length > 0}
              isDeletePostDisabled={disabled("deletePost")}
              onContinueEditing={handleContinueSelectedPostEditing}
              onCreateNewPost={handleCreateNewPostFromSelectedPanel}
              onDeletePost={handleDeleteSelectedPost}
              isDirectLoadOpen={isDirectLoadOpen}
              onToggleDirectLoad={() => setIsDirectLoadOpen((prev: boolean) => !prev)}
              isSelectedToolsOpen={isSelectedToolsOpen}
              onToggleSelectedTools={() => setIsSelectedToolsOpen((prev: boolean) => !prev)}
              onPostIdChange={handleSelectedPostIdChange}
              isLoadPostDisabled={disabled("postOne")}
              onLoadPost={() => void loadPostForEditor()}
              isHitPostDisabled={disabled("hitPost")}
              onRunHitPost={() =>
                handleHitPost()
              }
              isLikePostDisabled={disabled("likePost")}
              onRunLikePost={() =>
                handleLikePost()
              }
              softDeleteUndoMessage={softDeleteUndoState?.message || ""}
              isSoftDeleteUndoVisible={Boolean(softDeleteUndoState)}
              isUndoDisabled={disabled("undoDeletePost")}
              onUndoSoftDelete={() => void handleUndoSoftDelete()}
            />
          )}

        <EditorStudioDeleteConfirmDialog
          state={deleteConfirmState}
          noticeTone={deleteConfirmNotice.tone}
          noticeText={deleteConfirmNotice.text}
          isDeleteDisabled={loadingKey === "deletePost"}
          onClose={closeDeleteConfirm}
          onConfirm={async (state) => {
            const ok = await deletePostsFromList(state.ids)
            if (ok) closeDeleteConfirm()
          }}
        />
        {studioSurface === "compose" && (
          <EditorStudioComposeWorkspace
            isCompactMobileLayout={isCompactMobileLayout}
            isPublishModalOpen={isPublishModalOpen}
            mobilePrimaryStatus={mobileComposeStatusPrimary}
            mobileSecondaryStatusText={mobileComposeStatusSecondary?.text}
            mobilePrimaryActionLabel={mobilePrimaryActionLabel}
            composeCallToActionLabel={composeCallToActionLabel}
            mobilePrimaryActionDisabled={mobilePrimaryActionDisabled}
            onPrimaryAction={() => openPublishModal(editorPrimaryActionType)}
            currentVisibilityText={currentVisibilityText}
            editorModeLabel={editorModeLabel}
            composePageTitle={composePageTitle}
            composeSurfaceSubtitle={composeSurfaceSubtitle}
            composeStatusText={composeStatusText}
            composeStatusTone={composeStatusTone}
            postSummary={postSummary}
            postSummaryMaxLength={PREVIEW_SUMMARY_MAX_LENGTH}
            onPostSummaryChange={setPostSummary}
            isFillSummaryFromBodyDisabled={!postContent.trim()}
            onFillSummaryFromBody={() => setPostSummary(makePreviewSummary(postContent))}
            postTags={postTags}
            tagDraft={tagDraft}
            onTagDraftChange={setTagDraft}
            onAddTags={addTagsToPost}
            onAddTag={addTagToPost}
            onRemoveTag={removeTagFromPost}
            titleInputRef={handleTitleFieldRef}
            postTitle={postTitle}
            onPostTitleChange={handleTitleChange}
            onPostTitleKeyDown={handleTitleKeyDown}
            thumbnailImageFileInputRef={thumbnailImageFileInputRef}
            onThumbnailImageFileChange={handleThumbnailImageFileChange}
            contentLength={contentLength}
            lineCount={lineCount}
            imageCount={imageCount}
            editorCanvas={composeEditorCanvas}
            tagSummaryText={tagSummaryText}
            isSaveDraftDisabled={loadingKey.length > 0}
            onSaveLocalDraft={saveLocalDraft}
            composeHeroSummary={composeHeroSummary}
            isRecommendTagsDisabled={disabled("recommendTags") || !postContent.trim()}
            isRecommendTagsLoading={loadingKey === "recommendTags"}
            onRecommendTags={() => void handleRecommendTags()}
            composeStatusEntries={composeStatusEntries}
            activeVisibility={postVisibility}
            visibilityOptions={PUBLISH_VISIBILITY_OPTIONS}
            onVisibilityChange={setPostVisibility}
            previewViewport={previewViewport}
            previewViewportLabel={previewViewportConfig.label}
            previewViewportOptions={previewViewportOptions}
            onPreviewViewportChange={(viewport) => setPreviewViewport(viewport)}
            previewFrameStyle={{ width: `min(100%, ${previewViewportConfig.cardWidth}px)` }}
            previewThumbnailSrc={previewThumbnailSrc}
            postThumbnailFocusX={postThumbnailFocusX}
            postThumbnailFocusY={postThumbnailFocusY}
            postThumbnailZoom={postThumbnailZoom}
            onPreviewThumbnailError={() => setIsPreviewThumbnailError(true)}
            previewVisibilityLabel={previewVisibilityLabel}
            summaryPreview={composeSummaryPreview}
            previewDateText={previewDateText}
            previewAuthorAvatarSrc={previewAuthorAvatarSrc}
            displayNameInitial={displayNameInitial}
            displayName={displayName}
            summaryLengthLabel={
              postSummary.trim() ? `${postSummary.trim().length}/${PREVIEW_SUMMARY_MAX_LENGTH}` : "본문 기준 자동"
            }
            isComposeAssistOpen={isComposeAssistOpen}
            onToggleComposeAssist={() => setIsComposeAssistOpen((prev: boolean) => !prev)}
            thumbnailEditorPanel={thumbnailEditorPanel}
            previewMetaEditorPanel={previewMetaEditorPanel}
            isTagPanelOpen={activeMetaPanel === "tag"}
            onToggleTagPanel={() => setActiveMetaPanel((prev: "tag" | "category" | null) => (prev === "tag" ? null : "tag"))}
            isUtilityPanelOpen={isComposeUtilityOpen}
            onToggleUtilityPanel={() => setIsComposeUtilityOpen((prev: boolean) => !prev)}
            metaNotice={metaNotice}
            knownTags={knownTags}
            tagUsageMap={tagUsageMap}
            onToggleKnownTag={(tag) => (postTags.includes(tag) ? removeTagFromPost(tag) : addTagToPost(tag))}
            onDeleteKnownTag={deleteTagFromCatalog}
            onRestoreLocalDraft={restoreLocalDraft}
            onClearLocalDraft={clearLocalDraft}
            isClearLocalDraftDisabled={loadingKey.length > 0 || !localDraftSavedAt}
          />
        )}

        {isPublishModalOpen ? (
          <EditorStudioPublishModal
            closeToggleLabel="접기"
            displayName={displayName}
            displayNameInitial={displayNameInitial}
            isCompactMobileLayout={isCompactMobileLayout}
            isMobileMetaEditorOpen={isMobileMetaEditorOpen}
            isMobileThumbnailEditorOpen={isMobileThumbnailEditorOpen}
            loadingKey={loadingKey}
            modalNotice={publishModalNotice}
            postThumbnailFocusX={postThumbnailFocusX}
            postThumbnailFocusY={postThumbnailFocusY}
            postThumbnailZoom={postThumbnailZoom}
            postTitle={postTitle}
            postVisibility={postVisibility}
            previewAuthorAvatarSrc={previewAuthorAvatarSrc}
            previewDateText={previewDateText}
            previewFrameStyle={{ maxWidth: `${previewViewportConfig.cardWidth}px` }}
            previewKicker="실제 카드 결과"
            previewMetaEditorPanel={previewMetaEditorPanel}
            previewSummary={resolvedPreviewSummary}
            previewSummaryFallback="요약을 비워두면 본문에서 자동 생성한 요약이 카드에 반영됩니다."
            previewThumbnailSrc={previewThumbnailSrc}
            previewViewport={previewViewport}
            previewViewportLabel={previewViewportConfig.label}
            previewViewportOptions={previewViewportOptions}
            previewVisibilityLabel={previewVisibilityLabel}
            publishActionButtonDisabled={publishActionButtonDisabled}
            publishActionButtonText={publishActionButtonText}
            publishActionTitle={publishActionTitle}
            setupDescription="썸네일 위치와 카드 요약만 조정합니다. 결과는 위 카드에서 바로 확인됩니다."
            shouldShowNotice={shouldShowPublishModalNotice}
            thumbnailEditorPanel={thumbnailEditorPanel}
            visibilityOptions={PUBLISH_VISIBILITY_OPTIONS}
            onClose={closePublishModal}
            onConfirmPublish={() => void handleConfirmPublish()}
            onPostVisibilityChange={setPostVisibility}
            onPreviewThumbnailError={() => setIsPreviewThumbnailError(true)}
            onPreviewViewportChange={setPreviewViewport}
            onToggleMobileMetaEditor={() => setIsMobileMetaEditorOpen((current: boolean) => !current)}
            onToggleMobileThumbnailEditor={() => setIsMobileThumbnailEditorOpen((current: boolean) => !current)}
          />
        ) : null}

          {SHOW_LEGACY_UTILITY_STUDIO && (
            <EditorStudioLegacyUtilityPanel
              commentContent={commentContent}
              commentId={commentId}
              isCommentDeleteDisabled={disabled("commentDelete")}
              isCommentListDisabled={disabled("commentList")}
              isCommentModifyDisabled={disabled("commentModify")}
              isCommentOneDisabled={disabled("commentOne")}
              isCommentWriteDisabled={disabled("commentWrite")}
              isPostCountDisabled={disabled("admPostCount")}
              isSystemHealthDisabled={disabled("systemHealth")}
              postId={postId}
              onCommentContentChange={setCommentContent}
              onCommentIdChange={setCommentId}
              onDeleteComment={handleDeleteComment}
              onListComments={handleListComments}
              onModifyComment={handleModifyComment}
              onPostIdChange={setPostId}
              onReadComment={handleReadComment}
              onReadPostCount={handleReadPostCount}
              onReadSystemHealth={handleReadSystemHealth}
              onWriteComment={handleWriteComment}
            />
          )}
        </WorkspaceMain>

      </WorkspaceGrid>

      <EditorStudioResultLogPanel
        eyebrow="실행 로그"
        idleDescription="접어서 숨길 수 있습니다"
        idleTitle="최근 작업 응답 보기"
        loadingDescription={(currentLoadingKey) => `실행 중: ${currentLoadingKey}`}
        loadingKey={loadingKey}
        loadingTitle="작업 응답 확인 중"
        result={result}
        variant="standard"
      />
    </Main>
  )
}
