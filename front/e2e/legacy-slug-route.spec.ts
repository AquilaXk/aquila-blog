import { readFileSync } from "node:fs"
import path from "node:path"
import { expect, test } from "@playwright/test"
import { createLegacySlugServerSideProps } from "src/pages/[slug]"

test.describe("legacy /[slug] route", () => {
  test("백엔드 fetch 실패 시 렌더된 404로 fail-closed 한다", async () => {
    const source = readFileSync(path.resolve(__dirname, "../src/pages/[slug].tsx"), "utf8")

    expect(source).toContain("import { GetServerSideProps } from \"next\"")
    expect(source).toContain("<CustomError />")
    expect(source).toContain("res.statusCode = 404")
    expect(source).not.toContain("getStaticProps")

    const res = { statusCode: 200 } as { statusCode: number }
    const getServerSideProps = createLegacySlugServerSideProps(async () => {
      throw new Error("backend unavailable")
    })

    const result = await getServerSideProps({
      params: { slug: "legacy-post-title-42" },
      req: {} as never,
      res: res as never,
      query: {},
      resolvedUrl: "/legacy-post-title-42",
      locales: undefined,
      locale: undefined,
      defaultLocale: undefined,
      preview: false,
      previewData: undefined,
    })

    expect("props" in result).toBe(true)
    if ("props" in result) {
      expect(result.props).toEqual({ notFoundLegacy: true })
    }
    expect(res.statusCode).toBe(404)
    expect("notFound" in result).toBe(false)
    expect("redirect" in result).toBe(false)
  })

  test("글이 없으면 기존 notFound를 유지한다", async () => {
    const res = { statusCode: 200 } as { statusCode: number }
    const getServerSideProps = createLegacySlugServerSideProps(async () => null)

    const result = await getServerSideProps({
      params: { slug: "legacy-post-title-42" },
      req: {} as never,
      res: res as never,
      query: {},
      resolvedUrl: "/legacy-post-title-42",
      locales: undefined,
      locale: undefined,
      defaultLocale: undefined,
      preview: false,
      previewData: undefined,
    })

    expect(result).toEqual({ notFound: true })
    expect(res.statusCode).toBe(200)
  })
})
