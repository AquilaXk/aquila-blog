import { CONFIG } from "site.config"
import { GetServerSideProps } from "next"
import { NextPageWithLayout } from "../../types"
import CustomError from "src/routes/Error"
import MetaConfig from "src/components/MetaConfig"
import Detail from "src/routes/Detail"
import usePostQuery from "src/hooks/usePostQuery"
import { TPostComment } from "src/types"
import { buildCanonicalPostDetailPage } from "src/libs/server/postDetailPage"
import { toCanonicalPostPath } from "src/libs/utils/postPath"

export const getServerSideProps: GetServerSideProps = async ({ params, req, res }) => {
  const postId = params?.id as string
  return await buildCanonicalPostDetailPage(req, res, postId)
}

type DetailPageProps = {
  initialComments: TPostComment[]
}

const CanonicalPostPage: NextPageWithLayout<DetailPageProps> = ({ initialComments }) => {
  const { post, isLoading, isNotFound } = usePostQuery()
  if (isLoading) return null
  if (isNotFound || !post) return <CustomError />

  const date = post.createdTime || post.date?.start_date || ""
  const publishedDate = new Date(date)
  const publishedDateIso = Number.isNaN(publishedDate.getTime()) ? undefined : publishedDate.toISOString()
  const canonicalPath = toCanonicalPostPath(post.id)

  const meta = {
    title: post.title,
    date: publishedDateIso,
    image: post.thumbnail ?? `${CONFIG.ogImageGenerateURL}/${encodeURIComponent(post.title)}.png`,
    description: post.summary || "",
    type: Array.isArray(post.type) ? post.type[0] : post.type,
    url: `${CONFIG.link}${canonicalPath}`,
  }

  return (
    <>
      <MetaConfig {...meta} />
      <Detail initialComments={initialComments} />
    </>
  )
}

CanonicalPostPage.getLayout = (page) => <>{page}</>
export default CanonicalPostPage
