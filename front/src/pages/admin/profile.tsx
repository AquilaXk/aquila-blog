import styled from "@emotion/styled"
import { dehydrate, useQueryClient } from "@tanstack/react-query"
import { GetServerSideProps, NextPage } from "next"
import Link from "next/link"
import { useRouter } from "next/router"
import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { apiFetch, getApiBaseUrl } from "src/apis/backend/client"
import BrandMark from "src/components/branding/BrandMark"
import AppIcon, { IconName } from "src/components/icons/AppIcon"
import ProfileImage from "src/components/ProfileImage"
import {
  DEFAULT_CONTACT_ITEM_ICON,
  DEFAULT_SERVICE_ITEM_ICON,
  getProfileCardIconOptions,
  isAllowedProfileLinkHref,
  normalizeProfileLinkHref,
  ProfileCardLinkItem,
  ProfileCardLinkSection,
} from "src/constants/profileCardLinks"
import { queryKey } from "src/constants/queryKey"
import useAuthSession, { AuthMember } from "src/hooks/useAuthSession"
import { setAdminProfileCache, toAdminProfile } from "src/hooks/useAdminProfile"
import { setProfileWorkspaceCache, useProfileWorkspace } from "src/hooks/useProfileWorkspace"
import useViewportImageEditor from "src/libs/imageEditor/useViewportImageEditor"
import {
  buildLegacyAboutDetails,
  buildProfileWorkspaceFromLegacy,
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
  PROFILE_IMAGE_EDIT_MAX_ZOOM,
  PROFILE_IMAGE_EDIT_MIN_ZOOM,
  resolveProfileImageEditDrawRatios,
} from "src/libs/profileImageUpload"
import { createQueryClient } from "src/libs/react-query"
import { saveProfileCardWithConflictRetry } from "src/libs/profileCardSave"
import { guardAdminRequest } from "src/libs/server/adminGuard"
import { fetchServerProfileWorkspace } from "src/libs/server/profileWorkspace"
import { acquireBodyScrollLock } from "src/libs/utils/bodyScrollLock"

type NoticeTone = "idle" | "loading" | "success" | "error"
type WorkspaceSectionId = "identity" | "about" | "home" | "links"
type LinkTab = "service" | "contact"
type PreviewMode = "draft" | "published"
type OpenIconPicker = `${LinkTab}:${number}` | null
type ProfileImageDraftTransformState = {
  focusX: number
  focusY: number
  zoom: number
}

type AdminProfileWorkspacePageProps = {
  initialMember: AuthMember
  initialWorkspace: ProfileWorkspaceResponse | null
}

const PROFILE_UNSAVED_CHANGES_MESSAGE = "저장하지 않은 변경 사항이 있습니다. 이 페이지를 떠날까요?"
const PROFILE_IMAGE_DRAFT_DEFAULT_SOURCE_SIZE: ProfileImageSourceSize = { width: 1, height: 1 }
const PROFILE_IMAGE_UPLOAD_RETRY_DELAY_MS = 700

const WORKSPACE_SECTIONS: {
  id: WorkspaceSectionId
  label: string
  description: string
  impact: string[]
}[] = [
  {
    id: "identity",
    label: "아이덴티티",
    description: "프로필 카드에 바로 보이는 핵심 인상을 다듬습니다.",
    impact: ["프로필 카드", "관리자 소개"],
  },
  {
    id: "about",
    label: "About 페이지",
    description: "About 페이지 전용 역할과 상세 블록을 구성합니다.",
    impact: ["About 페이지"],
  },
  {
    id: "home",
    label: "홈 첫인상",
    description: "헤더 로고 텍스트와 홈 첫 문장을 관리합니다.",
    impact: ["상단 로고", "메인 첫 카드"],
  },
  {
    id: "links",
    label: "외부 링크",
    description: "서비스와 연락 채널을 카드형 리스트로 정리합니다.",
    impact: ["Service 카드", "Contact 카드"],
  },
]

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

const moveListItem = <T,>(items: T[], index: number, direction: -1 | 1) => {
  const nextIndex = index + direction
  if (nextIndex < 0 || nextIndex >= items.length) return items
  const next = items.slice()
  const [item] = next.splice(index, 1)
  next.splice(nextIndex, 0, item)
  return next
}

const createLocalId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 9)}`

const createBlankLinkItem = (section: LinkTab): ProfileCardLinkItem =>
  section === "service"
    ? { icon: DEFAULT_SERVICE_ITEM_ICON, label: "", href: "" }
    : { icon: DEFAULT_CONTACT_ITEM_ICON, label: "", href: "" }

const createBlankAboutSection = (): AboutSectionBlock => ({
  id: createLocalId("about"),
  title: "",
  items: [""],
  dividerBefore: false,
})

const validateLinkInputs = (
  section: ProfileCardLinkSection,
  sectionLabel: string,
  items: ProfileCardLinkItem[]
): string | null => {
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]
    const label = item.label.trim()
    const href = item.href.trim()
    const rowLabel = `${sectionLabel} ${index + 1}번 링크`

    if (!label && !href) {
      return `${rowLabel}이 비어 있습니다. 입력하거나 삭제해주세요.`
    }
    if (!label || !href) {
      return `${rowLabel}은 이름과 연결 주소를 모두 입력해야 합니다.`
    }
    if (!isAllowedProfileLinkHref(section, href)) {
      if (section === "service") {
        return `${rowLabel} 주소는 https:// 또는 http:// 형식만 허용됩니다.`
      }
      return `${rowLabel} 주소는 https://, http://, mailto:, tel: 형식만 허용됩니다.`
    }
  }

  return null
}

const toPayloadLinks = (
  section: ProfileCardLinkSection,
  items: ProfileCardLinkItem[],
  defaultIcon: IconName
): ProfileCardLinkItem[] =>
  items
    .map((item) => ({
      icon: item.icon || defaultIcon,
      label: item.label.trim(),
      href: normalizeProfileLinkHref(section, item.href),
    }))
    .filter((item) => item.label && item.href)

