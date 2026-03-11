import Detail from "src/routes/Detail"
import { filterPosts } from "src/libs/utils/notion"
import { CONFIG } from "site.config"
import { NextPageWithLayout } from "../types"
import CustomError from "src/routes/Error"
import { getPostDetailBySlug, getPosts } from "src/apis"
import MetaConfig from "src/components/MetaConfig"
import { GetServerSideProps } from "next"
import { createQueryClient } from "src/libs/react-query"
import { queryKey } from "src/constants/queryKey"
import { dehydrate } from "@tanstack/react-query"
import usePostQuery from "src/hooks/usePostQuery"

export const getServerSideProps: GetServerSideProps = async ({ params, res }) => {
  const queryClient = createQueryClient()
  const slug = params?.slug as string
  const posts = await getPosts()

  const feedPosts = filterPosts(posts)
  await queryClient.prefetchQuery(queryKey.posts(), () => feedPosts)

  const postDetail = await getPostDetailBySlug(slug)

  if (!postDetail) {
    return { notFound: true }
  }

  await queryClient.prefetchQuery(queryKey.post(`${slug}`), () => postDetail)

  // Keep detail pages fresh while still leveraging CDN edge cache.
  res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=120")

  return {
    props: { dehydratedState: dehydrate(queryClient) },
  }
}

const DetailPage: NextPageWithLayout = () => {
  const post = usePostQuery()
  if (!post) return <CustomError />

  const date = post.createdTime || post.date?.start_date || ""
  const publishedDate = new Date(date)
  const publishedDateIso = Number.isNaN(publishedDate.getTime())
    ? undefined
    : publishedDate.toISOString()
  const meta = {
    title: post.title,
    date: publishedDateIso,
    image:
      post.thumbnail ??
      `${CONFIG.ogImageGenerateURL}/${encodeURIComponent(post.title)}.png`,
    description: post.summary || "",
    type: Array.isArray(post.type) ? post.type[0] : post.type,
    url: `${CONFIG.link}/${post.slug}`,
  }

  return (
    <>
      <MetaConfig {...meta} />
      <Detail />
    </>
  )
}

DetailPage.getLayout = (page) => <>{page}</>
export default DetailPage
