import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { expect, test } from "@playwright/test"

const readFrontText = (relativePath: string): string => readFileSync(path.resolve(__dirname, "..", relativePath), "utf8")
const frontPathExists = (relativePath: string): boolean => existsSync(path.resolve(__dirname, "..", relativePath))

test.describe("frontend legacy boundary", () => {
  test("package identity does not point to the upstream template project", () => {
    const packageJson = JSON.parse(readFrontText("package.json")) as {
      name?: string
      repository?: {
        url?: string
      }
    }

    expect(packageJson.name).toBe("aquila-blog")
    expect(packageJson.repository?.url).toBe("https://github.com/AquilaXk/aquila-blog.git")
    expect(JSON.stringify(packageJson)).not.toContain("morethan-log")
    expect(JSON.stringify(packageJson)).not.toContain("morethanmin")
  })

  test("legacy post routes stay redirect or SSR 404 only", () => {
    const legacySlugRoute = readFrontText("src/pages/[slug].tsx")
    const legacyPageRoute = readFrontText("src/pages/page/[pageId].tsx")

    expect(legacySlugRoute).toContain("export const getServerSideProps")
    expect(legacySlugRoute).toContain("extractPostIdFromLegacySlug")
    expect(legacySlugRoute).toContain("toCanonicalPostPath(post.id)")
    expect(legacySlugRoute).toContain("permanent: true")
    expect(legacySlugRoute).toContain("const LegacyPostRedirectPage = () => null")
    expect(legacySlugRoute).not.toContain("getStaticProps")
    expect(legacySlugRoute).not.toContain("MarkdownRenderer")

    expect(legacyPageRoute).toContain("export const getServerSideProps")
    expect(legacyPageRoute).toContain("toCanonicalPostPath(post.id)")
    expect(legacyPageRoute).toContain("permanent: true")
    expect(legacyPageRoute).toContain("res.statusCode = 404")
    expect(legacyPageRoute).toContain("<CustomError />")
    expect(legacyPageRoute).not.toContain("getStaticProps")
    expect(legacyPageRoute).not.toContain("MarkdownRenderer")
  })

  test("canonical post query hook does not own legacy slug fallback", () => {
    const postQueryHook = readFrontText("src/hooks/usePostQuery.ts")

    expect(postQueryHook).toContain("extractCanonicalPostIdFromAsPath")
    expect(postQueryHook).toContain('pathname.match(/^\\/posts\\/(\\d+)(?:\\/)?$/)')
    expect(postQueryHook).not.toContain("extractPostIdFromLegacySlug")
    expect(postQueryHook).not.toContain("router.query.slug")
  })

  test("canonical post detail does not keep the retired Detail wrapper or PageDetail branch", () => {
    const canonicalPostPage = readFrontText("src/pages/posts/[id].tsx")

    expect(canonicalPostPage).toContain('import PostDetail from "src/routes/Detail/PostDetail"')
    expect(frontPathExists("src/routes/Detail/index.tsx")).toBe(false)
    expect(frontPathExists("src/routes/Detail/PageDetail/index.tsx")).toBe(false)
  })
})
