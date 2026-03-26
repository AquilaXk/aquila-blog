import styled from "@emotion/styled"
import { GetServerSideProps, NextPage } from "next"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/router"
import { ChangeEvent, PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { apiFetch, getApiBaseUrl } from "src/apis/backend/client"
import BrandMark from "src/components/branding/BrandMark"
import AppIcon, { IconName } from "src/components/icons/AppIcon"
import ProfileImage from "src/components/ProfileImage"
import {
  DEFAULT_CONTACT_ITEM_ICON,
  DEFAULT_SERVICE_ITEM_ICON,
  getProfileCardIconOptions,
  isAllowedProfileLinkHref,
  normalizeProfileCardLinkItem,
  ProfileCardIconOption,
  ProfileCardLinkItem,
  ProfileCardLinkSection,
} from "src/constants/profileCardLinks"
import useAuthSession, { AuthMember } from "src/hooks/useAuthSession"
import { setAdminProfileCache, toAdminProfile } from "src/hooks/useAdminProfile"
import { resolveContactLinks, resolveServiceLinks } from "src/libs/utils/profileCardLinks"
import { AdminPageProps, getAdminPageProps } from "src/libs/server/adminPage"
import {
  buildProfileImageEditedFile,
  buildImageOptimizationSummary,
  clampProfileImageEditFocusBySource,
  clampProfileImageEditZoom,
  normalizeProfileImageUploadError,
  prepareProfileImageForUpload,
  ProfileImageSourceSize,
  PROFILE_IMAGE_EDIT_DEFAULT_FOCUS_X,
  PROFILE_IMAGE_EDIT_DEFAULT_FOCUS_Y,
  PROFILE_IMAGE_EDIT_MAX_ZOOM,
  PROFILE_IMAGE_EDIT_MIN_ZOOM,
  resolveProfileImageEditDrawRatios,
} from "src/libs/profileImageUpload"
import { acquireBodyScrollLock } from "src/libs/utils/bodyScrollLock"

export const getServerSideProps: GetServerSideProps<AdminPageProps> = async ({ req }) => {
  return await getAdminPageProps(req)
}

type NoticeTone = "idle" | "loading" | "success" | "error"

type MemberMe = AuthMember
type LinkSectionType = "service" | "contact"
type OpenIconPicker = `${LinkSectionType}:${number}` | null
type ProfileImageEditorDragState = {
  pointerId: number
  startClientX: number
  startClientY: number
  startFocusX: number
  startFocusY: number
}
type ProfileImageEditorPinchState = {
  startDistance: number
  startCenterXRatio: number
  startCenterYRatio: number
  startFocusX: number
  startFocusY: number
  startZoom: number
}
type ProfileImageDraftTransformState = {
  focusX: number
  focusY: number
  zoom: number
}
type ProfileImagePointerPosition = { clientX: number; clientY: number }

const PROFILE_IMAGE_UPLOAD_RETRY_DELAY_MS = 700
const PROFILE_IMAGE_DRAFT_DEFAULT_SOURCE_SIZE: ProfileImageSourceSize = { width: 1, height: 1 }
const PROFILE_UNSAVED_CHANGES_MESSAGE = "저장하지 않은 변경 사항이 있습니다. 이 페이지를 떠날까요?"

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })

const readImageSourceSizeFromFile = (file: File): Promise<ProfileImageSourceSize> =>
  new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const image = new window.Image()
    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      const width = image.naturalWidth || image.width
      const height = image.naturalHeight || image.height
      if (width <= 0 || height <= 0) {
        reject(new Error("이미지 해상도를 확인할 수 없습니다."))
        return
      }
      resolve({ width, height })
    }
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error("이미지 정보를 읽을 수 없습니다."))
    }
    image.src = objectUrl
  })

const buildMemberRevisionKey = (member: MemberMe) =>
  [
    member.id,
    member.modifiedAt || "",
    member.profileImageDirectUrl || "",
    member.profileImageUrl || "",
    member.profileRole || "",
    member.profileBio || "",
    member.aboutRole || "",
    member.aboutBio || "",
    member.aboutDetails || "",
    member.blogTitle || "",
    member.homeIntroTitle || "",
    member.homeIntroDescription || "",
    JSON.stringify(resolveServiceLinks(member)),
    JSON.stringify(resolveContactLinks(member)),
  ].join("|")

const parseResponseErrorBody = async (response: Response): Promise<string> => {
  const text = await response.text().catch(() => "")
  if (!text) return ""

  try {
    const parsed = JSON.parse(text) as { resultCode?: string; msg?: string }
    const msg = parsed.msg?.trim()
    if (!msg) return text
    return parsed.resultCode ? `${msg} (${parsed.resultCode})` : msg
  } catch {
    return text
  }
}

const normalizeLinkInputs = (
  section: ProfileCardLinkSection,
  items: ProfileCardLinkItem[],
  defaultIcon: IconName
): ProfileCardLinkItem[] =>
  items
    .map((item) => normalizeProfileCardLinkItem(item, defaultIcon, section))
    .filter((item): item is ProfileCardLinkItem => item !== null)

const toPayloadLinks = (
  section: ProfileCardLinkSection,
  items: ProfileCardLinkItem[],
  defaultIcon: IconName
): ProfileCardLinkItem[] =>
  normalizeLinkInputs(section, items, defaultIcon).map((item) => ({
    icon: item.icon,
    label: item.label.trim(),
    href: item.href.trim(),
  }))

const validateLinkInputs = (
  section: ProfileCardLinkSection,
  sectionLabel: "Service" | "Contact",
  items: ProfileCardLinkItem[]
): string | null => {
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]
    const label = item.label.trim()
    const href = item.href.trim()
    const rowLabel = `${sectionLabel} ${index + 1}번 항목`

    if (!label && !href) {
      return `${rowLabel}이 비어 있습니다. 입력하거나 삭제해주세요.`
    }
    if (!label || !href) {
      return `${rowLabel}은 표시 이름과 링크를 모두 입력해야 합니다.`
    }
    if (!isAllowedProfileLinkHref(section, href)) {
      if (section === "service") {
        return `${rowLabel} 링크는 https:// 또는 http:// 형식만 허용됩니다.`
      }
      return `${rowLabel} 링크는 https://, http://, mailto:, tel: 형식만 허용됩니다.`
    }
  }

  return null
}

const normalizeComparableText = (value: string | null | undefined) => (value || "").trim()

const serializeComparableLinks = (
  section: ProfileCardLinkSection,
  items: ProfileCardLinkItem[],
  defaultIcon: IconName
) => JSON.stringify(toPayloadLinks(section, items, defaultIcon))

