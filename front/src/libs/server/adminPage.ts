import { dehydrate, DehydratedState } from "@tanstack/react-query"
import { IncomingMessage } from "http"
import { GetServerSidePropsResult } from "next"
import { queryKey } from "src/constants/queryKey"
import type { AuthMember } from "src/hooks/useAuthSession"
import { createQueryClient } from "src/libs/react-query"
import { normalizeNextPath, toLoginPath } from "src/libs/router"
import { serverApiFetch } from "./backend"
import { guardAdminRequest } from "./adminGuard"

export type AdminPageProps = {
  dehydratedState: DehydratedState
  initialMember: AuthMember
}

type AdminProtectedBootstrapResult<T> =
  | { ok: true; value: T }
  | { ok: false; destination: string | null }

export const buildAdminPagePropsFromMember = (member: AuthMember): AdminPageProps => {
  const queryClient = createQueryClient()
  queryClient.setQueryData(queryKey.authMeProbe(), true)
  queryClient.setQueryData(queryKey.authMe(), member)

  return {
    dehydratedState: dehydrate(queryClient),
    initialMember: member,
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
    props: buildAdminPagePropsFromMember(guardResult.member),
  }
}
