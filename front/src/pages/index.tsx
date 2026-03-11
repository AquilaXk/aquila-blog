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
import { getApiBaseUrl } from "src/apis/backend/client"

const fetchAdminProfile = async (): Promise<AdminProfile | null> => {
  try {
    const response = await fetch(`${getApiBaseUrl()}/member/api/v1/members/adminProfile`)
    if (!response.ok) return null
    return (await response.json()) as AdminProfile
  } catch {
    return null
  }
}

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  const queryClient = createQueryClient()
  const [posts, initialAdminProfile] = await Promise.all([
    getPosts().then(filterPosts),
    fetchAdminProfile(),
  ])
  await queryClient.prefetchQuery(queryKey.posts(), () => posts)

  // Velog-like strategy: SSR + short CDN cache.
  res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=120")

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
  const meta = {
    title: CONFIG.blog.title,
    description: CONFIG.blog.description,
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
