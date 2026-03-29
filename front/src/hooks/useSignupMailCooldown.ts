import { useCallback, useEffect, useMemo, useState } from "react"

const SIGNUP_MAIL_COOLDOWN_STORAGE_KEY = "auth.signupMailCooldown.v1"
const DEFAULT_SIGNUP_MAIL_COOLDOWN_SECONDS = 180

type SignupMailCooldownMap = Record<string, number>

const normalizeCooldownEmail = (value: string) => value.trim().toLowerCase()

const readCooldownMap = (): SignupMailCooldownMap => {
  if (typeof window === "undefined") return {}

  try {
    const raw = window.sessionStorage.getItem(SIGNUP_MAIL_COOLDOWN_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object") return {}
    return parsed as SignupMailCooldownMap
  } catch {
    return {}
  }
}

const writeCooldownMap = (value: SignupMailCooldownMap) => {
  if (typeof window === "undefined") return
  window.sessionStorage.setItem(SIGNUP_MAIL_COOLDOWN_STORAGE_KEY, JSON.stringify(value))
}

const cleanupCooldownMap = (nowMs: number) => {
  const current = readCooldownMap()
  const next = Object.fromEntries(
    Object.entries(current).filter(([, expiresAtMs]) => Number.isFinite(expiresAtMs) && expiresAtMs > nowMs)
  )
  writeCooldownMap(next)
  return next
}

const readRemainingSeconds = (email: string, nowMs: number) => {
  const normalizedEmail = normalizeCooldownEmail(email)
  if (!normalizedEmail) return 0

  const current = cleanupCooldownMap(nowMs)
  const expiresAtMs = current[normalizedEmail]
  if (!expiresAtMs) return 0

  return Math.max(0, Math.ceil((expiresAtMs - nowMs) / 1000))
}

export const formatSignupCooldown = (seconds: number) => {
  const minutes = Math.floor(seconds / 60)
  const remainderSeconds = seconds % 60
  return `${minutes}:${String(remainderSeconds).padStart(2, "0")}`
}

export const useSignupMailCooldown = (
  email: string,
  cooldownSeconds: number = DEFAULT_SIGNUP_MAIL_COOLDOWN_SECONDS
) => {
  const normalizedEmail = useMemo(() => normalizeCooldownEmail(email), [email])
  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    readRemainingSeconds(normalizedEmail, Date.now())
  )

  useEffect(() => {
    const sync = () => setRemainingSeconds(readRemainingSeconds(normalizedEmail, Date.now()))
    sync()

    if (!normalizedEmail) return

    const intervalId = window.setInterval(sync, 1000)
    return () => window.clearInterval(intervalId)
  }, [normalizedEmail])

  const startCooldown = useCallback(
    (nextEmail?: string) => {
      const targetEmail = normalizeCooldownEmail(nextEmail ?? normalizedEmail)
      if (!targetEmail || typeof window === "undefined") return

      const nowMs = Date.now()
      const current = cleanupCooldownMap(nowMs)
      current[targetEmail] = nowMs + cooldownSeconds * 1000
      writeCooldownMap(current)

      if (targetEmail === normalizedEmail) {
        setRemainingSeconds(cooldownSeconds)
      }
    },
    [cooldownSeconds, normalizedEmail]
  )

  return {
    remainingSeconds,
    isCoolingDown: remainingSeconds > 0,
    startCooldown,
  }
}
