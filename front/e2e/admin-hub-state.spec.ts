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
    expect(source).toContain("const profilePriorityAction =")
    expect(source).toContain("const priorityActions =")
    expect(source).toContain("const handoffActions =")
    expect(source).toContain("const supportRailGroups = [")
    expect(source).toContain('title: "프로필 완성도"')
    expect(source).toContain('title: "빠른 이동"')
    expect(source).toContain('title: "최근 변경"')
    expect(source).toContain("priorityActions={priorityActions}")
    expect(source).toContain("handoffActions={handoffActions}")
    expect(source).toContain("supportRailGroups={supportRailGroups}")
  })

  test("admin hub uses backstage landing copy instead of generic management labels", () => {
    const source = readFileSync(path.resolve(__dirname, "../src/routes/Admin/AdminHubSurface.tsx"), "utf8")

    expect(source).toContain("오늘 블로그 운영은 이 흐름으로 정리됩니다")
    expect(source).toContain("<h2>지금 할 일</h2>")
    expect(source).toContain("<h2>최근 작업</h2>")
    expect(source).toContain("<h2>공개 노출 상태</h2>")
    expect(source).toContain('aria-label="허브 지원 정보"')
    expect(source).toContain("resolvedSupportRailGroups.map((group) => (")
    expect(source).toContain("<h3>{group.title}</h3>")
    expect(source).toContain("priorityActions: AdminHubNextAction[]")
    expect(source).toContain("handoffActions: AdminHubNextAction[]")
    expect(source).not.toContain("const SummaryRail = styled.div`")
    expect(source).not.toContain("showDeferredPanels")
    expect(source).not.toContain("requestIdleCallback")
  })

  test("dashboard first fold uses main-like priority copy and explicit rail labels", () => {
    const source = readFileSync(path.resolve(__dirname, "../src/pages/admin/dashboard.tsx"), "utf8")

    expect(source).toContain("지금 확인해야 할 운영 상태")
    expect(source).toContain("<strong>최근 실패</strong>")
    expect(source).toContain("<strong>런북</strong>")
    expect(source).toContain("<strong>즉시 이동</strong>")
  })
})
