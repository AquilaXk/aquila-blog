import { dehydrate, type DehydratedState, useQueryClient } from "@tanstack/react-query"
import { GetServerSideProps, NextPage } from "next"
import { useRouter } from "next/router"
import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { apiFetch } from "src/apis/backend/client"
import AppIcon from "src/components/icons/AppIcon"
import ProfileImage from "src/components/ProfileImage"
import {
  getProfileCardIconOptions,
  isAllowedProfileLinkHref,
  normalizeProfileLinkHref,
  ProfileCardLinkItem,
} from "src/constants/profileCardLinks"
import { queryKey } from "src/constants/queryKey"
import useAuthSession, { AuthMember } from "src/hooks/useAuthSession"
import { setAdminProfileCache, toAdminProfile } from "src/hooks/useAdminProfile"
import { setProfileWorkspaceCache, useProfileWorkspace } from "src/hooks/useProfileWorkspace"
import useViewportImageEditor from "src/libs/imageEditor/useViewportImageEditor"
import {
  buildProfileWorkspaceAdminProfileCacheFields,
  AboutProjectBlock,
  normalizeProfileWorkspaceContent,
  ProfileWorkspaceContent,
  ProfileWorkspaceResponse,
  serializeProfileWorkspaceContent,
  AboutSectionBlock,
} from "src/libs/profileWorkspace"
import {
  buildImageOptimizationSummary,
  buildProfileImageEditedFile,
  clampProfileImageEditFocusBySource,
  clampProfileImageEditZoom,
  normalizeProfileImageUploadError,
  prepareProfileImageForUpload,
  ProfileImageSourceSize,
  PROFILE_IMAGE_EDIT_DEFAULT_FOCUS_X,
  PROFILE_IMAGE_EDIT_DEFAULT_FOCUS_Y,
  PROFILE_IMAGE_EDIT_MIN_ZOOM,
  resolveProfileImageEditDrawRatios,
} from "src/libs/profileImageUpload"
import { createQueryClient } from "src/libs/react-query"
import { saveProfileCardWithConflictRetry } from "src/libs/profileCardSave"
import { readAdminProtectedBootstrap } from "src/libs/server/adminPage"
import { guardAdminRequest } from "src/libs/server/adminGuard"
import { hasServerAuthCookie } from "src/libs/server/authSession"
import { fetchServerProfileWorkspace } from "src/libs/server/profileWorkspace"
import { appendSsrDebugTiming, timed } from "src/libs/server/serverTiming"
import { acquireBodyScrollLock } from "src/libs/utils/bodyScrollLock"
import AdminShell from "src/routes/Admin/AdminShell"
import {
  Main,
  BaseButton,
  GhostButton,
  PublishButton,
  MiniButton,
  DangerButton,
  PreviewAnchor,
  WorkspaceHero,
  WorkspaceShell,
  SectionRail,
  SectionRailButton,
  EditorColumn,
  EditorPaneHeader,
  SectionStateBadge,
  EditorSurface,
  SectionStack,
  AvatarWorkspaceCard,
  FieldSectionCard,
  SectionBlockHeader,
  FieldGrid,
  FieldBox,
  FieldLabel,
  Input,
  TextArea,
  AboutSectionList,
  AboutSectionCard,
  AboutProjectList,
  AboutProjectCard,
  AboutSectionCardHeader,
  ItemList,
  ItemRow,
  InlineActionRow,
  EmptyStateCard,
  SegmentedControl,
  SegmentButton,
  LinkManagerHeader,
  LinkCardList,
  LinkRowCard,
  DragHandleButton,
  IconPickerField,
  IconPickerButton,
  IconPreview,
  IconPickerCopy,
  IconPickerPanel,
  IconOptionButton,
  IconOptionText,
  LinkInputs,
  EditorActionDock,
  DockSecondaryButton,
  DockPrimaryButton,
  ToastStack,
  ToastCard,
  AvatarFallback,
} from "src/routes/Admin/AdminProfileWorkspace.styles"
import {
  WORKSPACE_SECTIONS,
  buildWorkspaceFallback,
  createBlankAboutProject,
  createBlankAboutSection,
  createBlankLinkItem,
  type LinkTab,
  moveListItem,
  type PreviewMode,
  reorderListItem,
  serializeWorkspaceSection,
  toPayloadLinks,
  validateLinkInputs,
  type WorkspaceSectionId,
} from "src/routes/Admin/AdminProfileWorkspaceModel"
import AdminProfileImageEditorModal from "src/routes/Admin/AdminProfileImageEditorModal"
import AdminProfilePreviewRail from "src/routes/Admin/AdminProfilePreviewRail"
import { renderAdminProfileWorkspaceSection } from "src/routes/Admin/AdminProfileWorkspaceSectionRenderer"
import {
  PROFILE_IMAGE_DRAFT_DEFAULT_SOURCE_SIZE,
  PROFILE_IMAGE_UPLOAD_RETRY_DELAY_MS,
  PROFILE_UNSAVED_CHANGES_MESSAGE,
  parseResponseErrorBody,
  readImageSourceSizeFromFile,
  requestProfileImageUpload,
  revalidatePublicBlogAppearance,
  sleep,
} from "src/routes/Admin/AdminProfilePersistenceModel"
import {
  AdminWorkspaceActionDockInner,
  AdminWorkspaceHeroCopy,
  AdminWorkspaceHeroLayout,
} from "src/routes/Admin/AdminSurfacePrimitives"

