export type AuthLoginPolicyPrefs = {
  keepSignedIn: boolean
  ipSecurityOn: boolean
}

const KEEP_SIGNED_IN_KEY = "auth.login.keepSignedIn"
const IP_SECURITY_KEY = "auth.login.ipSecurityOn"

const DEFAULT_PREFS: AuthLoginPolicyPrefs = {
  keepSignedIn: true,
  ipSecurityOn: false,
}

const toStoredFlag = (value: boolean) => (value ? "1" : "0")

const fromStoredFlag = (value: string | null, fallback: boolean) => {
  if (value === "1") return true
  if (value === "0") return false
  return fallback
}

export const loadAuthLoginPolicyPrefs = (): AuthLoginPolicyPrefs => {
  if (typeof window === "undefined") return DEFAULT_PREFS

  try {
    return {
      keepSignedIn: fromStoredFlag(window.localStorage.getItem(KEEP_SIGNED_IN_KEY), DEFAULT_PREFS.keepSignedIn),
      ipSecurityOn: fromStoredFlag(window.localStorage.getItem(IP_SECURITY_KEY), DEFAULT_PREFS.ipSecurityOn),
    }
  } catch {
    return DEFAULT_PREFS
  }
}

export const saveAuthLoginPolicyPrefs = (prefs: AuthLoginPolicyPrefs) => {
  if (typeof window === "undefined") return

  try {
    window.localStorage.setItem(KEEP_SIGNED_IN_KEY, toStoredFlag(prefs.keepSignedIn))
    window.localStorage.setItem(IP_SECURITY_KEY, toStoredFlag(prefs.ipSecurityOn))
  } catch {
    // 로컬 저장소 접근이 차단된 환경에서는 무시하고 기본 동작을 유지한다.
  }
}

