import { GetServerSideProps, NextPage } from "next"

export const getServerSideProps: GetServerSideProps = async () => {
  return {
    redirect: {
      destination: "/admin/posts",
      permanent: false,
    },
  }
}

const AdminPostsNewRedirectPage: NextPage = () => null

export default AdminPostsNewRedirectPage
