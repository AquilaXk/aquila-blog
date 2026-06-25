import type { AuthMember } from "src/hooks/useAuthSession"
import type { ProfileWorkspaceContent } from "src/libs/profileWorkspace"
import { clampProfileImageEditZoom } from "src/libs/profileImageUpload"
import AdminShell from "src/routes/Admin/AdminShell"
import {
  DockPrimaryButton,
  DockSecondaryButton,
  EditorActionDock,
  EditorColumn,
  EditorPaneHeader,
  EditorSurface,
  Main,
  SectionRail,
  SectionRailButton,
  SectionStateBadge,
  ToastCard,
  ToastStack,
  WorkspaceHero,
  WorkspaceShell,
} from "src/routes/Admin/AdminProfileWorkspace.styles"
import { WORKSPACE_SECTIONS } from "src/routes/Admin/AdminProfileWorkspaceModel"
import AdminProfileImageEditorModal from "src/routes/Admin/AdminProfileImageEditorModal"
import AdminProfilePreviewRail from "src/routes/Admin/AdminProfilePreviewRail"
import { renderAdminProfileWorkspaceSection } from "src/routes/Admin/AdminProfileWorkspaceSectionRenderer"
import {
  AdminWorkspaceActionDockInner,
  AdminWorkspaceHeroCopy,
  AdminWorkspaceHeroLayout,
} from "src/routes/Admin/AdminSurfacePrimitives"

