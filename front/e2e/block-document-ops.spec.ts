import { expect, test } from "@playwright/test"
import {
  deleteTopLevelBlockAt,
  duplicateTopLevelBlockAt,
  insertTopLevelBlockAt,
  moveTopLevelBlockToInsertionIndex,
} from "src/components/editor/blockDocumentOps"
import type { BlockEditorDoc } from "src/components/editor/serialization"

const createDoc = (): BlockEditorDoc => ({
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "첫 제목" }] },
    { type: "paragraph", content: [{ type: "text", text: "본문 1" }] },
    { type: "paragraph", content: [{ type: "text", text: "본문 2" }] },
  ],
})

test.describe("block document ops", () => {
  test("top-level block insert 는 순서를 유지한다", () => {
    const nextDoc = insertTopLevelBlockAt(createDoc(), 1, [{ type: "horizontalRule" }])
    expect(nextDoc.content?.map((node) => node.type)).toEqual(["heading", "horizontalRule", "paragraph", "paragraph"])
  })

  test("top-level block duplicate 는 바로 다음에 복제한다", () => {
    const nextDoc = duplicateTopLevelBlockAt(createDoc(), 0)
    expect(nextDoc.content?.map((node) => node.type)).toEqual(["heading", "heading", "paragraph", "paragraph"])
    expect(nextDoc.content?.[1]?.content?.[0]).toEqual({ type: "text", text: "첫 제목" })
  })

  test("top-level block delete 는 문서가 비면 빈 paragraph 를 남긴다", () => {
    const singleDoc: BlockEditorDoc = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "단일 블록" }] }],
    }

    const nextDoc = deleteTopLevelBlockAt(singleDoc, 0)
    expect(nextDoc.content).toEqual([{ type: "paragraph" }])
  })

  test("top-level block move 는 insertion index 기준으로 재배치한다", () => {
    const nextDoc = moveTopLevelBlockToInsertionIndex(createDoc(), 0, 3)
    expect(nextDoc.content?.map((node) => node.type)).toEqual(["paragraph", "paragraph", "heading"])
    expect(nextDoc.content?.[2]?.content?.[0]).toEqual({ type: "text", text: "첫 제목" })
  })
})
