import { expect, test } from "@playwright/test"
import { readFileSync } from "fs"
import path from "path"
import {
  matchListMarkerLine,
  planFormatShortcutMutation,
  planHardBreak,
  planListEnterContinuation,
  planTabIndentMutation,
  resolveFormatShortcut,
} from "../../src/components/markdown-editor/markdownEditorKeyboardModel"
import { resolveModeForBodyFocus } from "../../src/components/markdown-editor/markdownEditorModeTabs"
import {
  applyPlannedTextMutation,
  planIndentLines,
  planOutdentLines,
  planToggleWrapSelection,
} from "../../src/components/markdown-editor/markdownEditorTextMutation"

const sourcePath = (...parts: string[]) => path.resolve(__dirname, "../../src", ...parts)

test.describe("markdown editor keyboard model", () => {
  test("toggles bold wrap and unwrap around a selection", () => {
    const wrapped = planFormatShortcutMutation("hello", 0, 5, "bold")
    expect(wrapped).toEqual({
      rangeStart: 0,
      rangeEnd: 5,
      replacement: "**hello**",
      selectionStart: 2,
      selectionEnd: 7,
    })

    const unwrapped = planToggleWrapSelection("**hello**", 2, 7, "**", "**")
    expect(unwrapped).toEqual({
      rangeStart: 0,
      rangeEnd: 9,
      replacement: "hello",
      selectionStart: 0,
      selectionEnd: 5,
    })
  })

  test("toggles italic, strikethrough, and inline code wrappers", () => {
    expect(planFormatShortcutMutation("code", 0, 4, "italic").replacement).toBe("_code_")
    expect(planFormatShortcutMutation("code", 0, 4, "strikethrough").replacement).toBe("~~code~~")
    expect(planFormatShortcutMutation("code", 0, 4, "inlineCode").replacement).toBe("`code`")
  })

  test("inserts a markdown link with the URL selected", () => {
    expect(planFormatShortcutMutation("docs", 0, 4, "link")).toEqual({
      rangeStart: 0,
      rangeEnd: 4,
      replacement: "[docs](https://)",
      selectionStart: 7,
      selectionEnd: 15,
    })
  })

  test("maps common format shortcut chords", () => {
    expect(resolveFormatShortcut({ key: "b", metaKey: true, ctrlKey: false, shiftKey: false, altKey: false })).toBe(
      "bold"
    )
    expect(resolveFormatShortcut({ key: "i", metaKey: false, ctrlKey: true, shiftKey: false, altKey: false })).toBe(
      "italic"
    )
    expect(resolveFormatShortcut({ key: "k", metaKey: true, ctrlKey: false, shiftKey: false, altKey: false })).toBe(
      "link"
    )
    expect(resolveFormatShortcut({ key: "e", metaKey: true, ctrlKey: false, shiftKey: false, altKey: false })).toBe(
      "inlineCode"
    )
    expect(resolveFormatShortcut({ key: "x", metaKey: true, ctrlKey: false, shiftKey: true, altKey: false })).toBe(
      "strikethrough"
    )
  })

  test("Shift+Enter plans a hard break with two trailing spaces", () => {
    expect(planHardBreak(3, 3)).toEqual({
      rangeStart: 3,
      rangeEnd: 3,
      replacement: "  \n",
      selectionStart: 6,
      selectionEnd: 6,
    })
  })

  test("continues unordered, ordered, task, and quote markers on Enter", () => {
    expect(planListEnterContinuation("- item", 6, 6)?.replacement).toBe("\n- ")
    expect(planListEnterContinuation("1. item", 7, 7)?.replacement).toBe("\n2. ")
    expect(planListEnterContinuation("- [ ] task", 10, 10)?.replacement).toBe("\n- [ ] ")
    expect(planListEnterContinuation("> quote", 7, 7)?.replacement).toBe("\n> ")
  })

  test("exits an empty list item on Enter by removing the marker", () => {
    expect(planListEnterContinuation("- ", 2, 2)).toEqual({
      rangeStart: 0,
      rangeEnd: 2,
      replacement: "",
      selectionStart: 0,
      selectionEnd: 0,
    })
    expect(matchListMarkerLine("1. ").kind).toBe("ordered")
  })

  test("indents and outdents multi-line selections with Tab / Shift+Tab", () => {
    const value = "alpha\nbeta\ngamma"
    const indented = planTabIndentMutation(value, 0, value.length, false)
    expect(indented?.replacement).toBe("  alpha\n  beta\n  gamma")

    const outdented = planTabIndentMutation(indented!.replacement, 0, indented!.replacement.length, true)
    expect(outdented?.replacement).toBe(value)
  })

  test("adjusts selection by indent applied only before each selection edge", () => {
    const value = "alpha\nbeta\ngamma"
    // Select only the middle line ("beta"): offsets 6..10
    const indented = planIndentLines(value, 6, 10)
    expect(indented).toEqual({
      rangeStart: 6,
      rangeEnd: 10,
      replacement: "  beta",
      // lineStart === selectionStart → start stays; end moves by indent on that line
      selectionStart: 6,
      selectionEnd: 12,
    })

    // Partial multi-line: from mid "alpha" through mid "gamma"
    const partial = planIndentLines(value, 2, 13)
    expect(partial.replacement).toBe("  alpha\n  beta\n  gamma")
    expect(partial.selectionStart).toBe(4) // +2 on first line only
    expect(partial.selectionEnd).toBe(19) // +2 per line with lineStart < end

    const outdented = planOutdentLines(partial.replacement, partial.selectionStart, partial.selectionEnd)
    expect(outdented).toEqual({
      rangeStart: 0,
      rangeEnd: partial.replacement.length,
      replacement: value,
      selectionStart: 2,
      selectionEnd: 13,
    })
  })

  test("body focus from title switches preview mode to write", () => {
    expect(resolveModeForBodyFocus("preview")).toBe("write")
    expect(resolveModeForBodyFocus("write")).toBe("write")
    expect(resolveModeForBodyFocus("split")).toBe("split")

    const editorSource = readFileSync(sourcePath("components", "markdown-editor", "MarkdownEditor.tsx"), "utf8")
    expect(editorSource).toContain("resolveModeForBodyFocus")
    expect(editorSource).toContain("pendingBodyFocusRef")
  })

  test("mutation helper uses setRangeText to preserve native undo", () => {
    const mutationSource = readFileSync(sourcePath("components", "markdown-editor", "markdownEditorTextMutation.ts"), "utf8")
    const editorSource = readFileSync(sourcePath("components", "markdown-editor", "MarkdownEditor.tsx"), "utf8")

    expect(mutationSource).toContain("textarea.setRangeText(")
    expect(mutationSource).toContain("export const applyPlannedTextMutation")
    expect(editorSource).toContain("applyPlannedTextMutation")
    expect(editorSource).toContain("onRequestSave")
    expect(editorSource).toContain("onFocusRequestReady")
    expect(editorSource).toContain("allowNativeTabAfterEscapeRef")
    expect(editorSource).toContain("aria-description")

    const textarea = {
      value: "hello",
      selectionStart: 0,
      selectionEnd: 5,
      setRangeText(replacement: string, start: number, end: number) {
        this.value = `${this.value.slice(0, start)}${replacement}${this.value.slice(end)}`
      },
      setSelectionRange(start: number, end: number) {
        this.selectionStart = start
        this.selectionEnd = end
      },
    } as unknown as HTMLTextAreaElement

    const next = applyPlannedTextMutation(textarea, planToggleWrapSelection("hello", 0, 5, "**", "**"))
    expect(next).toBe("**hello**")
    expect(textarea.selectionStart).toBe(2)
    expect(textarea.selectionEnd).toBe(7)
  })

  test("ModeTabs expose arrow-key a11y contracts", () => {
    const modeTabsSource = readFileSync(
      sourcePath("components", "markdown-editor", "markdownEditorModeTabs.tsx"),
      "utf8"
    )
    expect(modeTabsSource).toContain('role="tablist"')
    expect(modeTabsSource).toContain("ArrowRight")
    expect(modeTabsSource).toContain("ArrowLeft")
    expect(modeTabsSource).toContain("aria-controls")
    expect(modeTabsSource).toContain("tabIndex={selected ? 0 : -1}")
  })
})
