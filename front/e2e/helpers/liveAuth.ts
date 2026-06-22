import { expect, type Page } from "@playwright/test"

export const adminEmail = process.env.E2E_ADMIN_EMAIL?.trim() || ""
export const adminLegacyLoginId = process.env.E2E_ADMIN_USERNAME?.trim() || ""
export const adminPassword = process.env.E2E_ADMIN_PASSWORD?.trim() || ""
export const explicitApiBaseUrl = process.env.E2E_API_BASE_URL?.trim() || ""
export const liveApiProbeAttempts = Number.parseInt(process.env.E2E_LIVE_API_PROBE_ATTEMPTS || "4", 10)
export const liveLoginAttempts = Number.parseInt(process.env.E2E_LIVE_LOGIN_ATTEMPTS || "3", 10)
export const liveLoginTimeoutMs = Number.parseInt(process.env.E2E_LIVE_LOGIN_TIMEOUT_MS || "30000", 10)
export const liveRetryBaseDelayMs = Number.parseInt(process.env.E2E_LIVE_RETRY_BASE_DELAY_MS || "2000", 10)
export const liveUiRedirectTimeoutMs = Number.parseInt(process.env.E2E_LIVE_UI_REDIRECT_TIMEOUT_MS || "20000", 10)
export const quickReconsentProbeTimeoutMs = 1_500

export const stripTrailingSlash = (value: string) => value.replace(/\/+$/, "")
export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export const resolveApiBaseUrl = (currentUrl: string) => {
  if (explicitApiBaseUrl) return stripTrailingSlash(explicitApiBaseUrl)

  const parsed = new URL(currentUrl)

  if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
    const localApiPort = process.env.E2E_LOCAL_API_PORT?.trim() || "8080"
    return `${parsed.protocol}//${parsed.hostname}:${localApiPort}`
  }

  if (parsed.hostname.startsWith("www.")) {
    parsed.hostname = `api.${parsed.hostname.slice(4)}`
    return `${parsed.protocol}//${parsed.host}`
  }

  parsed.hostname = `api.${parsed.hostname}`
  return `${parsed.protocol}//${parsed.host}`
}

export const isRetriableNetworkError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  return /(timeout|econnreset|enotfound|etimedout|econnrefused)/i.test(message)
}

export const isRetriableLoginStatus = (status: number) => [502, 503, 504, 520, 522, 524, 530].includes(status)
export const isInvalidLoginRequestBody = (status: number, body: string) =>
  status === 400 &&
  /"resultCode"\s*:\s*"400-1"/.test(body) &&
  /요청 본문이 올바르지 않습니다\./.test(body)

export const hasAuthCookie = async (page: Page) => {
  const currentUrl = page.url()
  const cookies = /^https?:\/\//.test(currentUrl)
    ? await page.context().cookies([new URL(currentUrl).origin])
    : await page.context().cookies()
  return cookies.some((cookie) => cookie.name === "apiKey" || cookie.name === "accessToken")
}

export const isNavigationInterruptedError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  return /(interrupted by another navigation|net::ERR_ABORTED)/i.test(message)
}

export const isLegalReconsentGateUrl = (url: string) => {
  try {
    const parsed = new URL(url)
    return parsed.pathname === "/settings/privacy" && parsed.searchParams.get("reconsent") === "required"
  } catch {
    return false
  }
}

const isCurrentFallbackPath = (currentUrl: string, fallbackPath: string) => {
  try {
    const current = new URL(currentUrl)
    const fallback = new URL(fallbackPath, current.origin)
    return current.pathname === fallback.pathname
  } catch {
    return false
  }
}

export const completeLegalReconsentIfRequired = async (
  page: Page,
  fallbackPath: string,
  timeoutMs = liveUiRedirectTimeoutMs,
  probeTimeoutMs = quickReconsentProbeTimeoutMs
) => {
  const reconsentPanel = page.getByRole("region", { name: "법적 문서 재동의" })
  let isGate = isLegalReconsentGateUrl(page.url()) || (await reconsentPanel.isVisible().catch(() => false))
  if (!isGate) {
    const gateProbeTimeoutMs = Math.min(timeoutMs, probeTimeoutMs, quickReconsentProbeTimeoutMs)
    isGate = await expect
      .poll(
        async () => isLegalReconsentGateUrl(page.url()) || (await reconsentPanel.isVisible().catch(() => false)),
        { timeout: gateProbeTimeoutMs }
      )
      .toBe(true)
      .then(
        () => true,
        () => false
      )
  }
  if (!isGate) return false

  await page.getByLabel("만 14세 이상입니다.").check()
  await page.getByLabel("필수 개인정보 처리 안내를 확인했습니다.").check()
  await page.getByLabel("국외 이전 및 외부 처리자 안내를 확인했습니다.").check()
  await page.getByRole("button", { name: "동의하고 계속 이용" }).click()

  await expect
    .poll(() => page.url(), { timeout: timeoutMs })
    .not.toContain("reconsent=required")

  if (!isCurrentFallbackPath(page.url(), fallbackPath)) {
    await page.goto(fallbackPath)
  }

  return true
}

export const waitForApiReachability = async (page: Page, apiBaseUrl: string) => {
  const probePaths = ["/actuator/health", "/member/api/v1/auth/me"]
  let lastFailure = "unknown"

  for (let attempt = 1; attempt <= liveApiProbeAttempts; attempt += 1) {
    for (const path of probePaths) {
      try {
        const response = await page.request.get(`${apiBaseUrl}${path}`, { timeout: 15_000 })
        if (response.status() > 0) return
        lastFailure = `status=${response.status()} path=${path}`
      } catch (error) {
        lastFailure = error instanceof Error ? error.message : String(error)
      }
    }

    if (attempt < liveApiProbeAttempts) {
      await sleep(liveRetryBaseDelayMs * attempt)
    }
  }

  throw new Error(
    `API reachability probe failed. base=${apiBaseUrl} attempts=${liveApiProbeAttempts} last=${lastFailure}`
  )
}

export type LoginPayloadCandidate = {
  label: "email+policy" | "email" | "username"
  data: Record<string, string | boolean>
}

export const buildLoginPayloadCandidates = (
  email: string,
  legacyLoginId: string,
  password: string
): LoginPayloadCandidate[] => {
  const candidates: LoginPayloadCandidate[] = []
  if (email) {
    candidates.push({
      label: "email+policy",
      data: { email, password, rememberMe: true, ipSecurity: false },
    })
    candidates.push({
      label: "email",
      data: { email, password },
    })
  }
  if (legacyLoginId) {
    candidates.push({
      label: "username",
      data: { username: legacyLoginId, password },
    })
  }
  return candidates
}
