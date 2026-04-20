import { readFileSync } from "node:fs"
import path from "node:path"
import { test, expect } from "@playwright/test"

test.describe("admin hub state contract", () => {
  test("관리자 허브는 live admin profile snapshot을 first paint seed로 사용한다", () => {
    const source = readFileSync(path.resolve(__dirname, "../src/pages/admin.tsx"), "utf8")

    expect(source).toContain("const hasAuthCookie = hasServerAuthCookie(req)")
    expect(source).toContain("const fallbackProfileSnapshot = resolvePublicAdminProfileSnapshot(req)")
    expect(source).toContain("const baseResultPromise = timed(() => getAdminPageProps(req))")
    expect(source).toContain("const adminProfileResultPromise = hasAuthCookie")
    expect(source).toContain("fetchServerAdminProfile(req, {")
    expect(source).toContain("const [baseResult, adminProfileResult] = await Promise.all([baseResultPromise, adminProfileResultPromise])")
    expect(source).toContain("initialProfileSnapshot: profileSnapshot")
    expect(source).toContain("const adminProfile = initialProfileSnapshot")
    expect(source).toContain("profileRole: adminProfile?.profileRole || sessionMember?.profileRole || \"\"")
    expect(source).toContain("profileBio: adminProfile?.profileBio || sessionMember?.profileBio || \"\"")
    expect(source).toContain("homeIntroTitle:")
    expect(source).toContain("adminProfile?.homeIntroTitle || sessionMember?.homeIntroTitle || \"\"")
    expect(source).toContain("serviceLinks: adminProfile?.serviceLinks || sessionMember?.serviceLinks || []")
    expect(source).toContain("contactLinks: adminProfile?.contactLinks || sessionMember?.contactLinks || []")
  })

  test("admin hub uses backstage landing copy instead of generic management labels", () => {
    const source = readFileSync(path.resolve(__dirname, "../src/routes/Admin/AdminHubSurface.tsx"), "utf8")

    expect(source).toContain("오늘 블로그 운영은 이 흐름으로 정리됩니다")
    expect(source).toContain("<h2>지금 할 일</h2>")
    expect(source).toContain("<h2>최근 작업</h2>")
    expect(source).toContain("<h2>공개 노출 상태</h2>")
  })

  test("dashboard first fold uses main-like priority copy and explicit rail labels", () => {
    const source = readFileSync(path.resolve(__dirname, "../src/pages/admin/dashboard.tsx"), "utf8")

    expect(source).toContain("지금 확인해야 할 운영 상태")
    expect(source).toContain("<strong>최근 실패</strong>")
    expect(source).toContain("<strong>런북</strong>")
    expect(source).toContain("<strong>즉시 이동</strong>")
  })
})
