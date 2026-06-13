import type { GetServerSideProps, NextPage } from "next"
import type { AdminPageProps } from "src/libs/server/adminPage"
import { getAdminPageProps } from "src/libs/server/adminPage"
import AdminShell from "src/routes/Admin/AdminShell"
import AdminCloudWorkspacePage from "src/routes/Admin/AdminCloudWorkspacePage"

export const getServerSideProps: GetServerSideProps<AdminPageProps> = async ({ req }) => getAdminPageProps(req)

const AdminCloudPage: NextPage<AdminPageProps> = ({ initialMember, initialProfileSnapshot }) => (
  <AdminShell currentSection="cloud" member={initialMember} profileSnapshot={initialProfileSnapshot}>
    <AdminCloudWorkspacePage />
  </AdminShell>
)

export default AdminCloudPage
