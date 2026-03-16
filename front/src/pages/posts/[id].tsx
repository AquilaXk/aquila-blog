import { CONFIG } from "site.config"
import { GetServerSideProps } from "next"
import { NextPageWithLayout } from "../../types"
import styled from "@emotion/styled"
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
  if (isLoading) {
    return (
      <LoadingShell aria-live="polite" aria-busy="true">
        <div className="title" />
        <div className="meta" />
        <div className="body" />
      </LoadingShell>
    )
  }
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

const LoadingShell = styled.section`
  display: grid;
  gap: 0.75rem;
  margin-top: 1rem;

  > div {
    border-radius: 12px;
    background: ${({ theme }) => theme.colors.gray3};
    animation: detail-skeleton-pulse 1.2s ease-in-out infinite;
  }

  .title {
    height: 44px;
    width: min(70%, 520px);
  }

  .meta {
    height: 24px;
    width: min(44%, 280px);
  }

  .body {
    height: min(42vh, 320px);
    width: 100%;
  }

  @keyframes detail-skeleton-pulse {
    0% {
      opacity: 0.7;
    }
    50% {
      opacity: 1;
    }
    100% {
      opacity: 0.7;
    }
  }
`
