import { GetServerSideProps } from "next"
import { getPostDetailById } from "src/apis"
import CustomError from "src/routes/Error"
import { toCanonicalPostPath } from "src/libs/utils/postPath"
import { NextPageWithLayout } from "src/types"

type LegacyPageRouteProps = {
  notFoundLegacy: true
}

export const getServerSideProps: GetServerSideProps<LegacyPageRouteProps> = async ({ params, res }) => {
  const rawPageId = Array.isArray(params?.pageId) ? params?.pageId[0] : params?.pageId
  const pageId = typeof rawPageId === "string" ? rawPageId.trim() : ""

  if (pageId) {
    try {
      const post = await getPostDetailById(pageId)
      if (post) {
        return {
          redirect: {
            destination: toCanonicalPostPath(post.id),
            permanent: true,
          },
        }
      }
    } catch {
      // Legacy route must fail closed to a rendered 404 page instead of surfacing
      // a client-side "Failed to load static props" error from an SSG 404.
    }
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

const LegacyPageRoute: NextPageWithLayout<LegacyPageRouteProps> = () => <CustomError />

LegacyPageRoute.getLayout = (page) => <>{page}</>

export default LegacyPageRoute