const AdminProfilePage: NextPage<AdminPageProps> = ({ initialMember }) => {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { me, authStatus, setMe } = useAuthSession()
  const sessionMember = authStatus === "loading" || authStatus === "unavailable" ? initialMember : me
  const [loadingKey, setLoadingKey] = useState("")
  const [imageNotice, setImageNotice] = useState<{ tone: NoticeTone; text: string }>({
    tone: "idle",
    text: "",
  })
  const [profileNotice, setProfileNotice] = useState<{ tone: NoticeTone; text: string }>({
    tone: "idle",
    text: "",
  })
  const [profileRoleInput, setProfileRoleInput] = useState(initialMember.profileRole || "")
  const [profileBioInput, setProfileBioInput] = useState(initialMember.profileBio || "")
  const [aboutRoleInput, setAboutRoleInput] = useState(initialMember.aboutRole || "")
  const [aboutBioInput, setAboutBioInput] = useState(initialMember.aboutBio || "")
  const [aboutDetailsInput, setAboutDetailsInput] = useState(initialMember.aboutDetails || "")
  const [blogTitleInput, setBlogTitleInput] = useState(initialMember.blogTitle || "")
  const [homeIntroTitleInput, setHomeIntroTitleInput] = useState(initialMember.homeIntroTitle || "")
  const [homeIntroDescriptionInput, setHomeIntroDescriptionInput] = useState(initialMember.homeIntroDescription || "")
  const [serviceLinksInput, setServiceLinksInput] = useState<ProfileCardLinkItem[]>(
    resolveServiceLinks(initialMember)
  )
  const [contactLinksInput, setContactLinksInput] = useState<ProfileCardLinkItem[]>(
    resolveContactLinks(initialMember)
  )
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
  const [isProfileImageDraftDragging, setIsProfileImageDraftDragging] = useState(false)
  const [profileImageDraftNotice, setProfileImageDraftNotice] = useState<{ tone: NoticeTone; text: string }>({
    tone: "idle",
    text: "",
  })
  const [profileImgInputUrl, setProfileImgInputUrl] = useState(
    () => (initialMember.profileImageDirectUrl || initialMember.profileImageUrl || "").trim()
  )
  const [openIconPicker, setOpenIconPicker] = useState<OpenIconPicker>(null)
  const profileImageFileInputRef = useRef<HTMLInputElement>(null)
  const profileImageDraftFrameRef = useRef<HTMLDivElement>(null)
  const profileImageDraftDragRef = useRef<ProfileImageEditorDragState | null>(null)
  const profileImageDraftPinchRef = useRef<ProfileImageEditorPinchState | null>(null)
  const profileImageDraftActivePointersRef = useRef<Map<number, ProfileImagePointerPosition>>(new Map())
  const profileImageDraftSourceSizeRef = useRef<ProfileImageSourceSize>(PROFILE_IMAGE_DRAFT_DEFAULT_SOURCE_SIZE)
  const profileImageDraftTransformRef = useRef<ProfileImageDraftTransformState>({
    focusX: PROFILE_IMAGE_EDIT_DEFAULT_FOCUS_X,
    focusY: PROFILE_IMAGE_EDIT_DEFAULT_FOCUS_Y,
    zoom: PROFILE_IMAGE_EDIT_MIN_ZOOM,
  })
  const profileImageDraftTransformRafRef = useRef<number | null>(null)
  const profileImageDraftFileSeqRef = useRef(0)
  const lastSyncedRevisionRef = useRef<string>(buildMemberRevisionKey(initialMember))

  const syncProfileState = useCallback((member: MemberMe) => {
    setMe(member)
    setAdminProfileCache(queryClient, toAdminProfile(member))
    setProfileRoleInput(member.profileRole || "")
    setProfileBioInput(member.profileBio || "")
    setAboutRoleInput(member.aboutRole || "")
    setAboutBioInput(member.aboutBio || "")
    setAboutDetailsInput(member.aboutDetails || "")
    setBlogTitleInput(member.blogTitle || "")
    setHomeIntroTitleInput(member.homeIntroTitle || "")
    setHomeIntroDescriptionInput(member.homeIntroDescription || "")
    setServiceLinksInput(resolveServiceLinks(member))
    setContactLinksInput(resolveContactLinks(member))
    setProfileImgInputUrl((member.profileImageDirectUrl || member.profileImageUrl || "").trim())
    lastSyncedRevisionRef.current = buildMemberRevisionKey(member)
  }, [queryClient, setMe])

  const refreshAdminProfile = useCallback(async (memberId: number, fallback?: MemberMe) => {
    try {
      const detailed = await apiFetch<MemberMe>(`/member/api/v1/adm/members/${memberId}`)
      syncProfileState(detailed)
      return detailed
    } catch {
      if (fallback) syncProfileState(fallback)
      return fallback ?? null
    }
  }, [syncProfileState])

  useEffect(() => {
    if (!sessionMember) return
    if (authStatus === "loading") return
    const nextRevision = buildMemberRevisionKey(sessionMember)
    if (lastSyncedRevisionRef.current === nextRevision) return

    syncProfileState(sessionMember)
  }, [authStatus, sessionMember, syncProfileState])

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

  const toPickerKey = useCallback((section: LinkSectionType, index: number): OpenIconPicker => {
    return `${section}:${index}`
  }, [])

  const getSectionIconOptions = useCallback((section: ProfileCardLinkSection): ProfileCardIconOption[] => {
    return getProfileCardIconOptions(section)
  }, [])

  const updateLinkItem = useCallback(
    (
      section: LinkSectionType,
      index: number,
      field: keyof ProfileCardLinkItem,
      value: string
    ) => {
      const updater = (items: ProfileCardLinkItem[]) =>
        items.map((item, itemIndex) =>
          itemIndex === index
            ? {
                ...item,
                [field]: value,
              }
            : item
        )

      if (section === "service") {
        setServiceLinksInput(updater)
      } else {
        setContactLinksInput(updater)
      }
    },
    []
  )

  const appendLinkItem = useCallback((section: LinkSectionType) => {
    const blankItem: ProfileCardLinkItem =
      section === "service"
        ? { icon: DEFAULT_SERVICE_ITEM_ICON, label: "", href: "" }
        : { icon: DEFAULT_CONTACT_ITEM_ICON, label: "", href: "" }

    if (section === "service") {
      setServiceLinksInput((prev) => [...prev, blankItem])
    } else {
      setContactLinksInput((prev) => [...prev, blankItem])
    }
  }, [])

  const removeLinkItem = useCallback((section: LinkSectionType, index: number) => {
    const updater = (items: ProfileCardLinkItem[]) => items.filter((_, itemIndex) => itemIndex !== index)
    if (section === "service") {
      setServiceLinksInput(updater)
    } else {
      setContactLinksInput(updater)
    }
    setOpenIconPicker((current) => {
      if (current === `${section}:${index}`) return null
      return current
    })
  }, [])

  const applyProfileImageDraftPreviewStyle = useCallback((transform: ProfileImageDraftTransformState) => {
    const frame = profileImageDraftFrameRef.current
    if (!frame) return

    const { drawWidth, drawHeight } = resolveProfileImageEditDrawRatios(profileImageDraftSourceSizeRef.current, transform.zoom)
    const centerXRatio = transform.focusX / 100
    const centerYRatio = transform.focusY / 100
    const leftRatio = centerXRatio - drawWidth / 2
    const topRatio = centerYRatio - drawHeight / 2

    frame.style.setProperty("--profile-draft-width", `${drawWidth * 100}%`)
    frame.style.setProperty("--profile-draft-height", `${drawHeight * 100}%`)
    frame.style.setProperty("--profile-draft-left", `${leftRatio * 100}%`)
    frame.style.setProperty("--profile-draft-top", `${topRatio * 100}%`)
  }, [])

  const scheduleProfileImageDraftTransform = useCallback((next: ProfileImageDraftTransformState) => {
    profileImageDraftTransformRef.current = next
    if (profileImageDraftTransformRafRef.current !== null) return

    profileImageDraftTransformRafRef.current = window.requestAnimationFrame(() => {
      profileImageDraftTransformRafRef.current = null
      const current = profileImageDraftTransformRef.current
      const zoom = clampProfileImageEditZoom(current.zoom)
      const clampedFocus = clampProfileImageEditFocusBySource({
        focusX: current.focusX,
        focusY: current.focusY,
        zoom,
        sourceSize: profileImageDraftSourceSizeRef.current,
      })
      const normalized: ProfileImageDraftTransformState = {
        focusX: clampedFocus.focusX,
        focusY: clampedFocus.focusY,
        zoom,
      }
      profileImageDraftTransformRef.current = normalized
      applyProfileImageDraftPreviewStyle(normalized)
      setProfileImageDraftFocusX((prev) => (Math.abs(prev - normalized.focusX) > 0.0001 ? normalized.focusX : prev))
      setProfileImageDraftFocusY((prev) => (Math.abs(prev - normalized.focusY) > 0.0001 ? normalized.focusY : prev))
      setProfileImageDraftZoom((prev) => (Math.abs(prev - normalized.zoom) > 0.0001 ? normalized.zoom : prev))
    })
  }, [applyProfileImageDraftPreviewStyle])

  const computeAnchoredZoomTransform = useCallback(
    (
      baseTransform: ProfileImageDraftTransformState,
      nextZoom: number,
      anchorXRatio: number,
      anchorYRatio: number
    ): ProfileImageDraftTransformState => {
      const sourceSize = profileImageDraftSourceSizeRef.current
      const { drawWidth: prevDrawWidth, drawHeight: prevDrawHeight } = resolveProfileImageEditDrawRatios(
        sourceSize,
        baseTransform.zoom
      )
      const { drawWidth: nextDrawWidth, drawHeight: nextDrawHeight } = resolveProfileImageEditDrawRatios(
        sourceSize,
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
    []
  )

  const clearProfileImageDraft = useCallback(() => {
    profileImageDraftFileSeqRef.current += 1
    profileImageDraftDragRef.current = null
    profileImageDraftPinchRef.current = null
    profileImageDraftActivePointersRef.current.clear()
    setIsProfileImageDraftDragging(false)
    setProfileImageDraftFile(null)
    setProfileImageDraftSourceSize(PROFILE_IMAGE_DRAFT_DEFAULT_SOURCE_SIZE)
    profileImageDraftSourceSizeRef.current = PROFILE_IMAGE_DRAFT_DEFAULT_SOURCE_SIZE
    setProfileImageDraftNotice({ tone: "idle", text: "" })

    if (profileImageDraftTransformRafRef.current !== null) {
      window.cancelAnimationFrame(profileImageDraftTransformRafRef.current)
      profileImageDraftTransformRafRef.current = null
    }

    const defaultTransform: ProfileImageDraftTransformState = {
      focusX: PROFILE_IMAGE_EDIT_DEFAULT_FOCUS_X,
      focusY: PROFILE_IMAGE_EDIT_DEFAULT_FOCUS_Y,
      zoom: PROFILE_IMAGE_EDIT_MIN_ZOOM,
    }
    profileImageDraftTransformRef.current = defaultTransform
    setProfileImageDraftFocusX(defaultTransform.focusX)
    setProfileImageDraftFocusY(defaultTransform.focusY)
    setProfileImageDraftZoom(defaultTransform.zoom)
    applyProfileImageDraftPreviewStyle(defaultTransform)

    setProfileImageDraftPreviewUrl((prev) => {
      if (prev) {
        URL.revokeObjectURL(prev)
      }
      return ""
    })
  }, [applyProfileImageDraftPreviewStyle])

  const openProfileImageEditor = useCallback(() => {
    setIsProfileImageEditorOpen(true)
    setProfileImageDraftNotice({ tone: "idle", text: "" })
  }, [])

  const closeProfileImageEditor = useCallback(() => {
    if (loadingKey === "upload") return
    setIsProfileImageEditorOpen(false)
    setIsProfileImageDraftDragging(false)
    profileImageDraftPinchRef.current = null
    profileImageDraftActivePointersRef.current.clear()
    profileImageDraftDragRef.current = null
  }, [loadingKey])

  const handleDraftFileChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return

    const nextFileSeq = profileImageDraftFileSeqRef.current + 1
    profileImageDraftFileSeqRef.current = nextFileSeq
    setProfileImageFileName(file.name)
    setProfileImageDraftFile(file)
    setProfileImageDraftSourceSize(PROFILE_IMAGE_DRAFT_DEFAULT_SOURCE_SIZE)
    profileImageDraftSourceSizeRef.current = PROFILE_IMAGE_DRAFT_DEFAULT_SOURCE_SIZE
    setProfileImageDraftNotice({ tone: "idle", text: "" })
    const defaultTransform: ProfileImageDraftTransformState = {
      focusX: PROFILE_IMAGE_EDIT_DEFAULT_FOCUS_X,
      focusY: PROFILE_IMAGE_EDIT_DEFAULT_FOCUS_Y,
      zoom: PROFILE_IMAGE_EDIT_MIN_ZOOM,
    }
    profileImageDraftTransformRef.current = defaultTransform
    scheduleProfileImageDraftTransform(defaultTransform)
    setProfileImageDraftPreviewUrl((prev) => {
      if (prev) {
        URL.revokeObjectURL(prev)
      }
      return URL.createObjectURL(file)
    })
    void readImageSourceSizeFromFile(file)
      .then((sourceSize) => {
        if (profileImageDraftFileSeqRef.current !== nextFileSeq) return
        profileImageDraftSourceSizeRef.current = sourceSize
        setProfileImageDraftSourceSize(sourceSize)
        scheduleProfileImageDraftTransform(profileImageDraftTransformRef.current)
      })
      .catch(() => {
        if (profileImageDraftFileSeqRef.current !== nextFileSeq) return
        setProfileImageDraftNotice({ tone: "error", text: "이미지 해상도 정보를 읽지 못했습니다." })
      })
  }, [scheduleProfileImageDraftTransform])

  const handleProfileImageDraftPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!profileImageDraftFile) return
      const frame = profileImageDraftFrameRef.current
      if (!frame) return
      if (event.button !== 0) return

      event.preventDefault()
      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        // 일부 브라우저에서 포인터 캡처가 실패할 수 있으므로 드래그 로직은 계속 진행한다.
      }
      profileImageDraftActivePointersRef.current.set(event.pointerId, {
        clientX: event.clientX,
        clientY: event.clientY,
      })

      if (profileImageDraftActivePointersRef.current.size === 1) {
        const current = profileImageDraftTransformRef.current
        setIsProfileImageDraftDragging(true)
        profileImageDraftDragRef.current = {
          pointerId: event.pointerId,
          startClientX: event.clientX,
          startClientY: event.clientY,
          startFocusX: current.focusX,
          startFocusY: current.focusY,
        }
        return
      }

      if (profileImageDraftActivePointersRef.current.size >= 2) {
        const [firstPointer, secondPointer] = Array.from(profileImageDraftActivePointersRef.current.values())
        const distance = Math.hypot(
          secondPointer.clientX - firstPointer.clientX,
          secondPointer.clientY - firstPointer.clientY
        )
        if (distance > 0) {
          const frameRect = frame.getBoundingClientRect()
          const centerXRatio = frameRect.width > 0
            ? ((firstPointer.clientX + secondPointer.clientX) / 2 - frameRect.left) / frameRect.width
            : 0.5
          const centerYRatio = frameRect.height > 0
            ? ((firstPointer.clientY + secondPointer.clientY) / 2 - frameRect.top) / frameRect.height
            : 0.5
          const current = profileImageDraftTransformRef.current
          profileImageDraftPinchRef.current = {
            startDistance: distance,
            startCenterXRatio: Math.min(1, Math.max(0, centerXRatio)),
            startCenterYRatio: Math.min(1, Math.max(0, centerYRatio)),
            startFocusX: current.focusX,
            startFocusY: current.focusY,
            startZoom: current.zoom,
          }
          profileImageDraftDragRef.current = null
          setIsProfileImageDraftDragging(false)
        }
      }
    },
    [profileImageDraftFile]
  )

  const handleProfileImageDraftPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault()
      if (profileImageDraftActivePointersRef.current.has(event.pointerId)) {
        profileImageDraftActivePointersRef.current.set(event.pointerId, {
          clientX: event.clientX,
          clientY: event.clientY,
        })
      }

      const rect = event.currentTarget.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return

      const pinchState = profileImageDraftPinchRef.current
      if (pinchState && profileImageDraftActivePointersRef.current.size >= 2) {
        const [firstPointer, secondPointer] = Array.from(profileImageDraftActivePointersRef.current.values())
        const distance = Math.hypot(
          secondPointer.clientX - firstPointer.clientX,
          secondPointer.clientY - firstPointer.clientY
        )
        if (distance > 0) {
          const zoomFactor = distance / pinchState.startDistance
          const nextZoom = clampProfileImageEditZoom(pinchState.startZoom * zoomFactor)
          const baseTransform: ProfileImageDraftTransformState = {
            focusX: pinchState.startFocusX,
            focusY: pinchState.startFocusY,
            zoom: pinchState.startZoom,
          }
          let nextTransform = computeAnchoredZoomTransform(
            baseTransform,
            nextZoom,
            pinchState.startCenterXRatio,
            pinchState.startCenterYRatio
          )
          const currentCenterXRatio = ((firstPointer.clientX + secondPointer.clientX) / 2 - rect.left) / rect.width
          const currentCenterYRatio = ((firstPointer.clientY + secondPointer.clientY) / 2 - rect.top) / rect.height
          nextTransform = {
            ...nextTransform,
            focusX: nextTransform.focusX + (currentCenterXRatio - pinchState.startCenterXRatio) * 100,
            focusY: nextTransform.focusY + (currentCenterYRatio - pinchState.startCenterYRatio) * 100,
          }
          scheduleProfileImageDraftTransform(nextTransform)
        }
        return
      }

      const dragState = profileImageDraftDragRef.current
      if (!dragState || dragState.pointerId !== event.pointerId) return
      const deltaX = event.clientX - dragState.startClientX
      const deltaY = event.clientY - dragState.startClientY
      const zoomScale = Math.max(profileImageDraftTransformRef.current.zoom, PROFILE_IMAGE_EDIT_MIN_ZOOM)
      const nextFocusX = dragState.startFocusX + (deltaX / rect.width) * (100 / zoomScale)
      const nextFocusY = dragState.startFocusY + (deltaY / rect.height) * (100 / zoomScale)
      scheduleProfileImageDraftTransform({
        focusX: nextFocusX,
        focusY: nextFocusY,
        zoom: profileImageDraftTransformRef.current.zoom,
      })
    },
    [computeAnchoredZoomTransform, scheduleProfileImageDraftTransform]
  )

  const finalizeProfileImageDraftPointer = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    profileImageDraftActivePointersRef.current.delete(event.pointerId)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    const dragState = profileImageDraftDragRef.current
    if (dragState && dragState.pointerId === event.pointerId) {
      profileImageDraftDragRef.current = null
    }

    if (profileImageDraftActivePointersRef.current.size >= 2) {
      const [firstPointer, secondPointer] = Array.from(profileImageDraftActivePointersRef.current.values())
      const rect = event.currentTarget.getBoundingClientRect()
      const distance = Math.hypot(
        secondPointer.clientX - firstPointer.clientX,
        secondPointer.clientY - firstPointer.clientY
      )
      if (distance > 0 && rect.width > 0 && rect.height > 0) {
        const current = profileImageDraftTransformRef.current
        profileImageDraftPinchRef.current = {
          startDistance: distance,
          startCenterXRatio: ((firstPointer.clientX + secondPointer.clientX) / 2 - rect.left) / rect.width,
          startCenterYRatio: ((firstPointer.clientY + secondPointer.clientY) / 2 - rect.top) / rect.height,
          startFocusX: current.focusX,
          startFocusY: current.focusY,
          startZoom: current.zoom,
        }
      }
      setIsProfileImageDraftDragging(false)
      return
    }

    profileImageDraftPinchRef.current = null
    if (profileImageDraftActivePointersRef.current.size === 1) {
      const [remainingPointerId, remainingPointerPosition] = Array.from(profileImageDraftActivePointersRef.current.entries())[0]
      const current = profileImageDraftTransformRef.current
      profileImageDraftDragRef.current = {
        pointerId: remainingPointerId,
        startClientX: remainingPointerPosition.clientX,
        startClientY: remainingPointerPosition.clientY,
        startFocusX: current.focusX,
        startFocusY: current.focusY,
      }
      setIsProfileImageDraftDragging(true)
      return
    }

    setIsProfileImageDraftDragging(false)
  }, [])

  useEffect(() => {
    const frame = profileImageDraftFrameRef.current
    if (!frame || !profileImageDraftFile) return

    const handleWheel = (event: globalThis.WheelEvent) => {
      event.preventDefault()
      const rect = frame.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      const delta = event.deltaY < 0 ? 0.08 : -0.08
      const current = profileImageDraftTransformRef.current
      const nextZoom = clampProfileImageEditZoom(current.zoom + delta)
      if (nextZoom === current.zoom) return
      const anchorXRatio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
      const anchorYRatio = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
      const nextTransform = computeAnchoredZoomTransform(current, nextZoom, anchorXRatio, anchorYRatio)
      scheduleProfileImageDraftTransform(nextTransform)
    }

    frame.addEventListener("wheel", handleWheel, { passive: false })
    return () => frame.removeEventListener("wheel", handleWheel)
  }, [computeAnchoredZoomTransform, profileImageDraftFile, scheduleProfileImageDraftTransform])

  useEffect(() => {
    profileImageDraftSourceSizeRef.current = profileImageDraftSourceSize
    scheduleProfileImageDraftTransform(profileImageDraftTransformRef.current)
  }, [profileImageDraftSourceSize, scheduleProfileImageDraftTransform])

  useEffect(() => {
    return () => {
      if (profileImageDraftTransformRafRef.current !== null) {
        window.cancelAnimationFrame(profileImageDraftTransformRafRef.current)
      }
    }
  }, [])

  const requestProfileImageUpload = useCallback(async (memberId: number, file: File): Promise<Response> => {
    const formData = new FormData()
    formData.append("file", file, file.name)
    return await fetch(`${getApiBaseUrl()}/member/api/v1/adm/members/${memberId}/profileImageFile`, {
      method: "POST",
      credentials: "include",
      body: formData,
    })
  }, [])

  const handleUploadMemberProfileImage = useCallback(async (selectedFile?: File): Promise<boolean> => {
    const file = selectedFile || profileImageFileInputRef.current?.files?.[0]
    const memberId = sessionMember?.id
    if (!file) return false
    if (!memberId) return false

    try {
      setLoadingKey("upload")
      setImageNotice({ tone: "loading", text: "프로필 이미지를 최적화하고 업로드하고 있습니다..." })
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

      const uploadData = (await uploadResponse.json()) as MemberMe
      syncProfileState(uploadData)
      const successMessage = `프로필 이미지가 저장되었습니다. ${buildImageOptimizationSummary(prepared)}`
      setImageNotice({
        tone: "success",
        text: successMessage,
      })
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
  }, [requestProfileImageUpload, sessionMember?.id, syncProfileState])

  const handleApplyProfileImageDraft = useCallback(async () => {
    if (!profileImageDraftFile) {
      setProfileImageDraftNotice({ tone: "error", text: "먼저 프로필 이미지를 선택해주세요." })
      return
    }

    try {
      setProfileImageDraftNotice({ tone: "loading", text: "편집 결과를 반영해 업로드하고 있습니다..." })
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

  const handleUpdateMemberProfileCard = async () => {
    if (!sessionMember?.id) return

    const serviceValidationError = validateLinkInputs("service", "Service", serviceLinksInput)
    if (serviceValidationError) {
      setProfileNotice({ tone: "error", text: serviceValidationError })
      return
    }

    const contactValidationError = validateLinkInputs("contact", "Contact", contactLinksInput)
    if (contactValidationError) {
      setProfileNotice({ tone: "error", text: contactValidationError })
      return
    }

    try {
      setLoadingKey("save")
      setProfileNotice({ tone: "loading", text: "프로필 카드, 헤더 브랜드명, 메인 소개 카드 내용을 저장하고 있습니다..." })
      const updated = await apiFetch<MemberMe>(`/member/api/v1/adm/members/${sessionMember.id}/profileCard`, {
        method: "PATCH",
        body: JSON.stringify({
          role: profileRoleInput.trim(),
          bio: profileBioInput.trim(),
          aboutRole: aboutRoleInput.trim(),
          aboutBio: aboutBioInput.trim(),
          aboutDetails: aboutDetailsInput.trim(),
          blogTitle: blogTitleInput.trim(),
          homeIntroTitle: homeIntroTitleInput.trim(),
          homeIntroDescription: homeIntroDescriptionInput.trim(),
          serviceLinks: toPayloadLinks("service", serviceLinksInput, DEFAULT_SERVICE_ITEM_ICON),
          contactLinks: toPayloadLinks("contact", contactLinksInput, DEFAULT_CONTACT_ITEM_ICON),
        }),
      })
      syncProfileState(updated)
      setProfileNotice({ tone: "success", text: "프로필 카드, 헤더 브랜드명, 메인 소개 카드 내용이 저장되었습니다." })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setProfileNotice({ tone: "error", text: `프로필 저장 실패: ${message}` })
    } finally {
      setLoadingKey("")
    }
  }

  const hasUnsavedChanges = useMemo(() => {
    if (!sessionMember) return false

    const currentProfileImage = normalizeComparableText(profileImgInputUrl)
    const savedProfileImage = normalizeComparableText(sessionMember.profileImageDirectUrl || sessionMember.profileImageUrl)
    if (currentProfileImage !== savedProfileImage) return true

    if (normalizeComparableText(profileRoleInput) !== normalizeComparableText(sessionMember.profileRole)) return true
    if (normalizeComparableText(profileBioInput) !== normalizeComparableText(sessionMember.profileBio)) return true
    if (normalizeComparableText(aboutRoleInput) !== normalizeComparableText(sessionMember.aboutRole)) return true
    if (normalizeComparableText(aboutBioInput) !== normalizeComparableText(sessionMember.aboutBio)) return true
    if (normalizeComparableText(aboutDetailsInput) !== normalizeComparableText(sessionMember.aboutDetails)) return true
    if (normalizeComparableText(blogTitleInput) !== normalizeComparableText(sessionMember.blogTitle)) return true
    if (normalizeComparableText(homeIntroTitleInput) !== normalizeComparableText(sessionMember.homeIntroTitle)) return true
    if (normalizeComparableText(homeIntroDescriptionInput) !== normalizeComparableText(sessionMember.homeIntroDescription)) {
      return true
    }

    const currentService = serializeComparableLinks("service", serviceLinksInput, DEFAULT_SERVICE_ITEM_ICON)
    const savedService = serializeComparableLinks(
      "service",
      resolveServiceLinks(sessionMember),
      DEFAULT_SERVICE_ITEM_ICON
    )
    if (currentService !== savedService) return true

    const currentContact = serializeComparableLinks("contact", contactLinksInput, DEFAULT_CONTACT_ITEM_ICON)
    const savedContact = serializeComparableLinks(
      "contact",
      resolveContactLinks(sessionMember),
      DEFAULT_CONTACT_ITEM_ICON
    )

    return currentContact !== savedContact
  }, [
    aboutBioInput,
    aboutDetailsInput,
    aboutRoleInput,
    blogTitleInput,
    contactLinksInput,
    homeIntroDescriptionInput,
    homeIntroTitleInput,
    profileBioInput,
    profileImgInputUrl,
    profileRoleInput,
    serviceLinksInput,
    sessionMember,
  ])

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
      const error = new Error("Navigation aborted due to unsaved profile changes.") as Error & { cancelled?: boolean }
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

  if (!sessionMember) return null

  const profileSrc = profileImgInputUrl.trim()
  const displayName = sessionMember.nickname || sessionMember.username || "관리자"
  const displayNameInitial = displayName.slice(0, 2).toUpperCase()
  const profileUpdatedText = sessionMember.modifiedAt
    ? sessionMember.modifiedAt.slice(0, 16).replace("T", " ")
    : "확인 전"

  const handleRefreshStoredProfile = async () => {
    if (!sessionMember?.id) return
    try {
      setLoadingKey("refresh")
      setProfileNotice({ tone: "loading", text: "현재 저장값을 다시 불러오는 중입니다..." })
      const refreshed = await refreshAdminProfile(sessionMember.id, sessionMember)
      if (refreshed) {
        setProfileNotice({ tone: "success", text: "현재 저장값을 다시 불러왔습니다." })
      }
    } finally {
      setLoadingKey("")
    }
  }

  return (
    <Main>
      <HeaderCard>
        <HeaderCopy>
          <h1>운영 프로필</h1>
          <p>프로필 카드와 홈 소개만 한 화면에서 정리합니다.</p>
        </HeaderCopy>
        <HeaderActions>
          <Link href="/" passHref legacyBehavior>
            <LinkButton>메인</LinkButton>
          </Link>
          <Link href="/admin" passHref legacyBehavior>
            <LinkButton>허브</LinkButton>
          </Link>
          <Link href="/admin/posts/new" passHref legacyBehavior>
            <LinkButton>글 작업실</LinkButton>
          </Link>
        </HeaderActions>
      </HeaderCard>

      <HeaderMetaStrip data-dirty={hasUnsavedChanges ? "true" : "false"}>
        <span>현재 계정 {displayName}</span>
        <span>최근 수정 {profileUpdatedText}</span>
        <strong>{hasUnsavedChanges ? "미저장 변경 있음" : "저장 상태 최신"}</strong>
      </HeaderMetaStrip>

      <ProfileGrid>
        <PreviewCard>
          <AvatarFrame>
            {profileSrc ? (
              <ProfileImage src={profileSrc} alt={displayName} fillContainer priority />
            ) : (
              <AvatarFallback>{displayNameInitial}</AvatarFallback>
            )}
          </AvatarFrame>
          <strong>{displayName}</strong>
          <span>{profileRoleInput.trim() || "역할 미설정"}</span>
          <p>{profileBioInput.trim() || "소개 문구 미설정"}</p>
          <PreviewMetaStrip>
            <small>블로그 명</small>
            <BrandTitlePreview>
              {blogTitleInput.trim() ? <BrandMark className="brandMark" /> : null}
              <strong>{blogTitleInput.trim() || "미설정"}</strong>
            </BrandTitlePreview>
          </PreviewMetaStrip>
          <PreviewMetaStrip>
            <small>메인 소개 타이틀</small>
            <strong>{homeIntroTitleInput.trim() || "미설정"}</strong>
          </PreviewMetaStrip>
          <input
            ref={profileImageFileInputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={handleDraftFileChange}
          />
          <PrimaryButton
            type="button"
            onClick={openProfileImageEditor}
            disabled={loadingKey === "upload"}
          >
            {loadingKey === "upload" ? "업로드 중..." : "프로필 이미지 편집"}
          </PrimaryButton>
          <Hint>{profileImageFileName ? `선택 파일: ${profileImageFileName}` : "이미지 편집은 모달에서만 엽니다."}</Hint>
          {imageNotice.text ? <Notice data-tone={imageNotice.tone}>{imageNotice.text}</Notice> : null}
        </PreviewCard>

        <FormCard>
          <MetaBar aria-label="프로필 메타 정보">
            <MetaItem>
              <span>현재 계정</span>
              <strong>{displayName}</strong>
            </MetaItem>
            <MetaItem>
              <span>최종 수정 시각</span>
              <strong>{profileUpdatedText}</strong>
            </MetaItem>
          </MetaBar>
          <FormSections>
            <FormSection>
              <SectionHeading>
                <h2>기본 정보</h2>
                <p>역할과 소개 문구만 간단히 정리합니다.</p>
              </SectionHeading>
              <FieldGrid data-columns="2">
                <FieldBox>
                  <FieldLabel htmlFor="profile-role">프로필 역할</FieldLabel>
                  <Input
                    id="profile-role"
                    placeholder="예: Backend Developer"
                    value={profileRoleInput}
                    onChange={(e) => setProfileRoleInput(e.target.value)}
                  />
                </FieldBox>
                <FieldBox>
                  <FieldLabel htmlFor="profile-bio">소개 문구</FieldLabel>
                  <TextArea
                    id="profile-bio"
                    placeholder="메인 프로필 카드에 노출할 소개 문구"
                    value={profileBioInput}
                    onChange={(e) => setProfileBioInput(e.target.value)}
                  />
                </FieldBox>
              </FieldGrid>
            </FormSection>

            <FormSection>
              <SectionHeading>
                <h2>About Me 정보 카드</h2>
                <p>About 페이지 전용 역할/소개를 메인 프로필과 분리해 관리합니다.</p>
              </SectionHeading>
              <FieldGrid data-columns="2">
                <FieldBox>
                  <FieldLabel htmlFor="about-role">About 역할</FieldLabel>
                  <Input
                    id="about-role"
                    placeholder="예: Backend Developer"
                    value={aboutRoleInput}
                    onChange={(e) => setAboutRoleInput(e.target.value)}
                  />
                </FieldBox>
                <FieldBox>
                  <FieldLabel htmlFor="about-bio">About 소개 문구</FieldLabel>
                  <TextArea
                    id="about-bio"
                    placeholder="About Me 카드에 노출할 상세 소개 문구"
                    value={aboutBioInput}
                    onChange={(e) => setAboutBioInput(e.target.value)}
                  />
                </FieldBox>
                <FieldBox style={{ gridColumn: "1 / -1" }}>
                  <FieldLabel htmlFor="about-details">About 상세 섹션</FieldLabel>
                  <TextArea
                    id="about-details"
                    placeholder={"예시)\n## 경력\n2021.07 - 2022.04 SpaceWalk(DE Chapter) Intern\n2020.09 - 2021.02 세종대학교 NLP 학부 연구생\n\n## 수상이력\n2021.06 세종대학교 창의설계경진대회 인기상\n2020.12 세종대학교 해커톤 장려상\n\n## 논문\n2020.12 텍스트 마이닝을 이용한 ESG 요소 분석"}
                    value={aboutDetailsInput}
                    onChange={(e) => setAboutDetailsInput(e.target.value)}
                  />
                  <Hint>형식: `## 섹션명` 제목 아래 줄마다 항목을 입력하면 About 페이지에 구분선 스타일로 렌더링됩니다.</Hint>
                </FieldBox>
              </FieldGrid>
            </FormSection>

            <FormSection>
              <SectionHeading>
                <h2>홈 소개</h2>
                <p>헤더 로고 옆 블로그 명과 메인 소개 문구만 관리합니다.</p>
              </SectionHeading>
              <FieldGrid data-columns="2">
                <FieldBox>
                  <FieldLabel htmlFor="blog-title">블로그 명</FieldLabel>
                  <Input
                    id="blog-title"
                    placeholder="예: aquilaXk's Blog"
                    value={blogTitleInput}
                    onChange={(e) => setBlogTitleInput(e.target.value)}
                  />
                </FieldBox>
                <FieldBox>
                  <FieldLabel htmlFor="home-intro-title">메인 소개 카드 타이틀</FieldLabel>
                  <Input
                    id="home-intro-title"
                    placeholder="예: 비밀스러운 IT 공작소"
                    value={homeIntroTitleInput}
                    onChange={(e) => setHomeIntroTitleInput(e.target.value)}
                  />
                </FieldBox>
                <FieldBox style={{ gridColumn: "1 / -1" }}>
                  <FieldLabel htmlFor="home-intro-description">메인 소개 카드 설명</FieldLabel>
                  <TextArea
                    id="home-intro-description"
                    placeholder="메인 페이지 소개 카드에 노출할 설명 문구"
                    value={homeIntroDescriptionInput}
                    onChange={(e) => setHomeIntroDescriptionInput(e.target.value)}
                  />
                </FieldBox>
              </FieldGrid>
            </FormSection>

            <LinkSectionCard>
              <SectionHeading>
                <h2>서비스 링크</h2>
                <p>메인 Service 카드 링크를 관리합니다.</p>
              </SectionHeading>
              <LinkSectionHeader>
                <Button type="button" onClick={() => appendLinkItem("service")}>
                  항목 추가
                </Button>
              </LinkSectionHeader>
              <LinkSectionHint>아이콘, 이름, 링크만 입력하면 됩니다.</LinkSectionHint>
              <LinkItemsWrap>
                {serviceLinksInput.length > 0 ? (
                  serviceLinksInput.map((item, index) => (
                    <LinkItemRow key={`service-${index}`}>
                      <IconPickerField data-icon-picker-root="true">
                        <FieldLabel as="span">아이콘</FieldLabel>
                        <IconPickerButton
                          type="button"
                          aria-expanded={openIconPicker === toPickerKey("service", index)}
                          onClick={() =>
                            setOpenIconPicker((current) =>
                              current === toPickerKey("service", index) ? null : toPickerKey("service", index)
                            )
                          }
                        >
                          <IconPreview>
                            <AppIcon name={item.icon} />
                          </IconPreview>
                          <IconPickerCopy>
                            <strong>{getSectionIconOptions("service").find((option) => option.id === item.icon)?.label || "서비스"}</strong>
                            <span>아이콘만 선택</span>
                          </IconPickerCopy>
                          <AppIcon name="chevron-down" />
                        </IconPickerButton>
                        {openIconPicker === toPickerKey("service", index) && (
                          <IconPickerPanel role="listbox" aria-label="서비스 아이콘 선택">
                            {getSectionIconOptions("service").map((option) => (
                              <IconOptionButton
                                key={option.id}
                                type="button"
                                data-selected={option.id === item.icon}
                                onClick={() => {
                                  updateLinkItem("service", index, "icon", option.id)
                                  setOpenIconPicker(null)
                                }}
                              >
                                <IconPreview data-compact="true">
                                  <AppIcon name={option.id} />
                                </IconPreview>
                                <IconOptionText>
                                  <strong>{option.label}</strong>
                                  <span>{option.id}</span>
                                </IconOptionText>
                              </IconOptionButton>
                            ))}
                          </IconPickerPanel>
                        )}
                      </IconPickerField>
                      <FieldBox className="nameField">
                        <FieldLabel as="span">표시 이름</FieldLabel>
                        <Input
                          placeholder="예: aquila-blog"
                          value={item.label}
                          onChange={(e) => updateLinkItem("service", index, "label", e.target.value)}
                        />
                      </FieldBox>
                      <FieldBox className="urlField">
                        <FieldLabel as="span">이동 링크</FieldLabel>
                        <Input
                          placeholder="https://..."
                          value={item.href}
                          onChange={(e) => updateLinkItem("service", index, "href", e.target.value)}
                        />
                      </FieldBox>
                      <RemoveButton className="removeAction" type="button" onClick={() => removeLinkItem("service", index)}>
                        삭제
                      </RemoveButton>
                    </LinkItemRow>
                  ))
                ) : (
                  <InlineEmpty>서비스 링크가 없습니다. 항목 추가를 눌러 시작하세요.</InlineEmpty>
                )}
              </LinkItemsWrap>
            </LinkSectionCard>
            <LinkSectionCard>
              <SectionHeading>
                <h2>연락 링크</h2>
                <p>메인 Contact 카드 링크를 관리합니다.</p>
              </SectionHeading>
              <LinkSectionHeader>
                <Button type="button" onClick={() => appendLinkItem("contact")}>
                  항목 추가
                </Button>
              </LinkSectionHeader>
              <LinkSectionHint>아이콘, 이름, 링크만 입력하면 됩니다.</LinkSectionHint>
              <LinkItemsWrap>
                {contactLinksInput.length > 0 ? (
                  contactLinksInput.map((item, index) => (
                    <LinkItemRow key={`contact-${index}`}>
                      <IconPickerField data-icon-picker-root="true">
                        <FieldLabel as="span">아이콘</FieldLabel>
                        <IconPickerButton
                          type="button"
                          aria-expanded={openIconPicker === toPickerKey("contact", index)}
                          onClick={() =>
                            setOpenIconPicker((current) =>
                              current === toPickerKey("contact", index) ? null : toPickerKey("contact", index)
                            )
                          }
                        >
                          <IconPreview>
                            <AppIcon name={item.icon} />
                          </IconPreview>
                          <IconPickerCopy>
                            <strong>{getSectionIconOptions("contact").find((option) => option.id === item.icon)?.label || "메시지"}</strong>
                            <span>아이콘만 선택</span>
                          </IconPickerCopy>
                          <AppIcon name="chevron-down" />
                        </IconPickerButton>
                        {openIconPicker === toPickerKey("contact", index) && (
                          <IconPickerPanel role="listbox" aria-label="연락처 아이콘 선택">
                            {getSectionIconOptions("contact").map((option) => (
                              <IconOptionButton
                                key={option.id}
                                type="button"
                                data-selected={option.id === item.icon}
                                onClick={() => {
                                  updateLinkItem("contact", index, "icon", option.id)
                                  setOpenIconPicker(null)
                                }}
                              >
                                <IconPreview data-compact="true">
                                  <AppIcon name={option.id} />
                                </IconPreview>
                                <IconOptionText>
                                  <strong>{option.label}</strong>
                                  <span>{option.id}</span>
                                </IconOptionText>
                              </IconOptionButton>
                            ))}
                          </IconPickerPanel>
                        )}
                      </IconPickerField>
                      <FieldBox className="nameField">
                        <FieldLabel as="span">표시 이름</FieldLabel>
                        <Input
                          placeholder="예: github"
                          value={item.label}
                          onChange={(e) => updateLinkItem("contact", index, "label", e.target.value)}
                        />
                      </FieldBox>
                      <FieldBox className="urlField">
                        <FieldLabel as="span">이동 링크</FieldLabel>
                        <Input
                          placeholder="예: mailto:me@example.com"
                          value={item.href}
                          onChange={(e) => updateLinkItem("contact", index, "href", e.target.value)}
                        />
                      </FieldBox>
                      <RemoveButton className="removeAction" type="button" onClick={() => removeLinkItem("contact", index)}>
                        삭제
                      </RemoveButton>
                    </LinkItemRow>
                  ))
                ) : (
                  <InlineEmpty>연락 링크가 없습니다. 항목 추가를 눌러 시작하세요.</InlineEmpty>
                )}
              </LinkItemsWrap>
            </LinkSectionCard>
          </FormSections>
        </FormCard>
      </ProfileGrid>

      <StickySaveBar data-dirty={hasUnsavedChanges ? "true" : "false"}>
        <StickySaveCopy>
          <strong>{hasUnsavedChanges ? "미저장 변경이 있습니다." : "저장 상태 최신"}</strong>
          <span>
            {profileNotice.tone !== "idle"
              ? profileNotice.text
              : hasUnsavedChanges
                ? "하단 저장 바에서 바로 반영합니다."
                : "항목을 바꾸면 저장 버튼이 켜집니다."}
          </span>
        </StickySaveCopy>
        <StickySaveActions>
          <Button type="button" disabled={loadingKey === "refresh"} onClick={() => void handleRefreshStoredProfile()}>
            {loadingKey === "refresh" ? "불러오는 중..." : "저장값 다시 불러오기"}
          </Button>
          <PrimaryButton
            type="button"
            disabled={loadingKey === "save" || !hasUnsavedChanges}
            onClick={() => void handleUpdateMemberProfileCard()}
          >
            {loadingKey === "save" ? "저장 중..." : "변경 사항 저장"}
          </PrimaryButton>
        </StickySaveActions>
      </StickySaveBar>

      {isProfileImageEditorOpen ? (
        <ModalOverlay
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeProfileImageEditor()
            }
          }}
        >
          <ModalCard role="dialog" aria-modal="true" aria-label="프로필 이미지 편집">
            <ModalHeader>
              <div>
                <h2>프로필 이미지 편집</h2>
                <p>파일 선택 후 드래그/확대 축소로 표시 영역을 조정해 저장할 수 있습니다.</p>
              </div>
              <ModalCloseButton type="button" onClick={closeProfileImageEditor} disabled={loadingKey === "upload"}>
                <AppIcon name="close" />
              </ModalCloseButton>
            </ModalHeader>

            <ModalConstraintList>
              <li>지원 형식: JPG/PNG/GIF/WebP</li>
              <li>프로필 업로드 기준: 자동 최적화 후 최대 2MB</li>
              <li>움직이는 GIF는 애니메이션 보존을 위해 2MB 이하 원본만 허용</li>
            </ModalConstraintList>

            <ModalActions>
              <Button type="button" onClick={() => profileImageFileInputRef.current?.click()} disabled={loadingKey === "upload"}>
                파일 선택
              </Button>
              <Button type="button" onClick={clearProfileImageDraft} disabled={loadingKey === "upload"}>
                편집값 초기화
              </Button>
            </ModalActions>

            {profileImageDraftPreviewUrl ? (
              <>
                <ModalEditorFrame
                  ref={profileImageDraftFrameRef}
                  data-has-image="true"
                  data-draggable={profileImageDraftFile ? "true" : "false"}
                  data-dragging={isProfileImageDraftDragging ? "true" : "false"}
                  onPointerDown={handleProfileImageDraftPointerDown}
                  onPointerMove={handleProfileImageDraftPointerMove}
                  onPointerUp={finalizeProfileImageDraftPointer}
                  onPointerCancel={finalizeProfileImageDraftPointer}
                >
                  <Image
                    src={profileImageDraftPreviewUrl}
                    alt="프로필 편집 미리보기"
                    fill
                    unoptimized
                    sizes="(max-width: 768px) 100vw, 360px"
                    style={{
                      objectFit: "cover",
                      width: "var(--profile-draft-width)",
                      height: "var(--profile-draft-height)",
                      left: "var(--profile-draft-left)",
                      top: "var(--profile-draft-top)",
                      maxWidth: "none",
                      transform: "translateZ(0)",
                    }}
                    draggable={false}
                  />
                </ModalEditorFrame>

                <ModalSliderWrap>
                  <label htmlFor="profile-image-zoom">확대/축소</label>
                  <input
                    id="profile-image-zoom"
                    type="range"
                    min={PROFILE_IMAGE_EDIT_MIN_ZOOM}
                    max={PROFILE_IMAGE_EDIT_MAX_ZOOM}
                    step={0.01}
                    value={profileImageDraftZoom}
                    onChange={(event) =>
                      scheduleProfileImageDraftTransform({
                        ...profileImageDraftTransformRef.current,
                        zoom: clampProfileImageEditZoom(Number(event.target.value)),
                      })
                    }
                  />
                  <span>{profileImageDraftZoom.toFixed(2)}x</span>
                </ModalSliderWrap>
              </>
            ) : (
              <ModalEmptyState>먼저 프로필 이미지를 선택해주세요.</ModalEmptyState>
            )}

            {profileImageDraftNotice.text ? <Notice data-tone={profileImageDraftNotice.tone}>{profileImageDraftNotice.text}</Notice> : null}

            <ModalFooter>
              <Button type="button" onClick={closeProfileImageEditor} disabled={loadingKey === "upload"}>
                취소
              </Button>
              <PrimaryButton
                type="button"
                onClick={() => void handleApplyProfileImageDraft()}
                disabled={loadingKey === "upload" || !profileImageDraftFile}
              >
                {loadingKey === "upload" ? "저장 중..." : "편집 결과 저장"}
              </PrimaryButton>
            </ModalFooter>
          </ModalCard>
        </ModalOverlay>
      ) : null}
    </Main>
  )
}

export default AdminProfilePage

const Main = styled.main`
  max-width: 1120px;
  margin: 0 auto;
  padding: 1.5rem 1rem 2.6rem;
  display: grid;
  gap: 0.95rem;

  @media (max-width: 760px) {
    padding-bottom: calc(9.2rem + env(safe-area-inset-bottom, 0px));
  }
`

const HeaderCard = styled.section`
  display: grid;
  gap: 0.68rem;
  padding: 0.84rem 0.92rem;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  border-radius: 16px;
  background: ${({ theme }) => theme.colors.gray2};
  box-shadow: none;

  h1 {
    margin: 0;
    font-size: clamp(1.72rem, 3.2vw, 2.15rem);
    letter-spacing: -0.03em;
    line-height: 1.08;
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.82rem;
    line-height: 1.45;
  }
`

const HeaderCopy = styled.div`
  display: grid;
  gap: 0.45rem;
  max-width: 32rem;
`

const HeaderActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;

  @media (max-width: 1024px) {
    width: 100%;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
`

const HeaderMetaStrip = styled.section`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.38rem;
  padding: 0.5rem 0.6rem;
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  background: ${({ theme }) => theme.colors.gray2};

  span,
  strong {
    display: inline-flex;
    align-items: center;
    min-height: 30px;
    min-height: 28px;
    border-radius: 999px;
    padding: 0 0.56rem;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: transparent;
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.72rem;
    font-weight: 700;
    white-space: nowrap;
  }

  strong {
    justify-content: center;
    color: ${({ theme }) => theme.colors.gray12};
  }

  &[data-dirty="true"] strong {
    border-color: ${({ theme }) => theme.colors.blue8};
    background: ${({ theme }) => theme.colors.blue3};
    color: ${({ theme }) => theme.colors.blue11};
  }

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`

const BaseButton = styled.button`
  border-radius: 10px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray11};
  padding: 0.66rem 0.92rem;
  font-size: 0.92rem;
  font-weight: 700;
  cursor: pointer;
  transition:
    background-color 0.18s ease,
    border-color 0.18s ease,
    color 0.18s ease;

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.gray8};
    background: ${({ theme }) => theme.colors.gray3};
    color: ${({ theme }) => theme.colors.gray12};
  }

  &:disabled {
    opacity: 1;
    cursor: not-allowed;
    border-color: ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.colors.gray3};
    color: ${({ theme }) => theme.colors.gray10};
  }
