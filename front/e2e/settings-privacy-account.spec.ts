import { expect, test } from "@playwright/test"

const OPTIONAL_TRACKING_CONSENT_STORAGE_KEY = "privacy.optionalTrackingConsent.v1"

const authMember = {
  id: 901,
  createdAt: "2026-06-21T00:00:00Z",
  modifiedAt: "2026-06-22T00:00:00Z",
  username: "privacy-user",
  nickname: "권리행사",
  isAdmin: false,
}

test("settings privacy page exposes export snapshot and creates privacy request", async ({ page }) => {
  let createdRequestBody: Record<string, unknown> | null = null

  await page.route("**/member/api/v1/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(authMember),
    })
  })
  await page.route("**/member/api/v1/privacy/export", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        resultCode: "200-1",
        msg: "개인정보 내보내기 데이터를 조회했습니다.",
        data: {
          generatedAt: "2026-06-22T01:00:00Z",
          member: {
            id: authMember.id,
            email: "privacy-user@example.com",
            username: authMember.username,
            nickname: authMember.nickname,
            createdAt: authMember.createdAt,
            modifiedAt: authMember.modifiedAt,
          },
          latestLegalAcceptance: {
            termsVersion: "1.0.1",
            privacyVersion: "1.0.1",
            analyticsConsent: false,
            overseasTransferAcknowledged: true,
            acceptedAt: "2026-06-21T00:10:00Z",
          },
        },
      }),
    })
  })
  await page.route("**/member/api/v1/privacy/requests", async (route) => {
    createdRequestBody = route.request().postDataJSON()
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        resultCode: "201-1",
        msg: "개인정보 처리 요청을 접수했습니다.",
        data: {
          item: {
            id: 77,
            memberId: authMember.id,
            type: "EXPORT",
            status: "RECEIVED",
            message: createdRequestBody?.message,
            requestedAt: "2026-06-22T01:01:00Z",
            dueAt: "2026-07-22T01:01:00Z",
            completedAt: null,
          },
        },
      }),
    })
  })

  await page.goto("/settings/privacy")

  await expect(page.getByRole("heading", { name: "개인정보 관리" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "선택 analytics·RUM" })).toBeVisible()
  await expect(page.getByText("privacy-user@example.com")).toBeVisible()
  await expect(page.getByText("개인정보처리방침 1.0.1")).toBeVisible()

  await page.getByRole("button", { name: "선택 분석 동의" }).click()
  await expect(page.getByText("동의됨")).toBeVisible()
  const grantedConsent = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) || "{}"), OPTIONAL_TRACKING_CONSENT_STORAGE_KEY)
  expect(grantedConsent).toMatchObject({
    version: 1,
    state: "granted",
    source: "settings",
    categories: {
      analytics: true,
      rum: true,
    },
  })
  expect(typeof grantedConsent.updatedAt).toBe("string")

  await page.getByRole("button", { name: "선택 분석 거부·철회" }).click()
  await expect(page.getByText("거부됨")).toBeVisible()
  const deniedConsent = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) || "{}"), OPTIONAL_TRACKING_CONSENT_STORAGE_KEY)
  expect(deniedConsent).toMatchObject({
    version: 1,
    state: "denied",
    source: "settings",
    categories: {
      analytics: false,
      rum: false,
    },
  })

  await page.getByLabel("요청 사유").fill("가입 정보와 운영 로그 열람을 요청합니다.")
  await page.getByRole("button", { name: "처리 요청 접수" }).click()

  await expect(page.getByText("개인정보 처리 요청을 접수했습니다.")).toBeVisible()
  await expect(page.getByText("접수 번호 77")).toBeVisible()
  expect(createdRequestBody).toMatchObject({
    type: "EXPORT",
    message: "가입 정보와 운영 로그 열람을 요청합니다.",
  })
})

test("settings account page deletes account after password reauthentication", async ({ page }) => {
  let deletionRequestBody: Record<string, unknown> | null = null

  await page.route("**/member/api/v1/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(authMember),
    })
  })
  await page.route("**/member/api/v1/privacy/account", async (route) => {
    deletionRequestBody = route.request().postDataJSON()
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        resultCode: "200-1",
        msg: "계정 탈퇴가 완료되었습니다.",
        data: {
          memberId: authMember.id,
          deletedAt: "2026-06-22T01:10:00Z",
          revokedSessionCount: 2,
        },
      }),
    })
  })

  await page.goto("/settings/account")

  await expect(page.getByRole("heading", { name: "계정 보안" })).toBeVisible()
  await page.getByLabel("비밀번호 재확인 (이메일 계정)").fill("Abcd1234!")
  await page.getByLabel("탈퇴 사유").fill("서비스 이용 종료")
  await page.getByRole("checkbox", { name: "계정 탈퇴 영향을 확인했습니다." }).check()
  await page.getByRole("button", { name: "계정 탈퇴" }).click()

  await expect(page.getByText("계정 탈퇴가 완료되었습니다.")).toBeVisible()
  await expect(page.getByText("폐기된 세션 2개")).toBeVisible()
  expect(deletionRequestBody).toMatchObject({
    password: "Abcd1234!",
    reason: "서비스 이용 종료",
  })
})

test("settings account page sends oauth confirmation when password is empty", async ({ page }) => {
  let deletionRequestBody: Record<string, unknown> | null = null

  await page.route("**/member/api/v1/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(authMember),
    })
  })
  await page.route("**/member/api/v1/privacy/account", async (route) => {
    deletionRequestBody = route.request().postDataJSON()
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        resultCode: "200-1",
        msg: "계정 탈퇴가 완료되었습니다.",
        data: {
          memberId: authMember.id,
          deletedAt: "2026-06-22T01:20:00Z",
          revokedSessionCount: 1,
        },
      }),
    })
  })

  await page.goto("/settings/account")

  await expect(page.getByText("비밀번호가 없는 소셜 계정은 비워두고 확인 체크 후 진행합니다.")).toBeVisible()
  await page.getByLabel("탈퇴 사유").fill("소셜 계정 탈퇴")
  await page.getByRole("checkbox", { name: "계정 탈퇴 영향을 확인했습니다." }).check()
  await page.getByRole("button", { name: "계정 탈퇴" }).click()

  await expect(page.getByText("계정 탈퇴가 완료되었습니다.")).toBeVisible()
  expect(deletionRequestBody).toMatchObject({
    oauthAccountDeletionConfirmed: true,
    reason: "소셜 계정 탈퇴",
  })
  expect(deletionRequestBody).not.toHaveProperty("password")
})
