import { NextPage } from "next"
import {
  AdminPostWorkspacePage,
  getAdminPostsWorkspacePageProps,
} from "src/routes/Admin/AdminPostsWorkspacePage"
import { AdminPageProps } from "src/libs/server/adminPage"

export const getServerSideProps = getAdminPostsWorkspacePageProps

const AdminPostsPage: NextPage<AdminPageProps> = (props) => <AdminPostWorkspacePage {...props} />

export default AdminPostsPage