const formatWorkspaceTime = (value?: string | null) => {
  if (!value) return "아직 기록 없음"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "아직 기록 없음"
  return date.toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

const buildWorkspaceFallback = (
  member: AuthMember,
  initialWorkspace: ProfileWorkspaceResponse | null
): ProfileWorkspaceResponse => {
  if (initialWorkspace) {
    return {
      draft: normalizeProfileWorkspaceContent(initialWorkspace.draft),
      published: normalizeProfileWorkspaceContent(initialWorkspace.published),
      lastDraftSavedAt: initialWorkspace.lastDraftSavedAt || member.modifiedAt || null,
      lastPublishedAt: initialWorkspace.lastPublishedAt || member.modifiedAt || null,
      dirtyFromPublished: initialWorkspace.dirtyFromPublished,
    }
  }

  const content = buildProfileWorkspaceFromLegacy(member)
  return {
    draft: content,
    published: content,
    lastDraftSavedAt: member.modifiedAt || null,
    lastPublishedAt: member.modifiedAt || null,
    dirtyFromPublished: false,
  }
}

export const getServerSideProps: GetServerSideProps<AdminProfileWorkspacePageProps> = async ({ req }) => {
  const queryClient = createQueryClient()
  const guardResult = await guardAdminRequest(req)

  if (!guardResult.ok) {
    return {
      redirect: {
        destination: guardResult.destination,
        permanent: false,
      },
    }
  }

  const initialWorkspace = await fetchServerProfileWorkspace(req, guardResult.member.id)
  queryClient.setQueryData(queryKey.authMeProbe(), true)
  queryClient.setQueryData(queryKey.authMe(), guardResult.member)
  if (initialWorkspace) {
    queryClient.setQueryData(queryKey.adminProfileWorkspace(guardResult.member.id), initialWorkspace)
  }

  return {
    props: {
      dehydratedState: dehydrate(queryClient),
      initialMember: guardResult.member,
      initialWorkspace,
    },
  }
}

const AdminProfileWorkspacePage: NextPage<AdminProfileWorkspacePageProps> = ({
  initialMember,
  initialWorkspace,
}) => {
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
  const [remoteDraft, setRemoteDraft] = useState<ProfileWorkspaceContent>(fallbackWorkspace.draft)
  const [publishedSnapshot, setPublishedSnapshot] = useState<ProfileWorkspaceContent>(fallbackWorkspace.published)
  const [draft, setDraft] = useState<ProfileWorkspaceContent>(fallbackWorkspace.draft)
  const [lastDraftSavedAt, setLastDraftSavedAt] = useState<string | null | undefined>(
    fallbackWorkspace.lastDraftSavedAt
  )
  const [lastPublishedAt, setLastPublishedAt] = useState<string | null | undefined>(
    fallbackWorkspace.lastPublishedAt
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
          profileImageUrl: content.profileImageUrl,
          profileImageDirectUrl: content.profileImageUrl,
          profileRole: content.profileRole,
          profileBio: content.profileBio,
          aboutRole: content.aboutRole,
          aboutBio: content.aboutBio,
          aboutDetails: buildLegacyAboutDetails(content.aboutSections),
          aboutSections: content.aboutSections,
          blogTitle: content.blogTitle,
          homeIntroTitle: content.homeIntroTitle,
          homeIntroDescription: content.homeIntroDescription,
          serviceLinks: content.serviceLinks,
          contactLinks: content.contactLinks,
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
      setLastDraftSavedAt(workspace.lastDraftSavedAt || sessionMember?.modifiedAt || initialMember.modifiedAt || null)
      setLastPublishedAt(
        workspace.lastPublishedAt || sessionMember?.modifiedAt || initialMember.modifiedAt || null
      )
      if (sessionMember?.id) {
        setProfileWorkspaceCache(queryClient, sessionMember.id, {
          ...workspace,
          draft: normalizedDraft,
          published: normalizedPublished,
        })
      }
    },
    [initialMember.modifiedAt, queryClient, sessionMember]
  )

  useEffect(() => {
    if (!workspaceQuery.data) return
    applyWorkspaceState(workspaceQuery.data)
  }, [applyWorkspaceState, workspaceQuery.data])

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

  const hasUnsavedChanges = useMemo(
    () => serializeProfileWorkspaceContent(draft) !== serializeProfileWorkspaceContent(remoteDraft),
    [draft, remoteDraft]
  )
  const hasPublishedDiff = useMemo(
    () => serializeProfileWorkspaceContent(remoteDraft) !== serializeProfileWorkspaceContent(publishedSnapshot),
    [publishedSnapshot, remoteDraft]
  )

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

  const requestProfileImageUpload = useCallback(async (memberId: number, file: File): Promise<Response> => {
    const formData = new FormData()
    formData.append("file", file, file.name)
    return await fetch(`${getApiBaseUrl()}/member/api/v1/adm/members/${memberId}/profileImageFile`, {
      method: "POST",
      credentials: "include",
      body: formData,
    })
  }, [])

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
    [refreshWorkspace, requestProfileImageUpload, sessionMember?.id, setMe]
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

    const serviceValidationError = validateLinkInputs("service", "서비스", draft.serviceLinks)
    if (serviceValidationError) {
      setWorkspaceNotice({ tone: "error", text: serviceValidationError })
      setActiveSection("links")
      setLinkTab("service")
      return
    }

    const contactValidationError = validateLinkInputs("contact", "연락 채널", draft.contactLinks)
    if (contactValidationError) {
      setWorkspaceNotice({ tone: "error", text: contactValidationError })
      setActiveSection("links")
      setLinkTab("contact")
      return
    }

    try {
      setLoadingKey("save")
      setWorkspaceNotice({ tone: "loading", text: "프로필 워크스페이스 초안을 저장하고 있습니다..." })
      const normalizedDraft = normalizeProfileWorkspaceContent({
        ...draft,
        serviceLinks: toPayloadLinks("service", draft.serviceLinks, DEFAULT_SERVICE_ITEM_ICON),
        contactLinks: toPayloadLinks("contact", draft.contactLinks, DEFAULT_CONTACT_ITEM_ICON),
      })
      const nextWorkspace = await saveProfileCardWithConflictRetry(() =>
        apiFetch<ProfileWorkspaceResponse>(`/member/api/v1/adm/members/${sessionMember.id}/profileWorkspace/draft`, {
          method: "PUT",
          body: JSON.stringify(normalizedDraft),
        })
      )
      applyWorkspaceState(nextWorkspace)
      setWorkspaceNotice({ tone: "success", text: "초안을 저장했습니다. 현재 작업 상태가 서버와 동기화되었습니다." })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setWorkspaceNotice({ tone: "error", text: `초안 저장 실패: ${message}` })
    } finally {
      setLoadingKey("")
    }
  }, [applyWorkspaceState, draft, sessionMember?.id])

  const handlePublish = useCallback(async () => {
    if (!sessionMember?.id) return
    if (hasUnsavedChanges) {
      setWorkspaceNotice({ tone: "error", text: "로컬 변경 사항을 먼저 초안 저장한 뒤 공개할 수 있습니다." })
      return
    }
    if (!hasPublishedDiff) {
      setWorkspaceNotice({ tone: "idle", text: "이미 공개본과 초안이 동일합니다." })
      return
    }

    try {
      setLoadingKey("publish")
      setWorkspaceNotice({ tone: "loading", text: "현재 초안을 공개본으로 반영하고 있습니다..." })
      const nextWorkspace = await apiFetch<ProfileWorkspaceResponse>(
        `/member/api/v1/adm/members/${sessionMember.id}/profileWorkspace/publish`,
        {
          method: "POST",
        }
      )
      applyWorkspaceState(nextWorkspace)
      syncPublishedAdminProfileCache(normalizeProfileWorkspaceContent(nextWorkspace.published))
      setPreviewMode("published")
      setWorkspaceNotice({ tone: "success", text: "지금 공개하기가 완료되었습니다. 공개 사이트가 최신 상태를 사용합니다." })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setWorkspaceNotice({ tone: "error", text: `공개 실패: ${message}` })
    } finally {
      setLoadingKey("")
    }
  }, [
    applyWorkspaceState,
    hasPublishedDiff,
    hasUnsavedChanges,
    sessionMember?.id,
    syncPublishedAdminProfileCache,
  ])

  const handleRefreshStoredDraft = useCallback(async () => {
    if (!sessionMember?.id) return

    try {
      setLoadingKey("refresh")
      setWorkspaceNotice({ tone: "loading", text: "서버에 저장된 초안을 다시 불러오는 중입니다..." })
      await refreshWorkspace(sessionMember.id)
      setWorkspaceNotice({ tone: "success", text: "서버 초안을 다시 불러왔습니다." })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setWorkspaceNotice({ tone: "error", text: `불러오기 실패: ${message}` })
    } finally {
      setLoadingKey("")
    }
  }, [refreshWorkspace, sessionMember?.id])

  if (!sessionMember) return null

  const displayName = sessionMember.nickname || sessionMember.username || "관리자"
  const displayNameInitial = displayName.slice(0, 2).toUpperCase()
  const previewContent = previewMode === "published" ? publishedSnapshot : draft
  const activeSectionMeta = WORKSPACE_SECTIONS.find((section) => section.id === activeSection) || WORKSPACE_SECTIONS[0]
  const visibleLinks = linkTab === "service" ? draft.serviceLinks : draft.contactLinks
  const canPublish = !hasUnsavedChanges && hasPublishedDiff && loadingKey !== "publish" && loadingKey !== "save"
  const canSave = hasUnsavedChanges && loadingKey !== "save"

  const renderActiveSection = () => {
    switch (activeSection) {
      case "identity":
        return (
          <SectionStack>
            <FeatureHeroCard>
              <div className="heroCopy">
                <span>프로필 카드 기준</span>
                <h2>아바타, 한 줄 역할, 짧은 소개를 먼저 정리하세요.</h2>
                <p>이 섹션은 프로필 카드의 첫인상을 다듬는 영역입니다.</p>
              </div>
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
                  <span>{profileImageFileName ? `선택 파일: ${profileImageFileName}` : "현재 초안 이미지"}</span>
                </div>
                <PrimaryButton type="button" onClick={() => setIsProfileImageEditorOpen(true)} disabled={loadingKey === "upload"}>
                  {loadingKey === "upload" ? "업로드 중..." : "이미지 바꾸기"}
                </PrimaryButton>
              </AvatarWorkspaceCard>
            </FeatureHeroCard>

            <FieldSectionCard>
              <SectionBlockHeader>
                <div>
                  <h3>기본 텍스트</h3>
                  <p>표시 이름은 계정 정보라 여기서 바꾸지 않습니다.</p>
                </div>
              </SectionBlockHeader>
              <FieldGrid data-columns="2">
                <FieldBox>
                  <FieldLabel>표시 이름</FieldLabel>
                  <LockedField>
                    <strong>{displayName}</strong>
                    <span>계정 이름은 여기서 바꾸지 않습니다.</span>
                  </LockedField>
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
                  <h3>About 페이지 기본 소개</h3>
                  <p>페이지 상단 역할과 소개 문단을 분리해 작성합니다.</p>
                </div>
              </SectionBlockHeader>
              <FieldGrid data-columns="2">
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
                  <p>경력, 수상이력, 관심사처럼 주제별 블록을 카드로 정리합니다.</p>
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
                                updateAboutSection(sectionIndex, (current) => ({
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
                            updateAboutSection(sectionIndex, (current) => ({
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
                                updateAboutSection(sectionIndex, (current) => ({
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
                  <p>첫 블록을 추가해 About 페이지에 경력이나 강점을 구조적으로 보여주세요.</p>
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
                  <h3>헤더</h3>
                  <p>상단 로고 옆에 보이는 브랜드 텍스트를 관리합니다.</p>
                </div>
              </SectionBlockHeader>
              <FieldBox>
                <FieldLabel htmlFor="blog-title">헤더 로고 텍스트</FieldLabel>
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
                  <p>메인 첫 카드에서 보이는 첫 문장과 보조 설명을 다듬습니다.</p>
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
                  <FieldLabel htmlFor="home-description">보조 설명</FieldLabel>
                  <TextArea
                    id="home-description"
                    value={draft.homeIntroDescription}
                    placeholder="메인 첫 카드 아래에 보이는 설명 문구를 적어주세요."
                    onChange={(event) => updateDraft("homeIntroDescription", event.target.value)}
                  />
                </FieldBox>
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
                  <p>서비스와 연락 채널을 카드형 리스트로 정리합니다.</p>
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
                  <span>
                    {linkTab === "service"
                      ? "프로젝트, 포트폴리오, 서비스 페이지를 연결합니다."
                      : "이메일, SNS, 메신저처럼 연락 가능한 채널을 연결합니다."}
                  </span>
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
                      <LinkRowCard key={`${section}-${index}`}>
                        <IconPickerField data-icon-picker-root="true">
                          <FieldLabel as="span">아이콘</FieldLabel>
                          <IconPickerButton
                            type="button"
                            aria-expanded={openIconPicker === pickerKey}
                            onClick={() => setOpenIconPicker((current) => (current === pickerKey ? null : pickerKey))}
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
                          {previewHref && isAllowedProfileLinkHref(section, item.href) ? (
                            <PreviewAnchor href={previewHref} target="_blank" rel="noreferrer">
                              미리 보기
                            </PreviewAnchor>
                          ) : (
                            <MiniButton type="button" disabled>
                              미리 보기
                            </MiniButton>
                          )}
                          <MiniButton
                            type="button"
                            disabled={index === 0}
                            onClick={() => moveLinkItem(section, index, -1)}
                          >
                            위로
                          </MiniButton>
                          <MiniButton
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
                      </LinkRowCard>
                    )
                  })}
                </LinkCardList>
              ) : (
                <EmptyStateCard>
                  <strong>아직 등록된 링크가 없습니다</strong>
                  <p>첫 링크를 추가해 프로필을 완성하세요.</p>
                </EmptyStateCard>
              )}
            </FieldSectionCard>
          </SectionStack>
        )
    }
  }

  return (
    <Main>
      <input
        ref={profileImageFileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleDraftFileChange}
      />

      <WorkspaceHero>
        <HeroText>
          <span className="eyebrow">Profile Content Workspace</span>
          <h1>프로필 워크스페이스</h1>
          <p>내 프로필, About 페이지, 홈 첫인상을 한 곳에서 관리합니다.</p>
        </HeroText>

        <HeroStatus>
          <StatusPill data-tone={hasUnsavedChanges ? "draft" : "stable"}>
            {hasUnsavedChanges ? "초안 편집 중" : "저장 상태 최신"}
          </StatusPill>
          <StatusPill data-tone={hasPublishedDiff ? "attention" : "stable"}>
            {hasPublishedDiff ? "공개본과 다른 초안이 있습니다" : "현재 공개 중"}
          </StatusPill>
          <StatusPill>마지막 초안 저장 {formatWorkspaceTime(lastDraftSavedAt)}</StatusPill>
          <StatusPill>현재 공개본 {formatWorkspaceTime(lastPublishedAt)}</StatusPill>
        </HeroStatus>

        <HeroLinks>
          <Link href="/admin" passHref legacyBehavior>
            <NavLink>관리자 허브</NavLink>
          </Link>
          <Link href="/admin/posts/new" passHref legacyBehavior>
            <NavLink>글 작업 공간</NavLink>
          </Link>
          <Link href="/" passHref legacyBehavior>
            <NavLink>메인 보기</NavLink>
          </Link>
        </HeroLinks>
      </WorkspaceHero>

      <MobileSectionRail role="tablist" aria-label="프로필 섹션">
        {WORKSPACE_SECTIONS.map((section) => (
          <SectionSwitchButton
            key={section.id}
            type="button"
            role="tab"
            aria-selected={activeSection === section.id}
            data-active={activeSection === section.id}
            onClick={() => setActiveSection(section.id)}
          >
            {section.label}
          </SectionSwitchButton>
        ))}
      </MobileSectionRail>

      <WorkspaceShell>
        <SidebarCard>
          <SidebarTitle>
            <strong>편집 영역</strong>
            <span>한 번에 하나씩 집중 편집합니다.</span>
          </SidebarTitle>
          <SidebarNav>
            {WORKSPACE_SECTIONS.map((section) => (
              <SidebarButton
                key={section.id}
                type="button"
                data-active={activeSection === section.id}
                onClick={() => setActiveSection(section.id)}
              >
                <strong>{section.label}</strong>
                <span>{section.description}</span>
              </SidebarButton>
            ))}
          </SidebarNav>
        </SidebarCard>

        <EditorColumn>
          <EditorSurfaceHeader>
            <div>
              <span className="eyebrow">{activeSectionMeta.label}</span>
              <h2>{activeSectionMeta.description}</h2>
            </div>
            <ImpactChips>
              {activeSectionMeta.impact.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </ImpactChips>
          </EditorSurfaceHeader>

          <EditorSurface>{renderActiveSection()}</EditorSurface>
        </EditorColumn>

        <PreviewRail>
          <PreviewCardShell>
            <PreviewHeader>
              <div>
                <span>라이브 프리뷰</span>
                <strong>{previewMode === "draft" ? "초안 미리보기" : "현재 공개본"}</strong>
              </div>
              <SegmentedControl>
                <SegmentButton
                  type="button"
                  data-active={previewMode === "draft"}
                  onClick={() => setPreviewMode("draft")}
                >
                  초안
                </SegmentButton>
                <SegmentButton
                  type="button"
                  data-active={previewMode === "published"}
                  onClick={() => setPreviewMode("published")}
                >
                  공개본
                </SegmentButton>
              </SegmentedControl>
            </PreviewHeader>

            <PreviewViewport>
              {activeSection === "identity" ? (
                <PreviewProfileCard>
                  <div className="avatar">
                    {previewContent.profileImageUrl ? (
                      <ProfileImage
                        src={previewContent.profileImageUrl}
                        alt={displayName}
                        width={88}
                        height={88}
                        priority
                      />
                    ) : (
                      <AvatarFallback>{displayNameInitial}</AvatarFallback>
                    )}
                  </div>
                  <strong>{displayName}</strong>
                  <span>{previewContent.profileRole || "한 줄 역할이 여기에 표시됩니다."}</span>
                  <p>{previewContent.profileBio || "짧은 소개를 입력하면 프로필 카드가 이렇게 보입니다."}</p>
                </PreviewProfileCard>
              ) : null}

              {activeSection === "about" ? (
                <PreviewAboutCard>
                  <header>
                    <span>About Me</span>
                    <strong>{displayName}</strong>
                  </header>
                  <h4>{previewContent.aboutRole || "페이지 역할 문구"}</h4>
                  <p>{previewContent.aboutBio || "소개 문단이 여기에 표시됩니다."}</p>
                  {previewContent.aboutSections.length > 0 ? (
                    <div className="sections">
                      {previewContent.aboutSections.map((section) => (
                        <section key={section.id}>
                          <strong>{section.title || "블록 제목"}</strong>
                          <ul>
                            {section.items.slice(0, 3).map((item, index) => (
                              <li key={`${section.id}-${index}`}>{item}</li>
                            ))}
                          </ul>
                        </section>
                      ))}
                    </div>
                  ) : null}
                </PreviewAboutCard>
              ) : null}

              {activeSection === "home" ? (
                <PreviewHomeCard>
                  <div className="topbar">
                    <div className="brand">
                      <BrandMark className="mark" priority />
                      <span>{previewContent.blogTitle || "헤더 로고 텍스트"}</span>
                    </div>
                  </div>
                  <div className="heroCard">
                    <strong>{previewContent.homeIntroTitle || "첫 문장이 여기에 표시됩니다."}</strong>
                    <p>{previewContent.homeIntroDescription || "보조 설명이 이 카드 아래에 반영됩니다."}</p>
                  </div>
                </PreviewHomeCard>
              ) : null}

              {activeSection === "links" ? (
                <PreviewLinksCard>
                  {([
                    ["Service", previewContent.serviceLinks],
                    ["Contact", previewContent.contactLinks],
                  ] as const).map(([title, items]) => (
                    <section key={title}>
                      <strong>{title}</strong>
                      {items.length > 0 ? (
                        <ul>
                          {items.map((item) => (
                            <li key={`${title}-${item.icon}-${item.label}-${item.href}`}>
                              <AppIcon name={item.icon} />
                              <span>{item.label}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p>아직 등록된 링크가 없습니다.</p>
                      )}
                    </section>
                  ))}
                </PreviewLinksCard>
              ) : null}
            </PreviewViewport>
          </PreviewCardShell>

          <ActionRailCard>
            <RailSummary>
              <strong>{hasUnsavedChanges ? "로컬 변경이 있습니다" : "서버 초안과 동기화됨"}</strong>
              <span>
                {hasUnsavedChanges
                  ? "먼저 초안 저장을 마친 뒤 공개할 수 있습니다."
                  : hasPublishedDiff
                    ? "저장된 초안이 현재 공개본과 다릅니다."
                    : "공개본과 초안이 동일합니다."}
              </span>
            </RailSummary>

            <RailActions>
              <GhostButton
                type="button"
                disabled={loadingKey === "refresh"}
                onClick={() => void handleRefreshStoredDraft()}
              >
                {loadingKey === "refresh" ? "불러오는 중..." : "초안 새로고침"}
              </GhostButton>
              <PrimaryButton type="button" disabled={!canSave} onClick={() => void handleSaveDraft()}>
                {loadingKey === "save" ? "저장 중..." : "초안 저장"}
              </PrimaryButton>
              <PublishButton type="button" disabled={!canPublish} onClick={() => void handlePublish()}>
                {loadingKey === "publish" ? "공개 중..." : "지금 공개하기"}
              </PublishButton>
              <GhostButton
                type="button"
                disabled={!hasUnsavedChanges}
                onClick={() => {
                  setDraft(remoteDraft)
                  setWorkspaceNotice({ tone: "success", text: "로컬 변경을 버리고 저장된 초안으로 되돌렸습니다." })
                }}
              >
                초안 되돌리기
              </GhostButton>
            </RailActions>

            {workspaceNotice.text ? <Notice data-tone={workspaceNotice.tone}>{workspaceNotice.text}</Notice> : null}
            {imageNotice.text ? <Notice data-tone={imageNotice.tone}>{imageNotice.text}</Notice> : null}

            <QuickCtaCard>
              <strong>글 작업 공간 프로필 빠른 수정은 종료합니다</strong>
              <p>이제 프로필 변경은 여기서 집중 관리하고, 글 작업 공간에서는 읽기 전용 요약만 남깁니다.</p>
              <Link href="/admin/posts/new" passHref legacyBehavior>
                <PreviewAnchor>글 작업 공간 확인</PreviewAnchor>
              </Link>
            </QuickCtaCard>
          </ActionRailCard>
        </PreviewRail>
      </WorkspaceShell>

      {isProfileImageEditorOpen ? (
        <ModalOverlay
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget && loadingKey !== "upload") {
              setIsProfileImageEditorOpen(false)
              resetProfileImageDraftInteractions()
            }
          }}
        >
          <ModalCard role="dialog" aria-modal="true" aria-label="프로필 이미지 편집">
            <ModalHeader>
              <div>
                <h2>프로필 이미지 편집</h2>
                <p>파일 선택 후 드래그와 확대/축소로 표시 영역을 맞춘 뒤 초안에 반영합니다.</p>
              </div>
              <ModalCloseButton
                type="button"
                disabled={loadingKey === "upload"}
                onClick={() => {
                  setIsProfileImageEditorOpen(false)
                  resetProfileImageDraftInteractions()
                }}
              >
                <AppIcon name="close" />
              </ModalCloseButton>
            </ModalHeader>

            <ModalConstraintList>
              <li>지원 형식: JPG/PNG/GIF/WebP</li>
              <li>업로드 기준: 자동 최적화 후 최대 2MB</li>
              <li>움직이는 GIF는 원본 2MB 이하에서만 애니메이션을 유지합니다.</li>
            </ModalConstraintList>

            <ModalActions>
              <GhostButton type="button" onClick={() => profileImageFileInputRef.current?.click()} disabled={loadingKey === "upload"}>
                파일 선택
              </GhostButton>
              <GhostButton type="button" onClick={clearProfileImageDraft} disabled={loadingKey === "upload"}>
                편집값 초기화
              </GhostButton>
            </ModalActions>

            {profileImageDraftPreviewUrl ? (
              <>
                <ModalEditorFrame
                  ref={profileImageDraftFrameRef}
                  data-draggable={profileImageDraftFile ? "true" : "false"}
                  data-dragging={isProfileImageDraftDragging ? "true" : "false"}
                  onPointerDown={handleProfileImageDraftPointerDown}
                  onPointerMove={handleProfileImageDraftPointerMove}
                  onPointerUp={finalizeProfileImageDraftPointer}
                  onPointerCancel={finalizeProfileImageDraftPointer}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={profileImageDraftPreviewUrl}
                    alt="프로필 편집 미리보기"
                    loading="eager"
                    decoding="async"
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
              <GhostButton
                type="button"
                disabled={loadingKey === "upload"}
                onClick={() => {
                  setIsProfileImageEditorOpen(false)
                  resetProfileImageDraftInteractions()
                }}
              >
                취소
              </GhostButton>
              <PrimaryButton
                type="button"
                disabled={loadingKey === "upload" || !profileImageDraftFile}
                onClick={() => void handleApplyProfileImageDraft()}
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

export default AdminProfileWorkspacePage

const Main = styled.main`
  max-width: 1420px;
  margin: 0 auto;
  padding: 1.6rem 1rem 2.8rem;
  display: grid;
  gap: 1rem;

  @media (max-width: 760px) {
    padding-bottom: calc(2rem + env(safe-area-inset-bottom, 0px));
  }
`

const BaseButton = styled.button`
  min-height: 38px;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray11};
  padding: 0.7rem 0.96rem;
  font-size: 0.92rem;
  font-weight: 700;
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    background-color 0.18s ease,
    color 0.18s ease,
    transform 0.18s ease;

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.gray8};
    background: ${({ theme }) => theme.colors.gray3};
    color: ${({ theme }) => theme.colors.gray12};
    transform: translateY(-1px);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.72;
    transform: none;
  }
`

const GhostButton = styled(BaseButton)``

const PrimaryButton = styled(BaseButton)`
  border-color: ${({ theme }) => theme.colors.blue8};
  background: ${({ theme }) => theme.colors.blue3};
  color: ${({ theme }) => theme.colors.blue11};

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.blue9};
    background: ${({ theme }) => theme.colors.blue4};
    color: ${({ theme }) => theme.colors.blue12};
  }
`

const PublishButton = styled(PrimaryButton)`
  border-color: ${({ theme }) => theme.colors.green8};
  background: ${({ theme }) => theme.colors.green3};
  color: ${({ theme }) => theme.colors.green11};

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.green9};
    background: ${({ theme }) => theme.colors.green4};
    color: ${({ theme }) => theme.colors.green12};
  }
`

const MiniButton = styled(BaseButton)`
  min-height: 34px;
  padding: 0.55rem 0.72rem;
  font-size: 0.8rem;
`

const DangerButton = styled(MiniButton)`
  border-color: ${({ theme }) => theme.colors.red7};
  color: ${({ theme }) => theme.colors.red11};

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.red8};
    background: ${({ theme }) => theme.colors.red3};
    color: ${({ theme }) => theme.colors.red11};
  }
`

const NavLink = styled.a`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 38px;
  padding: 0.68rem 0.94rem;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
  color: ${({ theme }) => theme.colors.gray11};
  text-decoration: none;
  font-weight: 700;
`

const PreviewAnchor = styled.a`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  padding: 0.55rem 0.72rem;
  border-radius: 10px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray12};
  font-size: 0.8rem;
  font-weight: 700;
  text-decoration: none;
`

const WorkspaceHero = styled.section`
  display: grid;
  gap: 0.9rem;
  padding: 1.2rem 1.24rem;
  border-radius: 22px;
  background:
    radial-gradient(circle at top left, rgba(71, 112, 255, 0.12), transparent 28%),
    linear-gradient(180deg, ${({ theme }) => theme.colors.gray2}, ${({ theme }) => theme.colors.gray1});
  border: 1px solid ${({ theme }) => theme.colors.gray5};
`

const HeroText = styled.div`
  display: grid;
  gap: 0.42rem;

  .eyebrow {
    color: ${({ theme }) => theme.colors.blue10};
    font-size: 0.78rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  h1 {
    margin: 0;
    font-size: clamp(2rem, 3vw, 2.8rem);
    line-height: 1.04;
    letter-spacing: -0.04em;
    color: ${({ theme }) => theme.colors.gray12};
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.96rem;
    line-height: 1.6;
  }
`

const HeroStatus = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
`

const StatusPill = styled.span`
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  border-radius: 999px;
  padding: 0 0.82rem;
  background: ${({ theme }) => theme.colors.gray2};
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.8rem;
  font-weight: 700;

  &[data-tone="draft"] {
    border-color: ${({ theme }) => theme.colors.blue8};
    background: ${({ theme }) => theme.colors.blue3};
    color: ${({ theme }) => theme.colors.blue11};
  }

  &[data-tone="attention"] {
    border-color: ${({ theme }) => theme.colors.green8};
    background: ${({ theme }) => theme.colors.green3};
    color: ${({ theme }) => theme.colors.green11};
  }
`

const HeroLinks = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.48rem;
`

const MobileSectionRail = styled.div`
  display: none;

  @media (max-width: 760px) {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.48rem;
  }
`

const SectionSwitchButton = styled.button`
  min-height: 38px;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray11};
  font-weight: 700;

  &[data-active="true"] {
    border-color: ${({ theme }) => theme.colors.blue8};
    background: ${({ theme }) => theme.colors.blue3};
    color: ${({ theme }) => theme.colors.blue11};
  }
`

const WorkspaceShell = styled.section`
  display: grid;
  grid-template-columns: 228px minmax(0, 1fr) 328px;
  gap: 0.9rem;
  align-items: start;

  @media (max-width: 1180px) {
    grid-template-columns: 196px minmax(0, 1fr);
  }

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`

const SurfaceCard = styled.section`
  border-radius: 20px;
  background: ${({ theme }) => theme.colors.gray2};
  border: 1px solid ${({ theme }) => theme.colors.gray5};
`

const SidebarCard = styled(SurfaceCard)`
  position: sticky;
  top: 0.88rem;
  padding: 0.92rem;
  display: grid;
  gap: 0.9rem;

  @media (max-width: 760px) {
    display: none;
  }
`

const SidebarTitle = styled.div`
  display: grid;
  gap: 0.16rem;

  strong {
    color: ${({ theme }) => theme.colors.gray12};
  }

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.82rem;
    line-height: 1.5;
  }
`

const SidebarNav = styled.div`
  display: grid;
  gap: 0.48rem;
`

const SidebarButton = styled.button`
  text-align: left;
  padding: 0.9rem;
  border-radius: 16px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  display: grid;
  gap: 0.3rem;

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.92rem;
  }

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.78rem;
    line-height: 1.5;
  }

  &[data-active="true"] {
    border-color: ${({ theme }) => theme.colors.blue8};
    background: ${({ theme }) => theme.colors.blue3};
  }
`

const EditorColumn = styled.div`
  display: grid;
  gap: 0.8rem;
`

const EditorSurfaceHeader = styled(SurfaceCard)`
  padding: 1rem 1.06rem;
  display: grid;
  gap: 0.72rem;

  .eyebrow {
    color: ${({ theme }) => theme.colors.blue10};
    font-size: 0.8rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  h2 {
    margin: 0.22rem 0 0;
    font-size: clamp(1.24rem, 2vw, 1.6rem);
    line-height: 1.24;
    color: ${({ theme }) => theme.colors.gray12};
  }
`

const ImpactChips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.42rem;

  span {
    display: inline-flex;
    align-items: center;
    min-height: 30px;
    border-radius: 999px;
    padding: 0 0.7rem;
    background: ${({ theme }) => theme.colors.gray1};
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.78rem;
    font-weight: 700;
  }
`

const EditorSurface = styled(SurfaceCard)`
  padding: 1rem;
`

const SectionStack = styled.div`
  display: grid;
  gap: 0.9rem;
`

const FeatureHeroCard = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: 0.9rem;
  padding: 1rem;
  border-radius: 18px;
  background:
    linear-gradient(180deg, rgba(71, 112, 255, 0.08), transparent),
    ${({ theme }) => theme.colors.gray1};
  border: 1px solid ${({ theme }) => theme.colors.gray6};

  .heroCopy {
    display: grid;
    gap: 0.36rem;
    align-content: start;
  }

  .heroCopy span {
    color: ${({ theme }) => theme.colors.blue10};
    font-size: 0.82rem;
    font-weight: 800;
  }

  .heroCopy h2 {
    margin: 0;
    font-size: clamp(1.2rem, 2vw, 1.56rem);
    line-height: 1.28;
    color: ${({ theme }) => theme.colors.gray12};
  }

  .heroCopy p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray10};
    line-height: 1.6;
  }

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`

const AvatarWorkspaceCard = styled.div`
  display: grid;
  justify-items: center;
  gap: 0.58rem;
  padding: 1rem;
  border-radius: 18px;
  background: ${({ theme }) => theme.colors.gray2};
  border: 1px solid ${({ theme }) => theme.colors.gray6};

  .avatarPreview {
    width: 88px;
    height: 88px;
    border-radius: 999px;
    overflow: hidden;
  }

  .avatarMeta {
    display: grid;
    gap: 0.14rem;
    text-align: center;
  }

  .avatarMeta strong {
    color: ${({ theme }) => theme.colors.gray12};
  }

  .avatarMeta span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.78rem;
  }
`

const FieldSectionCard = styled.div`
  display: grid;
  gap: 0.82rem;
  padding: 1rem;
  border-radius: 18px;
  background: ${({ theme }) => theme.colors.gray1};
  border: 1px solid ${({ theme }) => theme.colors.gray6};
`

const SectionBlockHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.8rem;

  h3 {
    margin: 0;
    font-size: 1.02rem;
    color: ${({ theme }) => theme.colors.gray12};
  }

  p {
    margin: 0.22rem 0 0;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.84rem;
    line-height: 1.55;
  }

  @media (max-width: 760px) {
    flex-direction: column;
  }
`

const FieldGrid = styled.div`
  display: grid;
  gap: 0.82rem;

  &[data-columns="2"] {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 900px) {
    &[data-columns="2"] {
      grid-template-columns: 1fr;
    }
  }
`

const FieldBox = styled.label`
  display: grid;
  gap: 0.46rem;

  &[data-span="full"] {
    grid-column: 1 / -1;
  }
`

const FieldLabel = styled.label`
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.8rem;
  font-weight: 800;
`

const Input = styled.input`
  width: 100%;
  min-height: 42px;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
  color: ${({ theme }) => theme.colors.gray12};
  padding: 0.82rem 0.95rem;

  &::placeholder {
    color: ${({ theme }) => theme.colors.gray9};
  }
`

const TextArea = styled.textarea`
  width: 100%;
  min-height: 132px;
  border-radius: 14px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
  color: ${({ theme }) => theme.colors.gray12};
  padding: 0.92rem 1rem;
  resize: vertical;
  line-height: 1.6;

  &::placeholder {
    color: ${({ theme }) => theme.colors.gray9};
  }
`

const LockedField = styled.div`
  min-height: 42px;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
  padding: 0.82rem 0.95rem;
  display: grid;
  gap: 0.2rem;

  strong {
    color: ${({ theme }) => theme.colors.gray12};
  }

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.76rem;
    line-height: 1.45;
  }
`

const AboutSectionList = styled.div`
  display: grid;
  gap: 0.78rem;
`

const AboutSectionCard = styled.div`
  display: grid;
  gap: 0.72rem;
  padding: 0.9rem;
  border-radius: 16px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
`

const AboutSectionCardHeader = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 0.72rem;

  > div:first-of-type {
    display: grid;
    gap: 0.24rem;
  }

  > div:first-of-type span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.76rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  label {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.8rem;
  }

  @media (max-width: 760px) {
    flex-direction: column;
  }
`

const ItemList = styled.div`
  display: grid;
  gap: 0.56rem;
`

const ItemRow = styled.div`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 0.58rem;
  align-items: center;

  .bullet {
    color: ${({ theme }) => theme.colors.gray10};
    font-weight: 900;
  }

  @media (max-width: 760px) {
    grid-template-columns: minmax(0, 1fr);

    .bullet {
      display: none;
    }
  }
`

const InlineActionRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.42rem;
`

const EmptyStateCard = styled.div`
  padding: 1rem;
  border-radius: 16px;
  border: 1px dashed ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
  display: grid;
  gap: 0.28rem;

  strong {
    color: ${({ theme }) => theme.colors.gray12};
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray10};
    line-height: 1.55;
  }
`

const SegmentedControl = styled.div`
  display: inline-flex;
  gap: 0.36rem;
  padding: 0.25rem;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
`

const SegmentButton = styled.button`
  min-height: 34px;
  padding: 0 0.82rem;
  border-radius: 999px;
  border: none;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray10};
  font-weight: 700;

  &[data-active="true"] {
    background: ${({ theme }) => theme.colors.gray1};
    color: ${({ theme }) => theme.colors.gray12};
  }
`

const LinkManagerHeader = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 0.8rem;
  align-items: center;

  > div {
    display: grid;
    gap: 0.16rem;
  }

  strong {
    color: ${({ theme }) => theme.colors.gray12};
  }

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.8rem;
  }

  @media (max-width: 760px) {
    flex-direction: column;
    align-items: flex-start;
  }
`

const LinkCardList = styled.div`
  display: grid;
  gap: 0.72rem;
`

const LinkRowCard = styled.div`
  display: grid;
  grid-template-columns: 216px minmax(0, 1fr) auto;
  gap: 0.72rem;
  padding: 0.9rem;
  border-radius: 16px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};

  .linkActions {
    align-self: center;
    justify-content: flex-end;
  }

  @media (max-width: 1080px) {
    grid-template-columns: 1fr;

    .linkActions {
      justify-content: flex-start;
    }
  }
`

const IconPickerField = styled.div`
  position: relative;
  display: grid;
  gap: 0.46rem;
`

const IconPickerButton = styled.button`
  min-height: 42px;
  padding: 0.7rem 0.82rem;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 0.62rem;
  align-items: center;
  color: ${({ theme }) => theme.colors.gray12};
`

const IconPreview = styled.span<{ "data-compact"?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: ${({ ["data-compact"]: compact }) => (compact ? "2rem" : "2.4rem")};
  height: ${({ ["data-compact"]: compact }) => (compact ? "2rem" : "2.4rem")};
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
  color: ${({ theme }) => theme.colors.gray12};
  font-size: 1rem;
`

const IconPickerCopy = styled.span`
  display: grid;
  gap: 0.08rem;
  text-align: left;

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.86rem;
  }

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.72rem;
  }
`

const IconPickerPanel = styled.div`
  position: absolute;
  top: calc(100% + 0.36rem);
  left: 0;
  z-index: 10;
  width: min(100%, 280px);
  max-height: 280px;
  overflow: auto;
  border-radius: 16px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  box-shadow: 0 18px 42px rgba(0, 0, 0, 0.34);
  padding: 0.4rem;
  display: grid;
  gap: 0.32rem;
`

const IconOptionButton = styled.button`
  width: 100%;
  padding: 0.56rem;
  border-radius: 12px;
  border: 1px solid transparent;
  background: transparent;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.58rem;
  align-items: center;

  &[data-selected="true"] {
    border-color: ${({ theme }) => theme.colors.blue8};
    background: ${({ theme }) => theme.colors.blue3};
  }
`

const IconOptionText = styled.span`
  display: grid;
  gap: 0.1rem;
  text-align: left;

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.84rem;
  }

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.72rem;
  }
`

const LinkInputs = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.72rem;

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`

const PreviewRail = styled.div`
  display: grid;
  gap: 0.82rem;
  position: sticky;
  top: 0.88rem;

  @media (max-width: 1180px) {
    position: static;
    grid-column: 1 / -1;
  }
`

const PreviewCardShell = styled(SurfaceCard)`
  padding: 0.92rem;
  display: grid;
  gap: 0.78rem;
`

const PreviewHeader = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 0.72rem;
  align-items: center;

  > div {
    display: grid;
    gap: 0.12rem;
  }

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.78rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 1rem;
  }

  @media (max-width: 760px) {
    flex-direction: column;
    align-items: flex-start;
  }
`

const PreviewViewport = styled.div`
  min-height: 300px;
  border-radius: 18px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  padding: 0.92rem;
`

const PreviewProfileCard = styled.div`
  display: grid;
  justify-items: center;
  text-align: center;
  gap: 0.44rem;

  .avatar {
    width: 88px;
    height: 88px;
    border-radius: 999px;
    overflow: hidden;
  }

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 1.04rem;
  }

  span {
    color: ${({ theme }) => theme.colors.blue10};
    font-weight: 700;
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray11};
    line-height: 1.6;
  }
