import { expect, test } from "@playwright/test"
import { readFileSync } from "fs"
import path from "path"
import {
  buildUploadingAttachmentPlaceholder,
  buildUploadingImagePlaceholder,
  createUploadPlaceholderId,
  extractImageFileFromClipboard,
  findExactSubstringIndex,
  isImageFile,
  listFilesFromDataTransfer,
  parseSingleHttpUrl,
  partitionUploadFiles,
  planAppendAtEnd,
  planLinkifySelectionWithUrl,
  planReplaceExactSubstring,
  planTransferFileReservations,
  readClipboardPlainText,
  resolvePasteMediaRoute,
  toInlineMarkdownSnippet,
} from "../../src/components/markdown-editor/markdownEditorPasteDropModel"
import {
  applyPlannedTextMutationToValue,
  planReplaceSelection,
} from "../../src/components/markdown-editor/markdownEditorTextMutation"
import {
  MARKDOWN_ATTACHMENT_MAX_BYTES,
  MARKDOWN_ATTACHMENT_TOO_LARGE_MESSAGE,
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
  test("builds Korean GitHub-style image and attachment placeholders with unique upload ids", () => {
    const firstId = "upload-a"
    const secondId = "upload-b"
    expect(buildUploadingImagePlaceholder("shot.png", firstId)).toBe(
      "![업로드 중: shot.png · upload-a…]()"
    )
    expect(buildUploadingAttachmentPlaceholder("notes.pdf", firstId)).toBe(
      "[업로드 중: notes.pdf · upload-a…]()"
    )

    const sameNameA = buildUploadingImagePlaceholder("shot.png", firstId)
    const sameNameB = buildUploadingImagePlaceholder("shot.png", secondId)
    expect(sameNameA).not.toBe(sameNameB)
    expect(createUploadPlaceholderId()).not.toBe(createUploadPlaceholderId())

    const value = `${sameNameA}${sameNameB}`
    const replaceSecond = planReplaceExactSubstring(
      value,
      sameNameB,
      "![shot.png](https://cdn.example.test/b.png)",
      0,
      0
    )
    expect(replaceSecond).not.toBeNull()
    expect(applyPlannedTextMutationToValue(value, replaceSecond!).value).toBe(
      `${sameNameA}![shot.png](https://cdn.example.test/b.png)`
    )
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

  test("escapes markdown label metacharacters when linkifying a selection", () => {
    const value = "see foo]bar here"
    const plan = planLinkifySelectionWithUrl(4, 11, "foo]bar", "https://example.com")
    expect(plan.replacement).toBe("[foo\\]bar](https://example.com)")
    expect(applyPlannedTextMutationToValue(value, plan).value).toBe(
      "see [foo\\]bar](https://example.com) here"
    )

    const bracketPlan = planLinkifySelectionWithUrl(0, 5, "a[b]c", "https://example.com/x")
    expect(bracketPlan.replacement).toBe("[a\\[b\\]c](https://example.com/x)")
  })

  test("routes multi-file paste through transfer-files and keeps items-only fallback", () => {
    const imageA = makeFile("a.png", "image/png")
    const imageB = makeFile("b.png", "image/png")
    const pdf = makeFile("notes.pdf", "application/pdf")
    const multiFiles = {
      files: [imageA, pdf, imageB],
      items: [],
    } as unknown as DataTransfer

    expect(
      resolvePasteMediaRoute(multiFiles, { canUploadImage: true, canUploadFile: true })
    ).toEqual({
      kind: "transfer-files",
      files: [imageA, pdf, imageB],
    })

    const itemsOnlyImage = makeFile("clip.png", "image/png")
    const itemsOnly = {
      files: [],
      items: [
        {
          kind: "file",
          type: "image/png",
          getAsFile: () => itemsOnlyImage,
        },
      ],
    } as unknown as DataTransfer
    expect(resolvePasteMediaRoute(itemsOnly, { canUploadImage: true, canUploadFile: true })).toEqual({
      kind: "clipboard-image",
      file: itemsOnlyImage,
    })
  })

  test("replaces an exact uploading placeholder or appends when edited away", () => {
    const placeholder = buildUploadingImagePlaceholder("shot.png", "upload-1")
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
    const caret = 6
    const appendPlan = planAppendAtEnd(edited, resolved.markdown, caret, caret)
    expect(appendPlan.selectionStart).toBe(caret)
    expect(appendPlan.selectionEnd).toBe(caret)
    const appended = applyPlannedTextMutationToValue(edited, appendPlan)
    expect(appended.value).toBe(`${edited}${resolved.markdown}`)
    expect(appended.selectionStart).toBe(caret)
    expect(appended.selectionEnd).toBe(caret)
  })

  test("plans multi-file reservations in original order before any upload await", () => {
    const pdf = makeFile("doc.pdf", "application/pdf")
    const image = makeFile("shot.png", "image/png")
    const oversized = { name: "huge.bin", type: "application/octet-stream", size: MARKDOWN_ATTACHMENT_MAX_BYTES + 1 } as File
    let id = 0
    const { jobs, errors } = planTransferFileReservations([pdf, image, oversized], {
      canUploadImage: true,
      canUploadFile: true,
      createId: () => `id-${++id}`,
    })

    expect(jobs.map((job) => job.kind)).toEqual(["attachment", "image"])
    expect(jobs[0]?.placeholder).toContain("doc.pdf")
    expect(jobs[1]?.placeholder).toContain("shot.png")
    expect(jobs.map((job) => job.placeholder).join("")).toBe(
      `${jobs[0]?.placeholder}${jobs[1]?.placeholder}`
    )
    expect(errors).toEqual([MARKDOWN_ATTACHMENT_TOO_LARGE_MESSAGE])

    const mediaSource = readFileSync(
      sourcePath("components", "markdown-editor", "useMarkdownEditorMediaTransfers.ts"),
      "utf8"
    )
    expect(mediaSource).toContain("planTransferFileReservations")
    expect(mediaSource).toContain('jobs.map((job) => job.placeholder).join("")')
    expect(mediaSource).toContain("completeReservedJob")
    expect(mediaSource).toContain("reportUploadError")
    expect(mediaSource).toContain("clearUploadError: false")
    expect(mediaSource).not.toContain("partitionUploadFiles(files)")
  })

  test("removes an exact placeholder on upload failure without leaving residue", () => {
    const placeholder = buildUploadingAttachmentPlaceholder("notes.pdf", "upload-2")
    const value = `before ${placeholder} after`
    const removePlan = planReplaceExactSubstring(value, placeholder, "", 0, 0)
    expect(removePlan).not.toBeNull()
    expect(applyPlannedTextMutationToValue(value, removePlan!).value).toBe("before  after")
  })

  test("keeps caret-based insert plan independent from drop coordinates", () => {
    const placeholder = buildUploadingImagePlaceholder("drop.png", "upload-3")
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
    expect(editorSource).toContain("applyBackgroundMarkdownMutation")
    expect(editorSource).toContain("clearUploadError")

    expect(mediaSource).toContain("buildUploadingImagePlaceholder")
    expect(mediaSource).toContain("createUploadPlaceholderId")
    expect(mediaSource).toContain("resolvePasteMediaRoute")
    expect(mediaSource).toContain("uploadImageWithPlaceholder")
    expect(mediaSource).toContain("planTransferFileReservations")
    expect(mediaSource).toContain("parseSingleHttpUrl")
    expect(mediaSource).toContain("planLinkifySelectionWithUrl")
    expect(mediaSource).toContain("processTransferFiles")
    expect(mediaSource).toContain("applyBackgroundMarkdownMutation")
    expect(mediaSource).toContain("retainedUploadErrorRef")

    expect(modelSource).toContain("![업로드 중:")
    expect(modelSource).toContain("createUploadPlaceholderId")
    expect(modelSource).toContain("resolvePasteMediaRoute")
    expect(modelSource).toContain("escapeMarkdownLinkLabel")
    expect(modelSource).toContain("planTransferFileReservations")
    expect(rootModelSource).toContain(
      'export { extractImageFileFromClipboard } from "src/components/markdown-editor/markdownEditorPasteDropModel"'
    )
  })
})
