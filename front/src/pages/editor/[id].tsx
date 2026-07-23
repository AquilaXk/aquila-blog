import { NextPage } from "next"
import {
  EditorStudioPage,
  getEditorStudioPageProps,
  type EditorStudioPageProps,
} from "src/routes/Admin/EditorStudioPage"

export const getServerSideProps = getEditorStudioPageProps

const EditorPostPage: NextPage<EditorStudioPageProps> = (props) => <EditorStudioPage {...props} />

export default EditorPostPage
