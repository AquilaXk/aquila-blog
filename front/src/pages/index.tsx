import Feed from "src/routes/Feed"
import { CONFIG } from "../../site.config"
import { NextPageWithLayout } from "../types"
import { getExplorePosts, getExplorePostsTotalCount, getTagCounts } from "../apis/backend/posts"
import MetaConfig from "src/components/MetaConfig"
import { createQueryClient } from "src/libs/react-query"
import { queryKey } from "src/constants/queryKey"
import { GetServerSideProps } from "next"
import { dehydrate } from "@tanstack/react-query"
import { AdminProfile } from "src/hooks/useAdminProfile"
import { hydrateServerAuthSession } from "src/libs/server/authSession"
import { fetchServerAdminProfile } from "src/libs/server/adminProfile"
import type { TPost } from "src/types"

export const getServerSideProps: GetServerSideProps = async ({ req, res, query }) => {
  const queryClient = createQueryClient()
  const postsQueryTagRaw = typeof query.tag === "string" ? query.tag : ""
  const postsQueryOrderRaw = typeof query.order === "string" ? query.order : ""
  const currentTag = postsQueryTagRaw.trim()
  const currentOrder = postsQueryOrderRaw === "asc" ? "asc" : "desc"

  const postsPromise = getExplorePosts({
    kw: "",
    tag: currentTag,
    order: currentOrder,
    page: 1,
    pageSize: 30,
  })
    .then((fetchedPosts) => ({
      posts: fetchedPosts,
      postsLoaded: true,
    }))
    .catch(() => ({
      posts: [] as TPost[],
      postsLoaded: false,
    }))
  const tagsPromise = getTagCounts()
    .then((tagCounts) => ({
      tagCounts,
      tagsLoaded: true,
    }))
    .catch(() => ({
      tagCounts: {} as Record<string, number>,
      tagsLoaded: false,
    }))
  const totalCountPromise = getExplorePostsTotalCount()
    .then((totalCount) => ({
      totalCount,
      totalCountLoaded: true,
    }))
    .catch(() => ({
      totalCount: 0,
      totalCountLoaded: false,
    }))

  const [initialAdminProfile, authMember, postsResult, tagsResult, totalCountResult] = await Promise.all([
    fetchServerAdminProfile(req),
    hydrateServerAuthSession(queryClient, req),
    postsPromise,
    tagsPromise,
    totalCountPromise,
  ])
  const { posts, postsLoaded } = postsResult
  const { tagCounts, tagsLoaded } = tagsResult
  const { totalCount, totalCountLoaded } = totalCountResult

  queryClient.setQueryData(queryKey.adminProfile(), initialAdminProfile)
  if (tagsLoaded) {
    queryClient.setQueryData(queryKey.tags(), tagCounts)
  }
  if (totalCountLoaded) {
    queryClient.setQueryData(queryKey.postsTotalCount(), totalCount)
  }
  if (postsLoaded) {
    queryClient.setQueryData(
      queryKey.postsExplore({
        kw: "",
        tag: currentTag || undefined,
        order: currentOrder,
        page: 1,
        pageSize: 30,
      }),
      posts
    )
    queryClient.setQueryData(queryKey.posts(), posts)
  }

  // 데이터 소스 중 하나라도 실패하면 fallback HTML이 CDN에 고정되지 않도록 no-store 처리한다.
  res.setHeader(
    "Cache-Control",
    !authMember && initialAdminProfile && postsLoaded
      ? "public, s-maxage=60, stale-while-revalidate=300"
      : "private, no-store"
  )

  return {
    props: {
      dehydratedState: dehydrate(queryClient),
      initialAdminProfile,
    },
  }
}

type FeedPageProps = {
  initialAdminProfile: AdminProfile | null
}

const FeedPage: NextPageWithLayout<FeedPageProps> = ({ initialAdminProfile }) => {
  const feedTitle = initialAdminProfile?.homeIntroTitle || CONFIG.blog.title
  const feedDescription = initialAdminProfile?.homeIntroDescription || CONFIG.blog.description

  const meta = {
    title: feedTitle,
    description: feedDescription,
    type: "website",
    url: CONFIG.link,
  }

  return (
    <>
      <MetaConfig {...meta} />
      <Feed initialAdminProfile={initialAdminProfile} />
    </>
  )
}

export default FeedPage
