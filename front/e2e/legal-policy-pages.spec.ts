import { expect, test, type Page } from "@playwright/test"
import { addPublicAboutSnapshotCookie, mockAvatarAsset, mockFeedEndpoints } from "./helpers/smokeFixtures"

const internalPolicyTokens = [
  "법무·운영 확인 필요 항목",
  "reviewRequired",
  "출시 gate",
  "별도 이슈",
  "추후 확정",
  "구현 후 제공",
  "consent manager",
]

const expectNoInternalPolicyTodos = async (page: Page) => {
  for (const token of internalPolicyTokens) {
    await expect(page.getByText(token, { exact: false })).toHaveCount(0)
  }
}

test.describe("legal policy public pages", () => {
  test("effective policy pages expose public notices without internal review todos", async ({ page }) => {
    await page.goto("/privacy", { waitUntil: "domcontentloaded" })

    await expect(page).toHaveTitle(/개인정보처리방침/)
    await expect(page.locator("meta[name='robots']")).toHaveAttribute("content", /index/)
    await expect(page.getByRole("heading", { name: "개인정보처리방침" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "처리하는 개인정보 항목과 수집 방법" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "개인정보 처리위탁" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "개인정보 국외이전" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "이용자와 법정대리인의 권리 및 행사방법" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "쿠키·로컬 저장소·온라인 식별자" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "개인정보 보호책임자 또는 담당자" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "개인정보 침해·민원 구제 절차" })).toBeVisible()
    await expect(page.getByText("illusiveman7@gmail.com")).toHaveCount(0)
    await expectNoInternalPolicyTodos(page)
    await expect(page.getByRole("link", { name: /aquilaxk10@gmail\.com/ })).toHaveAttribute(
      "href",
      "mailto:aquilaxk10@gmail.com?subject=AquilaLog%20%EB%8D%B0%EC%9D%B4%ED%84%B0%20%EC%82%AD%EC%A0%9C%20%EC%9A%94%EC%B2%AD",
    )

    await page.goto("/terms", { waitUntil: "domcontentloaded" })

    await expect(page).toHaveTitle(/이용약관/)
    await expect(page.locator("meta[name='robots']")).toHaveAttribute("content", /index/)
    await expect(page.getByRole("heading", { name: "이용약관" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "이용계약 성립" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "게시글·댓글·파일 등 이용자 콘텐츠" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "금지행위" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "서비스 변경·점검·중단" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "통지", exact: true })).toBeVisible()
    await expect(page.getByRole("link", { name: "aquilaxk10@gmail.com" })).toBeVisible()
    await expect(page.getByText("illusiveman7@gmail.com")).toHaveCount(0)
    await expectNoInternalPolicyTodos(page)
    await expect(page.getByRole("link", { name: "개인정보처리방침" })).toHaveAttribute("href", "/privacy")

    await page.goto("/legal/cookies/1.0.1", { waitUntil: "domcontentloaded" })

    await expect(page).toHaveTitle(/쿠키 정책/)
    await expect(page.getByRole("heading", { name: "쿠키 정책", exact: true })).toBeVisible()
    await expect(page.getByRole("heading", { name: "필수 쿠키" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Analytics와 RUM" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "관리 방법" })).toBeVisible()
    await expectNoInternalPolicyTodos(page)
  })

  test("auth, signup, modal, and footer surfaces link to privacy and terms", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" })

    await expect(page.getByRole("link", { name: "개인정보처리방침" })).toHaveAttribute("href", "/privacy")
    await expect(page.getByRole("link", { name: "이용약관" })).toHaveAttribute("href", "/terms")

    await page.goto("/login?oauthError=signup-required", { waitUntil: "domcontentloaded" })
    await expect(page.getByText("소셜 로그인 신규 가입은 현재 지원하지 않습니다.")).toBeVisible()

    await page.goto("/signup", { waitUntil: "domcontentloaded" })

    const signupForm = page.locator("form")
    const signupSubmitButton = signupForm.getByRole("button", { name: "인증 메일 보내기" })

    await expect(page.getByText("회원가입을 진행하려면 필수 약관과 개인정보처리방침에 동의해야 합니다.")).toBeVisible()
    await expect(signupSubmitButton).toBeDisabled()
    await expect(signupForm.getByRole("button", { name: "카카오로 로그인" })).toHaveCount(0)
    await expect(signupForm.getByRole("link", { name: "개인정보처리방침" })).toHaveAttribute("href", "/privacy")
    await expect(signupForm.getByRole("link", { name: "이용약관" })).toHaveAttribute("href", "/terms")
    await signupForm.getByRole("checkbox", { name: /이용약관/ }).check()
    await expect(signupSubmitButton).toBeDisabled()
    await signupForm.getByRole("checkbox", { name: /개인정보처리방침/ }).check()
    await expect(signupSubmitButton).toBeEnabled()

    await mockAvatarAsset(page)
    await addPublicAboutSnapshotCookie(page)
    await mockFeedEndpoints(page)
    await page.goto("/", { waitUntil: "domcontentloaded" })

    await page.getByRole("button", { name: "Login" }).click()
    const authDialog = page.getByRole("dialog")
    await authDialog.getByRole("button", { name: "회원가입" }).click()
    const modalSignupButton = authDialog.getByRole("button", { name: "인증 메일 보내기" })

    await expect(authDialog.getByText("회원가입을 진행하려면 필수 약관과 개인정보처리방침에 동의해야 합니다.")).toBeVisible()
    await expect(modalSignupButton).toBeDisabled()
    await expect(authDialog.getByRole("button", { name: "카카오로 로그인" })).toHaveCount(0)
    await expect(authDialog.getByRole("link", { name: "개인정보처리방침" })).toHaveAttribute("href", "/privacy")
    await expect(authDialog.getByRole("link", { name: "이용약관" })).toHaveAttribute("href", "/terms")
    await authDialog.getByRole("checkbox", { name: /이용약관/ }).check()
    await expect(modalSignupButton).toBeDisabled()
    await authDialog.getByRole("checkbox", { name: /개인정보처리방침/ }).check()
    await expect(modalSignupButton).toBeEnabled()
    await authDialog.getByRole("button", { name: "닫기" }).click()

    const footer = page.locator("footer")

    await expect(footer.getByRole("link", { name: "개인정보처리방침" })).toHaveAttribute(
      "href",
      "/privacy",
    )
    await expect(footer.getByRole("link", { name: "이용약관" })).toHaveAttribute(
      "href",
      "/terms",
    )
  })
})
