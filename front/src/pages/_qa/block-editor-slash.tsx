import type { GetServerSideProps, NextPage } from "next"
import type { AuthMember } from "src/hooks/useAuthSession"
import { queryKey } from "src/constants/queryKey"
import { createQueryClient } from "src/libs/react-query"
import type { AdminPageProps } from "src/libs/server/adminPage"
import { dehydrate } from "@tanstack/react-query"
import { EditorStudioPage } from "src/routes/Admin/EditorStudioPage"
import { QaEditorHarness } from "src/routes/Admin/QaEditorHarness"

type QaBlockEditorSlashPageProps = {
  enabled: boolean
  surface: "writer" | "engine"
  seedMarkdown: string
} & AdminPageProps

const QA_MOCK_MEMBER: AuthMember = {
  id: 0,
  username: "qa-engine",
  nickname: "qa-engine",
  isAdmin: true,
  profileImageUrl: "",
  profileImageDirectUrl: "",
  profileRole: "",
  profileBio: "",
}

export const getServerSideProps: GetServerSideProps<QaBlockEditorSlashPageProps> = async (context) => {
  const host = String(context.req.headers.host || "").toLowerCase()
  const isLocalQaHost =
    host.startsWith("localhost:") ||
    host.startsWith("127.0.0.1:") ||
    host === "localhost" ||
    host === "127.0.0.1"
  const qaRoutesEnabled =
    process.env.ENABLE_QA_ROUTES === "true" || process.env.NODE_ENV !== "production" || isLocalQaHost
  if (!qaRoutesEnabled) {
    return { notFound: true }
  }

  const rawSurface = typeof context.query.surface === "string" ? context.query.surface.trim().toLowerCase() : ""
  const surface: QaBlockEditorSlashPageProps["surface"] = rawSurface === "engine" ? "engine" : "writer"
  const seedMarkdown =
    typeof context.query.seed === "string"
      ? context.query.seed.replace(/\\n/g, "\n")
      : ""
  const queryClient = createQueryClient()
  queryClient.setQueryData(queryKey.authMe(), QA_MOCK_MEMBER)
  queryClient.setQueryData(queryKey.authMeProbe(), true)

  return {
    props: {
      enabled: true,
      surface,
      seedMarkdown,
      initialMember: QA_MOCK_MEMBER,
      dehydratedState: dehydrate(queryClient),
    },
  }
}

const QaBlockEditorSlashPage: NextPage<QaBlockEditorSlashPageProps> = (props) => {
  if (props.surface === "writer") {
    return <EditorStudioPage {...props} />
  }

  return <QaEditorHarness seedMarkdown={props.seedMarkdown} />
}

export default QaBlockEditorSlashPage
