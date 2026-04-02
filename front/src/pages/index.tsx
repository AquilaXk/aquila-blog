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
import {
  buildStaticAdminProfileSnapshot,
  fetchServerAdminProfile,
  hasServerAuthCookie,
  resolvePublicAdminProfileSnapshot,
} from "src/libs/server/adminProfile"
import type { TPost } from "src/types"
import { FEED_EXPLORE_PAGE_SIZE } from "src/constants/feed"
import { appendSsrDebugTiming, isSsrDebugEnabled, timed } from "src/libs/server/serverTiming"

const CRAWLER_USER_AGENT_REGEX =
  /bot|crawler|spider|crawling|googlebot|bingbot|yandexbot|duckduckbot|applebot|baiduspider|facebookexternalhit|twitterbot|slurp|ia_archiver/i

const isCrawlerRequest = (userAgent: string | undefined) =>
  typeof userAgent === "string" && CRAWLER_USER_AGENT_REGEX.test(userAgent)

export const getServerSideProps: GetServerSideProps = async ({ req, res, query }) => {
  const ssrStartedAt = performance.now()
  const debugSsr = isSsrDebugEnabled(req)
  const queryClient = createQueryClient()
  const postsQueryTagRaw = typeof query.tag === "string" ? query.tag : ""
  const currentTag = postsQueryTagRaw.trim()
  const userAgent = typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : undefined
  const crawlerRequest = isCrawlerRequest(userAgent)
  const hasAuthCookie = hasServerAuthCookie(req)

  const bootstrapPromise = timed(() =>
    getPostsBootstrap({
      tag: currentTag,
      pageSize: FEED_EXPLORE_PAGE_SIZE,
    })
  )

  const publicProfileSnapshot = !hasAuthCookie && !crawlerRequest ? resolvePublicAdminProfileSnapshot(req) : null
  const adminProfilePromise = publicProfileSnapshot
    ? Promise.resolve({
        ok: true as const,
        value: publicProfileSnapshot.profile,
        durationMs: 0,
      })
    : timed(() =>
        fetchServerAdminProfile(req, {
          timeoutMs: hasAuthCookie ? 1_800 : crawlerRequest ? 1_500 : 900,
        })
      )

  const authMemberPromise = timed(() => hydrateServerAuthSession(queryClient, req))

  const [adminProfileResult, authMemberResult, bootstrapResult] = await Promise.all([
    adminProfilePromise,
    authMemberPromise,
    bootstrapPromise,
  ])

  const initialAdminProfile =
    adminProfileResult.ok && adminProfileResult.value
      ? adminProfileResult.value
      : hasAuthCookie
        ? null
        : buildStaticAdminProfileSnapshot()
  const authMember = authMemberResult.ok ? authMemberResult.value : undefined
  const bootstrapSnapshot =
    bootstrapResult.ok
      ? (() => {
          const hasNext = bootstrapResult.value.hasNext
          const resolvedTotalCount = hasNext ? null : bootstrapResult.value.posts.length

          return {
            posts: bootstrapResult.value.posts,
            tagCounts: bootstrapResult.value.tagCounts,
            totalCount: resolvedTotalCount,
            initialPageTotalCount: resolvedTotalCount ?? bootstrapResult.value.posts.length,
            hasNext,
            nextCursor: bootstrapResult.value.nextCursor ?? null,
            postsLoaded: true,
            tagsLoaded: true,
          }
        })()
      : {
          posts: [] as TPost[],
          tagCounts: {} as Record<string, number>,
          totalCount: null as number | null,
          initialPageTotalCount: 0,
          hasNext: false,
          nextCursor: null as string | null,
          postsLoaded: false,
          tagsLoaded: false,
        }

  const timingMetrics = [
    {
      name: "home-bootstrap",
      durationMs: bootstrapResult.durationMs,
      description: bootstrapResult.ok ? "ok" : "fallback",
    },
    {
      name: "home-admin-profile",
      durationMs: adminProfileResult.durationMs,
      description:
        initialAdminProfile !== null
          ? publicProfileSnapshot
            ? publicProfileSnapshot.source
            : adminProfileResult.ok && adminProfileResult.value
            ? "ok"
            : "static-fallback"
          : "auth-session",
    },
    {
      name: "home-auth-session",
      durationMs: authMemberResult.durationMs,
      description: authMember === undefined ? "unknown" : authMember === null ? "anonymous" : "member",
    },
    {
      name: "home-ssr-total",
      durationMs: performance.now() - ssrStartedAt,
      description: bootstrapSnapshot.postsLoaded ? "ready" : "bootstrap-fallback",
    },
  ]
  appendSsrDebugTiming(req, res, timingMetrics)

  const { posts, tagCounts, totalCount, initialPageTotalCount, hasNext, nextCursor, postsLoaded, tagsLoaded } =
    bootstrapSnapshot

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

  // 홈 캐시는 feed bootstrap 성공 여부만으로 결정하고, 비인증 admin profile 실패가 공개 캐시를 깨지 않게 한다.
  res.setHeader(
    "Cache-Control",
    !debugSsr && authMember === null && postsLoaded
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