`

const Button = styled(BaseButton)``

const PrimaryButton = styled(BaseButton)`
  border-color: ${({ theme }) => theme.colors.blue8};
  color: ${({ theme }) => theme.colors.blue11};

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.blue10};
    background: ${({ theme }) => theme.colors.blue3};
    color: ${({ theme }) => theme.colors.blue11};
  }

  &:disabled {
    border-color: ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.colors.gray4};
    color: ${({ theme }) => theme.colors.gray10};
  }
`

const LinkButton = styled.a`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  border-radius: 10px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray11};
  text-decoration: none;
  padding: 0.72rem 1rem;
  font-size: 0.92rem;
  font-weight: 700;

  @media (max-width: 640px) {
    justify-content: flex-start;
  }
`

const ProfileGrid = styled.section`
  display: grid;
  grid-template-columns: 268px minmax(0, 1fr);
  gap: 0.82rem;
  align-items: start;

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`

const PanelCard = styled.section`
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  background: ${({ theme }) => theme.colors.gray2};
  box-shadow: none;
  padding: 0.8rem;
`

const PreviewCard = styled(PanelCard)`
  display: grid;
  justify-items: center;
  align-content: start;
  gap: 0.38rem;
  text-align: center;
  align-self: start;
  height: fit-content;
  position: sticky;
  top: 0.78rem;
  width: 100%;
  min-width: 0;
  overflow: hidden;

  @media (max-width: 760px) {
    position: static;
    order: 2;
  }

  strong {
    font-size: 0.96rem;
    width: 100%;
    min-width: 0;
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  span {
    color: ${({ theme }) => theme.colors.blue10};
    font-weight: 700;
    font-size: 0.76rem;
    width: 100%;
    min-width: 0;
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.74rem;
    line-height: 1.4;
    width: 100%;
    min-width: 0;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    overflow: hidden;
    overflow-wrap: anywhere;
    word-break: break-word;
  }
`

const AvatarFrame = styled.div`
  position: relative;
  width: 84px;
  height: 84px;
  border-radius: 999px;
  overflow: hidden;
  border: none;
`

const AvatarFallback = styled.div`
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  font-size: 1.6rem;
  font-weight: 800;
  background: ${({ theme }) => theme.colors.gray4};
  color: ${({ theme }) => theme.colors.gray11};
`

const Hint = styled.p`
  margin: 0;
  width: 100%;
  min-width: 0;
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.74rem;
  line-height: 1.4;
  overflow-wrap: anywhere;
  word-break: break-word;
`

const PreviewMetaStrip = styled.div`
  width: 100%;
  display: grid;
  gap: 0.18rem;
  padding: 0.42rem 0.52rem;
  border-radius: 10px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};

  small {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.02em;
  }

  strong {
    font-size: 0.84rem;
    line-height: 1.45;
  }
