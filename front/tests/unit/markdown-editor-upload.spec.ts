import { expect, test } from "@playwright/test"
import { readFileSync } from "fs"
import path from "path"
import {
  MARKDOWN_ATTACHMENT_MAX_BYTES,
  MARKDOWN_ATTACHMENT_TOO_LARGE_MESSAGE,
  MARKDOWN_ATTACHMENT_URL_MISSING_MESSAGE,
  resolveMarkdownAttachmentLink,
  resolveMarkdownImageEmbed,
  validateMarkdownAttachmentSize,
} from "../../src/components/markdown-editor/markdownEditorUploadModel"
import { derivePublishActionViewModel } from "../../src/routes/Admin/editorStudioState"

const sourcePath = (...parts: string[]) => path.resolve(__dirname, "../../src", ...parts)

test.describe("markdown editor attachment upload model", () => {
  test("rejects attachments larger than 10MB before upload", () => {
    const oversized = { size: MARKDOWN_ATTACHMENT_MAX_BYTES + 1 } as File
    const allowed = { size: MARKDOWN_ATTACHMENT_MAX_BYTES } as File

    expect(validateMarkdownAttachmentSize(oversized)).toBe(MARKDOWN_ATTACHMENT_TOO_LARGE_MESSAGE)
    expect(validateMarkdownAttachmentSize(allowed)).toBeNull()
  })

  test("builds a markdown file link from a successful upload payload", () => {
    expect(
      resolveMarkdownAttachmentLink(
        {
          url: "https://cdn.example.test/files/report.pdf",
          name: "report.pdf",
          mimeType: "application/pdf",
          sizeBytes: 128,
        },
        "fallback.bin"
      )
    ).toEqual({
      markdown: "\n\n[report.pdf](https://cdn.example.test/files/report.pdf)\n",
    })
  })

  test("escapes markdown metacharacters in attachment link labels", () => {
    expect(
      resolveMarkdownAttachmentLink(
        {
          url: "https://cdn.example.test/files/bracket%5B1%5D.pdf",
          name: "report[1].pdf",
        },
        "fallback[1].bin"
      )
    ).toEqual({
      markdown: "\n\n[report\\[1\\].pdf](https://cdn.example.test/files/bracket%5B1%5D.pdf)\n",
    })
  })

  test("surfaces a toolbar error when the upload response has no url", () => {
    expect(resolveMarkdownAttachmentLink({ name: "missing.pdf" }, "fallback.pdf")).toEqual({
      error: MARKDOWN_ATTACHMENT_URL_MISSING_MESSAGE,
    })
  })

  test("keeps the image embed contract for url-only image uploads", () => {
    expect(
      resolveMarkdownImageEmbed(
        {
          url: "https://cdn.example.test/post-images/body.png",
        },
        "body.png"
      )
    ).toEqual({
      markdown: "\n\n![body.png](https://cdn.example.test/post-images/body.png)\n",
    })
  })

  test("writer host forwards onFileUpload into MarkdownEditor onUploadFile", () => {
    const writerHostSource = readFileSync(sourcePath("routes", "Admin", "WriterEditorHost.tsx"), "utf8")
    const markdownEditorSource = readFileSync(
      sourcePath("components", "markdown-editor", "MarkdownEditor.tsx"),
      "utf8"
    )
    const editorViewSource = readFileSync(
      sourcePath("routes", "Admin", "EditorStudioWorkspaceControllerRootView.tsx"),
      "utf8"
    )

    expect(writerHostSource).toContain("onFileUpload,")
    expect(writerHostSource).toContain("onUploadFile={onFileUpload}")
    expect(writerHostSource).toContain("onUploadingChange={onUploadingChange}")
    expect(markdownEditorSource).toContain("onUploadingChange?: (isUploading: boolean) => void")
    expect(markdownEditorSource).toContain("setUploadInFlight(1)")
    expect(markdownEditorSource).toContain("onUploadFile?: (file: File) => Promise<MarkdownFileUploadResult>")
    expect(markdownEditorSource).toContain('aria-label="파일"')
    expect(markdownEditorSource).toContain("handleFileInput")
    expect(markdownEditorSource).toContain("validateMarkdownAttachmentSize")
    expect(markdownEditorSource).toContain("MARKDOWN_ATTACHMENT_UPLOAD_FAILED_MESSAGE")
    expect(editorViewSource).toContain("onUploadingChange={handleMarkdownUploadingChange}")
    expect(editorViewSource).toContain("isMarkdownUploading,")
  })

  test("blocks publish actions while markdown attachment upload is in flight", () => {
    const publishActionViewModel = derivePublishActionViewModel({
      publishActionType: "create",
      editorMode: "create",
      loadingKey: "",
      hasEditorMinimumFields: true,
      hasPlaceholderIssue: false,
      isTempDraftMode: false,
      isMarkdownUploading: true,
    })

    expect(publishActionViewModel.publishActionTriggerDisabled).toBe(true)
    expect(publishActionViewModel.publishActionButtonDisabled).toBe(true)
    expect(publishActionViewModel.mobilePrimaryActionDisabled).toBe(true)
  })
})
