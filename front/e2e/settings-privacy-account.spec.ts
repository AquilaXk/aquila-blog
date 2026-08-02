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

const legalReconsentCurrent = {
  status: "CURRENT",
  required: false,
  termsVersion: "1.0.2",
  termsContentSha256: "a".repeat(64),
  privacyVersion: "1.0.3",
  privacyContentSha256: "b".repeat(64),
  acceptedAt: "2026-06-21T00:10:00Z",
  refusalGuidePath: "/settings/privacy",
  exportGuidePath: "/settings/privacy",
  deletionGuidePath: "/settings/privacy",
}

const legalReconsentRequired = {
  ...legalReconsentCurrent,
  status: "RECONSENT_REQUIRED",
  required: true,
  acceptedAt: null,
}

const fulfillLegalSession = async (
  page: import("@playwright/test").Page,
  legalReconsent: Record<string, unknown>
) => {
  await page.route("**/member/api/v1/auth/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ legalReconsent }),
    })
  })
}

const fulfillPrivacyExport = async (page: import("@playwright/test").Page) => {
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
  await fulfillLegalSession(page, legalReconsentCurrent)
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
  await expect(page.getByRole("heading", { name: "선택 분석" })).toBeVisible()
  await expect(page.getByText("privacy-user@example.com")).toBeVisible()
  await expect(page.getByText("개인정보처리방침 1.0.2")).toBeVisible()

  // 1597: 게이트가 아닌 일반 방문은 게이트 표식 없이 현재 동의 상태만 보여준다.
  const legalSection = page.getByRole("region", { name: "법적 문서 재동의" })
  await expect(legalSection).not.toHaveAttribute("data-gate", "required")
  await expect(legalSection.getByText("최신 문서에 동의한 상태입니다.")).toBeVisible()

  // 1597: 내부 상태 덤프는 1차 정보에서 제거하고 요약 한 줄 + 접힘 상세로만 노출한다.
  await expect(page.getByText("선택 분석: 꺼짐")).toBeVisible()
  await expect(page.getByText("저장 경로")).toHaveCount(0)
  await expect(page.getByText("브라우저 거부 신호")).toHaveCount(0)
  await expect(page.getByText("선택한 곳")).toBeHidden()
  await page.getByText("내 선택 기록 자세히 보기").click()
  await expect(page.getByText("선택한 곳")).toBeVisible()

  await page.getByRole("button", { name: "선택 분석 켜기" }).click()
  await expect(page.getByText("선택 분석: 켜짐")).toBeVisible()
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

  await page.getByRole("button", { name: "선택 분석 끄기" }).click()
  await expect(page.getByText("선택 분석: 꺼짐")).toBeVisible()
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
  await fulfillLegalSession(page, legalReconsentCurrent)
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

test("settings privacy reconsent gate frames purpose and blocks incomplete consent", async ({ page }) => {
  let reconsentRequestCount = 0

  await fulfillAuthMe(page)
  await fulfillLegalSession(page, legalReconsentRequired)
  await fulfillPrivacyExport(page)
  await page.route("**/member/api/v1/auth/legal-reconsent", async (route) => {
    reconsentRequestCount += 1
    await route.fulfill({ status: 500, contentType: "application/json", body: "{}" })
  })

  await page.goto("/settings/privacy?reconsent=required&next=%2Fsettings%2Faccount")

  const gate = page.getByRole("region", { name: "법적 문서 재동의" })
  await expect(gate).toHaveAttribute("data-gate", "required")
  await expect(gate.getByRole("heading", { name: "계속 이용하려면 다시 동의해 주세요" })).toBeVisible()
  await expect(gate.getByText("최신 버전(이용약관 1.0.2 · 개인정보처리방침 1.0.3)")).toBeVisible()
  await expect(gate.getByText("/settings/account")).toBeVisible()
  await expect(gate.getByText("화면으로 자동으로 돌아갑니다")).toBeVisible()
  await expect(gate.getByRole("checkbox")).toHaveCount(3)
  // 주 행동은 하나만 남긴다: 동급 버튼 병렬 노출이 회귀하지 않게 고정한다.
  await expect(gate.getByRole("button")).toHaveCount(1)
  await expect(page.getByText("저장 경로")).toHaveCount(0)
  await expect(page.getByText("브라우저 거부 신호")).toHaveCount(0)

  await gate.getByRole("button", { name: "동의하고 계속 이용" }).click()

  await expect(gate.getByRole("alert")).toContainText("세 항목을 모두 확인해야 계속 이용할 수 있습니다.")
  await expect(gate.getByLabel("만 14세 이상입니다.")).toBeFocused()
  expect(reconsentRequestCount).toBe(0)
  expect(page.url()).toContain("reconsent=required")
})

test("settings privacy reconsent gate submits three consents and returns to next path", async ({ page }) => {
  let reconsentBody: Record<string, unknown> | null = null

  await fulfillAuthMe(page)
  await fulfillLegalSession(page, legalReconsentRequired)
  await fulfillPrivacyExport(page)
  await page.route("**/member/api/v1/auth/legal-reconsent", async (route) => {
    reconsentBody = route.request().postDataJSON()
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        resultCode: "200-1",
        msg: "최신 약관 동의를 저장했습니다.",
        data: { legalReconsent: legalReconsentCurrent },
      }),
    })
  })

  await page.goto("/settings/privacy?reconsent=required&next=%2Fsettings%2Faccount")

  const gate = page.getByRole("region", { name: "법적 문서 재동의" })
  await expect(gate.getByText("필수 0/3 확인")).toBeVisible()
  await gate.getByLabel("만 14세 이상입니다.").check()
  await gate.getByLabel("필수 개인정보 처리 안내를 확인했습니다.").check()
  await gate.getByLabel("국외 이전 및 외부 처리자 안내를 확인했습니다.").check()
  await expect(gate.getByText("필수 3/3 확인")).toBeVisible()

  await gate.getByRole("button", { name: "동의하고 계속 이용" }).click()

  await expect(page).toHaveURL(/\/settings\/account$/)
  await expect(page.getByRole("heading", { name: "계정 보안" })).toBeVisible()
  expect(reconsentBody).toMatchObject({
    termsVersion: "1.0.2",
    privacyVersion: "1.0.3",
    age14OrOlder: true,
    requiredPrivacyConfirmed: true,
    analyticsConsent: false,
    overseasTransferAcknowledged: true,
  })
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
