import { type DehydratedState, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/router"
import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { apiFetch } from "src/apis/backend/client"
import type { ProfileCardLinkItem } from "src/constants/profileCardLinks"
import type { AuthMember } from "src/hooks/useAuthSession"
import useAuthSession from "src/hooks/useAuthSession"
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
import { saveProfileCardWithConflictRetry } from "src/libs/profileCardSave"
import { acquireBodyScrollLock } from "src/libs/utils/bodyScrollLock"
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

export type NoticeTone = "idle" | "loading" | "success" | "error"
type OpenIconPicker = `${LinkTab}:${number}` | null
type ProfileImageDraftTransformState = {
  focusX: number
  focusY: number
  zoom: number
}

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
  const [profileImageFileName, setProfileImageFileName] = useState("")
  const [isProfileImageEditorOpen, setIsProfileImageEditorOpen] = useState(false)
  const [profileImageDraftFile, setProfileImageDraftFile] = useState<File | null>(null)
  const [profileImageDraftPreviewUrl, setProfileImageDraftPreviewUrl] = useState("")
  const [profileImageDraftFocusX, setProfileImageDraftFocusX] = useState(PROFILE_IMAGE_EDIT_DEFAULT_FOCUS_X)
  const [profileImageDraftFocusY, setProfileImageDraftFocusY] = useState(PROFILE_IMAGE_EDIT_DEFAULT_FOCUS_Y)
  const [profileImageDraftZoom, setProfileImageDraftZoom] = useState(PROFILE_IMAGE_EDIT_MIN_ZOOM)
  const [profileImageDraftSourceSize, setProfileImageDraftSourceSize] = useState<ProfileImageSourceSize>(
    PROFILE_IMAGE_DRAFT_DEFAULT_SOURCE_SIZE
  )
  const [profileImageDraftNotice, setProfileImageDraftNotice] = useState<{ tone: NoticeTone; text: string }>({
    tone: "idle",
    text: "",
  })
  const profileImageDraftFrameRef = useRef<HTMLDivElement>(null)
  const profileImageFileInputRef = useRef<HTMLInputElement>(null)
  const profileImageDraftFileSeqRef = useRef(0)

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

  useEffect(() => {
    return () => {
      if (profileImageDraftPreviewUrl) {
        URL.revokeObjectURL(profileImageDraftPreviewUrl)
      }
    }
  }, [profileImageDraftPreviewUrl])

  useEffect(() => {
    if (!isProfileImageEditorOpen) return
    const releaseBodyScrollLock = acquireBodyScrollLock()
    return () => {
      releaseBodyScrollLock()
    }
  }, [isProfileImageEditorOpen])

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
        design: { dirty: false, publishedDiff: false },
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

  const updateDraft = useCallback(
    (
      field: keyof ProfileWorkspaceContent,
      value:
        | string
        | ProfileCardLinkItem[]
        | AboutSectionBlock[]
        | ((current: ProfileWorkspaceContent) => ProfileWorkspaceContent)
    ) => {
      if (typeof value === "function") {
        setDraft((current) => value(current))
        return
      }

      setDraft((current) => ({
        ...current,
        [field]: value,
      }))
    },
    []
  )

  const updateLinkItem = useCallback(
    (section: LinkTab, index: number, field: keyof ProfileCardLinkItem, value: string) => {
      setDraft((current) => {
        const key = section === "service" ? "serviceLinks" : "contactLinks"
        return {
          ...current,
          [key]: current[key].map((item, itemIndex) =>
            itemIndex === index
              ? {
                  ...item,
                  [field]: value,
                }
              : item
          ),
        }
      })
    },
    []
  )

  const appendLinkItem = useCallback((section: LinkTab) => {
    setDraft((current) => {
      const key = section === "service" ? "serviceLinks" : "contactLinks"
      return {
        ...current,
        [key]: [...current[key], createBlankLinkItem(section)],
      }
    })
  }, [])

  const removeLinkItem = useCallback((section: LinkTab, index: number) => {
    setDraft((current) => {
      const key = section === "service" ? "serviceLinks" : "contactLinks"
      return {
        ...current,
        [key]: current[key].filter((_, itemIndex) => itemIndex !== index),
      }
    })
    setOpenIconPicker((current) => (current === `${section}:${index}` ? null : current))
  }, [])

  const moveLinkItem = useCallback((section: LinkTab, index: number, direction: -1 | 1) => {
    setDraft((current) => {
      const key = section === "service" ? "serviceLinks" : "contactLinks"
      return {
        ...current,
        [key]: moveListItem(current[key], index, direction),
      }
    })
  }, [])

  const reorderLinkItems = useCallback((section: LinkTab, fromIndex: number, toIndex: number) => {
    setDraft((current) => {
      const key = section === "service" ? "serviceLinks" : "contactLinks"
      return {
        ...current,
        [key]: reorderListItem(current[key], fromIndex, toIndex),
      }
    })
  }, [])

  const updateAboutSection = useCallback((sectionIndex: number, updater: (section: AboutSectionBlock) => AboutSectionBlock) => {
    setDraft((current) => ({
      ...current,
      aboutSections: current.aboutSections.map((section, index) =>
        index === sectionIndex ? updater(section) : section
      ),
    }))
  }, [])

  const addAboutSection = useCallback(() => {
    setDraft((current) => ({
      ...current,
      aboutSections: [...current.aboutSections, createBlankAboutSection()],
    }))
  }, [])

  const removeAboutSection = useCallback((sectionIndex: number) => {
    setDraft((current) => ({
      ...current,
      aboutSections: current.aboutSections.filter((_, index) => index !== sectionIndex),
    }))
  }, [])

  const moveAboutSection = useCallback((sectionIndex: number, direction: -1 | 1) => {
    setDraft((current) => ({
      ...current,
      aboutSections: moveListItem(current.aboutSections, sectionIndex, direction),
    }))
  }, [])

  const addAboutItem = useCallback((sectionIndex: number) => {
    updateAboutSection(sectionIndex, (section) => ({
      ...section,
      items: [...section.items, ""],
    }))
  }, [updateAboutSection])

  const removeAboutItem = useCallback((sectionIndex: number, itemIndex: number) => {
    updateAboutSection(sectionIndex, (section) => ({
      ...section,
      items: section.items.filter((_, index) => index !== itemIndex),
    }))
  }, [updateAboutSection])

  const moveAboutItem = useCallback((sectionIndex: number, itemIndex: number, direction: -1 | 1) => {
    updateAboutSection(sectionIndex, (section) => ({
      ...section,
      items: moveListItem(section.items, itemIndex, direction),
    }))
  }, [updateAboutSection])

  const updateAboutProject = useCallback((projectIndex: number, updater: (project: AboutProjectBlock) => AboutProjectBlock) => {
    setDraft((current) => ({
      ...current,
      aboutProjects: current.aboutProjects.map((project, index) =>
        index === projectIndex ? updater(project) : project
      ),
    }))
  }, [])

  const addAboutProject = useCallback(() => {
    setDraft((current) => ({
      ...current,
      aboutProjects: [...current.aboutProjects, createBlankAboutProject()],
    }))
  }, [])

  const removeAboutProject = useCallback((projectIndex: number) => {
    setDraft((current) => ({
      ...current,
      aboutProjects: current.aboutProjects.filter((_, index) => index !== projectIndex),
    }))
  }, [])

  const moveAboutProject = useCallback((projectIndex: number, direction: -1 | 1) => {
    setDraft((current) => ({
      ...current,
      aboutProjects: moveListItem(current.aboutProjects, projectIndex, direction),
    }))
  }, [])

  const applyProfileImageDraftPreviewStyle = useCallback(
    (transform: ProfileImageDraftTransformState) => {
      const frame = profileImageDraftFrameRef.current
      if (!frame) return

      const { drawWidth, drawHeight } = resolveProfileImageEditDrawRatios(
        profileImageDraftSourceSize,
        transform.zoom
      )
      const centerXRatio = transform.focusX / 100
      const centerYRatio = transform.focusY / 100
      const leftRatio = centerXRatio - drawWidth / 2
      const topRatio = centerYRatio - drawHeight / 2

      frame.style.setProperty("--profile-draft-width", `${drawWidth * 100}%`)
      frame.style.setProperty("--profile-draft-height", `${drawHeight * 100}%`)
      frame.style.setProperty("--profile-draft-left", `${leftRatio * 100}%`)
      frame.style.setProperty("--profile-draft-top", `${topRatio * 100}%`)
    },
    [profileImageDraftSourceSize]
  )

  const normalizeProfileImageDraftTransform = useCallback(
    (current: ProfileImageDraftTransformState) => {
      const zoom = clampProfileImageEditZoom(current.zoom)
      const clampedFocus = clampProfileImageEditFocusBySource({
        focusX: current.focusX,
        focusY: current.focusY,
        zoom,
        sourceSize: profileImageDraftSourceSize,
      })

      return {
        focusX: clampedFocus.focusX,
        focusY: clampedFocus.focusY,
        zoom,
      }
    },
    [profileImageDraftSourceSize]
  )

  const computeAnchoredZoomTransform = useCallback(
    (
      baseTransform: ProfileImageDraftTransformState,
      nextZoom: number,
      anchorXRatio: number,
      anchorYRatio: number
    ): ProfileImageDraftTransformState => {
      const { drawWidth: prevDrawWidth, drawHeight: prevDrawHeight } = resolveProfileImageEditDrawRatios(
        profileImageDraftSourceSize,
        baseTransform.zoom
      )
      const { drawWidth: nextDrawWidth, drawHeight: nextDrawHeight } = resolveProfileImageEditDrawRatios(
        profileImageDraftSourceSize,
        nextZoom
      )
      const prevCenterX = baseTransform.focusX / 100
      const prevCenterY = baseTransform.focusY / 100
      const prevLeft = prevCenterX - prevDrawWidth / 2
      const prevTop = prevCenterY - prevDrawHeight / 2
      const pointerImageX = Math.min(1, Math.max(0, (anchorXRatio - prevLeft) / prevDrawWidth))
      const pointerImageY = Math.min(1, Math.max(0, (anchorYRatio - prevTop) / prevDrawHeight))
      const nextLeft = anchorXRatio - pointerImageX * nextDrawWidth
      const nextTop = anchorYRatio - pointerImageY * nextDrawHeight

      return {
        focusX: (nextLeft + nextDrawWidth / 2) * 100,
        focusY: (nextTop + nextDrawHeight / 2) * 100,
        zoom: nextZoom,
      }
    },
    [profileImageDraftSourceSize]
  )

  const computeDraggedProfileImageTransform = useCallback(
    (baseTransform: ProfileImageDraftTransformState, deltaXRatio: number, deltaYRatio: number) => {
      const zoomScale = Math.max(baseTransform.zoom, PROFILE_IMAGE_EDIT_MIN_ZOOM)
      return {
        focusX: baseTransform.focusX + deltaXRatio * (100 / zoomScale),
        focusY: baseTransform.focusY + deltaYRatio * (100 / zoomScale),
        zoom: baseTransform.zoom,
      }
    },
    []
  )

  const commitProfileImageDraftTransform = useCallback(
    (normalized: ProfileImageDraftTransformState) => {
      applyProfileImageDraftPreviewStyle(normalized)
      setProfileImageDraftFocusX((prev) => (Math.abs(prev - normalized.focusX) > 0.0001 ? normalized.focusX : prev))
      setProfileImageDraftFocusY((prev) => (Math.abs(prev - normalized.focusY) > 0.0001 ? normalized.focusY : prev))
      setProfileImageDraftZoom((prev) => (Math.abs(prev - normalized.zoom) > 0.0001 ? normalized.zoom : prev))
    },
    [applyProfileImageDraftPreviewStyle]
  )

  const {
    commitTransform: commitProfileImageDraftViewportTransform,
    finalizePointer: finalizeProfileImageDraftPointer,
    handlePointerDown: handleProfileImageDraftPointerDown,
    handlePointerMove: handleProfileImageDraftPointerMove,
    isDragging: isProfileImageDraftDragging,
    resetInteractions: resetProfileImageDraftInteractions,
    scheduleTransform: scheduleProfileImageDraftTransform,
    transformRef: profileImageDraftTransformRef,
  } = useViewportImageEditor<ProfileImageDraftTransformState>({
    frameRef: profileImageDraftFrameRef,
    initialTransform: {
      focusX: profileImageDraftFocusX,
      focusY: profileImageDraftFocusY,
      zoom: profileImageDraftZoom,
    },
    enabled: Boolean(profileImageDraftFile),
    clampZoom: clampProfileImageEditZoom,
    normalizeTransform: normalizeProfileImageDraftTransform,
    computeAnchoredZoomTransform,
    computeDraggedTransform: computeDraggedProfileImageTransform,
    onCommit: commitProfileImageDraftTransform,
  })

  const clearProfileImageDraft = useCallback(() => {
    profileImageDraftFileSeqRef.current += 1
    resetProfileImageDraftInteractions()
    setProfileImageDraftFile(null)
    setProfileImageDraftSourceSize(PROFILE_IMAGE_DRAFT_DEFAULT_SOURCE_SIZE)
    setProfileImageDraftNotice({ tone: "idle", text: "" })
    commitProfileImageDraftViewportTransform({
      focusX: PROFILE_IMAGE_EDIT_DEFAULT_FOCUS_X,
      focusY: PROFILE_IMAGE_EDIT_DEFAULT_FOCUS_Y,
      zoom: PROFILE_IMAGE_EDIT_MIN_ZOOM,
    })
    setProfileImageDraftPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return ""
    })
  }, [commitProfileImageDraftViewportTransform, resetProfileImageDraftInteractions])

  const handleDraftFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      event.target.value = ""
      if (!file) return

      const nextFileSeq = profileImageDraftFileSeqRef.current + 1
      profileImageDraftFileSeqRef.current = nextFileSeq
      setProfileImageFileName(file.name)
      setProfileImageDraftFile(file)
      setProfileImageDraftSourceSize(PROFILE_IMAGE_DRAFT_DEFAULT_SOURCE_SIZE)
      setProfileImageDraftNotice({ tone: "idle", text: "" })
      commitProfileImageDraftViewportTransform({
        focusX: PROFILE_IMAGE_EDIT_DEFAULT_FOCUS_X,
        focusY: PROFILE_IMAGE_EDIT_DEFAULT_FOCUS_Y,
        zoom: PROFILE_IMAGE_EDIT_MIN_ZOOM,
      })
      setProfileImageDraftPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return URL.createObjectURL(file)
      })
      void readImageSourceSizeFromFile(file)
        .then((sourceSize) => {
          if (profileImageDraftFileSeqRef.current !== nextFileSeq) return
          setProfileImageDraftSourceSize(sourceSize)
          scheduleProfileImageDraftTransform(profileImageDraftTransformRef.current)
        })
        .catch(() => {
          if (profileImageDraftFileSeqRef.current !== nextFileSeq) return
          setProfileImageDraftNotice({ tone: "error", text: "이미지 해상도 정보를 읽지 못했습니다." })
        })
    },
    [commitProfileImageDraftViewportTransform, profileImageDraftTransformRef, scheduleProfileImageDraftTransform]
  )

  useEffect(() => {
    scheduleProfileImageDraftTransform(profileImageDraftTransformRef.current)
  }, [profileImageDraftSourceSize, profileImageDraftTransformRef, scheduleProfileImageDraftTransform])

  const handleUploadMemberProfileImage = useCallback(
    async (selectedFile?: File): Promise<boolean> => {
      const file = selectedFile || profileImageFileInputRef.current?.files?.[0]
      const memberId = sessionMember?.id
      if (!file || !memberId) return false

      try {
        setLoadingKey("upload")
        setImageNotice({ tone: "loading", text: "프로필 이미지를 최적화하고 초안에 반영하고 있습니다..." })
        const prepared = await prepareProfileImageForUpload(file)
        let uploadResponse = await requestProfileImageUpload(memberId, prepared.file)

        if (uploadResponse.status === 409) {
          const firstConflictBody = await parseResponseErrorBody(uploadResponse)
          const retryMessage = "요청 충돌을 감지해 자동 재시도 중입니다..."
          setImageNotice({ tone: "loading", text: retryMessage })
          setProfileImageDraftNotice({ tone: "loading", text: retryMessage })
          await sleep(PROFILE_IMAGE_UPLOAD_RETRY_DELAY_MS)
          uploadResponse = await requestProfileImageUpload(memberId, prepared.file)
          if (!uploadResponse.ok) {
            const retryBody = await parseResponseErrorBody(uploadResponse)
            throw new Error(`이미지 업로드 실패 (${uploadResponse.status}) ${retryBody || firstConflictBody}`.trim())
          }
        } else if (!uploadResponse.ok) {
          const body = await parseResponseErrorBody(uploadResponse)
          throw new Error(`이미지 업로드 실패 (${uploadResponse.status}) ${body}`.trim())
        }

        const uploadData = (await uploadResponse.json()) as AuthMember
        setMe(uploadData)
        await refreshWorkspace(memberId)
        const successMessage = `프로필 이미지가 초안에 반영되었습니다. ${buildImageOptimizationSummary(prepared)}`
        setImageNotice({ tone: "success", text: successMessage })
        setProfileImageDraftNotice({ tone: "success", text: successMessage })
        return true
      } catch (error) {
        const message = normalizeProfileImageUploadError(error)
        setImageNotice({ tone: "error", text: `프로필 이미지 저장 실패: ${message}` })
        setProfileImageDraftNotice({ tone: "error", text: `프로필 이미지 저장 실패: ${message}` })
        return false
      } finally {
        if (profileImageFileInputRef.current) {
          profileImageFileInputRef.current.value = ""
        }
        setLoadingKey("")
      }
    },
    [refreshWorkspace, sessionMember?.id, setMe]
  )

  const handleApplyProfileImageDraft = useCallback(async () => {
    if (!profileImageDraftFile) {
      setProfileImageDraftNotice({ tone: "error", text: "먼저 프로필 이미지를 선택해주세요." })
      return
    }

    try {
      setProfileImageDraftNotice({ tone: "loading", text: "편집 결과를 업로드하고 있습니다..." })
      const editedFile = await buildProfileImageEditedFile(profileImageDraftFile, {
        focusX: profileImageDraftFocusX,
        focusY: profileImageDraftFocusY,
        zoom: profileImageDraftZoom,
      })
      const uploaded = await handleUploadMemberProfileImage(editedFile)
      if (uploaded) {
        setIsProfileImageEditorOpen(false)
        clearProfileImageDraft()
      }
    } catch (error) {
      const message = normalizeProfileImageUploadError(error)
      setProfileImageDraftNotice({ tone: "error", text: message })
    }
  }, [
    clearProfileImageDraft,
    handleUploadMemberProfileImage,
    profileImageDraftFile,
    profileImageDraftFocusX,
    profileImageDraftFocusY,
    profileImageDraftZoom,
  ])

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
  const profileWorkspaceSectionProps = { initialMember, router, queryClient, sessionMember, fallbackWorkspace, workspaceQuery, activeSection, setActiveSection, linkTab, setLinkTab, previewMode, setPreviewMode, isPreviewExpanded, setIsPreviewExpanded, draggingLinkIndex, setDraggingLinkIndex, dragOverLinkIndex, setDragOverLinkIndex, dragOverLinkPosition, setDragOverLinkPosition, openIconPicker, setOpenIconPicker, loadingKey, setLoadingKey, workspaceNotice, setWorkspaceNotice, imageNotice, setImageNotice, displayNameInput, setDisplayNameInput, remoteDraft, setRemoteDraft, publishedSnapshot, setPublishedSnapshot, draft, setDraft, profileImageFileName, setProfileImageFileName, isProfileImageEditorOpen, setIsProfileImageEditorOpen, profileImageDraftFile, setProfileImageDraftFile, profileImageDraftPreviewUrl, setProfileImageDraftPreviewUrl, profileImageDraftFocusX, setProfileImageDraftFocusX, profileImageDraftFocusY, setProfileImageDraftFocusY, profileImageDraftZoom, setProfileImageDraftZoom, profileImageDraftSourceSize, setProfileImageDraftSourceSize, profileImageDraftNotice, setProfileImageDraftNotice, profileImageDraftFrameRef, profileImageFileInputRef, profileImageDraftFileSeqRef, syncPublishedAdminProfileCache, applyWorkspaceState, hasWorkspaceUnsavedChanges, hasDisplayNameDirty, hasUnsavedChanges, hasPublishedDiff, sectionStateMap, refreshWorkspace, persistDisplayName, validateDraftBeforePersistence, buildDraftPayload, saveWorkspaceDraft, updateDraft, updateLinkItem, appendLinkItem, removeLinkItem, moveLinkItem, reorderLinkItems, updateAboutSection, addAboutSection, removeAboutSection, moveAboutSection, addAboutItem, removeAboutItem, moveAboutItem, updateAboutProject, addAboutProject, removeAboutProject, moveAboutProject, applyProfileImageDraftPreviewStyle, normalizeProfileImageDraftTransform, computeAnchoredZoomTransform, computeDraggedProfileImageTransform, commitProfileImageDraftTransform, finalizeProfileImageDraftPointer, handleProfileImageDraftPointerDown, handleProfileImageDraftPointerMove, isProfileImageDraftDragging, resetProfileImageDraftInteractions, scheduleProfileImageDraftTransform, profileImageDraftTransformRef, clearProfileImageDraft, handleDraftFileChange, handleUploadMemberProfileImage, handleApplyProfileImageDraft, handleSaveDraft, handlePublish }
  return profileWorkspaceSectionProps
}
