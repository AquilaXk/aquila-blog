import { dehydrate, DehydratedState } from "@tanstack/react-query"
import { IncomingMessage } from "http"
import { GetServerSidePropsResult } from "next"
import { queryKey } from "src/constants/queryKey"
import type { AdminProfile } from "src/hooks/useAdminProfile"
import type { AuthMember } from "src/hooks/useAuthSession"
import { createQueryClient } from "src/libs/react-query"
import { normalizeNextPath, toLoginPath } from "src/libs/router"
import { serverApiFetch } from "./backend"
import { guardAdminRequest } from "./adminGuard"
import {
  buildStaticAdminProfileSnapshot,
  fetchServerAdminProfile,
  resolvePublicAdminProfileSnapshot,
} from "./adminProfile"

export type AdminPageProps = {
  dehydratedState: DehydratedState
  initialMember: AuthMember
  initialProfileSnapshot?: AdminProfile | null
}

type AdminProtectedBootstrapResult<T> =
  | { ok: true; value: T }
  | { ok: false; destination: string | null }

const buildAdminProfileSnapshotFromMember = (member: AuthMember): AdminProfile => {
  const fallback = buildStaticAdminProfileSnapshot()
  return {
    ...fallback,
    username: member.username,
    name: member.nickname || member.username,
    nickname: member.nickname || member.username,
    modifiedAt: member.modifiedAt,
    profileImageUrl: member.profileImageUrl || fallback.profileImageUrl,
    profileImageDirectUrl:
      member.profileImageDirectUrl || member.profileImageUrl || fallback.profileImageDirectUrl,
    profileRole: member.profileRole || fallback.profileRole,
    profileBio: member.profileBio || fallback.profileBio,
    aboutRole: member.aboutRole || fallback.aboutRole,
    aboutBio: member.aboutBio || fallback.aboutBio,
    aboutDetails: member.aboutDetails,
    blogTitle: member.blogTitle || fallback.blogTitle,
    homeIntroTitle: member.homeIntroTitle || fallback.homeIntroTitle,
    homeIntroDescription: member.homeIntroDescription || fallback.homeIntroDescription,
    blogDesign: member.blogDesign || fallback.blogDesign,
    legacyBlogScheme: member.legacyBlogScheme || fallback.legacyBlogScheme,
    serviceLinks: member.serviceLinks || fallback.serviceLinks,
    contactLinks: member.contactLinks || fallback.contactLinks,
  }
}

const resolveAdminInitialProfileSnapshot = async (req: IncomingMessage): Promise<AdminProfile> => {
  return (
    (await fetchServerAdminProfile(req, {
      timeoutMs: 900,
    })) || resolvePublicAdminProfileSnapshot(req).profile
  )
}

export const buildAdminPagePropsFromMember = (
  member: AuthMember,
  initialProfileSnapshot: AdminProfile | null = buildAdminProfileSnapshotFromMember(member)
): AdminPageProps => {
  const queryClient = createQueryClient()
  queryClient.setQueryData(queryKey.authMeProbe(), true)
  queryClient.setQueryData(queryKey.authMe(), member)

  return {
    dehydratedState: dehydrate(queryClient),
    initialMember: member,
    initialProfileSnapshot,
  }
}

export const readAdminProtectedBootstrap = async <T>(
  req: IncomingMessage,
  path: string,
  fallbackPath: string
): Promise<AdminProtectedBootstrapResult<T>> => {
  try {
    const response = await serverApiFetch(req, path)
    if (response.status === 401) {
      return {
        ok: false,
        destination: toLoginPath(normalizeNextPath(req.url, fallbackPath), fallbackPath),
      }
    }
    if (response.status === 403) {
      return {
        ok: false,
        destination: "/",
      }
    }
    if (!response.ok) {
      return {
        ok: false,
        destination: null,
      }
    }

    return {
      ok: true,
      value: (await response.json()) as T,
    }
  } catch {
    return {
      ok: false,
      destination: null,
    }
  }
}

export const getAdminPageProps = async (
  req: IncomingMessage
): Promise<GetServerSidePropsResult<AdminPageProps>> => {
  const guardResult = await guardAdminRequest(req)

  if (!guardResult.ok) {
    return {
      redirect: {
        destination: guardResult.destination,
        permanent: false,
      },
    }
  }

  return {
    props: buildAdminPagePropsFromMember(guardResult.member, await resolveAdminInitialProfileSnapshot(req)),
  }
}
