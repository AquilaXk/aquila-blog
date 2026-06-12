import { readFileSync } from "node:fs"
import path from "node:path"
import { expect, test } from "@playwright/test"

test.describe("editor performance source contracts", () => {
  test("code block global selection events are shared instead of mounted per node view", () => {
    const source = readFileSync(path.resolve(__dirname, "../src/components/editor/codeBlockNodeView.tsx"), "utf8")

    expect(source).toContain("registerCodeBlockGlobalEventProvider")
    expect(source).toContain("activateCodeBlockWindowDragProvider")
    expect(source).not.toContain('window.addEventListener("pointerdown", handleDocumentCodePointer, true)')
    expect(source).not.toContain('document.addEventListener("pointerdown", handleDocumentCodePointer, true)')
    expect(source).not.toContain('window.addEventListener("keydown", handleDocumentSelectAll, true)')
    expect(source).not.toContain('document.addEventListener("keydown", handleDocumentSelectAll, true)')
    expect(source).not.toContain('window.addEventListener("mousemove", handleWindowMouseMove, true)')
    expect(source).not.toContain('window.addEventListener("pointermove", handleWindowMouseMove, true)')
  })

  test("selection bubble occlusion reads local selection candidates instead of the full editor tree", () => {
    const source = readFileSync(path.resolve(__dirname, "../src/components/editor/useFloatingBubbleState.ts"), "utf8")

    expect(source).toContain("MAX_TEXT_BUBBLE_OCCLUSION_CANDIDATES")
    expect(source).toContain("resolveVisibleSelectionAnchorRect")
    expect(source).toContain("collectTextBubbleOcclusionCandidates")
    expect(source).toContain('selected.closest("th, td")')
    expect(source).toContain("addTextBubbleOcclusionDescendantCandidates")
    expect(source).toContain("resolveSideTextBubbleTop")
    expect(source).not.toContain("editorRoot.querySelectorAll<HTMLElement>(TEXT_BUBBLE_OCCLUSION_SELECTOR)")
  })
})
