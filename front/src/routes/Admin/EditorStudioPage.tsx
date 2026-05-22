import type { GetServerSideProps, NextPage } from "next"
import type { AuthMember } from "src/hooks/useAuthSession"
import {
  buildAdminPagePropsFromMember,
  getAdminPageProps,
  readAdminProtectedBootstrap,
  type AdminPageProps,
} from "src/libs/server/adminPage"
import { EditorStudioWorkspaceController } from "./EditorStudioWorkspaceController"

const EDITOR_NEW_ROUTE_PATH = "/editor/new"

export const getEditorStudioPageProps: GetServerSideProps<AdminPageProps> = async ({ req }) => {
  const bootstrapResult = await readAdminProtectedBootstrap<{
    member: AuthMember
    profile: Partial<AuthMember>
  }>(req, "/member/api/v1/adm/members/bootstrap", EDITOR_NEW_ROUTE_PATH)

  if (bootstrapResult.ok) {
    const { member, profile } = bootstrapResult.value
    const mergedMember: AuthMember = {
      ...member,
      profileImageDirectUrl:
        profile.profileImageDirectUrl ||
        profile.profileImageUrl ||
        member.profileImageDirectUrl ||
        member.profileImageUrl ||
        "",
      profileImageUrl:
        profile.profileImageUrl ||
        profile.profileImageDirectUrl ||
        member.profileImageUrl ||
        member.profileImageDirectUrl ||
        "",
      profileRole: profile.profileRole || member.profileRole || "",
      profileBio: profile.profileBio || member.profileBio || "",
      aboutRole: profile.aboutRole || member.aboutRole || "",
      aboutBio: profile.aboutBio || member.aboutBio || "",
      aboutDetails: profile.aboutDetails || member.aboutDetails || "",
      blogTitle: profile.blogTitle || member.blogTitle || "",
      homeIntroTitle: profile.homeIntroTitle || member.homeIntroTitle || "",
      homeIntroDescription:
        profile.homeIntroDescription || member.homeIntroDescription || "",
    }

    return {
      props: buildAdminPagePropsFromMember(mergedMember),
    }
  }

  if (bootstrapResult.destination) {
    return {
      redirect: {
        destination: bootstrapResult.destination,
        permanent: false,
      },
    }
  }

  return await getAdminPageProps(req)
}

export const EditorStudioPage: NextPage<AdminPageProps> = (props) => (
  <EditorStudioWorkspaceController {...props} />
)

export default EditorStudioPage