`

const BrandTitlePreview = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.38rem;
  width: 100%;
  min-width: 0;

  .brandMark {
    display: block;
    flex-shrink: 0;
    width: 1.15rem;
    height: 1.15rem;
  }

  strong {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`

const FormCard = styled(PanelCard)`
  display: grid;
  gap: 0.88rem;

  @media (max-width: 760px) {
    order: 1;
  }
`

const FormSections = styled.div`
  display: grid;
  gap: 0.82rem;
`

const FormSection = styled.section`
  display: grid;
  gap: 0.72rem;
  padding: 0.78rem;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
`

const SectionHeading = styled.div`
  display: grid;
  gap: 0.22rem;

  h2 {
    margin: 0;
    font-size: 1rem;
    color: ${({ theme }) => theme.colors.gray12};
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.8rem;
    line-height: 1.5;
  }
`

const MetaBar = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.7rem;

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`

const MetaItem = styled.div`
  display: grid;
  gap: 0.32rem;
  min-width: 0;
  border-radius: 10px;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  background: ${({ theme }) => theme.colors.gray1};
  padding: 0.62rem 0.72rem;

  span {
    font-size: 0.76rem;
    font-weight: 700;
    color: ${({ theme }) => theme.colors.gray10};
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }

  strong {
    font-size: 1.08rem;
    font-weight: 800;
    color: ${({ theme }) => theme.colors.gray12};
    line-height: 1.35;
    letter-spacing: -0.02em;
    word-break: break-word;
  }
