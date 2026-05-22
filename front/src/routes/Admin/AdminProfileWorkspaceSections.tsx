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
  const renderActiveSection = () => {
    switch (activeSection) {
      case "identity":
        return (
          <SectionStack>
            <AvatarWorkspaceCard>
              <div className="avatarPreview">
                {draft.profileImageUrl ? (
                  <ProfileImage
                    src={draft.profileImageUrl}
                    alt={displayName}
                    width={88}
                    height={88}
                    priority
                  />
                ) : (
                  <AvatarFallback>{displayNameInitial}</AvatarFallback>
                )}
              </div>
              <div className="avatarMeta">
                <strong>{displayName}</strong>
                {profileImageFileName ? <span>{profileImageFileName}</span> : null}
              </div>
              <GhostButton type="button" onClick={() => setIsProfileImageEditorOpen(true)} disabled={loadingKey === "upload"}>
                {loadingKey === "upload" ? "업로드 중..." : "이미지 바꾸기"}
              </GhostButton>
            </AvatarWorkspaceCard>

            <FieldSectionCard>
              <FieldGrid data-columns="2">
                <FieldBox>
                  <FieldLabel htmlFor="profile-display-name">계정 이름</FieldLabel>
                  <Input
                    id="profile-display-name"
                    value={displayNameInput}
                    maxLength={30}
                    placeholder="공개 프로필에 표시할 이름"
                    autoComplete="nickname"
                    onChange={(event) => setDisplayNameInput(event.target.value)}
                  />
                </FieldBox>
                <FieldBox>
                  <FieldLabel htmlFor="profile-role">한 줄 역할</FieldLabel>
                  <Input
                    id="profile-role"
                    value={draft.profileRole}
                    placeholder="예: 플랫폼 백엔드 엔지니어"
                    onChange={(event) => updateDraft("profileRole", event.target.value)}
                  />
                </FieldBox>
                <FieldBox data-span="full">
                  <FieldLabel htmlFor="profile-bio">짧은 소개</FieldLabel>
                  <TextArea
                    id="profile-bio"
                    value={draft.profileBio}
                    placeholder="프로필 카드에서 바로 읽히는 한두 문장 소개를 적어주세요."
                    onChange={(event) => updateDraft("profileBio", event.target.value)}
                  />
                </FieldBox>
              </FieldGrid>
            </FieldSectionCard>
          </SectionStack>
        )

      case "about":
        return (
          <SectionStack>
            <FieldSectionCard>
              <SectionBlockHeader>
                <div>
                  <h3>상단 소개</h3>
                </div>
              </SectionBlockHeader>
              <FieldGrid data-columns="2">
                <FieldBox data-span="full">
                  <FieldLabel htmlFor="about-headline">상단 문구</FieldLabel>
                  <Input
                    id="about-headline"
                    value={draft.aboutHeadline}
                    placeholder="예: 이유를 먼저 따지고, 운영 가능한 시스템을 설계합니다."
                    onChange={(event) => updateDraft("aboutHeadline", event.target.value)}
                  />
                </FieldBox>
                <FieldBox>
                  <FieldLabel htmlFor="about-role">페이지 역할 문구</FieldLabel>
                  <Input
                    id="about-role"
                    value={draft.aboutRole}
                    placeholder="예: 운영과 구조를 설계하는 백엔드 엔지니어"
                    onChange={(event) => updateDraft("aboutRole", event.target.value)}
                  />
                </FieldBox>
                <FieldBox data-span="full">
                  <FieldLabel htmlFor="about-bio">소개 문단</FieldLabel>
                  <TextArea
                    id="about-bio"
                    value={draft.aboutBio}
                    placeholder="About 페이지 첫 문단에서 보여줄 소개를 적어주세요."
                    onChange={(event) => updateDraft("aboutBio", event.target.value)}
                  />
                </FieldBox>
              </FieldGrid>
            </FieldSectionCard>

            <FieldSectionCard>
              <SectionBlockHeader>
                <div>
                  <h3>상세 블록</h3>
                </div>
                <GhostButton type="button" onClick={addAboutSection}>
                  블록 추가
                </GhostButton>
              </SectionBlockHeader>

              {draft.aboutSections.length > 0 ? (
                <AboutSectionList>
                  {draft.aboutSections.map((section, sectionIndex) => (
                    <AboutSectionCard key={section.id || `section-${sectionIndex}`}>
                      <AboutSectionCardHeader>
                        <div>
                          <span>상세 블록 {sectionIndex + 1}</span>
                          <label>
                            <input
                              type="checkbox"
                              checked={section.dividerBefore}
                              onChange={(event) =>
                                updateAboutSection(sectionIndex, (current: AboutSectionBlock) => ({
                                  ...current,
                                  dividerBefore: event.target.checked,
                                }))
                              }
                            />
                            이전 블록과 구분선 넣기
                          </label>
                        </div>
                        <InlineActionRow>
                          <MiniButton
                            type="button"
                            disabled={sectionIndex === 0}
                            onClick={() => moveAboutSection(sectionIndex, -1)}
                          >
                            위로
                          </MiniButton>
                          <MiniButton
                            type="button"
                            disabled={sectionIndex === draft.aboutSections.length - 1}
                            onClick={() => moveAboutSection(sectionIndex, 1)}
                          >
                            아래로
                          </MiniButton>
                          <DangerButton type="button" onClick={() => removeAboutSection(sectionIndex)}>
                            삭제
                          </DangerButton>
                        </InlineActionRow>
                      </AboutSectionCardHeader>

                      <FieldBox>
                        <FieldLabel>블록 제목</FieldLabel>
                        <Input
                          value={section.title}
                          placeholder="예: 경력"
                          onChange={(event) =>
                            updateAboutSection(sectionIndex, (current: AboutSectionBlock) => ({
                              ...current,
                              title: event.target.value,
                            }))
                          }
                        />
                      </FieldBox>

                      <ItemList>
                        {section.items.map((item, itemIndex) => (
                          <ItemRow key={`${section.id}-${itemIndex}`}>
                            <span className="bullet">-</span>
                            <Input
                              value={item}
                              placeholder="항목 내용을 입력하세요."
                              onChange={(event) =>
                                updateAboutSection(sectionIndex, (current: AboutSectionBlock) => ({
                                  ...current,
                                  items: current.items.map((entry, index) =>
                                    index === itemIndex ? event.target.value : entry
                                  ),
                                }))
                              }
                            />
                            <InlineActionRow>
                              <MiniButton
                                type="button"
                                disabled={itemIndex === 0}
                                onClick={() => moveAboutItem(sectionIndex, itemIndex, -1)}
                              >
                                위로
                              </MiniButton>
                              <MiniButton
                                type="button"
                                disabled={itemIndex === section.items.length - 1}
                                onClick={() => moveAboutItem(sectionIndex, itemIndex, 1)}
                              >
                                아래로
                              </MiniButton>
                              <DangerButton type="button" onClick={() => removeAboutItem(sectionIndex, itemIndex)}>
                                삭제
                              </DangerButton>
                            </InlineActionRow>
                          </ItemRow>
                        ))}
                      </ItemList>

                      <GhostButton type="button" onClick={() => addAboutItem(sectionIndex)}>
                        항목 추가
                      </GhostButton>
                    </AboutSectionCard>
                  ))}
                </AboutSectionList>
              ) : (
                <EmptyStateCard>
                  <strong>아직 상세 블록이 없습니다</strong>
                </EmptyStateCard>
              )}
            </FieldSectionCard>

            <FieldSectionCard>
              <SectionBlockHeader>
                <div>
                  <h3>프로젝트</h3>
                </div>
                <GhostButton type="button" onClick={addAboutProject}>
                  프로젝트 추가
                </GhostButton>
              </SectionBlockHeader>

              <FieldBox>
                <FieldLabel htmlFor="about-project-title">섹션 제목</FieldLabel>
                <Input
                  id="about-project-title"
                  value={draft.aboutProjectSectionTitle}
                  placeholder="예: 프로젝트"
                  onChange={(event) => updateDraft("aboutProjectSectionTitle", event.target.value)}
                />
              </FieldBox>

              {draft.aboutProjects.length > 0 ? (
                <AboutProjectList>
                  {draft.aboutProjects.map((project, projectIndex) => (
                    <AboutProjectCard key={project.id || `project-${projectIndex}`}>
                      <AboutSectionCardHeader>
                        <div>
                          <span>프로젝트 {projectIndex + 1}</span>
                        </div>
                        <InlineActionRow>
                          <MiniButton
                            type="button"
                            disabled={projectIndex === 0}
                            onClick={() => moveAboutProject(projectIndex, -1)}
                          >
                            위로
                          </MiniButton>
                          <MiniButton
                            type="button"
                            disabled={projectIndex === draft.aboutProjects.length - 1}
                            onClick={() => moveAboutProject(projectIndex, 1)}
                          >
                            아래로
                          </MiniButton>
                          <DangerButton type="button" onClick={() => removeAboutProject(projectIndex)}>
                            삭제
                          </DangerButton>
                        </InlineActionRow>
                      </AboutSectionCardHeader>

                      <FieldGrid data-columns="2">
                        <FieldBox>
                          <FieldLabel>제목</FieldLabel>
                          <Input
                            value={project.name}
                            placeholder="예: aquila-blog"
                            onChange={(event) =>
                              updateAboutProject(projectIndex, (current: AboutProjectBlock) => ({
                                ...current,
                                name: event.target.value,
                              }))
                            }
                          />
                        </FieldBox>
                        <FieldBox>
                          <FieldLabel>역할</FieldLabel>
                          <Input
                            value={project.role}
                            placeholder="예: Full-stack · Editor/SSR/Deploy"
                            onChange={(event) =>
                              updateAboutProject(projectIndex, (current: AboutProjectBlock) => ({
                                ...current,
                                role: event.target.value,
                              }))
                            }
                          />
                        </FieldBox>
                        <FieldBox data-span="full">
                          <FieldLabel>요약</FieldLabel>
                          <TextArea
                            value={project.summary}
                            placeholder="프로젝트 목록에 표시할 설명"
                            onChange={(event) =>
                              updateAboutProject(projectIndex, (current: AboutProjectBlock) => ({
                                ...current,
                                summary: event.target.value,
                              }))
                            }
                          />
                        </FieldBox>
                        <FieldBox>
                          <FieldLabel>URL</FieldLabel>
                          <Input
                            value={project.href}
                            placeholder="https://..."
                            onChange={(event) =>
                              updateAboutProject(projectIndex, (current: AboutProjectBlock) => ({
                                ...current,
                                href: event.target.value,
                              }))
                            }
                          />
                        </FieldBox>
                        <FieldBox>
                          <FieldLabel>링크 라벨</FieldLabel>
                          <Input
                            value={project.linkLabel}
                            placeholder="예: 링크 보기"
                            onChange={(event) =>
                              updateAboutProject(projectIndex, (current: AboutProjectBlock) => ({
                                ...current,
                                linkLabel: event.target.value,
                              }))
                            }
                          />
                        </FieldBox>
                      </FieldGrid>
                    </AboutProjectCard>
                  ))}
                </AboutProjectList>
              ) : (
                <EmptyStateCard>
                  <strong>아직 프로젝트가 없습니다</strong>
                </EmptyStateCard>
              )}
            </FieldSectionCard>
          </SectionStack>
        )

      case "home":
        return (
          <SectionStack>
            <FieldSectionCard>
              <SectionBlockHeader>
                <div>
                  <h3>헤더 문구</h3>
                </div>
              </SectionBlockHeader>
              <FieldBox>
                <FieldLabel htmlFor="blog-title">헤더 제목</FieldLabel>
                <Input
                  id="blog-title"
                  value={draft.blogTitle}
                  placeholder="예: aquilaXk's Blog"
                  onChange={(event) => updateDraft("blogTitle", event.target.value)}
                />
              </FieldBox>
            </FieldSectionCard>

            <FieldSectionCard>
              <SectionBlockHeader>
                <div>
                  <h3>홈 인트로</h3>
                </div>
              </SectionBlockHeader>
              <FieldGrid data-columns="2">
                <FieldBox>
                  <FieldLabel htmlFor="home-title">첫 문장</FieldLabel>
                  <Input
                    id="home-title"
                    value={draft.homeIntroTitle}
                    placeholder="예: 비밀스러운 IT 공작소"
                    onChange={(event) => updateDraft("homeIntroTitle", event.target.value)}
                  />
                </FieldBox>
                <FieldBox data-span="full">
                  <FieldLabel htmlFor="home-description">설명</FieldLabel>
                  <TextArea
                    id="home-description"
                    value={draft.homeIntroDescription}
                    placeholder="설명을 입력하세요"
                    onChange={(event) => updateDraft("homeIntroDescription", event.target.value)}
                  />
                </FieldBox>
              </FieldGrid>
            </FieldSectionCard>
          </SectionStack>
        )

      case "design":
        return (
          <SectionStack>
            <FieldSectionCard>
              <SectionBlockHeader>
                <div>
                  <h3>블로그 디자인</h3>
                </div>
              </SectionBlockHeader>
              <FieldGrid data-columns="2">
                <FieldBox as="div">
                  <FieldLabel as="span">공개 디자인</FieldLabel>
                  <SegmentedControl role="group" aria-label="공개 블로그 디자인">
                    <SegmentButton
                      type="button"
                      data-active={draft.blogDesign === "legacy"}
                      onClick={() => updateDraft("blogDesign", "legacy")}
                    >
                      Legacy
                    </SegmentButton>
                    <SegmentButton
                      type="button"
                      data-active={draft.blogDesign === "grid"}
                      onClick={() => updateDraft("blogDesign", "grid")}
                    >
                      Grid
                    </SegmentButton>
                  </SegmentedControl>
                </FieldBox>

                {draft.blogDesign === "legacy" ? (
                  <FieldBox as="div">
                    <FieldLabel as="span">Legacy 색상</FieldLabel>
                    <SegmentedControl role="group" aria-label="Legacy 색상">
                      <SegmentButton
                        type="button"
                        data-active={draft.legacyBlogScheme === "light"}
                        onClick={() => updateDraft("legacyBlogScheme", "light")}
                      >
                        Light
                      </SegmentButton>
                      <SegmentButton
                        type="button"
                        data-active={draft.legacyBlogScheme === "dark"}
                        onClick={() => updateDraft("legacyBlogScheme", "dark")}
                      >
                        Dark
                      </SegmentButton>
                    </SegmentedControl>
                  </FieldBox>
                ) : (
                  <EmptyStateCard>
                    <strong>Grid dark presentation</strong>
                    <p>Grid 디자인은 dark presentation으로 고정됩니다.</p>
                  </EmptyStateCard>
                )}
              </FieldGrid>
            </FieldSectionCard>
          </SectionStack>
        )

      case "links":
        return (
          <SectionStack>
            <FieldSectionCard>
              <SectionBlockHeader>
                <div>
                  <h3>외부 링크</h3>
                </div>
                <SegmentedControl>
                  <SegmentButton
                    type="button"
                    data-active={linkTab === "service"}
                    onClick={() => setLinkTab("service")}
                  >
                    서비스
                  </SegmentButton>
                  <SegmentButton
                    type="button"
                    data-active={linkTab === "contact"}
                    onClick={() => setLinkTab("contact")}
                  >
                    연락 채널
                  </SegmentButton>
                </SegmentedControl>
              </SectionBlockHeader>

              <LinkManagerHeader>
                <div>
                  <strong>{linkTab === "service" ? "서비스 링크" : "연락 채널"}</strong>
                </div>
                <GhostButton type="button" onClick={() => appendLinkItem(linkTab)}>
                  링크 추가
                </GhostButton>
              </LinkManagerHeader>
              {visibleLinks.length > 0 ? (
                <LinkCardList>
                  {visibleLinks.map((item, index) => {
                    const section = linkTab
                    const options = getProfileCardIconOptions(section)
                    const pickerKey = `${section}:${index}` as OpenIconPicker
                    const previewHref = normalizeProfileLinkHref(section, item.href)
                    const optionLabel = options.find((option) => option.id === item.icon)?.label || "아이콘"

                    return (
                      <LinkRowCard
                        key={`${section}-${index}`}
                        draggable={true}
                        data-dragging={draggingLinkIndex === index ? "true" : "false"}
                        data-drop-target={dragOverLinkIndex === index && draggingLinkIndex !== index ? "true" : "false"}
                        data-drop-position={dragOverLinkIndex === index ? dragOverLinkPosition || undefined : undefined}
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = "move"
                          event.dataTransfer.setData("text/plain", `${section}:${index}`)
                          setDraggingLinkIndex(index)
                          setDragOverLinkIndex(index)
                          setDragOverLinkPosition("after")
                        }}
                        onDragOver={(event) => {
                          event.preventDefault()
                          event.dataTransfer.dropEffect = "move"
                          const bounds = (event.currentTarget as HTMLDivElement).getBoundingClientRect()
                          const nextPosition = event.clientY < bounds.top + bounds.height / 2 ? "before" : "after"
                          if (dragOverLinkIndex !== index) {
                            setDragOverLinkIndex(index)
                          }
                          setDragOverLinkPosition(nextPosition)
                        }}
                        onDrop={(event) => {
                          event.preventDefault()
                          const payload = event.dataTransfer.getData("text/plain")
                          const [dragSection, rawIndex] = payload.split(":")
                          const fromIndex = Number.parseInt(rawIndex ?? "", 10)
                          if (dragSection === section && Number.isFinite(fromIndex)) {
                            const rawTargetIndex =
                              dragOverLinkPosition === "after" && index < visibleLinks.length - 1 ? index + 1 : index
                            const normalizedTargetIndex =
                              fromIndex < rawTargetIndex ? rawTargetIndex - 1 : rawTargetIndex
                            const nextTargetIndex = Math.max(0, Math.min(visibleLinks.length - 1, normalizedTargetIndex))
                            reorderLinkItems(section, fromIndex, nextTargetIndex)
                          }
                          setDraggingLinkIndex(null)
                          setDragOverLinkIndex(null)
                          setDragOverLinkPosition(null)
                        }}
                        onDragEnd={() => {
                          setDraggingLinkIndex(null)
                          setDragOverLinkIndex(null)
                          setDragOverLinkPosition(null)
                        }}
                      >
                        <IconPickerField data-icon-picker-root="true">
                          <FieldLabel as="span">아이콘</FieldLabel>
                          <IconPickerButton
                            type="button"
                            aria-expanded={openIconPicker === pickerKey}
                            onClick={() => setOpenIconPicker((current: OpenIconPicker) => (current === pickerKey ? null : pickerKey))}
                          >
                            <IconPreview>
                              <AppIcon name={item.icon} />
                            </IconPreview>
                            <IconPickerCopy>
                              <strong>{optionLabel}</strong>
                              <span>{item.icon}</span>
                            </IconPickerCopy>
                            <AppIcon name="chevron-down" />
                          </IconPickerButton>
                          {openIconPicker === pickerKey ? (
                            <IconPickerPanel role="listbox" aria-label="링크 아이콘 선택">
                              {options.map((option) => (
                                <IconOptionButton
                                  key={option.id}
                                  type="button"
                                  data-selected={option.id === item.icon}
                                  onClick={() => {
                                    updateLinkItem(section, index, "icon", option.id)
                                    setOpenIconPicker(null)
                                  }}
                                >
                                  <IconPreview data-compact={true}>
                                    <AppIcon name={option.id} />
                                  </IconPreview>
                                  <IconOptionText>
                                    <strong>{option.label}</strong>
                                    <span>{option.id}</span>
                                  </IconOptionText>
                                </IconOptionButton>
                              ))}
                            </IconPickerPanel>
                          ) : null}
                        </IconPickerField>

                        <LinkInputs>
                          <FieldBox>
                            <FieldLabel>이름</FieldLabel>
                            <Input
                              value={item.label}
                              placeholder={section === "service" ? "예: aquila-blog" : "예: 이메일"}
                              onChange={(event) => updateLinkItem(section, index, "label", event.target.value)}
                            />
                          </FieldBox>
                          <FieldBox>
                            <FieldLabel>연결 주소</FieldLabel>
                            <Input
                              value={item.href}
                              placeholder={
                                section === "service" ? "https://..." : "mailto:me@example.com 또는 https://..."
                              }
                              onChange={(event) => updateLinkItem(section, index, "href", event.target.value)}
                            />
                          </FieldBox>
                        </LinkInputs>

                        <InlineActionRow className="linkActions">
                          <DragHandleButton aria-hidden="true">
                            <AppIcon name="list" />
                            드래그 정렬
                          </DragHandleButton>
                          <InlineActionRow className="linkActionButtons">
                            {previewHref && isAllowedProfileLinkHref(section, item.href) ? (
                              <PreviewAnchor href={previewHref} target="_blank" rel="noreferrer">
                                열기
                              </PreviewAnchor>
                            ) : (
                              <MiniButton type="button" disabled>
                                열기
                              </MiniButton>
                            )}
                            <MiniButton
                              className="reorderButton"
                              type="button"
                              disabled={index === 0}
                              onClick={() => moveLinkItem(section, index, -1)}
                            >
                              위로
                            </MiniButton>
                            <MiniButton
                              className="reorderButton"
                              type="button"
                              disabled={index === visibleLinks.length - 1}
                              onClick={() => moveLinkItem(section, index, 1)}
                            >
                              아래로
                            </MiniButton>
                            <DangerButton type="button" onClick={() => removeLinkItem(section, index)}>
                              삭제
                            </DangerButton>
                          </InlineActionRow>
                        </InlineActionRow>
                      </LinkRowCard>
                    )
                  })}
                </LinkCardList>
              ) : (
                <EmptyStateCard>
                  <strong>아직 등록된 링크가 없습니다</strong>
                </EmptyStateCard>
              )}
            </FieldSectionCard>
          </SectionStack>
        )
    }
  }

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
            {renderActiveSection()}
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
