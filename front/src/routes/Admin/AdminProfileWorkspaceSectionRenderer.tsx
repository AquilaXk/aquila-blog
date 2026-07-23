import { renderAdminProfileAboutSection } from "src/routes/Admin/AdminProfileWorkspaceAboutSection"
import { renderAdminProfileHomeSection } from "src/routes/Admin/AdminProfileWorkspaceHomeDesignSections"
import { renderAdminProfileIdentitySection } from "src/routes/Admin/AdminProfileWorkspaceIdentitySection"
import { renderAdminProfileLinksSection } from "src/routes/Admin/AdminProfileWorkspaceLinksSection"

export const renderAdminProfileWorkspaceSection = (props: Record<string, any>) => {
  switch (props.activeSection) {
    case "identity":
      return renderAdminProfileIdentitySection(props)
    case "about":
      return renderAdminProfileAboutSection(props)
    case "home":
      return renderAdminProfileHomeSection(props)
    case "links":
      return renderAdminProfileLinksSection(props)
    default:
      return null
  }
}