`

const Notice = styled.div`
  border-radius: 8px;
  padding: 0.8rem 0.95rem;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: transparent;
  color: ${({ theme }) => theme.colors.gray12};
  width: 100%;
  min-width: 0;
  line-height: 1.6;
  overflow-wrap: anywhere;
  word-break: break-word;

  &[data-tone="success"] {
    border-color: ${({ theme }) => theme.colors.green7};
    background: ${({ theme }) => theme.colors.green3};
    color: ${({ theme }) => theme.colors.green11};
  }

  &[data-tone="error"] {
    border-color: ${({ theme }) => theme.colors.red7};
    background: ${({ theme }) => theme.colors.red3};
    color: ${({ theme }) => theme.colors.red11};
  }

  &[data-tone="loading"] {
    border-color: ${({ theme }) => theme.colors.blue7};
    background: ${({ theme }) => theme.colors.blue3};
    color: ${({ theme }) => theme.colors.blue11};
  }
`

const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 2200;
  background: rgba(6, 10, 16, 0.78);
  display: grid;
  place-items: center;
  padding: 1rem;
`

const ModalCard = styled.section`
  width: min(640px, 100%);
  max-height: min(90vh, 860px);
  overflow: auto;
  border-radius: 16px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
  box-shadow: 0 22px 60px rgba(0, 0, 0, 0.42);
  padding: 1rem;
  display: grid;
  gap: 0.9rem;
`

