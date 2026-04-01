import Feed from "src/routes/Feed"
import { CONFIG } from "../../site.config"
import { NextPageWithLayout } from "../types"
import { getPostsBootstrap } from "../apis/backend/posts"
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

const CRAWLER_USER_AGENT_REGEX =
  /bot|crawler|spider|crawling|googlebot|bingbot|yandexbot|duckduckbot|applebot|baiduspider|facebookexternalhit|twitterbot|slurp|ia_archiver/i

const isCrawlerRequest = (userAgent: string | undefined) =>
  typeof userAgent === "string" && CRAWLER_USER_AGENT_REGEX.test(userAgent)

export const getServerSideProps: GetServerSideProps = async ({ req, res, query }) => {
  const queryClient = createQueryClient()
  const postsQueryTagRaw = typeof query.tag === "string" ? query.tag : ""
  const currentTag = postsQueryTagRaw.trim()
  const userAgent = typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : undefined
  const crawlerRequest = isCrawlerRequest(userAgent)

  const bootstrapPromise = getPostsBootstrap({
    tag: currentTag,
    pageSize: FEED_EXPLORE_PAGE_SIZE,
  })
    .then((bootstrap) => {
      const hasNext = bootstrap.hasNext
      const resolvedTotalCount = hasNext ? null : bootstrap.posts.length

      return {
        posts: bootstrap.posts,
        tagCounts: bootstrap.tagCounts,
        totalCount: resolvedTotalCount,
        initialPageTotalCount: resolvedTotalCount ?? bootstrap.posts.length,
        hasNext,
        nextCursor: bootstrap.nextCursor ?? null,
        postsLoaded: true,
        tagsLoaded: true,
      }
    })
    .catch(() => ({
      posts: [] as TPost[],
      tagCounts: {} as Record<string, number>,
      totalCount: null as number | null,
      initialPageTotalCount: 0,
      hasNext: false,
      nextCursor: null as string | null,
      postsLoaded: false,
      tagsLoaded: false,
    }))

  const adminProfilePromise = fetchServerAdminProfile(req, {
    timeoutMs: crawlerRequest ? 1_500 : 900,
  })

  const [initialAdminProfile, authMember, bootstrapResult] = await Promise.all([
    adminProfilePromise,
    hydrateServerAuthSession(queryClient, req),
    bootstrapPromise,
  ])
  const { posts, tagCounts, totalCount, initialPageTotalCount, hasNext, nextCursor, postsLoaded, tagsLoaded } =
    bootstrapResult

  queryClient.setQueryData(queryKey.adminProfile(), initialAdminProfile)
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

  // 데이터 소스 중 하나라도 실패하면 fallback HTML이 CDN에 고정되지 않도록 no-store 처리한다.
  res.setHeader(
    "Cache-Control",
    authMember === null && postsLoaded && initialAdminProfile !== null
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
