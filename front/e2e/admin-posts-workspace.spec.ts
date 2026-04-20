import { readFileSync } from "node:fs"
import path from "node:path"
import { expect, test } from "@playwright/test"

test.describe("admin posts workspace link contract", () => {
  test("posts workspace uses detail-like hero copy and checklist rail labels", () => {
    const source = readFileSync(path.resolve(__dirname, "../src/routes/Admin/AdminPostsWorkspacePage.tsx"), "utf8")

    expect(source).toContain("편집과 검수를 한 화면에서 이어갑니다")
    expect(source).toContain("최근 초안 복귀, 공개 상태 점검, 목록 필터링까지 지금 필요한 글 작업 흐름을 한곳에 모읍니다.")
    expect(source).toContain("<h2>검수 체크리스트</h2>")
    expect(source).toContain("<h2>상태 의미</h2>")
    expect(source).toContain("<h2>바로가기</h2>")
    expect(source).toContain("const WorkspaceRail = styled(AdminStickyRail)`")
    expect(source).toContain("position: sticky;")
    expect(source).toContain("top: calc(var(--app-header-height, 64px) + 0.55rem);")
  })

  test("관리자 글 목록은 제목 링크 same-tab 진입과 링크 복사 액션을 유지한다", () => {
    const source = readFileSync(path.resolve(__dirname, "../src/routes/Admin/AdminPostsWorkspacePage.tsx"), "utf8")

    expect(source).toContain('if (visibility === "PUBLIC_UNLISTED") return "링크 공개"')
    expect(source).toContain("const buildCanonicalPostUrl = (postId: string | number) => {")
    expect(source).toContain("const canOpenCanonicalPost = (row:")
    expect(source).toContain("AdminInlineActionRow,")
    expect(source).toContain("AdminStatusPill,")
    expect(source).toContain("AdminTextActionButton,")
    expect(source).toContain("const openCanonicalPost = useCallback(")
    expect(source).toContain("<TitleAnchor href={toCanonicalPostPath(row.id)} onClick={(event) => void openCanonicalPost(event, row)}>")
    expect(source).toContain("<TitleText>{getWorkspaceRowTitle(row)}</TitleText>")
    expect(source).toContain('<div className="metaRow">')
    expect(source).toContain("const buildWorkspaceAuthorFallbackInitial = (authorName: string) => {")
    expect(source).toContain('const renderAuthorMeta = (row: Pick<AdminPostListItem, "authorName" | "authorProfileImgUrl">) => {')
    expect(source).toContain('const avatarSrc = (row.authorProfileImgUrl || "").trim()')
    expect(source).toContain("<AuthorIdentity>")
    expect(source).toContain('<AuthorAvatarFrame aria-hidden="true" data-has-image={avatarSrc ? "true" : "false"}>')
    expect(source).toContain('<ProfileImage src={avatarSrc} alt="" fillContainer />')
    expect(source).toContain("{renderAuthorMeta(row)}")
    expect(source).not.toContain("resolveWorkspaceAuthorAvatarSrc")
    expect(source).not.toContain('<div className="titleRow">')
    expect(source).toContain("copyPostDetailLink(row)")
    expect(source).not.toContain("상세 열기")
    expect(source).toContain("링크 복사")
    expect(source).toContain("recentPosts.slice(0, 3)")
    expect(source).toContain("grid-template-columns: minmax(14rem, 0.74fr) minmax(0, 1.26fr);")
    expect(source).toContain("<h1>편집과 검수를 한 화면에서 이어갑니다</h1>")
    expect(source).toContain("const AuthorAvatarFrame = styled.span`")
    expect(source).not.toContain("SecondaryLinkButton")
    expect(source).toContain('<ResumeCardButton type="button" onClick={() => void openWriteRoute({ source: "local-draft" })}>')
    expect(source).toContain("const ResumeCardButton = styled.button`")
    expect(source).not.toContain('<PrimaryInlineButton type="button" onClick={() => void openWriteRoute({ source: "local-draft" })}>')
    expect(source).not.toContain('data-emphasis={localDraft ? "strong" : "soft"}')
    expect(source).not.toContain('data-clickable={localDraft ? "true" : undefined}')
  })

  test("관리자 작성 화면은 현재 편집 중인 글이면 visibility와 무관하게 canonical 링크 열기와 복사 액션을 노출한다", () => {
    const source = readFileSync(path.resolve(__dirname, "../src/routes/Admin/EditorStudioPage.tsx"), "utf8")

    expect(source).toContain("const canOpenCurrentPostDetail = editorMode === \"edit\" && postId.trim().length > 0")
    expect(source).toContain("copyPostDetailLink(postId, postTitle)")
    expect(source).toContain("openPostDetailRoute(postId)")
    expect(source).toContain("<EditorHeaderActionButton type=\"button\"")
    expect(source).toContain("상세 열기")
    expect(source).toContain("링크 복사")
  })

  test("canonical detail static props는 ISR 생성 실패 시 recovery shell로 폴백한다", () => {
    const source = readFileSync(path.resolve(__dirname, "../src/libs/server/postDetailPage.ts"), "utf8")

    expect(source).toContain("export const buildCanonicalPostDetailStaticProps = async (")
    expect(source).toContain("postDetail = await getPostDetailById(postId)")
    expect(source).toContain("const shouldServeClientRecoveryShell = shouldClientRecover || (IS_QA_STATIC_RECOVERY_MODE && !postDetail)")
    expect(source).toContain("if (!postDetail && !shouldServeClientRecoveryShell) return { notFound: true }")
    expect(source).toContain("revalidate: shouldServeClientRecoveryShell ? DETAIL_RECOVERY_REVALIDATE_SECONDS : DETAIL_ISR_REVALIDATE_SECONDS,")
  })
})
