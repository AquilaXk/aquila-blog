import { dehydrate } from "@tanstack/react-query"
import type { GetServerSideProps } from "next"
import { queryKey } from "src/constants/queryKey"
import type { AuthMember } from "src/hooks/useAuthSession"
import type { ProfileWorkspaceResponse } from "src/libs/profileWorkspace"
import { createQueryClient } from "src/libs/react-query"
import { readAdminProtectedBootstrap } from "src/libs/server/adminPage"
import { guardAdminRequest } from "src/libs/server/adminGuard"
import { hasServerAuthCookie } from "src/libs/server/authSession"
import { fetchServerProfileWorkspace } from "src/libs/server/profileWorkspace"
import { appendSsrDebugTiming, timed } from "src/libs/server/serverTiming"
import type { AdminProfileWorkspacePageProps } from "src/routes/Admin/AdminProfileWorkspacePageModel"

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
