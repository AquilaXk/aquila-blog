import { expect, test } from "@playwright/test"
import { readFileSync } from "fs"
import path from "path"
import {
  buildUploadingAttachmentPlaceholder,
  buildUploadingImagePlaceholder,
  extractImageFileFromClipboard,
  findExactSubstringIndex,
  isImageFile,
  listFilesFromDataTransfer,
  parseSingleHttpUrl,
  partitionUploadFiles,
  planAppendAtEnd,
  planLinkifySelectionWithUrl,
  planReplaceExactSubstring,
  readClipboardPlainText,
  toInlineMarkdownSnippet,
} from "../../src/components/markdown-editor/markdownEditorPasteDropModel"
import {
  applyPlannedTextMutationToValue,
  planReplaceSelection,
} from "../../src/components/markdown-editor/markdownEditorTextMutation"
import {
  resolveMarkdownAttachmentLink,
  resolveMarkdownImageEmbed,
} from "../../src/components/markdown-editor/markdownEditorUploadModel"

const sourcePath = (...parts: string[]) => path.resolve(__dirname, "../../src", ...parts)

const makeFile = (name: string, type: string): File =>
  ({
    name,
    type,
    size: 128,
  }) as File

test.describe("markdown editor paste/drop model", () => {
  test("builds Korean GitHub-style image and attachment placeholders", () => {
    expect(buildUploadingImagePlaceholder("shot.png")).toBe("![업로드 중: shot.png…]()")
    expect(buildUploadingAttachmentPlaceholder("notes.pdf")).toBe("[업로드 중: notes.pdf…]()")
  })

  test("partitions image vs non-image files for sequential drop handling", () => {
    const imageA = makeFile("a.png", "image/png")
    const imageB = makeFile("b.jpg", "image/jpeg")
    const pdf = makeFile("c.pdf", "application/pdf")

    expect(isImageFile(imageA)).toBe(true)
    expect(isImageFile(pdf)).toBe(false)
    expect(partitionUploadFiles([pdf, imageA, imageB])).toEqual({
      images: [imageA, imageB],
      attachments: [pdf],
    })
  })

  test("extracts clipboard images from files or items", () => {
    const image = makeFile("clip.png", "image/png")
    const fromFiles = {
      files: [image],
      items: [],
    } as unknown as DataTransfer
    expect(extractImageFileFromClipboard(fromFiles)).toBe(image)

    const fromItems = {
      files: [],
      items: [
        {
          kind: "file",
          type: "image/png",
          getAsFile: () => image,
        },
      ],
    } as unknown as DataTransfer
    expect(extractImageFileFromClipboard(fromItems)).toBe(image)
    expect(extractImageFileFromClipboard(null)).toBeNull()
  })

  test("lists dropped files and reads plain clipboard text", () => {
    const pdf = makeFile("doc.pdf", "application/pdf")
    const transfer = {
      files: [pdf],
      getData: (type: string) => (type === "text/plain" ? "https://example.com/docs" : ""),
    } as unknown as DataTransfer

    expect(listFilesFromDataTransfer(transfer)).toEqual([pdf])
    expect(readClipboardPlainText(transfer)).toBe("https://example.com/docs")
    expect(readClipboardPlainText(null)).toBe("")
  })

  test("parses a single http(s) URL and rejects mixed clipboard text", () => {
    expect(parseSingleHttpUrl("https://example.com/path?x=1")).toBe("https://example.com/path?x=1")
    expect(parseSingleHttpUrl("  http://example.com  ")).toBe("http://example.com")
    expect(parseSingleHttpUrl("https://example.com extra")).toBeNull()
    expect(parseSingleHttpUrl("not-a-url")).toBeNull()
    expect(parseSingleHttpUrl("ftp://example.com")).toBeNull()
    expect(parseSingleHttpUrl("")).toBeNull()
  })

  test("plans selection URL linkify via setRangeText-compatible mutation", () => {
    const value = "see docs here"
    const plan = planLinkifySelectionWithUrl(4, 8, "docs", "https://example.com")
    expect(plan).toEqual({
      rangeStart: 4,
      rangeEnd: 8,
      replacement: "[docs](https://example.com)",
      selectionStart: 4 + "[docs](https://example.com)".length,
      selectionEnd: 4 + "[docs](https://example.com)".length,
    })
    expect(applyPlannedTextMutationToValue(value, plan).value).toBe("see [docs](https://example.com) here")
  })

  test("replaces an exact uploading placeholder or appends when edited away", () => {
    const placeholder = buildUploadingImagePlaceholder("shot.png")
    const before = `intro ${placeholder} outro`
    const resolved = resolveMarkdownImageEmbed(
      { url: "https://cdn.example.test/shot.png" },
      "shot.png"
    )
    if ("error" in resolved) throw new Error(resolved.error)

    const inline = toInlineMarkdownSnippet(resolved.markdown)
    expect(inline).toBe("![shot.png](https://cdn.example.test/shot.png)")

    const matchedPlan = planReplaceExactSubstring(before, placeholder, inline, 0, 0)
    expect(matchedPlan).not.toBeNull()
    expect(applyPlannedTextMutationToValue(before, matchedPlan!).value).toBe(
      `intro ${inline} outro`
    )

    const edited = "intro ![업로드 중: shot.png edited]() outro"
    expect(findExactSubstringIndex(edited, placeholder)).toBe(-1)
    const appendPlan = planAppendAtEnd(edited, resolved.markdown)
    expect(applyPlannedTextMutationToValue(edited, appendPlan).value).toBe(`${edited}${resolved.markdown}`)
  })

  test("removes an exact placeholder on upload failure without leaving residue", () => {
    const placeholder = buildUploadingAttachmentPlaceholder("notes.pdf")
    const value = `before ${placeholder} after`
    const removePlan = planReplaceExactSubstring(value, placeholder, "", 0, 0)
    expect(removePlan).not.toBeNull()
    expect(applyPlannedTextMutationToValue(value, removePlan!).value).toBe("before  after")
  })

  test("keeps caret-based insert plan independent from drop coordinates", () => {
    const placeholder = buildUploadingImagePlaceholder("drop.png")
    const value = "alpha beta"
    const caret = 6
    const plan = planReplaceSelection(caret, caret, placeholder)
    expect(plan.rangeStart).toBe(caret)
    expect(plan.rangeEnd).toBe(caret)
    expect(applyPlannedTextMutationToValue(value, plan).value).toBe(`alpha ${placeholder}beta`)
  })

  test("attachment resolve path still yields markdown links for non-image drops", () => {
    expect(
      resolveMarkdownAttachmentLink(
        { url: "https://cdn.example.test/files/notes.pdf", name: "notes.pdf" },
        "notes.pdf"
      )
    ).toEqual({
      markdown: "\n\n[notes.pdf](https://cdn.example.test/files/notes.pdf)\n",
    })
    expect(toInlineMarkdownSnippet("\n\n[notes.pdf](https://cdn.example.test/files/notes.pdf)\n")).toBe(
      "[notes.pdf](https://cdn.example.test/files/notes.pdf)"
    )
  })

  test("MarkdownEditor wires paste/drop handlers through media transfer hook", () => {
    const editorSource = readFileSync(sourcePath("components", "markdown-editor", "MarkdownEditor.tsx"), "utf8")
    const mediaSource = readFileSync(
      sourcePath("components", "markdown-editor", "useMarkdownEditorMediaTransfers.ts"),
      "utf8"
    )
    const modelSource = readFileSync(
      sourcePath("components", "markdown-editor", "markdownEditorPasteDropModel.ts"),
      "utf8"
    )
    const rootModelSource = readFileSync(
      sourcePath("routes", "Admin", "EditorStudioWorkspaceControllerRootModel.ts"),
      "utf8"
    )

    expect(editorSource).toContain("onPaste={handlePaste}")
    expect(editorSource).toContain("onDragOver={handleDragOver}")
    expect(editorSource).toContain("onDrop={handleDrop}")
    expect(editorSource).toContain("useMarkdownEditorMediaTransfers")

    expect(mediaSource).toContain("buildUploadingImagePlaceholder")
    expect(mediaSource).toContain("uploadImageWithPlaceholder")
    expect(mediaSource).toContain("uploadAttachmentWithPlaceholder")
    expect(mediaSource).toContain("parseSingleHttpUrl")
    expect(mediaSource).toContain("planLinkifySelectionWithUrl")
    expect(mediaSource).toContain("processTransferFiles")

    expect(modelSource).toContain("![업로드 중:")
    expect(rootModelSource).toContain(
      'export { extractImageFileFromClipboard } from "src/components/markdown-editor/markdownEditorPasteDropModel"'
    )
  })
})
