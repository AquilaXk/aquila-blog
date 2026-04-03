import { readFileSync } from "node:fs"
import path from "node:path"
import { expect, test } from "@playwright/test"

test.describe("admin bootstrap state contract", () => {
  test("관리자 허브는 auth/session 선조회 대신 protected bootstrap으로 first paint 프로필을 구성한다", () => {
    const adminSource = readFileSync(path.resolve(__dirname, "../src/pages/admin.tsx"), "utf8")

    expect(adminSource).toContain('"/member/api/v1/adm/members/bootstrap"')
    expect(adminSource).toContain("readAdminProtectedBootstrap<AdminHubBootstrapPayload>(req, \"/member/api/v1/adm/members/bootstrap\", \"/admin\")")
    expect(adminSource).toContain("baseProps = buildAdminPagePropsFromMember(bootstrapResult.value.value.member)")
    expect(adminSource).toContain('profileDescription = "bootstrap"')
  })

  test("관리자 글 작업공간은 auth/session 선조회 대신 protected bootstrap으로 first paint를 구성한다", () => {
    const adminPageSource = readFileSync(path.resolve(__dirname, "../src/libs/server/adminPage.ts"), "utf8")
    const postsSource = readFileSync(path.resolve(__dirname, "../src/routes/Admin/AdminPostsWorkspacePage.tsx"), "utf8")

    expect(adminPageSource).toContain("export const buildAdminPagePropsFromMember = (member: AuthMember): AdminPageProps => {")
    expect(adminPageSource).toContain("queryClient.setQueryData(queryKey.authMeProbe(), true)")
    expect(adminPageSource).toContain("queryClient.setQueryData(queryKey.authMe(), member)")
    expect(adminPageSource).toContain("export const readAdminProtectedBootstrap = async <T>(")

    expect(postsSource).toContain('"/post/api/v1/adm/posts/bootstrap"')
    expect(postsSource).toContain("readAdminProtectedBootstrap<AdminPostsBootstrapPayload>(")
    expect(postsSource).toContain("baseProps = buildAdminPagePropsFromMember(bootstrapResult.value.value.member)")
    expect(postsSource).toContain('source: "bootstrap"')
  })

  test("운영 진단은 auth/session 선조회 대신 protected bootstrap으로 health summary를 first paint에 주입한다", () => {
    const toolsSource = readFileSync(path.resolve(__dirname, "../src/pages/admin/tools.tsx"), "utf8")

    expect(toolsSource).toContain('"/system/api/v1/adm/bootstrap"')
    expect(toolsSource).toContain("readAdminProtectedBootstrap<AdminToolsBootstrapPayload>(req, \"/system/api/v1/adm/bootstrap\", \"/admin/tools\")")
    expect(toolsSource).toContain("baseProps = buildAdminPagePropsFromMember(bootstrapResult.value.value.member)")
    expect(toolsSource).toContain("systemHealth: bootstrapResult.value.value.health")
    expect(toolsSource).toContain('source: "bootstrap"')
  })
})