`

const PreviewAboutCard = styled.div`
  display: grid;
  gap: 0.68rem;

  header {
    display: grid;
    gap: 0.12rem;
  }

  header span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.76rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  header strong,
  h4 {
    color: ${({ theme }) => theme.colors.gray12};
    margin: 0;
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray11};
    line-height: 1.6;
  }

  .sections {
    display: grid;
    gap: 0.7rem;
  }

  section {
    display: grid;
    gap: 0.3rem;
  }

  ul {
    margin: 0;
    padding-left: 1rem;
    color: ${({ theme }) => theme.colors.gray11};
    display: grid;
    gap: 0.18rem;
  }
`

const PreviewHomeCard = styled.div`
  display: grid;
  gap: 1rem;

  .topbar {
    border-radius: 14px;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.colors.gray2};
    padding: 0.72rem 0.82rem;
  }

  .brand {
    display: inline-flex;
    align-items: center;
    gap: 0.46rem;
    color: ${({ theme }) => theme.colors.gray12};
    font-weight: 800;
    font-size: 1rem;
  }

  .mark {
    width: 1.35rem;
    height: 1.35rem;
  }

  .heroCard {
    border-radius: 18px;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.colors.gray2};
    padding: 1rem;
    display: grid;
    gap: 0.42rem;
  }

  .heroCard strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 1.36rem;
    line-height: 1.18;
    letter-spacing: -0.03em;
  }

  .heroCard p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray11};
    line-height: 1.62;
  }
