import { GetServerSideProps } from "next"
import { getPostDetailById } from "src/apis"
import CustomError from "src/routes/Error"
import { extractPostIdFromLegacySlug, toCanonicalPostPath } from "src/libs/utils/postPath"
import { NextPageWithLayout, type PostDetail } from "src/types"

type LegacySlugRouteProps = {
  notFoundLegacy: true
}

type LegacySlugPostLoader = (id: string) => Promise<PostDetail | null>

export const createLegacySlugServerSideProps =
  (loadPost: LegacySlugPostLoader = getPostDetailById): GetServerSideProps<LegacySlugRouteProps> =>
  async ({ params, res }) => {
    const slug = params?.slug as string
    const postId = extractPostIdFromLegacySlug(slug)

    if (!postId) {
      return { notFound: true }
    }

    try {
      const post = await loadPost(String(postId))
      if (post) {
        return {
          redirect: {
            destination: toCanonicalPostPath(post.id),
            permanent: true,
          },
        }
      }

      return { notFound: true }
    } catch {
      // Legacy route must fail closed to a rendered 404 page instead of surfacing
      // a client-side "Failed to load static props" error from an SSG 404.
    }

    if (res) {
      res.statusCode = 404
    }

    return {
      props: {
        notFoundLegacy: true,
      },
    }
  }

export const getServerSideProps = createLegacySlugServerSideProps()

const LegacyPostRedirectPage: NextPageWithLayout<LegacySlugRouteProps> = () => <CustomError />

LegacyPostRedirectPage.getLayout = (page) => <>{page}</>

export default LegacyPostRedirectPage
