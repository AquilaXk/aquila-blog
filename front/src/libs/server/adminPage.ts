import { dehydrate, DehydratedState } from "@tanstack/react-query"
import { IncomingMessage } from "http"
import { GetServerSidePropsResult } from "next"
import { queryKey } from "src/constants/queryKey"
import type { AuthMember } from "src/hooks/useAuthSession"
import { createQueryClient } from "src/libs/react-query"
import { guardAdminRequest } from "./adminGuard"

export type AdminPageProps = {
  dehydratedState: DehydratedState
  initialMember: AuthMember
}

export const getAdminPageProps = async (
  req: IncomingMessage
): Promise<GetServerSidePropsResult<AdminPageProps>> => {
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

  await queryClient.prefetchQuery(queryKey.authMe(), () => guardResult.member)

  return {
    props: {
      dehydratedState: dehydrate(queryClient),
      initialMember: guardResult.member,
    },
  }
}
