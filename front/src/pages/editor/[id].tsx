import { NextPage } from "next"
import { AdminPageProps } from "src/libs/server/adminPage"
import { EditorStudioPage, getEditorStudioPageProps } from "src/routes/Admin/EditorStudioPage"

export const getServerSideProps = getEditorStudioPageProps

const EditorPostPage: NextPage<AdminPageProps> = (props) => <EditorStudioPage {...props} />

export default EditorPostPage
