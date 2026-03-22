import { dehydrate, DehydratedState } from "@tanstack/react-query"
import { IncomingMessage } from "http"
import { GetServerSidePropsResult } from "next"
import { createQueryClient } from "src/libs/react-query"
import { hydrateServerAuthSession } from "./authSession"

export type GuestPageProps = {
  dehydratedState: DehydratedState
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

  return {
    props: {
      dehydratedState: dehydrate(queryClient),
    },
  }
}

