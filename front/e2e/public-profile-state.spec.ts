import { readFileSync } from "node:fs"
import path from "node:path"
import { expect, test } from "@playwright/test"

const readNormalizedSource = (relativePath: string) =>
  readFileSync(path.resolve(__dirname, relativePath), "utf8").replace(/\s+/g, " ")

test.describe("public profile SSR contract", () => {
  test("홈은 비로그인이어도 공개 admin profile API를 먼저 조회한다", () => {
    const source = readNormalizedSource("../src/pages/index.tsx")

    expect(source).toContain(
      "const fallbackProfileSnapshot = !hasAuthCookie ? resolvePublicAdminProfileSnapshot(req) : null"
    )
    expect(source).toContain("const adminProfilePromise = timed(() => fetchServerAdminProfile(req, {")
    expect(source).toContain(
      "adminProfileResult.ok && adminProfileResult.value ? adminProfileResult.value : hasAuthCookie ? null : fallbackProfileSnapshot?.profile || null"
    )
    expect(source).not.toContain("const adminProfilePromise = publicProfileSnapshot ?")
  })

  test("어바웃은 공개 admin profile fetch 실패 때만 snapshot fallback 을 사용한다", () => {
    const source = readNormalizedSource("../src/pages/about.tsx")

    expect(source).toContain(
      "const fallbackProfileSnapshot = !hasAuthCookie ? resolvePublicAdminProfileSnapshot(req) : null"
    )
    expect(source).toContain("const adminProfileResult = await timed(() => fetchServerAdminProfile(req, {")
    expect(source).toContain(
      "adminProfileResult.ok && adminProfileResult.value ? adminProfileResult.value : hasAuthCookie ? buildStaticAdminProfileSnapshot() : fallbackProfileSnapshot?.profile || buildStaticAdminProfileSnapshot()"
    )
    expect(source).not.toContain("const adminProfileResult = publicProfileSnapshot ?")
  })
})
