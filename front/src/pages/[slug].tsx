import { GetServerSideProps } from "next"
import { getPostDetailById } from "src/apis"
import { extractPostIdFromLegacySlug, toCanonicalPostPath } from "src/libs/utils/postPath"

export const getServerSideProps: GetServerSideProps = async ({ params }) => {
  const slug = params?.slug as string
  const postId = extractPostIdFromLegacySlug(slug)

  if (!postId) {
    return { notFound: true }
  }

  const post = await getPostDetailById(String(postId))
  if (!post) {
    return { notFound: true }
  }

  return {
    redirect: {
      destination: toCanonicalPostPath(post.id),
      permanent: true,
    },
  }
}

const LegacyPostRedirectPage = () => null

export default LegacyPostRedirectPage
