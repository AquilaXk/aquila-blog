import { type ChangeEvent, type Dispatch, type SetStateAction, useCallback, useEffect, useRef, useState } from "react"
import type { AuthMember } from "src/hooks/useAuthSession"
import useViewportImageEditor from "src/libs/imageEditor/useViewportImageEditor"
import {
  buildImageOptimizationSummary,
  buildProfileImageEditedFile,
  clampProfileImageEditFocusBySource,
  clampProfileImageEditZoom,
  normalizeProfileImageUploadError,
  prepareProfileImageForUpload,
  type ProfileImageSourceSize,
  PROFILE_IMAGE_EDIT_DEFAULT_FOCUS_X,
  PROFILE_IMAGE_EDIT_DEFAULT_FOCUS_Y,
  PROFILE_IMAGE_EDIT_MIN_ZOOM,
  resolveProfileImageEditDrawRatios,
} from "src/libs/profileImageUpload"
import { acquireBodyScrollLock } from "src/libs/utils/bodyScrollLock"
import {
  PROFILE_IMAGE_DRAFT_DEFAULT_SOURCE_SIZE,
  PROFILE_IMAGE_UPLOAD_RETRY_DELAY_MS,
  deletePreviousProfileImage,
  listPreviousProfileImages,
  parseResponseErrorBody,
  readImageSourceSizeFromFile,
  requestProfileImageUpload,
  selectPreviousProfileImage,
  sleep,
  type ProfileImageHistoryItem,
} from "src/routes/Admin/AdminProfilePersistenceModel"
import type { NoticeTone } from "src/routes/Admin/AdminProfileWorkspacePageModel"

type ProfileImageDraftTransformState = {
  focusX: number
  focusY: number
  zoom: number
}

type UseAdminProfileWorkspaceImageDraftArgs = {
  refreshWorkspace: (memberId: number) => Promise<unknown>
  sessionMemberId?: number
  setImageNotice: Dispatch<SetStateAction<{ tone: NoticeTone; text: string }>>
  setLoadingKey: Dispatch<SetStateAction<string>>
  setMe: (member: AuthMember) => void
}

export const useAdminProfileWorkspaceImageDraft = ({
  refreshWorkspace,
  sessionMemberId,
  setImageNotice,
  setLoadingKey,
  setMe,
}: UseAdminProfileWorkspaceImageDraftArgs) => {
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
  const [previousProfileImages, setPreviousProfileImages] = useState<ProfileImageHistoryItem[]>([])
  const profileImageDraftFrameRef = useRef<HTMLDivElement>(null)
  const profileImageFileInputRef = useRef<HTMLInputElement>(null)
  const profileImageDraftFileSeqRef = useRef(0)

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

  const refreshPreviousProfileImages = useCallback(async () => {
    if (!sessionMemberId) return
    const images = await listPreviousProfileImages(sessionMemberId)
    setPreviousProfileImages(images)
  }, [sessionMemberId])

  useEffect(() => {
    if (!isProfileImageEditorOpen || !sessionMemberId) return
    void refreshPreviousProfileImages().catch(() => {
      setPreviousProfileImages([])
      setProfileImageDraftNotice({ tone: "error", text: "프로필 이미지 이력을 불러오지 못했습니다." })
    })
  }, [isProfileImageEditorOpen, refreshPreviousProfileImages, sessionMemberId])

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
      if (!selectedFile && !profileImageFileInputRef.current?.files?.[0]) return false
      if (!sessionMemberId) return false

      const file = selectedFile || profileImageFileInputRef.current?.files?.[0]
      if (!file) return false

      try {
        setLoadingKey("upload")
        setImageNotice({ tone: "loading", text: "프로필 이미지를 최적화하고 초안에 반영하고 있습니다..." })
        const prepared = await prepareProfileImageForUpload(file)
        let uploadResponse = await requestProfileImageUpload(sessionMemberId, prepared.file)

        if (uploadResponse.status === 409) {
          const firstConflictBody = await parseResponseErrorBody(uploadResponse)
          const retryMessage = "요청 충돌을 감지해 자동 재시도 중입니다..."
          setImageNotice({ tone: "loading", text: retryMessage })
          setProfileImageDraftNotice({ tone: "loading", text: retryMessage })
          await sleep(PROFILE_IMAGE_UPLOAD_RETRY_DELAY_MS)
          uploadResponse = await requestProfileImageUpload(sessionMemberId, prepared.file)
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
        await refreshWorkspace(sessionMemberId)
        await refreshPreviousProfileImages()
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
    [refreshPreviousProfileImages, refreshWorkspace, sessionMemberId, setImageNotice, setLoadingKey, setMe]
  )

  const handleSelectPreviousProfileImage = useCallback(
    async (image: ProfileImageHistoryItem) => {
      if (!sessionMemberId || image.isCurrent) return
      try {
        setLoadingKey("upload")
        setProfileImageDraftNotice({ tone: "loading", text: "이전 프로필 이미지를 적용하고 있습니다..." })
        const updatedMember = await selectPreviousProfileImage(sessionMemberId, image.imageUrl)
        setMe(updatedMember)
        await refreshWorkspace(sessionMemberId)
        await refreshPreviousProfileImages()
        setProfileImageDraftNotice({ tone: "success", text: "이전 프로필 이미지를 적용했습니다." })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setProfileImageDraftNotice({ tone: "error", text: `프로필 이미지 적용 실패: ${message}` })
      } finally {
        setLoadingKey("")
      }
    },
    [refreshPreviousProfileImages, refreshWorkspace, sessionMemberId, setLoadingKey, setMe]
  )

  const handleDeletePreviousProfileImage = useCallback(
    async (image: ProfileImageHistoryItem) => {
      if (!sessionMemberId || image.isCurrent) return
      try {
        setLoadingKey("upload")
        setProfileImageDraftNotice({ tone: "loading", text: "프로필 이미지를 삭제하고 있습니다..." })
        await deletePreviousProfileImage(sessionMemberId, image.id)
        await refreshPreviousProfileImages()
        setProfileImageDraftNotice({ tone: "success", text: "프로필 이미지를 삭제했습니다." })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setProfileImageDraftNotice({ tone: "error", text: `프로필 이미지 삭제 실패: ${message}` })
      } finally {
        setLoadingKey("")
      }
    },
    [refreshPreviousProfileImages, sessionMemberId, setLoadingKey]
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

  return {
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
  }
}
