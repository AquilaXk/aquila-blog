import { type DehydratedState, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/router"
import { useCallback, useEffect, useMemo, useState } from "react"
import { apiFetch } from "src/apis/backend/client"
import type { AuthMember } from "src/hooks/useAuthSession"
import useAuthSession from "src/hooks/useAuthSession"
import { setAdminProfileCache, toAdminProfile } from "src/hooks/useAdminProfile"
import { setProfileWorkspaceCache, useProfileWorkspace } from "src/hooks/useProfileWorkspace"
import {
  buildProfileWorkspaceAdminProfileCacheFields,
  normalizeProfileWorkspaceContent,
  ProfileWorkspaceContent,
  ProfileWorkspaceResponse,
  serializeProfileWorkspaceContent,
} from "src/libs/profileWorkspace"
import { saveProfileCardWithConflictRetry } from "src/libs/profileCardSave"
import {
  WORKSPACE_SECTIONS,
  buildWorkspaceFallback,
  type LinkTab,
  type PreviewMode,
  serializeWorkspaceSection,
  toPayloadLinks,
  validateLinkInputs,
  type WorkspaceSectionId,
} from "src/routes/Admin/AdminProfileWorkspaceModel"
import {
  PROFILE_UNSAVED_CHANGES_MESSAGE,
  revalidatePublicBlogAppearance,
} from "src/routes/Admin/AdminProfilePersistenceModel"
import {
  type OpenIconPicker,
  useAdminProfileWorkspaceDraftActions,
} from "src/routes/Admin/AdminProfileWorkspacePageDraftActions"
import { useAdminProfileWorkspaceImageDraft } from "src/routes/Admin/AdminProfileWorkspacePageImageDraft"

export type NoticeTone = "idle" | "loading" | "success" | "error"

export type AdminProfileWorkspacePageProps = {
  dehydratedState: DehydratedState
  initialMember: AuthMember
  initialWorkspace: ProfileWorkspaceResponse | null
}

type AdminProfileBootstrapPayload = {
  member: AuthMember
  workspace: ProfileWorkspaceResponse
}

export const useAdminProfileWorkspacePageModel = ({
  initialMember,
  initialWorkspace,
}: AdminProfileWorkspacePageProps) => {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { me, authStatus, setMe } = useAuthSession()
  const sessionMember =
    authStatus === "loading" || authStatus === "unavailable" ? initialMember : me || initialMember
  const fallbackWorkspace = useMemo(
    () => buildWorkspaceFallback(sessionMember || initialMember, initialWorkspace),
    [initialMember, initialWorkspace, sessionMember]
  )
  const workspaceQuery = useProfileWorkspace(sessionMember?.id ?? initialMember.id, fallbackWorkspace)

  const [activeSection, setActiveSection] = useState<WorkspaceSectionId>("identity")
  const [linkTab, setLinkTab] = useState<LinkTab>("service")
  const [previewMode, setPreviewMode] = useState<PreviewMode>("draft")
  const [isPreviewExpanded, setIsPreviewExpanded] = useState(false)
  const [draggingLinkIndex, setDraggingLinkIndex] = useState<number | null>(null)
  const [dragOverLinkIndex, setDragOverLinkIndex] = useState<number | null>(null)
  const [dragOverLinkPosition, setDragOverLinkPosition] = useState<"before" | "after" | null>(null)
  const [openIconPicker, setOpenIconPicker] = useState<OpenIconPicker>(null)
  const [loadingKey, setLoadingKey] = useState("")
  const [workspaceNotice, setWorkspaceNotice] = useState<{ tone: NoticeTone; text: string }>({
    tone: "idle",
    text: "",
  })
  const [imageNotice, setImageNotice] = useState<{ tone: NoticeTone; text: string }>({
    tone: "idle",
    text: "",
  })
  const [displayNameInput, setDisplayNameInput] = useState(
    (initialMember.nickname || initialMember.username || "").trim()
  )
  const [remoteDraft, setRemoteDraft] = useState<ProfileWorkspaceContent>(fallbackWorkspace.draft)
  const [publishedSnapshot, setPublishedSnapshot] = useState<ProfileWorkspaceContent>(fallbackWorkspace.published)
  const [draft, setDraft] = useState<ProfileWorkspaceContent>(fallbackWorkspace.draft)
  const {
    addAboutItem,
    addAboutProject,
    addAboutSection,
    appendLinkItem,
    moveAboutItem,
    moveAboutProject,
    moveAboutSection,
    moveLinkItem,
    removeAboutItem,
    removeAboutProject,
    removeAboutSection,
    removeLinkItem,
    reorderLinkItems,
    updateAboutProject,
    updateAboutSection,
    updateDraft,
    updateLinkItem,
  } = useAdminProfileWorkspaceDraftActions({
    setDraft,
    setOpenIconPicker,
  })


  const syncPublishedAdminProfileCache = useCallback(
    (content: ProfileWorkspaceContent) => {
      const owner = sessionMember || initialMember
      setAdminProfileCache(
        queryClient,
        toAdminProfile({
          username: owner.username,
          name: owner.nickname || owner.username,
          nickname: owner.nickname || owner.username,
          ...buildProfileWorkspaceAdminProfileCacheFields(content),
        })
      )
    },
    [initialMember, queryClient, sessionMember]
  )

  const applyWorkspaceState = useCallback(
    (workspace: ProfileWorkspaceResponse) => {
      const normalizedDraft = normalizeProfileWorkspaceContent(workspace.draft)
      const normalizedPublished = normalizeProfileWorkspaceContent(workspace.published)
      setRemoteDraft(normalizedDraft)
      setPublishedSnapshot(normalizedPublished)
      setDraft(normalizedDraft)
      if (sessionMember?.id) {
        setProfileWorkspaceCache(queryClient, sessionMember.id, {
          ...workspace,
          draft: normalizedDraft,
          published: normalizedPublished,
        })
      }
    },
    [queryClient, sessionMember]
  )

  useEffect(() => {
    if (!workspaceQuery.data) return
    applyWorkspaceState(workspaceQuery.data)
  }, [applyWorkspaceState, workspaceQuery.data])

  useEffect(() => {
    const nextDisplayName = (sessionMember?.nickname || sessionMember?.username || "").trim()
    setDisplayNameInput(nextDisplayName)
  }, [sessionMember?.nickname, sessionMember?.username])

  useEffect(() => {
    if (workspaceNotice.tone !== "success" && workspaceNotice.tone !== "error") return
    const timeout = window.setTimeout(() => {
      setWorkspaceNotice({ tone: "idle", text: "" })
    }, 3600)
    return () => window.clearTimeout(timeout)
  }, [workspaceNotice])

  useEffect(() => {
    if (imageNotice.tone !== "success" && imageNotice.tone !== "error") return
    const timeout = window.setTimeout(() => {
      setImageNotice({ tone: "idle", text: "" })
    }, 3600)
    return () => window.clearTimeout(timeout)
  }, [imageNotice])

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (target.closest("[data-icon-picker-root='true']")) return
      setOpenIconPicker(null)
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenIconPicker(null)
      }
    }

    document.addEventListener("mousedown", handlePointerDown)
    document.addEventListener("keydown", handleEscape)
    return () => {
      document.removeEventListener("mousedown", handlePointerDown)
      document.removeEventListener("keydown", handleEscape)
    }
  }, [])



  const hasWorkspaceUnsavedChanges = useMemo(
    () => serializeProfileWorkspaceContent(draft) !== serializeProfileWorkspaceContent(remoteDraft),
    [draft, remoteDraft]
  )
  const hasDisplayNameDirty = useMemo(() => {
    const currentDisplayName = (sessionMember?.nickname || sessionMember?.username || "").trim()
    return displayNameInput.trim() !== currentDisplayName
  }, [displayNameInput, sessionMember?.nickname, sessionMember?.username])
  const hasUnsavedChanges = hasDisplayNameDirty || hasWorkspaceUnsavedChanges
  const hasPublishedDiff = useMemo(
    () => serializeProfileWorkspaceContent(remoteDraft) !== serializeProfileWorkspaceContent(publishedSnapshot),
    [publishedSnapshot, remoteDraft]
  )
  const sectionStateMap = useMemo(() => {
    return WORKSPACE_SECTIONS.reduce<Record<WorkspaceSectionId, { dirty: boolean; publishedDiff: boolean }>>(
      (acc, section) => {
        acc[section.id] = {
          dirty:
            (section.id === "identity" ? hasDisplayNameDirty : false) ||
            serializeWorkspaceSection(draft, section.id) !==
              serializeWorkspaceSection(remoteDraft, section.id),
          publishedDiff:
            serializeWorkspaceSection(remoteDraft, section.id) !==
            serializeWorkspaceSection(publishedSnapshot, section.id),
        }
        return acc
      },
      {
        identity: { dirty: false, publishedDiff: false },
        about: { dirty: false, publishedDiff: false },
        home: { dirty: false, publishedDiff: false },
        links: { dirty: false, publishedDiff: false },
      }
    )
  }, [draft, hasDisplayNameDirty, publishedSnapshot, remoteDraft])

  useEffect(() => {
    if (typeof window === "undefined" || !sessionMember || !hasUnsavedChanges) return

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = PROFILE_UNSAVED_CHANGES_MESSAGE
      return PROFILE_UNSAVED_CHANGES_MESSAGE
    }

    const handleRouteChangeStart = (nextUrl: string) => {
      if (nextUrl === router.asPath) return
      const confirmed = window.confirm(PROFILE_UNSAVED_CHANGES_MESSAGE)
      if (confirmed) return

      router.events.emit("routeChangeError")
      const error = new Error("Navigation aborted due to unsaved profile changes.") as Error & {
        cancelled?: boolean
      }
      error.cancelled = true
      throw error
    }

    window.addEventListener("beforeunload", handleBeforeUnload)
    router.events.on("routeChangeStart", handleRouteChangeStart)
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload)
      router.events.off("routeChangeStart", handleRouteChangeStart)
    }
  }, [hasUnsavedChanges, router, sessionMember])

  const refreshWorkspace = useCallback(
    async (memberId: number) => {
      const nextWorkspace = await apiFetch<ProfileWorkspaceResponse>(
        `/member/api/v1/adm/members/${memberId}/profileWorkspace`
      )
      applyWorkspaceState(nextWorkspace)
      return nextWorkspace
    },
    [applyWorkspaceState]
  )

  const {
    applyProfileImageDraftPreviewStyle,
    clearProfileImageDraft,
    commitProfileImageDraftTransform,
    computeAnchoredZoomTransform,
    computeDraggedProfileImageTransform,
    finalizeProfileImageDraftPointer,
    handleApplyProfileImageDraft,
    handleDraftFileChange,
    handleProfileImageDraftPointerDown,
    handleProfileImageDraftPointerMove,
    handleDeletePreviousProfileImage,
    handleSelectPreviousProfileImage,
    handleUploadMemberProfileImage,
    isProfileImageDraftDragging,
    isProfileImageEditorOpen,
    normalizeProfileImageDraftTransform,
    profileImageDraftFile,
    profileImageDraftFileSeqRef,
    profileImageDraftFocusX,
    profileImageDraftFocusY,
    profileImageDraftFrameRef,
    profileImageDraftNotice,
    profileImageDraftPreviewUrl,
    profileImageDraftSourceSize,
    profileImageDraftTransformRef,
    profileImageDraftZoom,
    profileImageFileInputRef,
    profileImageFileName,
    previousProfileImages,
    resetProfileImageDraftInteractions,
    scheduleProfileImageDraftTransform,
    setIsProfileImageEditorOpen,
    setProfileImageDraftFile,
    setProfileImageDraftFocusX,
    setProfileImageDraftFocusY,
    setProfileImageDraftNotice,
    setProfileImageDraftPreviewUrl,
    setProfileImageDraftSourceSize,
    setProfileImageDraftZoom,
    setProfileImageFileName,
  } = useAdminProfileWorkspaceImageDraft({
    refreshWorkspace,
    sessionMemberId: sessionMember?.id,
    setImageNotice,
    setLoadingKey,
    setMe,
  })

  const persistDisplayName = useCallback(
    async (memberId: number, nickname: string) => {
      const updatedMember = await saveProfileCardWithConflictRetry(() =>
        apiFetch<AuthMember>(`/member/api/v1/adm/members/${memberId}/nickname`, {
          method: "PATCH",
          body: JSON.stringify({ nickname }),
        })
      )
      setMe(updatedMember)
      setAdminProfileCache(queryClient, toAdminProfile(updatedMember))
      return updatedMember
    },
    [queryClient, setMe]
  )

  const validateDraftBeforePersistence = useCallback(() => {
    const serviceValidationError = validateLinkInputs("service", "서비스", draft.serviceLinks)
    if (serviceValidationError) {
      setWorkspaceNotice({ tone: "error", text: serviceValidationError })
      setActiveSection("links")
      setLinkTab("service")
      return false
    }

    const contactValidationError = validateLinkInputs("contact", "연락 채널", draft.contactLinks)
    if (contactValidationError) {
      setWorkspaceNotice({ tone: "error", text: contactValidationError })
      setActiveSection("links")
      setLinkTab("contact")
      return false
    }

    const normalizedDisplayName = displayNameInput.trim()
    if (hasDisplayNameDirty && (normalizedDisplayName.length < 2 || normalizedDisplayName.length > 30)) {
      setWorkspaceNotice({ tone: "error", text: "계정 이름은 2자 이상 30자 이하로 입력해주세요." })
      setActiveSection("identity")
      return false
    }

    return true
  }, [displayNameInput, draft.contactLinks, draft.serviceLinks, hasDisplayNameDirty])

  const buildDraftPayload = useCallback(
    () =>
      normalizeProfileWorkspaceContent({
        ...draft,
        serviceLinks: toPayloadLinks("service", draft.serviceLinks),
        contactLinks: toPayloadLinks("contact", draft.contactLinks),
      }),
    [draft]
  )

  const saveWorkspaceDraft = useCallback(async () => {
    if (!sessionMember?.id) {
      throw new Error("관리자 세션을 확인할 수 없습니다.")
    }

    const normalizedDraft = buildDraftPayload()
    return saveProfileCardWithConflictRetry(() =>
      apiFetch<ProfileWorkspaceResponse>(`/member/api/v1/adm/members/${sessionMember.id}/profileWorkspace/draft`, {
        method: "PUT",
        body: JSON.stringify(normalizedDraft),
      })
    )
  }, [buildDraftPayload, sessionMember?.id])





  const handleSaveDraft = useCallback(async () => {
    if (!sessionMember?.id) return
    if (!validateDraftBeforePersistence()) return

    const normalizedDisplayName = displayNameInput.trim()
    const shouldSaveDisplayName = hasDisplayNameDirty
    const shouldSaveWorkspace = hasWorkspaceUnsavedChanges

    if (!shouldSaveDisplayName && !shouldSaveWorkspace) {
      setWorkspaceNotice({ tone: "idle", text: "이미 최신 상태입니다." })
      return
    }

    let workspaceSaved = false

    try {
      setLoadingKey("save")
      setWorkspaceNotice({
        tone: "loading",
        text:
          shouldSaveWorkspace && shouldSaveDisplayName
            ? "임시 저장과 계정 이름 저장을 함께 처리하고 있습니다..."
            : shouldSaveDisplayName
              ? "계정 이름을 저장하고 있습니다..."
              : "임시 저장 중...",
      })

      if (shouldSaveWorkspace) {
        const nextWorkspace = await saveWorkspaceDraft()
        applyWorkspaceState(nextWorkspace)
        workspaceSaved = true
      }

      if (shouldSaveDisplayName) {
        await persistDisplayName(sessionMember.id, normalizedDisplayName)
      }

      setWorkspaceNotice({
        tone: "success",
        text:
          shouldSaveWorkspace && shouldSaveDisplayName
            ? "임시 저장과 계정 이름 업데이트를 완료했습니다."
            : shouldSaveDisplayName
              ? "계정 이름을 저장했습니다."
              : "임시 저장했습니다.",
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const failureText =
        shouldSaveWorkspace && shouldSaveDisplayName
          ? "임시 저장 또는 계정 이름 저장 실패"
          : shouldSaveDisplayName
            ? "계정 이름 저장 실패"
            : "임시 저장 실패"
      setWorkspaceNotice({
        tone: "error",
        text:
          workspaceSaved && shouldSaveDisplayName
            ? `임시 저장은 완료됐지만 계정 이름 저장은 실패했습니다: ${message}`
            : `${failureText}: ${message}`,
      })
    } finally {
      setLoadingKey("")
    }
  }, [
    applyWorkspaceState,
    displayNameInput,
    hasDisplayNameDirty,
    hasWorkspaceUnsavedChanges,
    persistDisplayName,
    saveWorkspaceDraft,
    sessionMember?.id,
    validateDraftBeforePersistence,
  ])

  const handlePublish = useCallback(async () => {
    if (!sessionMember?.id) return
    if (!validateDraftBeforePersistence()) return

    const normalizedDisplayName = displayNameInput.trim()
    const shouldSaveDisplayName = hasDisplayNameDirty
    const shouldSaveWorkspace = hasWorkspaceUnsavedChanges
    const shouldApplyWorkspace = shouldSaveWorkspace || hasPublishedDiff

    if (!shouldSaveDisplayName && !shouldApplyWorkspace) {
      setWorkspaceNotice({ tone: "idle", text: "이미 공개본과 편집 중인 내용이 같습니다." })
      return
    }

    let workspaceForPublish: ProfileWorkspaceResponse | null = null

    try {
      setLoadingKey("publish")
      setWorkspaceNotice({
        tone: "loading",
        text: shouldSaveWorkspace ? "초안을 저장한 뒤 공개 적용 중..." : "공개 적용 중...",
      })

      if (shouldSaveWorkspace) {
        workspaceForPublish = await saveWorkspaceDraft()
      }

      if (shouldSaveDisplayName) {
        await persistDisplayName(sessionMember.id, normalizedDisplayName)
      }

      const shouldPublishWorkspace = workspaceForPublish?.dirtyFromPublished ?? hasPublishedDiff
      if (shouldPublishWorkspace) {
        const nextWorkspace = await apiFetch<ProfileWorkspaceResponse>(
          `/member/api/v1/adm/members/${sessionMember.id}/profileWorkspace/publish`,
          {
            method: "POST",
          }
        )
        applyWorkspaceState(nextWorkspace)
        syncPublishedAdminProfileCache(normalizeProfileWorkspaceContent(nextWorkspace.published))
        const publicCacheRevalidated = await revalidatePublicBlogAppearance()
        setPreviewMode("published")
        setWorkspaceNotice({
          tone: publicCacheRevalidated ? "success" : "error",
          text: publicCacheRevalidated
            ? "공개 적용과 공개 사이트 갱신을 완료했습니다."
            : "공개 적용은 완료됐지만 공개 사이트 캐시 갱신에 실패했습니다. 잠시 후 새로고침해주세요.",
        })
        return
      }

      if (workspaceForPublish) {
        applyWorkspaceState(workspaceForPublish)
      }
      setWorkspaceNotice({ tone: "success", text: "변경 사항을 저장했습니다." })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setWorkspaceNotice({ tone: "error", text: `공개 적용 실패: ${message}` })
    } finally {
      setLoadingKey("")
    }
  }, [
    applyWorkspaceState,
    displayNameInput,
    hasDisplayNameDirty,
    hasPublishedDiff,
    hasWorkspaceUnsavedChanges,
    persistDisplayName,
    saveWorkspaceDraft,
    sessionMember?.id,
    syncPublishedAdminProfileCache,
    validateDraftBeforePersistence,
  ])

  useEffect(() => {
    setDraggingLinkIndex(null)
    setDragOverLinkIndex(null)
  }, [linkTab])

  if (!sessionMember) return null
  const profileWorkspaceSectionProps = { initialMember, router, queryClient, sessionMember, fallbackWorkspace, workspaceQuery, activeSection, setActiveSection, linkTab, setLinkTab, previewMode, setPreviewMode, isPreviewExpanded, setIsPreviewExpanded, draggingLinkIndex, setDraggingLinkIndex, dragOverLinkIndex, setDragOverLinkIndex, dragOverLinkPosition, setDragOverLinkPosition, openIconPicker, setOpenIconPicker, loadingKey, setLoadingKey, workspaceNotice, setWorkspaceNotice, imageNotice, setImageNotice, displayNameInput, setDisplayNameInput, remoteDraft, setRemoteDraft, publishedSnapshot, setPublishedSnapshot, draft, setDraft, profileImageFileName, setProfileImageFileName, isProfileImageEditorOpen, setIsProfileImageEditorOpen, profileImageDraftFile, setProfileImageDraftFile, profileImageDraftPreviewUrl, setProfileImageDraftPreviewUrl, profileImageDraftFocusX, setProfileImageDraftFocusX, profileImageDraftFocusY, setProfileImageDraftFocusY, profileImageDraftZoom, setProfileImageDraftZoom, profileImageDraftSourceSize, setProfileImageDraftSourceSize, profileImageDraftNotice, setProfileImageDraftNotice, profileImageDraftFrameRef, profileImageFileInputRef, profileImageDraftFileSeqRef, previousProfileImages, syncPublishedAdminProfileCache, applyWorkspaceState, hasWorkspaceUnsavedChanges, hasDisplayNameDirty, hasUnsavedChanges, hasPublishedDiff, sectionStateMap, refreshWorkspace, persistDisplayName, validateDraftBeforePersistence, buildDraftPayload, saveWorkspaceDraft, updateDraft, updateLinkItem, appendLinkItem, removeLinkItem, moveLinkItem, reorderLinkItems, updateAboutSection, addAboutSection, removeAboutSection, moveAboutSection, addAboutItem, removeAboutItem, moveAboutItem, updateAboutProject, addAboutProject, removeAboutProject, moveAboutProject, applyProfileImageDraftPreviewStyle, normalizeProfileImageDraftTransform, computeAnchoredZoomTransform, computeDraggedProfileImageTransform, commitProfileImageDraftTransform, finalizeProfileImageDraftPointer, handleProfileImageDraftPointerDown, handleProfileImageDraftPointerMove, handleDeletePreviousProfileImage, handleSelectPreviousProfileImage, isProfileImageDraftDragging, resetProfileImageDraftInteractions, scheduleProfileImageDraftTransform, profileImageDraftTransformRef, clearProfileImageDraft, handleDraftFileChange, handleUploadMemberProfileImage, handleApplyProfileImageDraft, handleSaveDraft, handlePublish }
  return profileWorkspaceSectionProps
}
