import { expect, test } from "@playwright/test"
import {
  BLOCK_SNIPPET_SAMPLE_MARKERS,
  blockMarkdownSnippets,
  calloutBlockSnippet,
  codeBlockSnippet,
  mermaidBlockSnippet,
  planInsertBlockSnippet,
  snippetContainsSampleMarker,
  tableBlockSnippet,
  toggleBlockSnippet,
} from "../../src/components/markdown-editor/markdownEditorBlockSnippets"
import {
  DEFAULT_MARKDOWN_EDITOR_MODE,
  MARKDOWN_EDITOR_MODE_STORAGE_KEY,
  isMarkdownEditorMode,
  readMarkdownEditorModePreference,
  writeMarkdownEditorModePreference,
} from "../../src/components/markdown-editor/markdownEditorModePreference"
import { applyPlannedTextMutation } from "../../src/components/markdown-editor/markdownEditorTextMutation"

const blockSpecs = [
  ["code", codeBlockSnippet],
  ["table", tableBlockSnippet],
  ["mermaid", mermaidBlockSnippet],
  ["callout", calloutBlockSnippet],
  ["toggle", toggleBlockSnippet],
] as const

test.describe("markdown editor block snippets", () => {
  for (const [name, spec] of blockSpecs) {
    test(`${name} snippet excludes legacy sample markers`, () => {
      expect(snippetContainsSampleMarker(spec.snippet)).toBe(false)
      for (const marker of BLOCK_SNIPPET_SAMPLE_MARKERS) {
        expect(spec.snippet).not.toContain(marker)
      }
    })
  }

  test("table snippet keeps header, separator, and empty body row only", () => {
    expect(tableBlockSnippet.snippet).toBe("\n|  |  |\n| --- | --- |\n|  |  |\n")
  })

  test("code snippet keeps an empty fenced block", () => {
    expect(codeBlockSnippet.snippet).toBe("\n```\n\n```\n")
  })

  test("mermaid snippet uses a generic two-node flowchart", () => {
    expect(mermaidBlockSnippet.snippet).toContain("flowchart TD")
    expect(mermaidBlockSnippet.snippet).toContain("A --> B")
    expect(mermaidBlockSnippet.snippet).not.toContain("Admin write")
    expect(mermaidBlockSnippet.snippet).not.toContain("DB commit")
  })

  test("mermaid snippet cursor lands on an editable indented diagram line", () => {
    const plan = planInsertBlockSnippet(0, 0, mermaidBlockSnippet)
    const inserted = plan.replacement

    expect(inserted.slice(plan.selectionStart - 4, plan.selectionStart)).toBe("    ")
    expect(inserted[plan.selectionStart]).not.toBe("`")
    expect(inserted.slice(plan.selectionStart)).not.toMatch(/^```/)
  })

  test("callout and toggle snippets keep structure without body filler", () => {
    expect(calloutBlockSnippet.snippet).toBe("\n> [!TIP]\n> \n")
    expect(toggleBlockSnippet.snippet).toBe("\n:::toggle \n\n:::\n")
  })

  test("block toolbar entries expose snippet specs", () => {
    expect(blockMarkdownSnippets.map((entry) => entry.label)).toEqual([
      "Code",
      "Table",
      "Mermaid",
      "Callout",
      "Toggle",
    ])
    expect(blockMarkdownSnippets.every((entry) => entry.snippet.length > 0)).toBe(true)
    expect(blockMarkdownSnippets.every((entry) => entry.cursorOffset >= 0)).toBe(true)
  })

  test("insert plans place the cursor at the first typing position", () => {
    const textarea = {
      value: "hello",
      selectionStart: 5,
      selectionEnd: 5,
      setRangeText(replacement: string, start: number, end: number) {
        this.value = `${this.value.slice(0, start)}${replacement}${this.value.slice(end)}`
      },
      setSelectionRange(start: number, end: number) {
        this.selectionStart = start
        this.selectionEnd = end
      },
    } as unknown as HTMLTextAreaElement

    for (const [, spec] of blockSpecs) {
      textarea.value = "hello"
      textarea.selectionStart = 5
      textarea.selectionEnd = 5

      const plan = planInsertBlockSnippet(5, 5, spec)
      const next = applyPlannedTextMutation(textarea, plan)

      expect(next).toBe(`hello${spec.snippet}`)
      expect(textarea.selectionStart).toBe(5 + spec.cursorOffset)
      expect(textarea.selectionEnd).toBe(5 + spec.cursorOffset)
      expect(next.slice(textarea.selectionStart, textarea.selectionEnd)).toBe("")
    }
  })

  test("code block cursor starts inside the fence", () => {
    const plan = planInsertBlockSnippet(0, 0, codeBlockSnippet)
    const inserted = plan.replacement
    const cursorCharacter = inserted[plan.selectionStart]
    expect(cursorCharacter).not.toBe("`")
    expect(inserted.slice(plan.selectionStart - 4, plan.selectionStart)).toBe("```\n")
  })
})

test.describe("markdown editor mode preference", () => {
  test("accepts only write, preview, and split modes", () => {
    expect(isMarkdownEditorMode("write")).toBe(true)
    expect(isMarkdownEditorMode("preview")).toBe(true)
    expect(isMarkdownEditorMode("split")).toBe(true)
    expect(isMarkdownEditorMode("focus")).toBe(false)
    expect(isMarkdownEditorMode(null)).toBe(false)
  })

  test("reads stored mode and falls back to split for invalid values", () => {
    const storage = new Map<string, string>()

    expect(readMarkdownEditorModePreference({ getItem: (key) => storage.get(key) ?? null })).toBe(
      DEFAULT_MARKDOWN_EDITOR_MODE
    )

    storage.set(MARKDOWN_EDITOR_MODE_STORAGE_KEY, "write")
    expect(readMarkdownEditorModePreference({ getItem: (key) => storage.get(key) ?? null })).toBe("write")

    storage.set(MARKDOWN_EDITOR_MODE_STORAGE_KEY, "invalid")
    expect(readMarkdownEditorModePreference({ getItem: (key) => storage.get(key) ?? null })).toBe("split")
  })

  test("persists validated mode changes", () => {
    const storage = new Map<string, string>()
    const adapter = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value)
      },
    }

    writeMarkdownEditorModePreference("preview", adapter)
    expect(storage.get(MARKDOWN_EDITOR_MODE_STORAGE_KEY)).toBe("preview")
    expect(readMarkdownEditorModePreference(adapter)).toBe("preview")

    writeMarkdownEditorModePreference("bogus" as "write", adapter)
    expect(storage.get(MARKDOWN_EDITOR_MODE_STORAGE_KEY)).toBe("preview")
  })
})