export const AdminProfileWorkspaceSections = (props: Record<string, any>) => {
  const {
    activeSection,
    displayNameInput,
    draft,
    finalizeProfileImageDraftPointer,
    handleApplyProfileImageDraft,
    handleDraftFileChange,
    handleDeletePreviousProfileImage,
    handleProfileImageDraftPointerDown,
    handleProfileImageDraftPointerMove,
    handlePublish,
    handleSaveDraft,
    handleSelectPreviousProfileImage,
    hasPublishedDiff,
    hasUnsavedChanges,
    imageNotice,
    initialMember,
    isPreviewExpanded,
    isProfileImageDraftDragging,
    isProfileImageEditorOpen,
    loadingKey,
    previewMode,
    profileImageDraftFile,
    profileImageDraftFrameRef,
    profileImageDraftNotice,
    profileImageDraftPreviewUrl,
    profileImageDraftTransformRef,
    profileImageDraftZoom,
    profileImageFileInputRef,
    previousProfileImages,
    publishedSnapshot,
    resetProfileImageDraftInteractions,
    scheduleProfileImageDraftTransform,
    sectionStateMap,
    sessionMember,
    setActiveSection,
    setIsPreviewExpanded,
    setIsProfileImageEditorOpen,
    setPreviewMode,
    workspaceNotice,
    clearProfileImageDraft,
  } = props as Record<string, any> & {
    draft: ProfileWorkspaceContent
    initialMember: AuthMember
    publishedSnapshot: ProfileWorkspaceContent
  }
  const displayName = displayNameInput.trim() || sessionMember.nickname || sessionMember.username || "관리자"
  const previewContent = previewMode === "published" ? publishedSnapshot : draft
  const missingExposureItems: string[] = []
  if (!displayNameInput.trim()) missingExposureItems.push("계정 이름")
  if (!draft.profileBio.trim()) missingExposureItems.push("짧은 소개")
  if (!draft.aboutHeadline.trim() || !draft.aboutRole.trim() || !draft.aboutBio.trim()) missingExposureItems.push("About 소개")
  if (!draft.aboutProjectSectionTitle.trim() || draft.aboutProjects.length === 0) missingExposureItems.push("About 프로젝트")
  if (!draft.homeIntroTitle.trim() || !draft.homeIntroDescription.trim()) missingExposureItems.push("메인 헤더 카피")
  const hasMissingExposureItems = missingExposureItems.length > 0
  const activeSectionMeta = WORKSPACE_SECTIONS.find((section) => section.id === activeSection) || WORKSPACE_SECTIONS[0]
  const pageToasts = [workspaceNotice, imageNotice].filter(
    (notice) => notice.tone !== "idle" && notice.text.trim().length > 0
  )
  const canPublish = (hasUnsavedChanges || hasPublishedDiff) && loadingKey !== "publish" && loadingKey !== "save"
  const canSave = hasUnsavedChanges && loadingKey !== "save"
  const publishActionLabel =
    loadingKey === "publish" ? "공개 적용 중..." : hasUnsavedChanges ? "저장 후 공개 적용" : "공개 적용"
  const activeSectionState = sectionStateMap[activeSection]


  return (
    <AdminShell currentSection="profile" member={sessionMember || initialMember}>
      <Main>
      <input
        ref={profileImageFileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleDraftFileChange}
      />

      <WorkspaceHero>
        <AdminWorkspaceHeroLayout>
          <AdminWorkspaceHeroCopy>
            <span className="settingsLabel">Settings</span>
            <h1>개인정보와 계정 설정</h1>
          </AdminWorkspaceHeroCopy>
          <p className="settingsHeroDeck">
            공개 프로필, About 소개, 메인 헤더와 외부 링크를 한 곳에서 관리합니다.
          </p>
        </AdminWorkspaceHeroLayout>
      </WorkspaceHero>

      <WorkspaceShell>
        <SectionRail role="tablist" aria-label="프로필 섹션">
          {WORKSPACE_SECTIONS.map((section) => (
            <SectionRailButton
              key={section.id}
              type="button"
              role="tab"
              aria-selected={activeSection === section.id}
              data-active={activeSection === section.id}
              onClick={() => setActiveSection(section.id)}
            >
              <span>{section.label}</span>
            </SectionRailButton>
          ))}
        </SectionRail>

        <EditorColumn>
          <EditorSurface>
            <EditorPaneHeader>
              <span className="settingsPanelLabel">{activeSection}</span>
              <div className="titleRow">
                <h2>{activeSectionMeta.label}</h2>
                {activeSectionState.dirty ? (
                  <SectionStateBadge data-tone="dirty">저장 안 됨</SectionStateBadge>
                ) : activeSectionState.publishedDiff ? (
                  <SectionStateBadge data-tone="published">공개본과 차이 있음</SectionStateBadge>
                ) : null}
              </div>
              <p>변경 사항은 초안 저장 후 공개 적용으로 블로그와 About 페이지에 반영됩니다.</p>
            </EditorPaneHeader>
            {renderAdminProfileWorkspaceSection(props)}
          </EditorSurface>
          <EditorActionDock>
            <AdminWorkspaceActionDockInner>
              <DockSecondaryButton type="button" disabled={!canSave} onClick={() => void handleSaveDraft()}>
                {loadingKey === "save" ? "저장 중..." : "초안 저장"}
              </DockSecondaryButton>
              <DockPrimaryButton type="button" disabled={!canPublish} onClick={() => void handlePublish()}>
                {publishActionLabel}
              </DockPrimaryButton>
            </AdminWorkspaceActionDockInner>
          </EditorActionDock>
        </EditorColumn>

        <AdminProfilePreviewRail
          activeSection={activeSection}
          activeSectionLabel={activeSectionMeta.label}
          displayName={displayName}
          hasMissingExposureItems={hasMissingExposureItems}
          isPreviewExpanded={isPreviewExpanded}
          onPreviewModeChange={setPreviewMode}
          onToggleExpanded={() => setIsPreviewExpanded((current: boolean) => !current)}
          previewContent={previewContent}
          previewMode={previewMode}
        />
      </WorkspaceShell>

      {pageToasts.length > 0 ? (
        <ToastStack role="status" aria-live="polite">
          {pageToasts.map((notice, index) => (
            <ToastCard key={`${notice.tone}-${index}-${notice.text}`} data-tone={notice.tone}>
              {notice.text}
            </ToastCard>
          ))}
        </ToastStack>
      ) : null}

      {isProfileImageEditorOpen ? (
        <AdminProfileImageEditorModal
          frameRef={profileImageDraftFrameRef}
          hasDraftFile={Boolean(profileImageDraftFile)}
          isDragging={isProfileImageDraftDragging}
          isUploading={loadingKey === "upload"}
          notice={profileImageDraftNotice}
          onApply={() => void handleApplyProfileImageDraft()}
          onClear={clearProfileImageDraft}
          onDeletePreviousProfileImage={handleDeletePreviousProfileImage}
          onPointerCancel={finalizeProfileImageDraftPointer}
          onPointerDown={handleProfileImageDraftPointerDown}
          onPointerMove={handleProfileImageDraftPointerMove}
          onPointerUp={finalizeProfileImageDraftPointer}
          onRequestClose={() => {
            setIsProfileImageEditorOpen(false)
            resetProfileImageDraftInteractions()
          }}
          onSelectPreviousProfileImage={handleSelectPreviousProfileImage}
          onSelectFile={() => profileImageFileInputRef.current?.click()}
          previousProfileImages={previousProfileImages}
          onZoomChange={(zoom) =>
            scheduleProfileImageDraftTransform({
              ...profileImageDraftTransformRef.current,
              zoom: clampProfileImageEditZoom(zoom),
            })
          }
          previewUrl={profileImageDraftPreviewUrl}
          zoom={profileImageDraftZoom}
        />
      ) : null}
      </Main>
    </AdminShell>
  )
}
