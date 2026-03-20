import Feed from "src/routes/Feed"
import { CONFIG } from "../../site.config"
import { NextPageWithLayout } from "../types"
import { getExplorePostsPage, getFeedPostsPage, getTagCounts } from "../apis/backend/posts"
import MetaConfig from "src/components/MetaConfig"
import { createQueryClient } from "src/libs/react-query"
import { queryKey } from "src/constants/queryKey"
import { GetServerSideProps } from "next"
import { dehydrate } from "@tanstack/react-query"
import { AdminProfile } from "src/hooks/useAdminProfile"
import { hydrateServerAuthSession } from "src/libs/server/authSession"
import { fetchServerAdminProfile } from "src/libs/server/adminProfile"
import type { TPost } from "src/types"
import { FEED_EXPLORE_PAGE_SIZE } from "src/constants/feed"

export const getServerSideProps: GetServerSideProps = async ({ req, res, query }) => {
  const queryClient = createQueryClient()
  const postsQueryTagRaw = typeof query.tag === "string" ? query.tag : ""
  const currentTag = postsQueryTagRaw.trim()

  const postsPromise = (currentTag
    ? getExplorePostsPage({
        kw: "",
        tag: currentTag,
        page: 1,
        pageSize: FEED_EXPLORE_PAGE_SIZE,
      })
    : getFeedPostsPage({
        page: 1,
        pageSize: FEED_EXPLORE_PAGE_SIZE,
      }))
    .then(({ posts, totalCount }) => ({
      posts,
      totalCount,
      postsLoaded: true,
    }))
    .catch(() => ({
      posts: [] as TPost[],
      totalCount: 0,
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
  const [initialAdminProfile, authMember, postsResult, tagsResult] = await Promise.all([
    fetchServerAdminProfile(req),
    hydrateServerAuthSession(queryClient, req),
    postsPromise,
    tagsPromise,
  ])
  const { posts, totalCount, postsLoaded } = postsResult
  const { tagCounts, tagsLoaded } = tagsResult

  queryClient.setQueryData(queryKey.adminProfile(), initialAdminProfile)
  if (tagsLoaded) {
    queryClient.setQueryData(queryKey.tags(), tagCounts)
  }
  if (postsLoaded) {
    queryClient.setQueryData(queryKey.postsTotalCount(), totalCount)
  }
  if (postsLoaded) {
    queryClient.setQueryData(
      currentTag
        ? queryKey.postsExploreInfinite({
            kw: "",
            tag: currentTag || undefined,
            pageSize: FEED_EXPLORE_PAGE_SIZE,
            order: "desc",
          })
        : queryKey.postsFeedInfinite({
            pageSize: FEED_EXPLORE_PAGE_SIZE,
            order: "desc",
          }),
      {
        pages: [
          {
            posts,
            totalCount,
            pageNumber: 1,
            pageSize: FEED_EXPLORE_PAGE_SIZE,
          },
        ],
        pageParams: [1],
      }
    )
  }

  // 데이터 소스 중 하나라도 실패하면 fallback HTML이 CDN에 고정되지 않도록 no-store 처리한다.
  res.setHeader(
    "Cache-Control",
    authMember === null && initialAdminProfile && postsLoaded
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
