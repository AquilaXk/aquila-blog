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

const fulfillAuthMe = async (page: import("@playwright/test").Page) => {
  await page.route("**/member/api/v1/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(authMember),
    })
  })
}

const confirmAccountDeletion = async (page: import("@playwright/test").Page) => {
  await page.getByRole("button", { name: "계정 탈퇴" }).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText(authMember.nickname)).toBeVisible()
  await expect(dialog.getByText("되돌릴 수 없습니다")).toBeVisible()
  await dialog.getByRole("button", { name: "계정 탈퇴" }).click()
}

test("settings privacy page exposes export snapshot and creates privacy request", async ({ page }) => {
  let createdRequestBody: Record<string, unknown> | null = null

  await fulfillAuthMe(page)
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
            privacyVersion: "1.0.2",
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
  await expect(page.getByText("개인정보처리방침 1.0.2")).toBeVisible()

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

  const successFeedback = page.getByRole("status").filter({ hasText: "개인정보 처리 요청을 접수했습니다." })
  await expect(successFeedback).toBeVisible()
  await expect(successFeedback).toHaveAttribute("data-tone", "success")
  await expect(page.getByText("접수 번호 77")).toBeVisible()
  expect(createdRequestBody).toMatchObject({
    type: "EXPORT",
    message: "가입 정보와 운영 로그 열람을 요청합니다.",
  })
})

test("settings privacy request failure prefers server message with danger tone", async ({ page }) => {
  await fulfillAuthMe(page)
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
          latestLegalAcceptance: null,
        },
      }),
    })
  })
  await page.route("**/member/api/v1/privacy/requests", async (route) => {
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        resultCode: "400-1",
        msg: "요청 사유가 너무 짧습니다.",
      }),
    })
  })

  await page.goto("/settings/privacy")
  await page.getByLabel("요청 사유").fill("짧음")
  await page.getByRole("button", { name: "처리 요청 접수" }).click()

  const alert = page.getByRole("alert").filter({ hasText: "요청 사유가 너무 짧습니다." })
  await expect(alert).toBeVisible()
  await expect(alert).toHaveAttribute("data-tone", "danger")
})

test("settings account page deletes account after password reauthentication", async ({ page }) => {
  let deletionRequestBody: Record<string, unknown> | null = null

  await fulfillAuthMe(page)
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
  await confirmAccountDeletion(page)

  await expect(page.getByRole("heading", { name: "계정 탈퇴 완료" })).toBeVisible()
  await expect(page.getByText("계정 탈퇴가 완료되었습니다.")).toBeVisible()
  await expect(page.getByText("폐기된 세션 2개")).toBeVisible()
  await expect(page.getByRole("link", { name: "홈으로 이동" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "설정" })).toHaveCount(0)
  await expect(page.getByText("로그인 후 개인정보와 계정 설정을 관리할 수 있습니다.")).toHaveCount(0)
  expect(deletionRequestBody).toMatchObject({
    password: "Abcd1234!",
    reason: "서비스 이용 종료",
  })
})

test("settings account page sends oauth confirmation when password is empty", async ({ page }) => {
  let deletionRequestBody: Record<string, unknown> | null = null

  await fulfillAuthMe(page)
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
  await confirmAccountDeletion(page)

  await expect(page.getByRole("heading", { name: "계정 탈퇴 완료" })).toBeVisible()
  await expect(page.getByText("계정 탈퇴가 완료되었습니다.")).toBeVisible()
  expect(deletionRequestBody).toMatchObject({
    oauthAccountDeletionConfirmed: true,
    reason: "소셜 계정 탈퇴",
  })
  expect(deletionRequestBody).not.toHaveProperty("password")
})

test("settings account page completes deletion when revokedSessionCount is missing on 2xx", async ({ page }) => {
  await fulfillAuthMe(page)
  await page.route("**/member/api/v1/privacy/account", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        resultCode: "200-1",
        msg: "계정 탈퇴가 완료되었습니다.",
        data: {
          memberId: authMember.id,
          deletedAt: "2026-06-22T01:30:00Z",
        },
      }),
    })
  })

  await page.goto("/settings/account")

  await page.getByLabel("비밀번호 재확인 (이메일 계정)").fill("Abcd1234!")
  await page.getByRole("checkbox", { name: "계정 탈퇴 영향을 확인했습니다." }).check()
  await confirmAccountDeletion(page)

  await expect(page.getByRole("heading", { name: "계정 탈퇴 완료" })).toBeVisible()
  await expect(page.getByText("계정 탈퇴가 완료되었습니다.")).toBeVisible()
  await expect(page.getByText(/폐기된 세션/)).toHaveCount(0)
  await expect(page.getByRole("link", { name: "홈으로 이동" })).toBeVisible()
})

test("settings account page shows password field error for 400 deletion failure", async ({ page }) => {
  await fulfillAuthMe(page)
  await page.route("**/member/api/v1/privacy/account", async (route) => {
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        resultCode: "400-1",
        msg: "비밀번호를 입력해주세요.",
      }),
    })
  })

  await page.goto("/settings/account")
  await page.getByLabel("비밀번호 재확인 (이메일 계정)").fill("wrong-password")
  await page.getByRole("checkbox", { name: "계정 탈퇴 영향을 확인했습니다." }).check()
  await confirmAccountDeletion(page)

  const alert = page.getByRole("alert").filter({ hasText: "비밀번호를 입력해주세요." })
  await expect(alert).toBeVisible()
  await expect(alert).toHaveAttribute("data-tone", "danger")
  await expect(page.getByRole("heading", { name: "계정 탈퇴 완료" })).toHaveCount(0)
})

test("settings account page shows password field error for wrong-password 401", async ({ page }) => {
  await fulfillAuthMe(page)
  await page.route("**/member/api/v1/privacy/account", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({
        resultCode: "401-1",
        msg: "비밀번호가 일치하지 않습니다.",
      }),
    })
  })

  await page.goto("/settings/account")
  await page.getByLabel("비밀번호 재확인 (이메일 계정)").fill("wrong-password")
  await page.getByRole("checkbox", { name: "계정 탈퇴 영향을 확인했습니다." }).check()
  await confirmAccountDeletion(page)

  const alert = page.getByRole("alert").filter({ hasText: "비밀번호가 일치하지 않습니다." })
  await expect(alert).toBeVisible()
  await expect(alert).toHaveAttribute("data-tone", "danger")
  await expect(page.getByRole("heading", { name: "계정 탈퇴 완료" })).toHaveCount(0)
  await expect(page.getByRole("link", { name: "다시 로그인" })).toHaveCount(0)
})

test("settings account page guides re-login for 401 deletion failure", async ({ page }) => {
  await fulfillAuthMe(page)
  await page.route("**/member/api/v1/privacy/account", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({
        resultCode: "401-1",
        msg: "인증이 필요합니다.",
      }),
    })
  })

  await page.goto("/settings/account")
  await page.getByLabel("비밀번호 재확인 (이메일 계정)").fill("Abcd1234!")
  await page.getByRole("checkbox", { name: "계정 탈퇴 영향을 확인했습니다." }).check()
  await confirmAccountDeletion(page)

  const alert = page.getByRole("alert").filter({ hasText: "세션이 만료되었습니다. 다시 로그인해 주세요" })
  await expect(alert).toBeVisible()
  await expect(alert).toHaveAttribute("data-tone", "danger")
  await expect(page.getByRole("link", { name: "다시 로그인" })).toBeVisible()
})
