import styled from "@emotion/styled"
import { dehydrate, useQueryClient } from "@tanstack/react-query"
import { GetServerSideProps, NextPage } from "next"
import { useRouter } from "next/router"
import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { apiFetch, getApiBaseUrl } from "src/apis/backend/client"
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
}[] = [
  {
    id: "identity",
    label: "프로필",
    description: "",
  },
  {
    id: "about",
    label: "About 페이지",
    description: "",
  },
  {
    id: "home",
    label: "헤더 문구",
    description: "",
  },
  {
    id: "links",
    label: "외부 링크",
    description: "",
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
  const [isPreviewExpanded, setIsPreviewExpanded] = useState(false)
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
      setWorkspaceNotice({ tone: "loading", text: "임시 저장 중..." })
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
      setWorkspaceNotice({ tone: "success", text: "임시 저장했습니다." })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setWorkspaceNotice({ tone: "error", text: `임시 저장 실패: ${message}` })
    } finally {
      setLoadingKey("")
    }
  }, [applyWorkspaceState, draft, sessionMember?.id])

  const handlePublish = useCallback(async () => {
    if (!sessionMember?.id) return
    if (hasUnsavedChanges) {
      setWorkspaceNotice({ tone: "error", text: "로컬 변경 사항을 먼저 임시 저장한 뒤 공개할 수 있습니다." })
      return
    }
    if (!hasPublishedDiff) {
      setWorkspaceNotice({ tone: "idle", text: "이미 공개본과 임시 저장본이 같습니다." })
      return
    }

    try {
      setLoadingKey("publish")
      setWorkspaceNotice({ tone: "loading", text: "공개 중..." })
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

  if (!sessionMember) return null

  const displayName = sessionMember.nickname || sessionMember.username || "관리자"
  const displayNameInitial = displayName.slice(0, 2).toUpperCase()
  const previewContent = previewMode === "published" ? publishedSnapshot : draft
  const isHomeSection = activeSection === "home"
  const activeSectionMeta = WORKSPACE_SECTIONS.find((section) => section.id === activeSection) || WORKSPACE_SECTIONS[0]
  const visibleLinks = linkTab === "service" ? draft.serviceLinks : draft.contactLinks
  const pageToasts = [workspaceNotice, imageNotice].filter(
    (notice) => notice.tone !== "idle" && notice.text.trim().length > 0
  )
  const canPublish = !hasUnsavedChanges && hasPublishedDiff && loadingKey !== "publish" && loadingKey !== "save"
  const canSave = hasUnsavedChanges && loadingKey !== "save"

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
                  <span>{profileImageFileName ? `선택 파일: ${profileImageFileName}` : "현재 이미지"}</span>
              </div>
              <GhostButton type="button" onClick={() => setIsProfileImageEditorOpen(true)} disabled={loadingKey === "upload"}>
                {loadingKey === "upload" ? "업로드 중..." : "이미지 바꾸기"}
              </GhostButton>
            </AvatarWorkspaceCard>

            <FieldSectionCard>
              <SectionBlockHeader>
                <div>
                  <h3>텍스트</h3>
                </div>
              </SectionBlockHeader>
              <FieldGrid data-columns="2">
                <FieldBox>
                  <FieldLabel>계정 이름</FieldLabel>
                  <LockedField>
                    <strong>{displayName}</strong>
                    <span>읽기 전용</span>
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
                  <h3>상단 소개</h3>
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
                              열기
                            </PreviewAnchor>
                          ) : (
                            <MiniButton type="button" disabled>
                              열기
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

      <CompactHeader>
        <h1>프로필 설정</h1>
      </CompactHeader>

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
        <SectionRail aria-label="프로필 섹션">
          {WORKSPACE_SECTIONS.map((section) => (
            <SectionRailButton
              key={section.id}
              type="button"
              data-active={activeSection === section.id}
              onClick={() => setActiveSection(section.id)}
            >
              {section.label}
            </SectionRailButton>
          ))}
        </SectionRail>

        <EditorColumn>
          <EditorSurface>
            <EditorPaneHeader>
              <h2>{activeSectionMeta.label}</h2>
              {activeSectionMeta.description ? <p>{activeSectionMeta.description}</p> : null}
            </EditorPaneHeader>
            {renderActiveSection()}
          </EditorSurface>
          {isHomeSection ? (
            <PreviewActionDock>
              <ActionDockInner>
                <DockSecondaryButton type="button" disabled={!canSave} onClick={() => void handleSaveDraft()}>
                  {loadingKey === "save" ? "저장 중..." : "임시 저장"}
                </DockSecondaryButton>
                <DockPrimaryButton type="button" disabled={!canPublish} onClick={() => void handlePublish()}>
                  {loadingKey === "publish" ? "공개 중..." : "지금 공개하기"}
                </DockPrimaryButton>
              </ActionDockInner>
            </PreviewActionDock>
          ) : null}
        </EditorColumn>

        {!isHomeSection ? (
          <PreviewRail>
          <PreviewCardShell>
            <PreviewHeader>
              <div>
                <span>미리보기</span>
              </div>
              <PreviewHeaderActions>
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
                <PreviewToggleButton
                  type="button"
                  aria-expanded={isPreviewExpanded}
                  onClick={() => setIsPreviewExpanded((current) => !current)}
                >
                  {isPreviewExpanded ? "닫기" : "열기"}
                </PreviewToggleButton>
              </PreviewHeaderActions>
            </PreviewHeader>

            <PreviewBody data-expanded={isPreviewExpanded}>
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
                    <span>{previewContent.profileRole || "한 줄 역할"}</span>
                    <p>{previewContent.profileBio || "짧은 소개"}</p>
                  </PreviewProfileCard>
                ) : null}

                {activeSection === "about" ? (
                  <PreviewAboutCard>
                    <header>
                      <span>About</span>
                      <strong>{displayName}</strong>
                    </header>
                    <h4>{previewContent.aboutRole || "페이지 역할 문구"}</h4>
                    <p>{previewContent.aboutBio || "소개 문단"}</p>
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
                          <p>등록된 링크 없음</p>
                        )}
                      </section>
                    ))}
                  </PreviewLinksCard>
                ) : null}
              </PreviewViewport>
            </PreviewBody>
            <PreviewActionDock>
              <ActionDockInner>
                <DockSecondaryButton type="button" disabled={!canSave} onClick={() => void handleSaveDraft()}>
                  {loadingKey === "save" ? "저장 중..." : "임시 저장"}
                </DockSecondaryButton>
                <DockPrimaryButton type="button" disabled={!canPublish} onClick={() => void handlePublish()}>
                  {loadingKey === "publish" ? "공개 중..." : "지금 공개하기"}
                </DockPrimaryButton>
              </ActionDockInner>
            </PreviewActionDock>
          </PreviewCardShell>
          </PreviewRail>
        ) : null}
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

            {profileImageDraftNotice.text ? (
              <ModalNotice data-tone={profileImageDraftNotice.tone}>{profileImageDraftNotice.text}</ModalNotice>
            ) : null}

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

