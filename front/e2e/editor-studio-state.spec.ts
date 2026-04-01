import { readFileSync } from "node:fs"
import path from "node:path"
import { expect, test } from "@playwright/test"
import { getServerSideProps as getEditPageServerSideProps } from "src/pages/editor/[id]"
import { getServerSideProps as getNewPageServerSideProps } from "src/pages/editor/new"
import {
  deriveEditorPersistenceState,
  isPublishActionDisabled,
} from "src/routes/Admin/editorStudioState"
import { getEditorStudioPageProps } from "src/routes/Admin/EditorStudioPage"

test.describe("editor studio state", () => {
  test("기존 글은 서버 baseline과 같으면 저장됨으로 본다", () => {
    const state = deriveEditorPersistenceState({
      editorMode: "edit",
      hasSelectedManagedPost: true,
      hasEditorDraftContent: true,
      editorStateFingerprint: "server:1",
      serverBaselineFingerprint: "server:1",
      localDraftFingerprint: "local:1",
      localDraftSavedAt: "",
      loadingKey: "",
    })

    expect(state.text).toBe("저장됨")
    expect(state.tone).toBe("success")
    expect(state.isPersistedEditBaseline).toBe(true)
  })

  test("기존 글을 수정하면 저장되지 않은 변경으로 본다", () => {
    const state = deriveEditorPersistenceState({
      editorMode: "edit",
      hasSelectedManagedPost: true,
      hasEditorDraftContent: true,
      editorStateFingerprint: "server:2",
      serverBaselineFingerprint: "server:1",
      localDraftFingerprint: "local:1",
      localDraftSavedAt: "2026-03-28T10:00:00",
      loadingKey: "",
    })

    expect(state.text).toBe("저장되지 않은 변경")
    expect(state.tone).toBe("idle")
    expect(state.isPersistedEditBaseline).toBe(false)
  })

  test("새 글은 local draft와 같으면 자동 저장됨으로 본다", () => {
    const state = deriveEditorPersistenceState({
      editorMode: "create",
      hasSelectedManagedPost: false,
      hasEditorDraftContent: true,
      editorStateFingerprint: "local:1",
      serverBaselineFingerprint: "",
      localDraftFingerprint: "local:1",
      localDraftSavedAt: "2026-03-28T10:00:00",
      loadingKey: "",
    })

    expect(state.text).toBe("자동 저장됨")
    expect(state.tone).toBe("success")
    expect(state.isAutoSavedCreateDraft).toBe(true)
  })

  test("수정 반영 버튼은 edit mode + not loading + 최소 유효성일 때만 활성이다", () => {
    expect(
      isPublishActionDisabled({
        publishActionType: "modify",
        editorMode: "edit",
        loadingKey: "",
        hasEditorMinimumFields: true,
        hasPlaceholderIssue: false,
      })
    ).toBe(false)

    expect(
      isPublishActionDisabled({
        publishActionType: "modify",
        editorMode: "create",
        loadingKey: "",
        hasEditorMinimumFields: true,
        hasPlaceholderIssue: false,
      })
    ).toBe(true)

    expect(
      isPublishActionDisabled({
        publishActionType: "modify",
        editorMode: "edit",
        loadingKey: "modifyPost",
        hasEditorMinimumFields: true,
        hasPlaceholderIssue: false,
      })
    ).toBe(true)

    expect(
      isPublishActionDisabled({
        publishActionType: "modify",
        editorMode: "edit",
        loadingKey: "",
        hasEditorMinimumFields: false,
        hasPlaceholderIssue: false,
      })
    ).toBe(true)

    expect(
      isPublishActionDisabled({
        publishActionType: "modify",
        editorMode: "edit",
        loadingKey: "",
        hasEditorMinimumFields: true,
        hasPlaceholderIssue: true,
      })
    ).toBe(true)
  })

  test("새 글/수정 전용 라우트는 동일한 EditorStudioPage와 SSR props를 공유한다", () => {
    expect(getNewPageServerSideProps).toBe(getEditorStudioPageProps)
    expect(getEditPageServerSideProps).toBe(getEditorStudioPageProps)

    const editorNewSource = readFileSync(path.resolve(__dirname, "../src/pages/editor/new.tsx"), "utf8")
    const editorEditSource = readFileSync(path.resolve(__dirname, "../src/pages/editor/[id].tsx"), "utf8")

    expect(editorNewSource).toContain("import { EditorStudioPage, getEditorStudioPageProps }")
    expect(editorEditSource).toContain("import { EditorStudioPage, getEditorStudioPageProps }")
    expect(editorNewSource).toContain("const EditorNewPage: NextPage<AdminPageProps> = (props) => <EditorStudioPage {...props} />")
    expect(editorEditSource).toContain("const EditorPostPage: NextPage<AdminPageProps> = (props) => <EditorStudioPage {...props} />")
  })

  test("editor studio는 v2 단일 경로와 단일 작성 모드 계약을 유지한다", () => {
    const editorStudioSource = readFileSync(path.resolve(__dirname, "../src/routes/Admin/EditorStudioPage.tsx"), "utf8")
    const blockEditorSource = readFileSync(path.resolve(__dirname, "../src/components/editor/BlockEditorShell.tsx"), "utf8")

    expect(editorStudioSource).not.toContain("BLOCK_EDITOR_V2_ENABLED")
    expect(editorStudioSource).not.toContain("EditorStudioLegacyToolbar")
    expect(editorStudioSource).not.toContain("RawMarkdownTextarea")
    expect(editorStudioSource).toContain("const isCompactSplitPreview = false")
    expect(editorStudioSource).toContain("width: min(100%, 1600px);")
    expect(editorStudioSource).toContain("grid-template-columns: minmax(0, 1fr);")
    expect(editorStudioSource.match(/<LazyBlockEditorShell/g)?.length).toBe(2)
    expect(editorStudioSource).not.toContain("EditorStudioPreviewColumn")
    expect(editorStudioSource).not.toContain('data-testid="editor-preview-body"')
    expect(editorStudioSource).not.toContain("LazyMarkdownRenderer")
    expect(editorStudioSource).not.toContain("공개 결과 미리보기")
    expect(editorStudioSource).not.toContain("실제 보기")
    expect(editorStudioSource).not.toContain("--editor-split-pane-width")
    expect(editorStudioSource).not.toContain('? "112rem" : "1600px"')
    expect(editorStudioSource).not.toContain("const LIVE_PREVIEW_RENDER_WIDTHS: Record<PreviewViewportMode, number> = {")
    expect(editorStudioSource).not.toContain('aria-label="미리보기 기기 폭"')
    expect(editorStudioSource).not.toContain('zoom: var(--preview-scale, 1);')
    expect(editorStudioSource).not.toContain("--preview-scale")
    expect(editorStudioSource).toContain("const EditorExitAction = styled.button`")
    expect(editorStudioSource).toContain("min-height: 42px;")
    expect(editorStudioSource).toContain("const EditorStudioFrame = styled.div`")
    expect(editorStudioSource).toContain("const EditorStudioWritingColumn = styled.section<{ $compact?: boolean }>`")

    expect(blockEditorSource).not.toContain("Markdown 편집")
    expect(blockEditorSource).not.toContain('label: "원문 블록"')
    expect(blockEditorSource).not.toContain("buildStructuredInsertContent")
    expect(blockEditorSource).not.toContain("insertRawMarkdownBlock")
    expect(blockEditorSource).toContain("const QuickInsertBar = styled.div`")
    expect(blockEditorSource).not.toContain("슬래시(`/`)나 `+` 없이도 자주 쓰는 블록을 바로 넣을 수 있습니다.")
    expect(blockEditorSource).toContain(".aq-block-editor__content blockquote {")
    expect(blockEditorSource).toContain("border-left: 4px solid")
    expect(blockEditorSource).toContain("border-radius: 0;")
  })

  test("editor studio는 SSR 관리자 스냅샷을 hydration auth race 동안 유지한다", () => {
    const editorStudioSource = readFileSync(path.resolve(__dirname, "../src/routes/Admin/EditorStudioPage.tsx"), "utf8")
    const navBarSource = readFileSync(path.resolve(__dirname, "../src/layouts/RootLayout/Header/NavBar.tsx"), "utf8")

    expect(editorStudioSource).toContain("const sessionMember = me || initialMember")
    expect(editorStudioSource).toContain("if (!sessionMember) {")
    expect(editorStudioSource).toContain("if (!router.isReady || !isDedicatedEditorRoute || !sessionMember?.isAdmin) return")
    expect(navBarSource).toContain('router.pathname.startsWith("/editor")')
  })

  test("QA route는 writer/engine surface 계약을 분리 유지한다", () => {
    const qaSource = readFileSync(path.resolve(__dirname, "../src/pages/_qa/block-editor-slash.tsx"), "utf8")

    expect(qaSource).toContain('surface: "writer" | "engine"')
    expect(qaSource).toContain('rawSurface === "engine" ? "engine" : "writer"')
    expect(qaSource).toContain('if (props.surface === "writer") {')
    expect(qaSource).toContain("return <EditorStudioPage {...props} />")
    expect(qaSource).toContain("return <QaEngineSurface />")
    expect(qaSource).toContain('import type { BlockEditorQaActions } from "src/components/editor/BlockEditorShell"')
    expect(qaSource).toContain('dynamic(() => import("src/components/editor/BlockEditorShell")')
    expect(qaSource).toContain("BlockEditorShell 엔진 QA")
    expect(qaSource).toContain("실제 글쓰기 화면 레이아웃과 제목 입력칸 회귀는")
  })
})
