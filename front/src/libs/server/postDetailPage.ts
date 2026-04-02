import { dehydrate } from "@tanstack/react-query"
import { IncomingMessage, ServerResponse } from "http"
import { GetServerSidePropsResult } from "next"
import { getPostDetailById } from "src/apis"
import { queryKey } from "src/constants/queryKey"
import { createQueryClient } from "src/libs/react-query"
import { hydrateServerAuthSession } from "./authSession"
import { TPostComment } from "src/types"
import { appendSsrDebugTiming, isSsrDebugEnabled, timed } from "./serverTiming"

type DetailPageProps = {
  dehydratedState: unknown
  initialComments: TPostComment[] | null
}

const toSerializableState = (value: unknown): unknown =>
  JSON.parse(
    JSON.stringify(value, (_key, currentValue) => (currentValue === undefined ? null : currentValue))
  )

export const buildCanonicalPostDetailPage = async (
  req: IncomingMessage,
  res: ServerResponse,
  postId: string
): Promise<GetServerSidePropsResult<DetailPageProps>> => {
  const ssrStartedAt = performance.now()
  const debugSsr = isSsrDebugEnabled(req)
  const queryClient = createQueryClient()
  const authMemberPromise = timed(() => hydrateServerAuthSession(queryClient, req))

  let postDetail = null as Awaited<ReturnType<typeof getPostDetailById>>
  let shouldClientRecover = false
  const postDetailResult = await timed(() => getPostDetailById(postId))
  if (postDetailResult.ok) {
    postDetail = postDetailResult.value
  } else {
    // SSR fetch timeout/일시 장애 시에는 404 대신 클라이언트 1회 복구 fetch를 허용한다.
    shouldClientRecover = true
  }
  const authMemberResult = await authMemberPromise
  const authMember = authMemberResult.ok ? authMemberResult.value : undefined
  if (!postDetail && !shouldClientRecover) return { notFound: true }

  if (postDetail) {
    await queryClient.prefetchQuery({
      queryKey: queryKey.post(postDetail.id),
      queryFn: () => postDetail,
    })
  }
  const initialComments =
    postDetail && postDetail.type[0] === "Post"
      ? typeof postDetail.commentsCount === "number" && postDetail.commentsCount === 0
        ? []
        : null
      : null

  res.setHeader(
    "Cache-Control",
    !debugSsr && authMember === null && !shouldClientRecover
      ? "public, s-maxage=120, stale-while-revalidate=600"
      : "private, no-store"
  )
  const timingMetrics = [
    {
      name: "post-detail",
      durationMs: postDetailResult.durationMs,
      description: shouldClientRecover ? "client-recover" : postDetail ? "ok" : "not-found",
    },
    {
      name: "post-auth-session",
      durationMs: authMemberResult.durationMs,
      description: authMember === undefined ? "unknown" : authMember === null ? "anonymous" : "member",
    },
    {
      name: "post-ssr-total",
      durationMs: performance.now() - ssrStartedAt,
      description: shouldClientRecover ? "deferred-comments" : "ready",
    },
  ]
  appendSsrDebugTiming(req, res, timingMetrics)

  return {
    props: {
      dehydratedState: toSerializableState(dehydrate(queryClient)),
      initialComments,
    },
  }
}
