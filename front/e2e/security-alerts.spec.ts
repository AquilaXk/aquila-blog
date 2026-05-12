import { readFileSync } from "node:fs"
import path from "node:path"
import { expect, test } from "@playwright/test"

const readFrontFile = (relativePath: string) => readFileSync(path.resolve(__dirname, "..", relativePath), "utf8")

const compareSemver = (actual: string, minimum: string) => {
  const actualParts = actual.split(".").map((part) => Number.parseInt(part, 10))
  const minimumParts = minimum.split(".").map((part) => Number.parseInt(part, 10))

  for (let index = 0; index < Math.max(actualParts.length, minimumParts.length); index += 1) {
    const actualPart = actualParts[index] ?? 0
    const minimumPart = minimumParts[index] ?? 0
    if (actualPart > minimumPart) return 1
    if (actualPart < minimumPart) return -1
  }

  return 0
}

const resolveLockVersions = (yarnLock: string, packageName: string) =>
  yarnLock
    .split(/\n{2,}/)
    .filter((block) => {
      const selectorLine = block.split("\n", 1)[0] || ""
      return selectorLine
        .split(/,\s*/)
        .map((selector) => selector.trim().replace(/^"|"$/g, ""))
        .some((selector) => selector.startsWith(`${packageName}@`))
    })
    .map((block) => block.match(/\n  version "([^"]+)"/)?.[1])
    .filter((version): version is string => Boolean(version))

const expectLockVersionsAtLeast = (yarnLock: string, packageName: string, minimumVersion: string) => {
  const versions = resolveLockVersions(yarnLock, packageName)
  expect(versions, `${packageName} should be present in yarn.lock`).not.toHaveLength(0)

  for (const version of versions) {
    expect(compareSemver(version, minimumVersion), `${packageName}@${version} should be >= ${minimumVersion}`).toBeGreaterThanOrEqual(0)
  }
}

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

  test("package and lockfile dependency alert targets stay on patched versions", () => {
    const packageJson = JSON.parse(readFrontFile("package.json")) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
      resolutions?: Record<string, string>
    }
    const yarnLock = readFrontFile("yarn.lock")

    expect(packageJson.dependencies?.["@babel/runtime"]).toBe("7.26.10")
    expect(packageJson.dependencies?.["@next/env"]).toBe("15.5.15")
    expect(packageJson.dependencies?.katex).toBe("0.16.44")
    expect(packageJson.dependencies?.mermaid).toBe("10.9.3")
    expect(packageJson.dependencies?.next).toBe("15.5.15")
    expect(packageJson.devDependencies?.["eslint-config-next"]).toBe("15.5.15")
    expect(packageJson.devDependencies?.postcss).toBe("8.5.10")

    expect(packageJson.resolutions).toMatchObject({
      "@babel/plugin-transform-modules-systemjs": "7.29.4",
      braces: "3.0.3",
      dompurify: "3.4.2",
      "fast-uri": "3.1.2",
      flatted: "3.4.2",
      "js-yaml": "4.1.1",
      katex: "0.16.44",
      lodash: "4.18.0",
      "lodash-es": "4.18.0",
      postcss: "8.5.10",
    })

    const patchedVersionFloors: Array<[string, string]> = [
      ["@babel/plugin-transform-modules-systemjs", "7.29.4"],
      ["@babel/runtime", "7.26.10"],
      ["braces", "3.0.3"],
      ["fast-uri", "3.1.2"],
      ["flatted", "3.4.2"],
      ["js-yaml", "4.1.1"],
      ["katex", "0.16.21"],
      ["lodash", "4.18.0"],
      ["lodash-es", "4.18.0"],
      ["mermaid", "10.9.3"],
      ["minimatch", "3.1.3"],
      ["next", "15.5.15"],
      ["postcss", "8.5.10"],
    ]

    for (const [packageName, minimumVersion] of patchedVersionFloors) {
      expectLockVersionsAtLeast(yarnLock, packageName, minimumVersion)
    }

    const picomatchVersions = resolveLockVersions(yarnLock, "picomatch")
    expect(picomatchVersions, "picomatch should be present in yarn.lock").not.toHaveLength(0)
    for (const version of picomatchVersions) {
      const minimumVersion = version.startsWith("4.") ? "4.0.4" : "2.3.2"
      expect(compareSemver(version, minimumVersion), `picomatch@${version} should be >= ${minimumVersion}`).toBeGreaterThanOrEqual(0)
    }

    for (const vulnerableTarball of [
      "braces-3.0.2.tgz",
      "fast-uri-3.1.1.tgz",
      "flatted-3.4.1.tgz",
      "glob-10.3.10.tgz",
      "js-yaml-4.1.0.tgz",
      "katex-0.16.11.tgz",
      "lodash-4.17.21.tgz",
      "lodash-es-4.17.21.tgz",
      "mermaid-10.9.1.tgz",
      "minimatch-3.1.2.tgz",
      "next-14.2.35.tgz",
      "picomatch-2.3.1.tgz",
      "picomatch-4.0.3.tgz",
      "postcss-8.4.31.tgz",
      "runtime-7.22.6.tgz",
    ]) {
      expect(yarnLock).not.toContain(vulnerableTarball)
    }
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

    expect(source).not.toContain("const resolveSafeAboutHref = (href: string) =>")
    expect(source).toContain('resolveRenderableProfileLinkHref("service", project.href || linkedService?.safeHref || "")')
    expect(source).not.toContain("href={item.href}")
    expect(source).not.toContain("target={isExternalHref(item.href)")
  })

  test("CodeQL unused alert targets stay removed", () => {
    const editorSource = readFrontFile("src/components/editor/BlockEditorEngine.tsx")
    const postsSource = readFrontFile("src/routes/Admin/AdminPostsWorkspacePage.tsx")
    const toolsSource = readFrontFile("src/pages/admin/tools.tsx")

    expect(editorSource).not.toContain("previewHtml:")
    expect(editorSource).not.toContain("BLOCK_OUTER_SELECT_LEFT_EDGE_GAP_PX")
    expect(editorSource).not.toContain("const handleListItemContext = resolveBlockHandleListItemContext()")
    expect(postsSource).not.toContain('import Link from "next/link"')
    expect(toolsSource).not.toContain("const ObservabilityNotice = styled.p`")
  })
})
