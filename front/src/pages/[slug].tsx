import Detail from "src/routes/Detail"
import { filterPosts } from "src/libs/utils/notion"
import { CONFIG } from "site.config"
import { NextPageWithLayout } from "../types"
import CustomError from "src/routes/Error"
import { getPostDetailBySlug, getPosts } from "src/apis"
import MetaConfig from "src/components/MetaConfig"
import { GetStaticProps } from "next"
import { createQueryClient } from "src/libs/react-query"
import { queryKey } from "src/constants/queryKey"
import { dehydrate } from "@tanstack/react-query"
import usePostQuery from "src/hooks/usePostQuery"
import { FilterPostsOptions } from "src/libs/utils/notion/filterPosts"

const filter: FilterPostsOptions = {
  acceptStatus: ["Public", "PublicOnDetail"],
  acceptType: ["Paper", "Post", "Page"],
}

export const getStaticPaths = async () => {
  const posts = await getPosts()
  const filteredPost = filterPosts(posts, filter)

  return {
    paths: filteredPost.map((row) => `/${row.slug}`),
    fallback: "blocking",
  }
}

export const getStaticProps: GetStaticProps = async (context) => {
  const queryClient = createQueryClient()
  const slug = context.params?.slug as string
  const posts = await getPosts()

  const feedPosts = filterPosts(posts)
  await queryClient.prefetchQuery(queryKey.posts(), () => feedPosts)

  const postDetail = await getPostDetailBySlug(slug)

  if (!postDetail) {
    return { notFound: true }
  }

  await queryClient.prefetchQuery(queryKey.post(`${slug}`), () => postDetail)

  return {
    props: { dehydratedState: dehydrate(queryClient) },
    revalidate: CONFIG.revalidateTime,
  }
}

const DetailPage: NextPageWithLayout = () => {
  const post = usePostQuery()
  if (!post) return <CustomError />

  const date = post.date?.start_date || post.createdTime || ""
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