type OpenIconPicker = `${LinkTab}:${number}` | null

export const AdminProfileWorkspaceSections = (props: Record<string, any>) => {
  const { initialMember, router, queryClient, sessionMember, fallbackWorkspace, workspaceQuery, activeSection, setActiveSection, linkTab, setLinkTab, previewMode, setPreviewMode, isPreviewExpanded, setIsPreviewExpanded, draggingLinkIndex, setDraggingLinkIndex, dragOverLinkIndex, setDragOverLinkIndex, dragOverLinkPosition, setDragOverLinkPosition, openIconPicker, setOpenIconPicker, loadingKey, setLoadingKey, workspaceNotice, setWorkspaceNotice, imageNotice, setImageNotice, displayNameInput, setDisplayNameInput, remoteDraft, setRemoteDraft, publishedSnapshot, setPublishedSnapshot, draft, setDraft, profileImageFileName, setProfileImageFileName, isProfileImageEditorOpen, setIsProfileImageEditorOpen, profileImageDraftFile, setProfileImageDraftFile, profileImageDraftPreviewUrl, setProfileImageDraftPreviewUrl, profileImageDraftFocusX, setProfileImageDraftFocusX, profileImageDraftFocusY, setProfileImageDraftFocusY, profileImageDraftZoom, setProfileImageDraftZoom, profileImageDraftSourceSize, setProfileImageDraftSourceSize, profileImageDraftNotice, setProfileImageDraftNotice, profileImageDraftFrameRef, profileImageFileInputRef, profileImageDraftFileSeqRef, syncPublishedAdminProfileCache, applyWorkspaceState, hasWorkspaceUnsavedChanges, hasDisplayNameDirty, hasUnsavedChanges, hasPublishedDiff, sectionStateMap, refreshWorkspace, persistDisplayName, validateDraftBeforePersistence, buildDraftPayload, saveWorkspaceDraft, updateDraft, updateLinkItem, appendLinkItem, removeLinkItem, moveLinkItem, reorderLinkItems, updateAboutSection, addAboutSection, removeAboutSection, moveAboutSection, addAboutItem, removeAboutItem, moveAboutItem, updateAboutProject, addAboutProject, removeAboutProject, moveAboutProject, applyProfileImageDraftPreviewStyle, normalizeProfileImageDraftTransform, computeAnchoredZoomTransform, computeDraggedProfileImageTransform, commitProfileImageDraftTransform, finalizeProfileImageDraftPointer, handleProfileImageDraftPointerDown, handleProfileImageDraftPointerMove, isProfileImageDraftDragging, resetProfileImageDraftInteractions, scheduleProfileImageDraftTransform, profileImageDraftTransformRef, clearProfileImageDraft, handleDraftFileChange, handleUploadMemberProfileImage, handleApplyProfileImageDraft, handleSaveDraft, handlePublish } = props as Record<string, any> & { initialMember: AuthMember; draft: ProfileWorkspaceContent; publishedSnapshot: ProfileWorkspaceContent; visibleLinks: ProfileCardLinkItem[] }
  const displayName = displayNameInput.trim() || sessionMember.nickname || sessionMember.username || "관리자"
  const displayNameInitial = displayName.slice(0, 2).toUpperCase()
  const previewContent = previewMode === "published" ? publishedSnapshot : draft
  const missingExposureItems: string[] = []
  if (!displayNameInput.trim()) missingExposureItems.push("계정 이름")
  if (!draft.profileBio.trim()) missingExposureItems.push("짧은 소개")
  if (!draft.aboutHeadline.trim() || !draft.aboutRole.trim() || !draft.aboutBio.trim()) missingExposureItems.push("About 소개")
  if (!draft.aboutProjectSectionTitle.trim() || draft.aboutProjects.length === 0) missingExposureItems.push("About 프로젝트")
  if (!draft.homeIntroTitle.trim() || !draft.homeIntroDescription.trim()) missingExposureItems.push("메인 헤더 카피")
  const hasMissingExposureItems = missingExposureItems.length > 0
  const activeSectionMeta = WORKSPACE_SECTIONS.find((section) => section.id === activeSection) || WORKSPACE_SECTIONS[0]
  const visibleLinks = linkTab === "service" ? draft.serviceLinks : draft.contactLinks
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
            <h1>메인과 About에 보일 인상을 다듬습니다</h1>
          </AdminWorkspaceHeroCopy>
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
              <div className="titleRow">
                <h2>{activeSectionMeta.label}</h2>
                {activeSectionState.dirty ? (
                  <SectionStateBadge data-tone="dirty">저장 안 됨</SectionStateBadge>
                ) : activeSectionState.publishedDiff ? (
                  <SectionStateBadge data-tone="published">공개본과 차이 있음</SectionStateBadge>
                ) : null}
              </div>
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
          displayNameInitial={displayNameInitial}
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
          onPointerCancel={finalizeProfileImageDraftPointer}
          onPointerDown={handleProfileImageDraftPointerDown}
          onPointerMove={handleProfileImageDraftPointerMove}
          onPointerUp={finalizeProfileImageDraftPointer}
          onRequestClose={() => {
            setIsProfileImageEditorOpen(false)
            resetProfileImageDraftInteractions()
          }}
          onSelectFile={() => profileImageFileInputRef.current?.click()}
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
