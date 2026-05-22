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

type NoticeTone = "idle" | "loading" | "success" | "error"
type OpenIconPicker = `${LinkTab}:${number}` | null
type ProfileImageDraftTransformState = {
  focusX: number
  focusY: number
  zoom: number
}

type AdminProfileWorkspacePageProps = {
  dehydratedState: DehydratedState
  initialMember: AuthMember
  initialWorkspace: ProfileWorkspaceResponse | null
}

type AdminProfileBootstrapPayload = {
  member: AuthMember
  workspace: ProfileWorkspaceResponse
}

export const getServerSideProps: GetServerSideProps<AdminProfileWorkspacePageProps> = async ({ req, res }) => {
  const ssrStartedAt = performance.now()
  const queryClient = createQueryClient()
  const bootstrapResultPromise =
    hasServerAuthCookie(req)
      ? timed(() =>
          readAdminProtectedBootstrap<AdminProfileBootstrapPayload>(
            req,
            "/member/api/v1/adm/members/profile/bootstrap",
            "/admin/profile"
          )
        )
      : null

  const bootstrapResult = bootstrapResultPromise ? await bootstrapResultPromise : null
  if (bootstrapResult?.ok && !bootstrapResult.value.ok && bootstrapResult.value.destination) {
    return {
      redirect: {
        destination: bootstrapResult.value.destination,
        permanent: false,
      },
    }
  }

  let initialMember: AuthMember
  let initialWorkspace: ProfileWorkspaceResponse | null
  let authDurationMs = 0
  let authDescription: string = "bootstrap"
  let workspaceDurationMs = 0
  let workspaceDescription = "bootstrap"

  if (bootstrapResult?.ok && bootstrapResult.value.ok) {
    initialMember = bootstrapResult.value.value.member
    initialWorkspace = bootstrapResult.value.value.workspace
    workspaceDurationMs = bootstrapResult.durationMs
  } else {
    const guardResult = await timed(() => guardAdminRequest(req))
    if (!guardResult.ok) throw guardResult.error

    if (!guardResult.value.ok) {
      return {
        redirect: {
          destination: guardResult.value.destination,
          permanent: false,
        },
      }
    }

    initialMember = guardResult.value.member
    authDurationMs = guardResult.durationMs
    authDescription = "fallback"

    const workspaceResult = await timed(() => fetchServerProfileWorkspace(req, initialMember.id))
    if (!workspaceResult.ok) throw workspaceResult.error
    initialWorkspace = workspaceResult.value
    workspaceDurationMs = workspaceResult.durationMs
    workspaceDescription = initialWorkspace ? "ok" : "empty"
  }

  queryClient.setQueryData(queryKey.authMeProbe(), true)
  queryClient.setQueryData(queryKey.authMe(), initialMember)
  if (initialWorkspace) {
    queryClient.setQueryData(queryKey.adminProfileWorkspace(initialMember.id), initialWorkspace)
  }

  appendSsrDebugTiming(req, res, [
    {
      name: "admin-profile-auth",
      durationMs: authDurationMs,
      description: authDescription,
    },
    {
      name: "admin-profile-workspace",
      durationMs: workspaceDurationMs,
      description: workspaceDescription,
    },
    {
      name: "admin-profile-ssr-total",
      durationMs: performance.now() - ssrStartedAt,
      description: "ready",
    },
  ])

  return {
    props: {
      dehydratedState: dehydrate(queryClient),
      initialMember,
      initialWorkspace,
    },
  }
}

export { default } from "src/routes/Admin/AdminProfileWorkspacePage"
