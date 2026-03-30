import { NextPage } from "next"
import { AdminPageProps } from "src/libs/server/adminPage"
import { getEditorStudioPageProps } from "src/routes/Admin/EditorStudioPage"
import { EditorActualPreviewPage } from "src/routes/Admin/EditorActualPreviewPage"

export const getServerSideProps = getEditorStudioPageProps

const EditorPostActualPreviewRoute: NextPage<AdminPageProps> = (props) => <EditorActualPreviewPage {...props} />

export default EditorPostActualPreviewRoute