`

const PreviewLinksCard = styled.div`
  display: grid;
  gap: 0.82rem;

  section {
    display: grid;
    gap: 0.4rem;
  }

  strong {
    color: ${({ theme }) => theme.colors.gray12};
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 0.42rem;
  }

  li {
    display: inline-flex;
    align-items: center;
    gap: 0.55rem;
    color: ${({ theme }) => theme.colors.gray11};
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray10};
    line-height: 1.55;
  }
`

const ActionRailCard = styled(SurfaceCard)`
  padding: 0.92rem;
  display: grid;
  gap: 0.78rem;
`

const RailSummary = styled.div`
  display: grid;
  gap: 0.18rem;

  strong {
    color: ${({ theme }) => theme.colors.gray12};
  }

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.82rem;
    line-height: 1.55;
  }
`

const RailActions = styled.div`
  display: grid;
  gap: 0.48rem;
`

const QuickCtaCard = styled.div`
  display: grid;
  gap: 0.26rem;
  padding: 0.86rem;
  border-radius: 16px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};

  strong {
    color: ${({ theme }) => theme.colors.gray12};
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray10};
    line-height: 1.55;
  }
`

const Notice = styled.div`
  border-radius: 14px;
  padding: 0.78rem 0.9rem;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  color: ${({ theme }) => theme.colors.gray12};
  line-height: 1.58;

  &[data-tone="success"] {
    border-color: ${({ theme }) => theme.colors.green8};
    background: ${({ theme }) => theme.colors.green3};
    color: ${({ theme }) => theme.colors.green11};
  }

  &[data-tone="error"] {
    border-color: ${({ theme }) => theme.colors.red8};
    background: ${({ theme }) => theme.colors.red3};
    color: ${({ theme }) => theme.colors.red11};
  }

  &[data-tone="loading"] {
    border-color: ${({ theme }) => theme.colors.blue8};
    background: ${({ theme }) => theme.colors.blue3};
    color: ${({ theme }) => theme.colors.blue11};
  }
