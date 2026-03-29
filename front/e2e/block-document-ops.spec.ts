import { expect, test } from "@playwright/test"
import {
  moveNestedListItemToInsertionIndex,
  moveTaskItemToInsertionIndex,
} from "src/components/editor/blockDocumentOps"
import type { BlockEditorDoc } from "src/components/editor/serialization"

test.describe("block document ops", () => {
  test("nested task list reorder 는 동일한 path 내부에서 순서를 바꾼다", () => {
    const doc: BlockEditorDoc = {
      type: "doc",
      content: [
        {
          type: "taskList",
          content: [
            {
              type: "taskItem",
              attrs: { checked: false },
              content: [
                { type: "paragraph", content: [{ type: "text", text: "상위 1" }] },
                {
                  type: "taskList",
                  content: [
                    {
                      type: "taskItem",
                      attrs: { checked: false },
                      content: [{ type: "paragraph", content: [{ type: "text", text: "하위 A" }] }],
                    },
                    {
                      type: "taskItem",
                      attrs: { checked: false },
                      content: [{ type: "paragraph", content: [{ type: "text", text: "하위 B" }] }],
                    },
                    {
                      type: "taskItem",
                      attrs: { checked: false },
                      content: [{ type: "paragraph", content: [{ type: "text", text: "하위 C" }] }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    }

    const moved = moveTaskItemToInsertionIndex(doc, 0, [0], 2, 0)
    const nestedItems = moved.content?.[0]?.content?.[0]?.content?.[1]?.content || []

    expect(nestedItems[0]?.content?.[0]?.content?.[0]?.text).toBe("하위 C")
    expect(nestedItems[1]?.content?.[0]?.content?.[0]?.text).toBe("하위 A")
    expect(nestedItems[2]?.content?.[0]?.content?.[0]?.text).toBe("하위 B")
  })

  test("nested bullet list reorder 는 task 외 리스트 트리에서도 순서를 바꾼다", () => {
    const doc: BlockEditorDoc = {
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                { type: "paragraph", content: [{ type: "text", text: "상위 1" }] },
                {
                  type: "bulletList",
                  content: [
                    {
                      type: "listItem",
                      content: [{ type: "paragraph", content: [{ type: "text", text: "하위 A" }] }],
                    },
                    {
                      type: "listItem",
                      content: [{ type: "paragraph", content: [{ type: "text", text: "하위 B" }] }],
                    },
                    {
                      type: "listItem",
                      content: [{ type: "paragraph", content: [{ type: "text", text: "하위 C" }] }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    }

    const moved = moveNestedListItemToInsertionIndex(doc, 0, [0], 2, 0)
    const nestedItems = moved.content?.[0]?.content?.[0]?.content?.[1]?.content || []

    expect(nestedItems[0]?.content?.[0]?.content?.[0]?.text).toBe("하위 C")
    expect(nestedItems[1]?.content?.[0]?.content?.[0]?.text).toBe("하위 A")
    expect(nestedItems[2]?.content?.[0]?.content?.[0]?.text).toBe("하위 B")
  })
})