const GhostButton = styled(BaseButton)`
  min-height: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray11};

  &:hover:not(:disabled) {
    border-color: transparent;
    background: transparent;
    color: ${({ theme }) => theme.colors.gray12};
    transform: none;
  }
`

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
  min-height: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.8rem;

  &:hover:not(:disabled) {
    border-color: transparent;
    background: transparent;
    color: ${({ theme }) => theme.colors.gray12};
    transform: none;
  }
`

const DangerButton = styled(MiniButton)`
  color: ${({ theme }) => theme.colors.red11};

  &:hover:not(:disabled) {
    background: transparent;
    color: ${({ theme }) => theme.colors.red11};
  }
`

const PreviewAnchor = styled.a`
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  min-height: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: ${({ theme }) => theme.colors.blue9};
  font-size: 0.8rem;
  font-weight: 700;
  text-decoration: none;
`

const CompactHeader = styled.section`
  display: flex;
  align-items: center;
  padding: 0.15rem 0 0.1rem;

  h1 {
    margin: 0;
    font-size: clamp(1.5rem, 2vw, 1.9rem);
    line-height: 1.08;
    letter-spacing: -0.04em;
    color: ${({ theme }) => theme.colors.gray12};
  }

  @media (max-width: 760px) {
    align-items: flex-start;
  }
`

const MobileSectionRail = styled.div`
  display: none;

  @media (max-width: 760px) {
    display: flex;
    overflow-x: auto;
    gap: 0.48rem;
    padding-bottom: 0.15rem;
    scrollbar-width: none;

    &::-webkit-scrollbar {
      display: none;
    }
  }
`

const SectionSwitchButton = styled.button`
  min-height: 38px;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray11};
  font-weight: 700;
  white-space: nowrap;
  padding: 0 0.9rem;

  &[data-active="true"] {
    border-color: ${({ theme }) => theme.colors.blue8};
    background: ${({ theme }) => theme.colors.blue3};
    color: ${({ theme }) => theme.colors.blue11};
  }
