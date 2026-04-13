import Feed from "src/routes/Feed"
import { CONFIG } from "../../site.config"
import { NextPageWithLayout } from "../types"
import { getPostsBootstrap } from "../apis/backend/posts"
import { apiFetch } from "src/apis/backend/client"
import MetaConfig from "src/components/MetaConfig"
import { createQueryClient } from "src/libs/react-query"
import { queryKey } from "src/constants/queryKey"
import { GetStaticProps } from "next"
import { dehydrate } from "@tanstack/react-query"
import { AdminProfile } from "src/hooks/useAdminProfile"
import {
  buildStaticAdminProfileSnapshot,
} from "src/libs/server/adminProfile"
import type { TPost } from "src/types"
import { FEED_EXPLORE_PAGE_SIZE } from "src/constants/feed"
import { setAdminProfileCache } from "src/hooks/useAdminProfile"

const HOME_ISR_REVALIDATE_SECONDS = 60
const HOME_QA_SHELL_REVALIDATE_SECONDS = 15
const IS_QA_STATIC_SHELL_MODE = process.env.ENABLE_QA_ROUTES === "true"

const fetchPublicAdminProfile = async (): Promise<AdminProfile> => {
  try {
    return await apiFetch<AdminProfile>("/member/api/v1/members/adminProfile")
  } catch {
    return buildStaticAdminProfileSnapshot()
  }
}

export const getStaticProps: GetStaticProps = async () => {
  const queryClient = createQueryClient()
  const currentTag = ""
  const initialAdminProfile = await fetchPublicAdminProfile()
  const bootstrapSnapshot = await (async () => {
    if (IS_QA_STATIC_SHELL_MODE) {
      return {
        posts: [] as TPost[],
        tagCounts: {} as Record<string, number>,
        totalCount: null as number | null,
        initialPageTotalCount: 0,
        hasNext: false,
        nextCursor: null as string | null,
        postsLoaded: false,
        tagsLoaded: false,
      }
    }

    try {
      const bootstrapResult = await getPostsBootstrap({
        tag: currentTag,
        pageSize: FEED_EXPLORE_PAGE_SIZE,
      })
      const hasNext = bootstrapResult.hasNext
      const resolvedTotalCount = hasNext ? null : bootstrapResult.posts.length

      return {
        posts: bootstrapResult.posts,
        tagCounts: bootstrapResult.tagCounts,
        totalCount: resolvedTotalCount,
        initialPageTotalCount: resolvedTotalCount ?? bootstrapResult.posts.length,
        hasNext,
        nextCursor: bootstrapResult.nextCursor ?? null,
        postsLoaded: true,
        tagsLoaded: true,
      }
    } catch {
      return {
        posts: [] as TPost[],
        tagCounts: {} as Record<string, number>,
        totalCount: null as number | null,
        initialPageTotalCount: 0,
        hasNext: false,
        nextCursor: null as string | null,
        postsLoaded: false,
        tagsLoaded: false,
      }
    }
  })()
  const { posts, tagCounts, totalCount, initialPageTotalCount, hasNext, nextCursor, postsLoaded, tagsLoaded } =
    bootstrapSnapshot

  setAdminProfileCache(queryClient, initialAdminProfile)
  if (tagsLoaded) {
    queryClient.setQueryData(queryKey.tags(), tagCounts)
  }
  if (postsLoaded && typeof totalCount === "number") {
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
            totalCount: initialPageTotalCount,
            pageNumber: 1,
            pageSize: FEED_EXPLORE_PAGE_SIZE,
            hasNext,
            nextCursor,
          },
        ],
        pageParams: [1],
      }
    )
  }

  return {
    props: {
      dehydratedState: dehydrate(queryClient),
      initialAdminProfile,
    },
    revalidate:
      IS_QA_STATIC_SHELL_MODE || !postsLoaded ? HOME_QA_SHELL_REVALIDATE_SECONDS : HOME_ISR_REVALIDATE_SECONDS,
  }
}

type FeedPageProps = {
  initialAdminProfile: AdminProfile | null
}

const FeedPage: NextPageWithLayout<FeedPageProps> = ({ initialAdminProfile }) => {
  const feedTitle =
    initialAdminProfile?.homeIntroTitle ||
    initialAdminProfile?.blogTitle ||
    CONFIG.blog.homeIntroTitle ||
    CONFIG.blog.title
  const feedDescription = initialAdminProfile?.homeIntroDescription || CONFIG.blog.homeIntroDescription || CONFIG.blog.description

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
