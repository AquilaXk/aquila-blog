import { readFileSync } from "node:fs"
import path from "node:path"
import { expect, test } from "@playwright/test"

test.describe("admin posts workspace link contract", () => {
  test("관리자 글 목록은 링크 공개 라벨과 canonical 링크 액션을 유지한다", () => {
    const source = readFileSync(path.resolve(__dirname, "../src/routes/Admin/AdminPostsWorkspacePage.tsx"), "utf8")

    expect(source).toContain('if (visibility === "PUBLIC_UNLISTED") return "링크 공개"')
    expect(source).toContain("const buildCanonicalPostUrl = (postId: string | number) => {")
    expect(source).toContain('window.open(path, "_blank", "noopener,noreferrer")')
    expect(source).toContain("copyPostDetailLink(row)")
    expect(source).toContain("상세 열기")
    expect(source).toContain("링크 복사")
  })

  test("관리자 작성 화면은 현재 공개 글의 canonical 링크 열기와 복사 액션을 노출한다", () => {
    const source = readFileSync(path.resolve(__dirname, "../src/routes/Admin/EditorStudioPage.tsx"), "utf8")

    expect(source).toContain("const canOpenCurrentPostDetail = editorMode === \"edit\" && currentFlags.published && postId.trim().length > 0")
    expect(source).toContain("copyPostDetailLink(postId, postTitle)")
    expect(source).toContain("openPostDetailRoute(postId)")
    expect(source).toContain("<EditorHeaderActionButton type=\"button\"")
    expect(source).toContain("상세 열기")
    expect(source).toContain("링크 복사")
  })
})