`

const WorkspaceShell = styled.section`
  display: grid;
  grid-template-columns: 188px minmax(0, 1fr) 312px;
  gap: 1rem;
  align-items: start;

  @media (max-width: 1180px) {
    grid-template-columns: minmax(0, 1fr);
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

const SectionRail = styled.nav`
  position: sticky;
  top: 0.88rem;
  display: grid;
  gap: 0.24rem;

  @media (max-width: 1180px) {
    display: none;
  }
`

const SectionRailButton = styled.button`
  text-align: left;
  padding: 0.82rem 0.9rem 0.82rem 1rem;
  border-radius: 14px;
  border: 1px solid transparent;
  border-left: 2px solid transparent;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.94rem;
  font-weight: 700;

  &[data-active="true"] {
    border-color: ${({ theme }) => theme.colors.gray6};
    border-left-color: ${({ theme }) => theme.colors.blue8};
    background: ${({ theme }) => theme.colors.gray2};
    color: ${({ theme }) => theme.colors.gray12};
  }

  &:hover {
    color: ${({ theme }) => theme.colors.gray12};
  }
`

const EditorColumn = styled.div`
  display: grid;
  gap: 0.8rem;
`

const EditorPaneHeader = styled.div`
  display: grid;
  gap: 0.22rem;
  padding-bottom: 0.95rem;
  border-bottom: 1px solid ${({ theme }) => theme.colors.gray5};

  h2 {
    margin: 0;
    font-size: clamp(1.24rem, 2vw, 1.5rem);
    line-height: 1.2;
    color: ${({ theme }) => theme.colors.gray12};
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.86rem;
    line-height: 1.55;
  }
`

const EditorSurface = styled(SurfaceCard)`
  padding: 1.1rem 1.14rem 1.18rem;
  display: grid;
  gap: 1rem;
`

const SectionStack = styled.div`
  display: grid;
  gap: 1.1rem;

  > * + * {
    border-top: 1px solid ${({ theme }) => theme.colors.gray5};
    padding-top: 1.1rem;
  }
`

const AvatarWorkspaceCard = styled.div`
  display: grid;
  justify-items: center;
  gap: 0.58rem;
  padding: 0.92rem;
  border-radius: 18px;
  background: ${({ theme }) => theme.colors.gray1};
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
    margin: 0.12rem 0 0;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.8rem;
    line-height: 1.45;
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

  @media (max-width: 760px) {
    flex-direction: column;
    align-items: flex-start;
  }
`

const PreviewHeaderActions = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
`

const PreviewToggleButton = styled.button`
  display: none;

  @media (max-width: 760px) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 34px;
    padding: 0 0.82rem;
    border-radius: 999px;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.colors.gray1};
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.8rem;
    font-weight: 700;
  }
`

const PreviewBody = styled.div<{ "data-expanded"?: boolean }>`
  display: grid;

  @media (max-width: 760px) {
    display: ${({ ["data-expanded"]: expanded }) => (expanded ? "grid" : "none")};
  }
`

const PreviewActionDock = styled.div`
  display: grid;
  justify-items: center;
`

const ActionDockInner = styled.div`
  width: min(100%, 560px);
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.65rem;
  padding: 0.7rem 0.9rem;
  border-radius: 20px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};

  @media (max-width: 760px) {
    width: 100%;
    justify-content: space-between;
  }
`

const DockSecondaryButton = styled(BaseButton)`
  min-height: 40px;
  padding: 0 1rem;
  border-radius: 999px;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray11};
`

const DockPrimaryButton = styled(PublishButton)`
  min-height: 40px;
  padding: 0 1rem;
  border-radius: 999px;
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
    color: ${({ theme }) => theme.colors.gray12};
    font-weight: 800;
    font-size: 1rem;
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

const ToastStack = styled.div`
  position: fixed;
  right: 1rem;
  bottom: calc(1rem + env(safe-area-inset-bottom, 0px));
  z-index: 1200;
  display: grid;
  gap: 0.5rem;
  max-width: min(360px, calc(100vw - 2rem));
`

const ToastCard = styled.div`
  border-radius: 14px;
  padding: 0.78rem 0.9rem;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray12};
  line-height: 1.58;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.28);

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

const ModalNotice = styled(ToastCard)`
  box-shadow: none;
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
