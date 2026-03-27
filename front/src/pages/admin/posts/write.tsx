import { GetServerSideProps, NextPage } from "next"

export const getServerSideProps: GetServerSideProps = async (context) => {
  const postId = typeof context.query.postId === "string" ? context.query.postId.trim() : ""
  const source = typeof context.query.source === "string" ? context.query.source.trim() : ""

  if (postId) {
    return {
      redirect: {
        destination: `/editor/${encodeURIComponent(postId)}`,
        permanent: false,
      },
    }
  }

  if (source === "local-draft") {
    return {
      redirect: {
        destination: "/editor/new?source=local-draft",
        permanent: false,
      },
    }
  }

  return {
    redirect: {
      destination: "/editor/new",
      permanent: false,
    },
  }
}

const AdminPostsWriteRedirectPage: NextPage = () => null

export default AdminPostsWriteRedirectPage
