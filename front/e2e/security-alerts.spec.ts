import { readFileSync } from "node:fs"
import path from "node:path"
import { expect, test } from "@playwright/test"

const readFrontFile = (relativePath: string) => readFileSync(path.resolve(__dirname, "..", relativePath), "utf8")

test.describe("front security alert contracts", () => {
  test("axios and dompurify are pinned to patched direct versions", () => {
    const packageJson = JSON.parse(readFrontFile("package.json")) as {
      dependencies?: Record<string, string>
    }
    const yarnLock = readFrontFile("yarn.lock")

    expect(packageJson.dependencies?.axios).toBe("1.16.0")
    expect(packageJson.dependencies?.dompurify).toBe("3.4.2")
    expect(yarnLock).toContain("axios@1.16.0:")
    expect(yarnLock).toContain('version "1.16.0"')
    expect(yarnLock).toContain("dompurify@3.4.2")
    expect(yarnLock).toContain('version "3.4.2"')
    expect(yarnLock).not.toContain("axios@>=0.21.1:")
    expect(yarnLock).not.toContain("dompurify-3.1.6.tgz")
  })

  test("editor drag ghost renders extracted text instead of reinterpreting HTML", () => {
    const source = readFrontFile("src/components/editor/BlockEditorEngine.tsx")

    expect(source).not.toContain("previewHtml")
    expect(source).not.toContain("dangerouslySetInnerHTML")
    expect(source).toContain("previewText")
    expect(source).toContain("textContent")
  })

  test("about page only renders project links after URL scheme validation", () => {
    const source = readFrontFile("src/pages/about.tsx")

    expect(source).toContain("const resolveSafeAboutHref = (href: string) =>")
    expect(source).toContain("safeHref")
    expect(source).toContain('["http:", "https:", "mailto:", "tel:"]')
    expect(source).not.toContain("href={item.href}")
    expect(source).not.toContain("target={isExternalHref(item.href)")
  })

  test("CodeQL unused alert targets stay removed", () => {
    const editorSource = readFrontFile("src/components/editor/BlockEditorEngine.tsx")
    const postsSource = readFrontFile("src/routes/Admin/AdminPostsWorkspacePage.tsx")
    const toolsSource = readFrontFile("src/pages/admin/tools.tsx")

    expect(editorSource).not.toContain("previewHtml:")
    expect(postsSource).not.toContain('import Link from "next/link"')
    expect(toolsSource).not.toContain("const ObservabilityNotice = styled.p`")
  })
})