`

const AvatarFallback = styled.div`
  width: 100%;
  height: 100%;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: ${({ theme }) => theme.colors.gray4};
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 1.52rem;
  font-weight: 800;
`

const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 2200;
  display: grid;
  place-items: center;
  background: rgba(6, 10, 16, 0.76);
  padding: 1rem;
`

const ModalCard = styled.section`
  width: min(640px, 100%);
  max-height: min(92vh, 860px);
  overflow: auto;
  border-radius: 20px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.42);
  padding: 1rem;
  display: grid;
  gap: 0.9rem;
`

const ModalHeader = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 0.82rem;
  align-items: flex-start;

  h2 {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray12};
  }

  p {
    margin: 0.34rem 0 0;
    color: ${({ theme }) => theme.colors.gray11};
    line-height: 1.58;
  }
`

const ModalCloseButton = styled.button`
  width: 40px;
  height: 40px;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray12};
  display: inline-flex;
  align-items: center;
  justify-content: center;
`

const ModalConstraintList = styled.ul`
  margin: 0;
  padding-left: 1.1rem;
  display: grid;
  gap: 0.3rem;
  color: ${({ theme }) => theme.colors.gray11};
  line-height: 1.55;
`

const ModalActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.48rem;
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
  gap: 0.62rem;

  label {
    color: ${({ theme }) => theme.colors.gray11};
    font-weight: 700;
  }

  input {
    width: 100%;
  }

  span {
    color: ${({ theme }) => theme.colors.gray11};
    font-variant-numeric: tabular-nums;
    min-width: 3.4rem;
    text-align: right;
  }
`

const ModalEmptyState = styled.div`
  padding: 1rem;
  border-radius: 16px;
  border: 1px dashed ${({ theme }) => theme.colors.gray6};
  color: ${({ theme }) => theme.colors.gray11};
  text-align: center;
`

const ModalFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 0.48rem;
`