const ModalHeader = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 0.8rem;
  align-items: flex-start;

  h2 {
    margin: 0;
    font-size: 1.18rem;
    line-height: 1.32;
  }

  p {
    margin: 0.4rem 0 0;
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.88rem;
    line-height: 1.6;
  }
`

const ModalCloseButton = styled.button`
  width: 40px;
  height: 40px;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray11};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`

const ModalConstraintList = styled.ul`
  margin: 0;
  padding-left: 1.1rem;
  display: grid;
  gap: 0.3rem;
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.84rem;
  line-height: 1.5;
`

const ModalActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
`

const ModalEditorFrame = styled.div`
  --profile-draft-width: 100%;
  --profile-draft-height: 100%;
  --profile-draft-left: 0%;
  --profile-draft-top: 0%;

  position: relative;
  width: 100%;
  max-width: 360px;
  justify-self: center;
  aspect-ratio: 1 / 1;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  overflow: hidden;
  user-select: none;

  &[data-draggable="true"] {
    cursor: grab;
    touch-action: none;
  }

  &[data-dragging="true"] {
    cursor: grabbing;
  }

  img {
    position: absolute;
    display: block;
    pointer-events: none;
    user-select: none;
    touch-action: none;
    will-change: top, left, width, height;
  }
`

