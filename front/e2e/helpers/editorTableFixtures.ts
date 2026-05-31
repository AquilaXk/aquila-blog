import { expect, type Page } from "@playwright/test"
import { expectEditorToContainLoadedText } from "./editorAuthoringFlow"

export const editorSevenByThreeTableMarkdown = [
  '<!-- aq-table {"overflowMode":"normal","columnWidths":[160,220,220]} -->',
  "| **영역** | **점검 항목** | **확인 기준** |",
  "| --- | --- | --- |",
  "| 개념 이해 | Stateless 의미 | 요청만으로 처리 가능한가 |",
  "| 토큰 구조 | Access Token | 역할 명확 |",
  "| 흐름 | 재발급 로직 | 구현되어 있는가 |",
  "| 예외 | 동시 요청 | 처리 안정성 확인 |",
  "| 정책 | 재시도 정책 | idempotent 검토 여부 |",
  "| UI | 행 선택 | 접근성 경로 검증 |",
].join("\n")

const adminMember = {
  id: 1,
  username: "qa-admin",
  nickname: "aquila",
  isAdmin: true,
}

export const mockEditorRouteWithSevenByThreeTable = async (
  page: Page,
  options: { postId: number; title: string; lead?: string; tail?: string }
) => {
  const { postId, title, lead = "7x3 table lead paragraph", tail = "7x3 table trailing paragraph" } = options
  const content = [lead, editorSevenByThreeTableMarkdown, tail].join("\n\n")

  await page.route("**/member/api/v1/auth/me", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(adminMember),
    })
  })
  await page.route(`**/post/api/v1/adm/posts/${postId}`, async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        id: postId,
        version: 1,
        title,
        content,
        contentHtml: null,
        published: true,
        listed: true,
      }),
    })
  })

  await page.goto(`/editor/${postId}`)

  const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
  await expect(page.getByPlaceholder("제목을 입력하세요").first()).toHaveValue(title)
  await expectEditorToContainLoadedText(editor, "구현되어 있는가")
  await expect(editor.locator("table tr")).toHaveCount(7)
  await expect(editor.locator("table tr").first().locator("th, td")).toHaveCount(3)

  return { content, editor }
}
