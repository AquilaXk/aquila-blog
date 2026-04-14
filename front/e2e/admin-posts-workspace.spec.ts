import { readFileSync } from "node:fs"
import path from "node:path"
import { expect, test } from "@playwright/test"

test.describe("admin posts workspace link contract", () => {
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
    expect(source).toContain('<span className="author">{row.authorName || "작성자 미상"}</span>')
    expect(source).not.toContain('<div className="titleRow">')
    expect(source).toContain("copyPostDetailLink(row)")
    expect(source).not.toContain("상세 열기")
    expect(source).toContain("링크 복사")
    expect(source).toContain("recentPosts.slice(0, 3)")
    expect(source).toContain("grid-template-columns: minmax(14rem, 0.74fr) minmax(0, 1.26fr);")
    expect(source).toContain("<h1>글 관리</h1>")
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
