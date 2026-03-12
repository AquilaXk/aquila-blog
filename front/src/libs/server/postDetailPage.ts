import { dehydrate } from "@tanstack/react-query"
import { IncomingMessage, ServerResponse } from "http"
import { GetServerSidePropsResult } from "next"
import { getPostDetailById, getPosts } from "src/apis"
import { queryKey } from "src/constants/queryKey"
import { createQueryClient } from "src/libs/react-query"
import { filterPosts } from "src/libs/utils/notion"
import { hydrateServerAuthSession } from "./authSession"
import { serverApiFetch } from "./backend"
import { TPostComment } from "src/types"

type DetailPageProps = {
  dehydratedState: unknown
  initialComments: TPostComment[]
}

const fetchInitialComments = async (req: IncomingMessage, postId: string) => {
  try {
    const response = await serverApiFetch(req, `/post/api/v1/posts/${postId}/comments`)
    if (!response.ok) return []
    return (await response.json()) as TPostComment[]
  } catch {
    return []
  }
}

export const buildCanonicalPostDetailPage = async (
  req: IncomingMessage,
  res: ServerResponse,
  postId: string
): Promise<GetServerSidePropsResult<DetailPageProps>> => {
  const queryClient = createQueryClient()
  const posts = await getPosts()
  await hydrateServerAuthSession(queryClient, req)

  const feedPosts = filterPosts(posts)
  await queryClient.prefetchQuery(queryKey.posts(), () => feedPosts)

  const postDetail = await getPostDetailById(postId)
  if (!postDetail) return { notFound: true }

  await queryClient.prefetchQuery(queryKey.post(postDetail.id), () => postDetail)
  const initialComments = postDetail.type[0] === "Post" ? await fetchInitialComments(req, postDetail.id) : []

  res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=120")

  return {
    props: {
      dehydratedState: dehydrate(queryClient),
      initialComments,
    },
  }
}
