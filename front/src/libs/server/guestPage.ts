import { dehydrate, DehydratedState } from "@tanstack/react-query"
import { IncomingMessage } from "http"
import { GetServerSidePropsResult } from "next"
import { createQueryClient } from "src/libs/react-query"
import { hydrateServerAuthSession } from "./authSession"
import type { AdminProfile } from "src/hooks/useAdminProfile"
import {
  fetchServerAdminProfile,
  resolvePublicAdminProfileSnapshot,
  type StaticAdminProfileSeedSource,
} from "./adminProfile"

export type GuestPageProps = {
  dehydratedState: DehydratedState
  initialProfileSnapshot: AdminProfile | null
  initialAdminProfileSource: StaticAdminProfileSeedSource
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
  const initialAdminProfileSource: StaticAdminProfileSeedSource =
    publishedProfile || fallbackProfileSnapshot.source === "cookie-snapshot" ? "published" : "static-fallback"

  return {
    props: {
      dehydratedState: dehydrate(queryClient),
      initialProfileSnapshot,
      initialAdminProfileSource,
    },
  }
}
