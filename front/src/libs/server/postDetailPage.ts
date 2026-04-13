import { dehydrate } from "@tanstack/react-query"
import { GetStaticPathsResult, GetStaticPropsResult } from "next"
import { getPostDetailById } from "src/apis"
import { getPostsBootstrap } from "src/apis/backend/posts"
import { queryKey } from "src/constants/queryKey"
import { createQueryClient } from "src/libs/react-query"
import { TPostComment } from "src/types"

type DetailPageProps = {
  dehydratedState: unknown
  initialComments: TPostComment[] | null
}

const DETAIL_ISR_REVALIDATE_SECONDS = 60 * 60
const DETAIL_PREBUILD_COUNT = 16
const DETAIL_RECOVERY_REVALIDATE_SECONDS = 30
const IS_QA_STATIC_RECOVERY_MODE = process.env.ENABLE_QA_ROUTES === "true"

const toSerializableState = (value: unknown): unknown =>
  JSON.parse(
    JSON.stringify(value, (_key, currentValue) => (currentValue === undefined ? null : currentValue))
  )

export const buildCanonicalPostDetailStaticProps = async (
  postId: string
): Promise<GetStaticPropsResult<DetailPageProps>> => {
  const queryClient = createQueryClient()

  if (IS_QA_STATIC_RECOVERY_MODE) {
    return {
      props: {
        dehydratedState: toSerializableState(dehydrate(queryClient)),
        initialComments: null,
      },
      revalidate: DETAIL_RECOVERY_REVALIDATE_SECONDS,
    }
  }

  let postDetail = null as Awaited<ReturnType<typeof getPostDetailById>>
  let shouldClientRecover = false
  try {
    postDetail = await getPostDetailById(postId)
  } catch {
    // ISR 생성 시점의 일시 장애는 기존 정적 결과를 유지하고, 첫 생성에서는 클라이언트 1회 복구 fetch를 허용한다.
    shouldClientRecover = true
  }
  const shouldServeClientRecoveryShell = shouldClientRecover || (IS_QA_STATIC_RECOVERY_MODE && !postDetail)
  if (!postDetail && !shouldServeClientRecoveryShell) return { notFound: true }

  if (postDetail) {
    queryClient.setQueryData(queryKey.post(postDetail.id), postDetail)
  }
  const initialComments =
    postDetail && postDetail.type[0] === "Post"
      ? typeof postDetail.commentsCount === "number" && postDetail.commentsCount === 0
        ? []
        : null
      : null

  return {
    props: {
      dehydratedState: toSerializableState(dehydrate(queryClient)),
      initialComments,
    },
    revalidate: shouldServeClientRecoveryShell ? DETAIL_RECOVERY_REVALIDATE_SECONDS : DETAIL_ISR_REVALIDATE_SECONDS,
  }
}

export const buildCanonicalPostDetailStaticPaths = async (): Promise<GetStaticPathsResult> => {
  if (IS_QA_STATIC_RECOVERY_MODE) {
    return {
      paths: [],
      fallback: "blocking",
    }
  }

  const bootstrap = await (async () => {
    try {
      return await getPostsBootstrap({
        pageSize: DETAIL_PREBUILD_COUNT,
      })
    } catch {
      return {
        posts: [],
      }
    }
  })()

  return {
    paths: bootstrap.posts.map((post: { id: string | number }) => ({
      params: {
        id: String(post.id),
      },
    })),
    fallback: "blocking",
  }
}
