import { readFileSync } from "node:fs"
import path from "node:path"
import { expect, test } from "@playwright/test"

test.describe("mermaid editor view", () => {
  test("머메이드 블록은 코드/코드+미리보기/미리보기 모드를 제공한다", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../src/components/editor/extensions.tsx"),
      "utf8"
    )

    expect(source).toContain('type MermaidEditorViewMode = "code" | "split" | "preview"')
    expect(source).toContain('{ value: "code", label: "코드" }')
    expect(source).toContain('{ value: "split", label: "코드+미리보기" }')
    expect(source).toContain('{ value: "preview", label: "미리보기" }')
    expect(source).toContain('useState<MermaidEditorViewMode>("split")')
    expect(source).toContain('<MermaidCodePane>')
    expect(source).toContain('<MermaidPreviewPane ref={previewRootRef}>')
  })
})
