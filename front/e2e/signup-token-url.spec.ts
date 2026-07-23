import { expect, test } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"

const repoRoot = path.resolve(__dirname, "../..")

const readRepoFile = (relativePath: string) => fs.readFileSync(path.join(repoRoot, relativePath), "utf8")

test("signup verify flow keeps token and completion email out of query URLs", () => {
  const signupVerifyPage = readRepoFile("front/src/pages/signup/verify.tsx")
  const appPage = readRepoFile("front/src/pages/_app.tsx")
  const signupVerificationService = readRepoFile(
    "back/src/main/kotlin/com/back/boundedContexts/member/subContexts/signupVerification/application/service/MemberSignupVerificationService.kt",
  )
  const signupVerificationController = readRepoFile(
    "back/src/main/kotlin/com/back/boundedContexts/member/subContexts/signupVerification/adapter/web/ApiV1SignupVerificationController.kt",
  )
  const socialSignupPage = readRepoFile("front/src/pages/signup/social/complete.tsx")
  const oauthFailureHandler = readRepoFile(
    "back/src/main/kotlin/com/back/global/security/config/oauth2/CustomOAuth2LoginFailureHandler.kt",
  )

  expect(signupVerifyPage).toContain("window.location.hash")
  expect(signupVerifyPage).toContain("window.history.replaceState")
  expect(signupVerifyPage).toContain("verificationTokenRef.current ?? readSignupVerificationTokenFromFragment()")
  expect(signupVerifyPage).toContain("setVerifyRetryCount")
  expect(signupVerifyPage).toContain('"/member/api/v1/signup/email/verify"')
  expect(signupVerifyPage).not.toContain("router.query.token")
  expect(signupVerifyPage).not.toContain("/email/verify?token=")
  expect(signupVerifyPage).not.toContain("signup=done&email=")
  expect(signupVerifyPage).not.toContain("signupToken:")
  expect(appPage).toContain('"/signup/verify"')
  expect(appPage).toContain('"/signup/social/complete"')
  expect(appPage).toContain("shouldRenderVercelTelemetry")
  expect(appPage).toContain("filterSensitiveSignupTelemetry")
  expect(appPage).toContain("<Analytics beforeSend={filterSensitiveSignupTelemetry} />")
  expect(appPage).toContain("<SpeedInsights beforeSend={filterSensitiveSignupTelemetry} />")
  expect(appPage).toContain("return new URL(url,")
  expect(appPage).toContain("? null : event")

  expect(signupVerificationService).toContain('append("#token=")')
  expect(signupVerificationService).not.toContain('append("?token=")')
  expect(signupVerificationService).not.toContain("findByEmailVerificationToken(")
  expect(signupVerificationService).not.toContain("findBySignupSessionToken(")

  expect(signupVerificationController).toContain("SIGNUP_SESSION_COOKIE_NAME")
  expect(signupVerificationController).toContain("@PostMapping(\"/email/verify\")")
  expect(signupVerificationController).toContain("@GetMapping(\"/email/verify\")")
  expect(signupVerificationController).not.toContain("@RequestParam token")

  expect(socialSignupPage).toContain("window.location.hash")
  expect(socialSignupPage).toContain("window.history.replaceState")
  expect(socialSignupPage).toContain('"/member/api/v1/signup/social/pending"')
  expect(socialSignupPage).toContain('"/member/api/v1/signup/social/complete"')
  expect(socialSignupPage).not.toContain("router.query.token")
  expect(oauthFailureHandler).toContain("appendFragment")
  expect(oauthFailureHandler).toContain("signup/social/complete")
})
