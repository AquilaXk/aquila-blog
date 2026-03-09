import { GetStaticProps } from "next"
import { NextPageWithLayout } from "src/types"
import CustomError from "src/routes/Error"

export const getStaticPaths = async () => ({
  paths: [],
  fallback: "blocking",
})

export const getStaticProps: GetStaticProps = async () => {
  return { notFound: true }
}

const LegacyPageRoute: NextPageWithLayout = () => <CustomError />

LegacyPageRoute.getLayout = (page) => <>{page}</>

export default LegacyPageRoute
