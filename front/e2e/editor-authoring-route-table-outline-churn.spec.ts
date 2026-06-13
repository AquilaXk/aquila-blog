import { readFileSync } from "fs"
import { expect, test } from "./helpers/authoringPlaywright"
import {
  POST_507_FINAL_TABLE_TARGET_CELL,
  mockEditorRouteWithPost507,
} from "./helpers/post507Fixtures"

const TABLE_CHROME_TRANSITION_RE = /\b(?:border-color|box-shadow|background(?:-color)?)\b/

test.describe("editor authoring route table outline churn", () => {
  test("table wrapper source contract는 caret-only click chrome transition을 두지 않는다", () => {
    const source = readFileSync("src/components/editor/BlockEditorEngine.editorSurfaceStyles.tsx", "utf8")
    const tableWrapperBlock = source.match(/\.aq-block-editor__content \.tableWrapper \{[\s\S]*?\n  \}/)?.[0] ?? ""
    const transitionDeclaration = tableWrapperBlock.match(/transition:\s*([\s\S]*?);/)?.[1] ?? ""
    expect(transitionDeclaration).not.toMatch(TABLE_CHROME_TRANSITION_RE)
  })

  test("실제 /editor/[id] 507 table wrapper는 border/shadow/background transition 대상이 아니다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1580, height: 900 })
    const { finalTable } = await mockEditorRouteWithPost507(page, {
      postId: 997,
      title: "live 507 table outline churn 글",
      version: 1,
    })
    const targetCell = finalTable.locator("td", { hasText: POST_507_FINAL_TABLE_TARGET_CELL }).first()
    await targetCell.scrollIntoViewIfNeeded()
    await targetCell.click()

    const tableChrome = await page.evaluate((tableText) => {
      const table = Array.from(document.querySelectorAll("table")).find((candidate) =>
        candidate.textContent?.includes(tableText)
      )
      const wrapper = table?.closest(".tableWrapper")
      if (!(wrapper instanceof HTMLElement)) throw new Error("post 507 table wrapper is missing")
      const style = window.getComputedStyle(wrapper)
      return {
        borderColor: style.borderColor,
        boxShadow: style.boxShadow,
        transitionDuration: style.transitionDuration,
        transitionProperty: style.transitionProperty,
      }
    }, POST_507_FINAL_TABLE_TARGET_CELL)

    expect(tableChrome.transitionProperty).not.toMatch(TABLE_CHROME_TRANSITION_RE)
  })
})
