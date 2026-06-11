import { readFileSync } from "node:fs"
import path from "node:path"
import { expect, test } from "@playwright/test"

test.describe("editor save flush source contract", () => {
  const readSource = (relativePath: string) =>
    readFileSync(path.resolve(__dirname, `../src/${relativePath}`), "utf8")

  test("저장/발행/브라우저 임시저장은 pending editor markdown을 먼저 flush한다", () => {
    const blockEditorContractSource = readSource("components/editor/blockEditorContract.ts")
    const writerEditorHostSource = readSource("routes/Admin/WriterEditorHost.tsx")
    const blockEditorMarkdownCommitSource = readSource("components/editor/useBlockEditorMarkdownCommit.ts")
    const blockEditorControllerSource = readSource("components/editor/useBlockEditorEngineController.ts")
    const editorStudioRootSource = readSource("routes/Admin/EditorStudioWorkspaceControllerRoot.tsx")
    const editorStudioPersistenceSource = readSource("routes/Admin/useEditorStudioPersistence.ts")
    const editorStudioDraftLifecycleSource = readSource("routes/Admin/useEditorStudioDraftLifecycle.ts")
    const editorStudioDraftLifecycleModelSource = readSource("routes/Admin/useEditorStudioDraftLifecycleModel.ts")

    expect(blockEditorContractSource).toContain("export type BlockEditorMarkdownFlush = () => string")
    expect(blockEditorContractSource).toContain("onFlushMarkdownReady?:")
    expect(writerEditorHostSource).toContain("onFlushMarkdownReady:")
    expect(writerEditorHostSource).toContain("onFlushMarkdownReady={onFlushMarkdownReady}")
    expect(blockEditorMarkdownCommitSource).toContain("fallbackEditor?: TiptapEditor | null")
    expect(blockEditorControllerSource).toContain("onFlushMarkdownReady")
    expect(blockEditorControllerSource).toContain("const flushCurrentMarkdown = useCallback(")
    expect(editorStudioRootSource).toContain("const flushEditorMarkdownRef = useRef<BlockEditorMarkdownFlush | null>(null)")
    expect(editorStudioRootSource).toContain("const getCurrentPostContent = useCallback(")
    expect(editorStudioPersistenceSource).toContain("getCurrentPostContent:")
    expect(editorStudioPersistenceSource).not.toContain("const currentPostContent = postContentLiveRef.current")
    expect(editorStudioDraftLifecycleSource).toContain("getCurrentPostContent,")
    expect(editorStudioDraftLifecycleModelSource).toContain("const currentLocalDraftCore = {")
    expect(editorStudioDraftLifecycleModelSource).toContain("const currentLocalDraftFingerprint = buildLocalDraftFingerprint(currentLocalDraftCore)")
  })
})