const ModalSliderWrap = styled.div`
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 0.6rem;

  label {
    font-size: 0.86rem;
    color: ${({ theme }) => theme.colors.gray11};
    font-weight: 700;
  }

  input {
    width: 100%;
  }

  span {
    font-size: 0.82rem;
    color: ${({ theme }) => theme.colors.gray11};
    font-variant-numeric: tabular-nums;
    min-width: 3.4rem;
    text-align: right;
  }
`

const ModalEmptyState = styled.div`
  border-radius: 10px;
  border: 1px dashed ${({ theme }) => theme.colors.gray6};
  padding: 1.05rem;
  color: ${({ theme }) => theme.colors.gray11};
  text-align: center;
  font-size: 0.86rem;
`

const ModalFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 0.55rem;
`

const FieldGrid = styled.div`
  display: grid;
  gap: 1rem;
`

const FieldBox = styled.label`
  display: grid;
  gap: 0.45rem;
`

const FieldLabel = styled.label`
  font-size: 0.82rem;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.gray11};
`

const Input = styled.input`
  width: 100%;
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray12};
  padding: 0.9rem 1rem;
  font-size: 0.98rem;
`

const TextArea = styled.textarea`
  width: 100%;
  min-height: 140px;
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray12};
  padding: 0.9rem 1rem;
  font-size: 0.98rem;
  line-height: 1.7;
  resize: vertical;
