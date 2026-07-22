import { expect, test } from "@playwright/test"
import { readFileSync } from "fs"
import path from "path"
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
  getBrowserModePreferenceStorage,
  isMarkdownEditorMode,
  readMarkdownEditorModePreference,
  resolveMarkdownEditorModeAfterHydration,
  writeMarkdownEditorModePreference,
} from "../../src/components/markdown-editor/markdownEditorModePreference"
import { resolveModeForToolbarInsert } from "../../src/components/markdown-editor/markdownEditorModeTabs"
import {
  applyPlannedTextMutation,
  applyPlannedTextMutationToValue,
} from "../../src/components/markdown-editor/markdownEditorTextMutation"
import {
  emptyPendingToolbarInsertQueue,
  queuePendingToolbarInsert,
  resolvePendingToolbarInsertAfterFlushSkip,
  resolvePendingToolbarInsertWhenModeChanges,
  shouldSchedulePendingToolbarInsertFlush,
} from "../../src/components/markdown-editor/markdownEditorPendingToolbarInsert"
import { registeredBrowserStorageKeys } from "../../src/libs/privacy/browserStorageRegistry"

const sourcePath = (...parts: string[]) => path.resolve(__dirname, "../../src", ...parts)

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

  test("SSR render keeps default mode until client storage is applied", () => {
    const storage = new Map<string, string>([[MARKDOWN_EDITOR_MODE_STORAGE_KEY, "write"]])

    expect(readMarkdownEditorModePreference(null)).toBe(DEFAULT_MARKDOWN_EDITOR_MODE)
    expect(resolveMarkdownEditorModeAfterHydration(DEFAULT_MARKDOWN_EDITOR_MODE, null)).toBe(
      DEFAULT_MARKDOWN_EDITOR_MODE
    )
    expect(
      resolveMarkdownEditorModeAfterHydration(DEFAULT_MARKDOWN_EDITOR_MODE, {
        getItem: (key) => storage.get(key) ?? null,
      })
    ).toBe("write")
  })

  test("preview toolbar inserts switch to write before applying mutation", () => {
    expect(resolveModeForToolbarInsert("preview")).toBe("write")
    expect(resolveModeForToolbarInsert("split")).toBe("split")
  })

  test("value-path mutation inserts at the active selection instead of appending", () => {
    const plan = planInsertBlockSnippet(5, 5, tableBlockSnippet)
    const next = applyPlannedTextMutationToValue("alphaomega", plan)

    expect(next.value.indexOf("|  |  |")).toBeLessThan(next.value.indexOf("omega"))
    expect(next.value).toBe(`alpha${tableBlockSnippet.snippet}omega`)
  })

  test("block insert preserves non-empty selection instead of replacing it", () => {
    const plan = planInsertBlockSnippet(5, 9, codeBlockSnippet)
    const next = applyPlannedTextMutationToValue("alphaomega", plan)

    expect(next.value).toBe(`alpha${codeBlockSnippet.snippet}omega`)
    expect(next.selectionStart).toBe(5 + codeBlockSnippet.cursorOffset)
    expect(next.selectionEnd).toBe(5 + codeBlockSnippet.cursorOffset)
  })

  test("markdown editor mode storage key is registered for privacy inventory", () => {
    expect(registeredBrowserStorageKeys).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          area: "localStorage",
          key: MARKDOWN_EDITOR_MODE_STORAGE_KEY,
          purpose: "markdown-editor-mode-preference",
        }),
      ])
    )
  })

  test("falls back when window.localStorage access throws SecurityError", () => {
    const previousWindow = (globalThis as { window?: unknown }).window
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        get localStorage() {
          throw new DOMException("Denied", "SecurityError")
        },
      },
    })
    try {
      expect(getBrowserModePreferenceStorage()).toBeNull()
      expect(readMarkdownEditorModePreference()).toBe(DEFAULT_MARKDOWN_EDITOR_MODE)
      expect(() => writeMarkdownEditorModePreference("write")).not.toThrow()
    } finally {
      if (previousWindow === undefined) {
        Reflect.deleteProperty(globalThis, "window")
      } else {
        Object.defineProperty(globalThis, "window", {
          configurable: true,
          value: previousWindow,
        })
      }
    }
  })
})

test.describe("markdown editor pending toolbar insert queue", () => {
  const queuedBlock = queuePendingToolbarInsert({ kind: "block", spec: tableBlockSnippet })

  test("clears stale queue when preview flush is skipped", () => {
    expect(resolvePendingToolbarInsertAfterFlushSkip(queuedBlock, "preview")).toEqual(
      emptyPendingToolbarInsertQueue()
    )
  })

  test("clears stale queue when disabled before pending flush runs", () => {
    expect(resolvePendingToolbarInsertAfterFlushSkip(queuedBlock, "disabled")).toEqual(
      emptyPendingToolbarInsertQueue()
    )
  })

  test("clears stale queue when mode returns to preview", () => {
    expect(resolvePendingToolbarInsertWhenModeChanges(queuedBlock, "preview")).toEqual(
      emptyPendingToolbarInsertQueue()
    )
    expect(resolvePendingToolbarInsertWhenModeChanges(queuedBlock, "write")).toBe(queuedBlock)
  })

  test("keeps in-flight preview transition when textarea is not mounted yet", () => {
    expect(resolvePendingToolbarInsertAfterFlushSkip(queuedBlock, "missing-textarea")).toBe(queuedBlock)
    expect(shouldSchedulePendingToolbarInsertFlush(queuedBlock)).toBe(true)
  })

  test("MarkdownEditor clears preview pending queue on mode change", () => {
    const editorSource = readFileSync(sourcePath("components", "markdown-editor", "MarkdownEditor.tsx"), "utf8")
    expect(editorSource).toContain("resolvePendingToolbarInsertWhenModeChanges")
    expect(editorSource).toContain('resolvePendingToolbarInsertAfterFlushSkip(queue, "preview")')
    expect(editorSource).toContain('resolvePendingToolbarInsertAfterFlushSkip(')
    expect(editorSource).toContain('"disabled"')
  })
})
