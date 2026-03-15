import Feed from "src/routes/Feed"
import { CONFIG } from "../../site.config"
import { NextPageWithLayout } from "../types"
import { getPosts } from "../apis"
import MetaConfig from "src/components/MetaConfig"
import { createQueryClient } from "src/libs/react-query"
import { queryKey } from "src/constants/queryKey"
import { GetServerSideProps } from "next"
import { dehydrate } from "@tanstack/react-query"
import { filterPosts } from "src/libs/utils/notion"
import { AdminProfile } from "src/hooks/useAdminProfile"
import { hydrateServerAuthSession } from "src/libs/server/authSession"
import { fetchServerAdminProfile } from "src/libs/server/adminProfile"
import type { TPost } from "src/types"

export const getServerSideProps: GetServerSideProps = async ({ req, res }) => {
  const queryClient = createQueryClient()
  const userAgent = typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : ""
  const initialViewport = /Mobi|Android|iPhone|iPad|iPod/i.test(userAgent) ? "mobile" : "desktop"
  const postsPromise = getPosts({ throwOnError: true })
    .then((fetchedPosts) => ({
      posts: filterPosts(fetchedPosts),
      postsLoaded: true,
    }))
    .catch(() => ({
      posts: [] as TPost[],
      postsLoaded: false,
    }))

  const [initialAdminProfile, authMember, postsResult] = await Promise.all([
    fetchServerAdminProfile(req),
    hydrateServerAuthSession(queryClient, req),
    postsPromise,
  ])
  const { posts, postsLoaded } = postsResult

  queryClient.setQueryData(queryKey.adminProfile(), initialAdminProfile)
  await queryClient.prefetchQuery(queryKey.posts(), () => posts)

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
      initialViewport,
    },
  }
}

type FeedPageProps = {
  initialAdminProfile: AdminProfile | null
  initialViewport: "mobile" | "desktop"
}

const FeedPage: NextPageWithLayout<FeedPageProps> = ({ initialAdminProfile, initialViewport }) => {
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
      <Feed initialAdminProfile={initialAdminProfile} initialViewport={initialViewport} />
    </>
  )
}

export default FeedPage
