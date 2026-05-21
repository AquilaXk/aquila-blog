import { readFileSync } from "node:fs"
import path from "node:path"
import { expect, test } from "@playwright/test"

test.describe("admin posts workspace link contract", () => {
  test("posts workspace uses detail-like hero copy and checklist rail labels", () => {
    const source = readFileSync(path.resolve(__dirname, "../src/routes/Admin/AdminPostsWorkspacePage.tsx"), "utf8")
    const recentWorkSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/AdminPostsWorkspaceRecentWork.tsx"),
      "utf8"
    )

    expect(source).toContain("편집과 검수를 한 화면에서 이어갑니다")
    expect(source).not.toContain("최근 초안 복귀, 공개 상태 점검, 목록 필터링까지 지금 필요한 글 작업 흐름을 한곳에 모읍니다.")
    expect(source).not.toContain("<h2>검수 체크리스트</h2>")
    expect(source).not.toContain("<h2>상태 의미</h2>")
    expect(source).not.toContain("<h2>바로가기</h2>")
    expect(source).not.toContain("const WorkspaceRail = styled(AdminStickyRail)`")
    expect(recentWorkSource).toContain("grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));")
  })

  test("관리자 글 목록은 제목 링크 same-tab 진입과 링크 복사 액션을 유지한다", () => {
    const source = readFileSync(path.resolve(__dirname, "../src/routes/Admin/AdminPostsWorkspacePage.tsx"), "utf8")
    const listSource = readFileSync(path.resolve(__dirname, "../src/routes/Admin/AdminPostsWorkspaceList.tsx"), "utf8")
    const modelSource = readFileSync(path.resolve(__dirname, "../src/routes/Admin/AdminPostsWorkspaceModel.ts"), "utf8")
    const recentWorkSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/AdminPostsWorkspaceRecentWork.tsx"),
      "utf8"
    )

    expect(modelSource).toContain('if (visibility === "PUBLIC_UNLISTED") return "링크 공개"')
    expect(source).toContain("const buildCanonicalPostUrl = (postId: string | number) => {")
    expect(modelSource).toContain("export const canOpenCanonicalPost = (row:")
    expect(listSource).toContain("AdminInlineActionRow,")
    expect(listSource).toContain("AdminStatusPill,")
    expect(listSource).toContain("AdminTextActionButton,")
    expect(source).toContain("const openCanonicalPost = useCallback(")
    expect(listSource).toContain("<TitleAnchor href={toCanonicalPostPath(row.id)} onClick={(event) => onOpenCanonicalPost(event, row)}>")
    expect(listSource).toContain("<TitleText>{getWorkspaceRowTitle(row)}</TitleText>")
    expect(listSource).toContain('<div className="metaRow">')
    expect(modelSource).toContain("export const buildWorkspaceAuthorFallbackInitial = (authorName: string) => {")
    expect(listSource).toContain('const renderAuthorMeta = (row: Pick<AdminPostListItem, "authorName" | "authorProfileImgUrl">) => {')
    expect(listSource).toContain('const avatarSrc = (row.authorProfileImgUrl || "").trim()')
    expect(listSource).toContain("<AuthorIdentity>")
    expect(listSource).toContain('<AuthorAvatarFrame aria-hidden="true" data-has-image={avatarSrc ? "true" : "false"}>')
    expect(listSource).toContain('<ProfileImage src={avatarSrc} alt="" fillContainer />')
    expect(listSource).toContain("{renderAuthorMeta(row)}")
    expect(listSource).not.toContain("resolveWorkspaceAuthorAvatarSrc")
    expect(listSource).not.toContain('<div className="titleRow">')
    expect(source).toContain("copyPostDetailLink(row)")
    expect(listSource).not.toContain("상세 열기")
    expect(listSource).toContain("링크 복사")
    expect(recentWorkSource).toContain("recentPosts.slice(0, 3)")
    expect(recentWorkSource).toContain("grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));")
    expect(source).toContain("<h1>편집과 검수를 한 화면에서 이어갑니다</h1>")
    expect(listSource).toContain("const AuthorAvatarFrame = styled.span`")
    expect(listSource).not.toContain("SecondaryLinkButton")
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
    const source = readFileSync(path.resolve(__dirname, "../src/routes/Admin/EditorStudioPage.tsx"), "utf8")
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
