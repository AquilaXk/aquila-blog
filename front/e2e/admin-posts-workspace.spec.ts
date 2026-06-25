import { readFileSync } from "node:fs"
import path from "node:path"
import { expect, test } from "@playwright/test"

test.describe("admin posts workspace link contract", () => {
  test("posts workspace uses detail-like hero copy and checklist rail labels", () => {
    const source = readFileSync(path.resolve(__dirname, "../src/routes/Admin/AdminPostsWorkspacePage.tsx"), "utf8")
    const pageViewSource = readFileSync(path.resolve(__dirname, "../src/routes/Admin/AdminPostsWorkspacePageView.tsx"), "utf8")
    const recentWorkSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/AdminPostsWorkspaceRecentWork.tsx"),
      "utf8"
    )

    expect(pageViewSource).toContain("<h1>글 관리</h1>")
    expect(source).not.toContain("최근 초안 복귀, 공개 상태 점검, 목록 필터링까지 지금 필요한 글 작업 흐름을 한곳에 모읍니다.")
    expect(source).not.toContain("<h2>검수 체크리스트</h2>")
    expect(source).not.toContain("<h2>상태 의미</h2>")
    expect(source).not.toContain("<h2>바로가기</h2>")
    expect(source).not.toContain("const WorkspaceRail = styled(AdminStickyRail)`")
    expect(recentWorkSource).toContain("grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));")
  })

  test("관리자 글 목록은 V4 table row editor 진입 계약을 유지한다", () => {
    const listSource = readFileSync(path.resolve(__dirname, "../src/routes/Admin/AdminPostsWorkspaceList.tsx"), "utf8")
    const listStyleSource = readFileSync(path.resolve(__dirname, "../src/routes/Admin/AdminPostsWorkspaceList.styles.ts"), "utf8")
    const modelSource = readFileSync(path.resolve(__dirname, "../src/routes/Admin/AdminPostsWorkspaceModel.ts"), "utf8")
    const pageSource = readFileSync(path.resolve(__dirname, "../src/routes/Admin/AdminPostsWorkspacePage.tsx"), "utf8")
    const pageViewSource = readFileSync(path.resolve(__dirname, "../src/routes/Admin/AdminPostsWorkspacePageView.tsx"), "utf8")
    const recentWorkSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/AdminPostsWorkspaceRecentWork.tsx"),
      "utf8"
    )

    expect(modelSource).toContain('if (visibility === "PUBLIC_UNLISTED") return "링크 공개"')
    expect(listSource).toContain('from "./AdminPostsWorkspaceList.styles"')
    expect(listStyleSource).toContain("AdminInlineActionRow,")
    expect(listStyleSource).toContain("AdminStatusPill,")
    expect(listStyleSource).toContain("AdminTextActionButton,")
    expect(listSource).toContain('<th className="selectCell"></th>')
    expect(listSource).toContain("<th>Title</th>")
    expect(listSource).toContain('<th className="topicCell">Topic</th>')
    expect(listSource).toContain('<th className="statusCell">Status</th>')
    expect(listSource).toContain('<th className="dateCell">Updated</th>')
    expect(listSource).toContain('<th className="viewsCell">{isDeletedScope ? "Actions" : "Views"}</th>')
    expect(listSource).toContain("const openEditorForRow = (row: AdminPostListItem) => onOpenWriteRoute({ postId: String(row.id) })")
    expect(listSource).toContain("<TitleButton type=\"button\" onClick={() => openEditorForRow(row)}>")
    expect(listSource).not.toContain('role={isDeletedScope ? undefined : "button"}')
    expect(listSource).toContain("onRestorePost(row)")
    expect(listSource).toContain("onHardDeletePost(row)")
    expect(listSource).toContain("onDeletePost(row)")
    expect(listSource).toContain("onClick={() => onPageChange(currentPage + 1)}")
    expect(listStyleSource).toContain("export const PageFooter = styled(ActionRow)`")
    expect(listStyleSource).toContain("export const TitleButton = styled.button`")
    expect(pageSource).toContain("listPage={listPage}")
    expect(pageSource).toContain("status: listStatus")
    expect(pageSource).not.toContain("for (let pageNumber")
    expect(pageSource).not.toContain("const displayListState = useMemo")
    expect(modelSource).toContain("if (isServerTempDraftPost(row)) return \"draft\"")
    expect(modelSource).toContain('query.set("status", options.status)')
    expect(listSource).toContain("<TitleButton type=\"button\" onClick={() => openEditorForRow(row)}>")
    expect(listSource).toContain('const getStatusLabel = (row: AdminPostListItem) => (listScope === "deleted" ? "삭제됨" : workspaceStatusLabel(row))')
    expect(listSource).toContain('const getStatusTone = (row: AdminPostListItem) => (listScope === "deleted" ? "PRIVATE" : toVisibility(row.published, row.listed))')
    expect(listSource).toContain('<span className="dateCell">Updated</span>')
    expect(listSource).toContain('<div className="cell viewsCell">')
    expect(listSource).toContain('<div className="metaRow">')
    expect(listSource).toContain("getWorkspaceTopicLabel(row)")
    expect(listSource).toContain("formatWorkspaceViews(row)")
    expect(modelSource).toContain('tags?: string[]')
    expect(listSource).not.toContain('<div className="titleRow">')
    expect(listSource).not.toContain("TitleAnchor")
    expect(listSource).not.toContain("상세 열기")
    expect(listSource).not.toContain("링크 복사")
    expect(recentWorkSource).toContain("recentPosts.slice(0, 3)")
    expect(recentWorkSource).toContain("grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));")
    expect(pageViewSource).toContain("<h1>글 관리</h1>")
    expect(recentWorkSource).toContain('<ResumeCardButton type="button" onClick={() => onOpenWriteRoute({ source: "local-draft" })}>')
    expect(recentWorkSource).toContain("const ResumeCardButton = styled.button`")
    expect(recentWorkSource).not.toContain('<PrimaryInlineButton type="button" onClick={() => onOpenWriteRoute({ source: "local-draft" })}>')
    expect(recentWorkSource).not.toContain('data-emphasis={localDraft ? "strong" : "soft"}')
    expect(recentWorkSource).not.toContain('data-clickable={localDraft ? "true" : undefined}')
  })

  test("브라우저 임시저장 카드는 본문 markdown preview를 직접 노출하지 않는다", () => {
    const source = readFileSync(path.resolve(__dirname, "../src/routes/Admin/AdminPostsWorkspaceRecentWork.tsx"), "utf8")

    expect(source).not.toContain("summary: summary || content.slice(0, 120)")
    expect(source).not.toContain("{localDraft.summary ? <ResumeDescription>{localDraft.summary}</ResumeDescription> : null}")
    expect(source).toContain("{localDraft.savedAt ? <span>{formatDateTime(localDraft.savedAt)}</span> : null}")
    expect(source).toContain("<ResumeTitle>{localDraft.title}</ResumeTitle>")
  })

  test("글 관리 API 실패 문구는 raw fetch detail을 사용자-facing 상태에 직접 노출하지 않는다", () => {
    const source = readFileSync(path.resolve(__dirname, "../src/routes/Admin/AdminPostsWorkspacePage.tsx"), "utf8")

    expect(source).toContain("POSTS_LIST_LOAD_ERROR_MESSAGE")
    expect(source).toContain("RECENT_POSTS_UNAVAILABLE_MESSAGE")
    expect(source).not.toContain("글 목록을 불러오지 못했습니다: ${message}")
    expect(source).not.toContain("최근 글을 불러오지 못했습니다: ${message}")
  })

  test("관리자 작성 화면은 현재 편집 중인 글이면 visibility와 무관하게 canonical 링크 열기와 복사 액션을 노출한다", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/EditorStudioWorkspaceControllerRootView.tsx"),
      "utf8"
    )
    const editorSurfaceSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/EditorStudioDedicatedEditorSurface.tsx"),
      "utf8"
    )

    expect(source).toContain("const canOpenCurrentPostDetail = editorMode === \"edit\" && postId.trim().length > 0")
    expect(source).toContain("copyPostDetailLink(postId, postTitle)")
    expect(source).toContain("openPostDetailRoute(postId)")
    expect(editorSurfaceSource).toContain("<EditorHeaderActionButton type=\"button\" onClick={onOpenPostDetail}>")
    expect(editorSurfaceSource).toContain("상세 열기")
    expect(editorSurfaceSource).toContain("링크 복사")
  })

  test("canonical detail static props는 ISR 생성 실패 시 recovery shell로 폴백한다", () => {
    const source = readFileSync(path.resolve(__dirname, "../src/libs/server/postDetailPage.ts"), "utf8")

    expect(source).toContain("export const buildCanonicalPostDetailStaticProps = async (")
    expect(source).toContain("postDetail = await getPostDetailById(postId)")
    expect(source).toContain("const shouldServeClientRecoveryShell = shouldClientRecover || (IS_QA_STATIC_RECOVERY_MODE && !postDetail)")
    expect(source).toContain("if (!postDetail && !shouldServeClientRecoveryShell) return { notFound: true }")
    expect(source).toContain("revalidate:")
    expect(source).toContain('shouldServeClientRecoveryShell || initialAdminProfileSource === "static-fallback"')
    expect(source).toContain("? DETAIL_RECOVERY_REVALIDATE_SECONDS")
    expect(source).toContain(": DETAIL_ISR_REVALIDATE_SECONDS,")
  })
})
