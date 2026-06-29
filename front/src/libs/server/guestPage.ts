import { dehydrate, DehydratedState } from "@tanstack/react-query"
import { IncomingMessage } from "http"
import { GetServerSidePropsResult } from "next"
import { createQueryClient } from "src/libs/react-query"
import { hydrateServerAuthSession } from "./authSession"
import type { AdminProfile } from "src/hooks/useAdminProfile"
import {
  fetchServerAdminProfile,
  resolvePublicAdminProfileSnapshot,
} from "./adminProfile"
import type { PublicAdminProfileSource } from "src/libs/adminProfileSource"

export type GuestPageProps = {
  dehydratedState: DehydratedState
  initialProfileSnapshot: AdminProfile | null
  initialAdminProfileSource: PublicAdminProfileSource
}

export const getGuestPageProps = async (
  req: IncomingMessage
): Promise<GetServerSidePropsResult<GuestPageProps>> => {
  const queryClient = createQueryClient()
  const authMember = await hydrateServerAuthSession(queryClient, req)

  if (authMember) {
    return {
      redirect: {
        destination: authMember.isAdmin ? "/admin" : "/",
        permanent: false,
      },
    }
  }
  const fallbackProfileSnapshot = resolvePublicAdminProfileSnapshot(req)
  const publishedProfile = await fetchServerAdminProfile(req, { timeoutMs: 900 })
  const initialProfileSnapshot = publishedProfile ?? fallbackProfileSnapshot.profile
  const initialAdminProfileSource: PublicAdminProfileSource = publishedProfile
    ? "published"
    : fallbackProfileSnapshot.source

  return {
    props: {
      dehydratedState: dehydrate(queryClient),
      initialProfileSnapshot,
      initialAdminProfileSource,
    },
  }
}
