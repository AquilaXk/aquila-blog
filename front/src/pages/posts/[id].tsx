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
        <div className="hero">
          <div className="eyebrow" />
          <div className="title" />
          <div className="metaRow">
            <div className="avatar" />
            <div className="meta" />
          </div>
          <div className="summary" />
        </div>
        <div className="layout">
          <div className="bodyCard">
            <div className="cover" />
            <div className="line wide" />
            <div className="line wide" />
            <div className="line medium" />
            <div className="line wide" />
            <div className="line medium" />
            <div className="line narrow" />
            <div className="commentShell">
              <div className="commentHead" />
              <div className="commentComposer" />
              <div className="commentRow" />
              <div className="commentRow" />
            </div>
          </div>
          <div className="rail" aria-hidden="true">
            <div className="railCard" />
            <div className="railCard" />
          </div>
        </div>
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
  gap: 1.25rem;
  margin-top: 1rem;
  padding-bottom: 2rem;

  > div {
    border-radius: 12px;
    background: ${({ theme }) => theme.colors.gray3};
    animation: detail-skeleton-pulse 1.2s ease-in-out infinite;
  }

  .hero {
    display: grid;
    gap: 0.85rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid ${({ theme }) => theme.colors.gray5};
  }

  .eyebrow {
    height: 18px;
    width: min(22%, 120px);
  }

  .title {
    height: 52px;
    width: min(72%, 560px);
  }

  .metaRow {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .avatar {
    width: 42px;
    height: 42px;
    border-radius: 999px;
  }

  .meta {
    height: 20px;
    width: min(38%, 240px);
  }

  .summary {
    height: 20px;
    width: min(58%, 420px);
  }

  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 1.25rem;
  }

  .rail {
    display: none;
    gap: 0.85rem;
  }

  .railCard {
    height: 124px;
    border-radius: 18px;
  }

  .bodyCard {
    display: grid;
    gap: 0.95rem;
  }

  .cover {
    height: min(34vh, 280px);
    width: 100%;
    border-radius: 20px;
  }

  .line {
    height: 18px;
  }

  .line.wide {
    width: 100%;
  }

  .line.medium {
    width: min(88%, 760px);
  }

  .line.narrow {
    width: min(70%, 620px);
  }

  .commentShell {
    display: grid;
    gap: 0.75rem;
    padding-top: 1.1rem;
    border-top: 1px solid ${({ theme }) => theme.colors.gray5};
  }

  .commentHead {
    height: 24px;
    width: min(28%, 180px);
  }

  .commentComposer {
    height: 108px;
    width: 100%;
  }

  .commentRow {
    height: 72px;
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

  @media (min-width: 1280px) {
    .layout {
      grid-template-columns: minmax(0, 1fr) 17rem;
      align-items: start;
    }

    .rail {
      display: grid;
    }
  }
`
