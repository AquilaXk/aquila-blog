import { NextPage } from "next"
import { AdminProfileWorkspaceSections } from "src/routes/Admin/AdminProfileWorkspaceSections"
import { type AdminProfileWorkspacePageProps, useAdminProfileWorkspacePageModel } from "src/routes/Admin/AdminProfileWorkspacePageModel"

const AdminProfileWorkspacePage: NextPage<AdminProfileWorkspacePageProps> = (props) => {
  const profileWorkspaceSectionProps = useAdminProfileWorkspacePageModel(props)

  if (!profileWorkspaceSectionProps) return null

  return <AdminProfileWorkspaceSections {...profileWorkspaceSectionProps} />
}

export default AdminProfileWorkspacePage
