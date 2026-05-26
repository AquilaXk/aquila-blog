import type { GetServerSideProps, NextPage } from "next"
import type { AuthMember } from "src/hooks/useAuthSession"
import {
  buildAdminPagePropsFromMember,
  getAdminPageProps,
  readAdminProtectedBootstrap,
  type AdminPageProps,
} from "src/libs/server/adminPage"
import { serverApiFetch } from "src/libs/server/backend"
import type { PostForEditor } from "./EditorStudioWorkspaceControllerRootModel"
import { EditorStudioWorkspaceController } from "./EditorStudioWorkspaceController"

const EDITOR_NEW_ROUTE_PATH = "/editor/new"

export type EditorStudioPageProps = AdminPageProps & {
  initialEditorPost?: PostForEditor | null
}

const parseEditorPostId = (value: unknown) => {
  if (typeof value !== "string") return ""
  const normalized = value.trim()
  return /^\d+$/.test(normalized) ? normalized : ""
}

const toRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : null

const normalizeInitialEditorPost = (payload: unknown): PostForEditor | null => {
  const root = toRecord(payload)
  const candidate = toRecord(root?.data) ?? root
  if (!candidate) return null

  const rawId = candidate.id
  const id = typeof rawId === "number" ? rawId : typeof rawId === "string" ? Number.parseInt(rawId, 10) : NaN
  if (!Number.isInteger(id) || id <= 0) return null

  const rawVersion = candidate.version
  const version =
    typeof rawVersion === "number" && Number.isFinite(rawVersion) ? rawVersion : undefined
  const contentHtml = typeof candidate.contentHtml === "string" ? candidate.contentHtml : undefined

  return {
    id,
    title: typeof candidate.title === "string" ? candidate.title : "",
    content: typeof candidate.content === "string" ? candidate.content : "",
    ...(contentHtml === undefined ? {} : { contentHtml }),
    ...(version === undefined ? {} : { version }),
    published: candidate.published === true,
    listed: candidate.listed === true,
    ...(candidate.tempDraft === undefined ? {} : { tempDraft: candidate.tempDraft === true }),
  }
}

const fetchInitialEditorPost = async (req: Parameters<GetServerSideProps>[0]["req"], postId: string) => {
  if (!postId) return null

  try {
    const response = await serverApiFetch(req, `/post/api/v1/adm/posts/${postId}`, {
      cache: "no-store",
      timeoutMs: 6_000,
    })
    if (!response.ok) return null
    return normalizeInitialEditorPost(await response.json())
  } catch {
    return null
  }
}

export const getEditorStudioPageProps: GetServerSideProps<EditorStudioPageProps> = async ({ req, query }) => {
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

    const initialEditorPost = await fetchInitialEditorPost(req, parseEditorPostId(query.id))
    const baseProps = buildAdminPagePropsFromMember(mergedMember)

    return {
      props: {
        ...baseProps,
        initialEditorPost,
      },
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

export const EditorStudioPage: NextPage<EditorStudioPageProps> = (props) => (
  <EditorStudioWorkspaceController {...props} />
)

export default EditorStudioPage