`

const LinkSectionCard = styled.section`
  display: grid;
  gap: 0.7rem;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  padding: 0.9rem;
`

const LinkSectionHeader = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  justify-content: space-between;
  align-items: center;
`

const LinkSectionHint = styled.p`
  margin: -0.15rem 0 0;
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.74rem;
  line-height: 1.4;
`

const LinkItemsWrap = styled.div`
  display: grid;
  gap: 0.8rem;
`

const LinkItemRow = styled.div`
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr) auto;
  grid-template-areas:
    "icon name remove"
    "url url remove";
  gap: 0.56rem;
  align-items: start;
  padding: 0.66rem 0;
  border-radius: 0;
  border: 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.gray6};
  background: transparent;

  > .nameField {
    grid-area: name;
  }

  > .urlField {
    grid-area: url;
  }

  > .removeAction {
    grid-area: remove;
    align-self: end;
  }

  @media (max-width: 980px) {
    grid-template-columns: 1fr;
    grid-template-areas:
      "icon"
      "name"
      "url"
      "remove";
  }
`

const IconPickerField = styled.div`
  grid-area: icon;
  display: grid;
  gap: 0.45rem;
  min-width: 0;
  position: relative;
  align-self: stretch;
`

const IconPickerButton = styled.button`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.72rem;
  width: 100%;
  min-height: 3.45rem;
  padding: 0.5rem 0.72rem;
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: transparent;
  color: ${({ theme }) => theme.colors.gray12};
  min-width: 0;
  cursor: pointer;

  &:hover {
    border-color: ${({ theme }) => theme.colors.gray8};
  }

  &[aria-expanded="true"] {
    border-color: ${({ theme }) => theme.colors.blue8};
    box-shadow: 0 0 0 1px ${({ theme }) => theme.colors.blue7};
  }

  > svg:last-of-type {
    font-size: 1rem;
    color: ${({ theme }) => theme.colors.gray10};
    flex-shrink: 0;
  }
`

const IconPreview = styled.span`
  width: 2.25rem;
  height: 2.25rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: ${({ theme }) => theme.colors.gray11};
  flex-shrink: 0;
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: transparent;

  svg {
    font-size: 1.08rem;
  }

  &[data-compact="true"] {
    width: 1.95rem;
    height: 1.95rem;
    border-radius: 10px;
  }
`

const IconPickerCopy = styled.span`
  display: grid;
  gap: 0.12rem;
  min-width: 0;

  strong {
    font-size: 0.96rem;
    line-height: 1.2;
    color: ${({ theme }) => theme.colors.gray12};
  }

  span {
    font-size: 0.75rem;
    color: ${({ theme }) => theme.colors.gray10};
    line-height: 1.2;
  }
`

const IconPickerPanel = styled.div`
  position: absolute;
  top: calc(100% + 0.45rem);
  left: 0;
  z-index: 40;
  min-width: 100%;
  width: max-content;
  max-width: min(18rem, calc(100vw - 3rem));
  max-height: 16rem;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0.45rem;
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
  box-shadow: none;
  scrollbar-gutter: stable;
`

const IconOptionButton = styled.button`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 0.65rem;
  width: 100%;
  min-height: 2.85rem;
  padding: 0.46rem 0.52rem;
  border: 0;
  border-radius: 14px;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray12};
  text-align: left;
  cursor: pointer;

  &:hover {
    background: ${({ theme }) => theme.colors.gray3};
  }

  &[data-selected="true"] {
    background: ${({ theme }) => theme.colors.blue3};
    color: ${({ theme }) => theme.colors.blue11};
  }
`

const IconOptionText = styled.span`
  display: grid;
  gap: 0.08rem;
  min-width: 0;

  strong {
    font-size: 0.92rem;
    line-height: 1.2;
    word-break: keep-all;
  }

  span {
    font-size: 0.72rem;
    color: ${({ theme }) => theme.colors.gray10};
    line-height: 1.2;
  }
`

const RemoveButton = styled(Button)`
  color: ${({ theme }) => theme.colors.red11};
  border-color: ${({ theme }) => theme.colors.red7};
  background: transparent;
  white-space: nowrap;
  min-height: 2.6rem;
  padding: 0 0.58rem;
`

const InlineEmpty = styled.p`
  margin: 0;
  border-radius: 0;
  border: 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.gray6};
  color: ${({ theme }) => theme.colors.gray11};
  padding: 0.72rem 0;
  font-size: 0.88rem;
`

const StickySaveBar = styled.section`
  position: sticky;
  bottom: 0.2rem;
  z-index: 15;
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 0.62rem;
  padding: 0.54rem 0.68rem;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: rgba(18, 21, 26, 0.88);

  &[data-dirty="true"] {
    border-color: ${({ theme }) => theme.colors.blue8};
    background: rgba(27, 45, 74, 0.84);
  }

  @media (max-width: 760px) {
    position: fixed;
    left: max(0.72rem, env(safe-area-inset-left, 0px));
    right: max(0.72rem, env(safe-area-inset-right, 0px));
    bottom: calc(0.72rem + env(safe-area-inset-bottom, 0px));
    z-index: 80;
    padding: 0.68rem;
    border-radius: 12px;
    box-shadow: 0 10px 24px rgba(2, 6, 23, 0.22);
  }
`

const StickySaveCopy = styled.div`
  min-width: 0;
  display: grid;
  gap: 0.12rem;

  strong {
    font-size: 0.8rem;
    color: ${({ theme }) => theme.colors.gray12};
    line-height: 1.35;
  }

  span {
    font-size: 0.72rem;
    color: ${({ theme }) => theme.colors.gray10};
    line-height: 1.4;
  }
`

const StickySaveActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;

  @media (max-width: 760px) {
    width: 100%;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));

    > button {
      display: inline-flex;
      align-items: center;
      width: 100%;
      justify-content: center;
      min-height: 40px;
    }
  }

  @media (max-width: 560px) {
    grid-template-columns: 1fr;
  }
`
