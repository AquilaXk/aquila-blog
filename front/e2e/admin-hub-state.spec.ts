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
    expect(source).toContain("const adminProfile = useAdminProfile(initialProfileSnapshot)")
    expect(source).toContain("profileRole: adminProfile?.profileRole || sessionMember?.profileRole || initialProfileSnapshot.profileRole || \"\"")
    expect(source).toContain("profileBio: adminProfile?.profileBio || sessionMember?.profileBio || initialProfileSnapshot.profileBio || \"\"")
    expect(source).toContain("homeIntroTitle:")
    expect(source).toContain("adminProfile?.homeIntroTitle || sessionMember?.homeIntroTitle || initialProfileSnapshot.homeIntroTitle || \"\"")
    expect(source).toContain("serviceLinks: adminProfile?.serviceLinks || sessionMember?.serviceLinks || initialProfileSnapshot.serviceLinks || []")
    expect(source).toContain("contactLinks: adminProfile?.contactLinks || sessionMember?.contactLinks || initialProfileSnapshot.contactLinks || []")
  })
})
