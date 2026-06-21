import { expect, test } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"

const repoRoot = path.resolve(__dirname, "../..")

const readRepoFile = (relativePath: string) => fs.readFileSync(path.join(repoRoot, relativePath), "utf8")

test("signup verify flow keeps token and completion email out of query URLs", () => {
  const signupVerifyPage = readRepoFile("front/src/pages/signup/verify.tsx")
  const signupVerificationService = readRepoFile(
    "back/src/main/kotlin/com/back/boundedContexts/member/subContexts/signupVerification/application/service/MemberSignupVerificationService.kt",
  )
  const signupVerificationController = readRepoFile(
    "back/src/main/kotlin/com/back/boundedContexts/member/subContexts/signupVerification/adapter/web/ApiV1SignupVerificationController.kt",
  )

  expect(signupVerifyPage).toContain("window.location.hash")
  expect(signupVerifyPage).toContain("window.history.replaceState")
  expect(signupVerifyPage).toContain('"/member/api/v1/signup/email/verify"')
  expect(signupVerifyPage).not.toContain("router.query.token")
  expect(signupVerifyPage).not.toContain("/email/verify?token=")
  expect(signupVerifyPage).not.toContain("signup=done&email=")
  expect(signupVerifyPage).not.toContain("signupToken:")

  expect(signupVerificationService).toContain('append("#token=")')
  expect(signupVerificationService).not.toContain('append("?token=")')
  expect(signupVerificationService).not.toContain("findByEmailVerificationToken(")
  expect(signupVerificationService).not.toContain("findBySignupSessionToken(")

  expect(signupVerificationController).toContain("SIGNUP_SESSION_COOKIE_NAME")
  expect(signupVerificationController).toContain("@PostMapping(\"/email/verify\")")
  expect(signupVerificationController).toContain("@GetMapping(\"/email/verify\")")
  expect(signupVerificationController).not.toContain("@RequestParam token")
})
