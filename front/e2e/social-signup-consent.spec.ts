import { expect, test } from "@playwright/test"

test("social signup completion keeps token in fragment and requires legal consent", async ({ page }) => {
  let pendingRequestBody: unknown = null
  let completeRequestBody: Record<string, unknown> | null = null

  await page.route("**/member/api/v1/signup/social/pending", async (route) => {
    pendingRequestBody = route.request().postDataJSON()
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        resultCode: "200-3",
        msg: "소셜 회원가입 세션을 확인했습니다.",
        data: {
          provider: "KAKAO",
          nickname: "카카오닉네임",
          profileImgUrl: null,
          expiresAt: "2026-06-22T10:00:00Z",
        },
      }),
    })
  })

  await page.route("**/member/api/v1/signup/social/complete", async (route) => {
    completeRequestBody = route.request().postDataJSON()
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        resultCode: "201-3",
        msg: "소셜 회원가입이 완료되었습니다.",
        data: {
          id: 77,
          username: "KAKAO__hashed-subject",
          nickname: completeRequestBody?.nickname,
        },
      }),
    })
  })

  await page.goto("/signup/social/complete#token=social-token&provider=kakao&next=%2Fposts%2F1")

  await expect(page).toHaveURL(/\/signup\/social\/complete$/)
  await expect(page.getByRole("heading", { name: "소셜 회원가입" })).toBeVisible()
  await expect(page.getByLabel("소셜 회원가입 프로필 정보")).toContainText("카카오닉네임")
  await expect(page.getByLabel("Kakao OAuth 처리 항목")).toContainText("Kakao OAuth provider subject hash")
  await expect(page.getByRole("button", { name: "가입" })).toBeDisabled()
  expect(pendingRequestBody).toEqual({ token: "social-token" })

  await page.getByLabel("프로필 이름").fill("최종닉네임")
  await page.getByRole("checkbox", { name: /만 14세 이상/ }).check()
  await page.getByRole("checkbox", { name: /개인정보처리방침/ }).check()
  await page.getByRole("checkbox", { name: /Kakao OAuth와 서비스 운영/ }).check()
  await expect(page.getByRole("button", { name: "가입" })).toBeEnabled()
  await page.getByRole("button", { name: "가입" }).click()

  await expect(page).toHaveURL(/\/login\?signup=done&next=%2Fposts%2F1/)
  expect(completeRequestBody).toMatchObject({
    token: "social-token",
    nickname: "최종닉네임",
    age14OrOlder: true,
    requiredPrivacyConfirmed: true,
    overseasTransferAcknowledged: true,
    analyticsConsent: false,
  })
  expect(JSON.stringify(completeRequestBody)).not.toContain("password")
})
