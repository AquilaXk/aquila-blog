import { useCallback, useEffect, useMemo, useState } from "react"

const SIGNUP_MAIL_COOLDOWN_STORAGE_KEY = "auth.signupMailCooldown.v1"
const DEFAULT_SIGNUP_MAIL_COOLDOWN_SECONDS = 180

type SignupMailCooldownMap = Record<string, number>

const normalizeCooldownEmail = (value: string) => value.trim().toLowerCase()

const hashCooldownEmail = async (email: string) => {
  const normalizedEmail = normalizeCooldownEmail(email)
  if (!normalizedEmail) return ""

  const source = `auth.signupMailCooldown.v1:${normalizedEmail}`
  if (!globalThis.crypto?.subtle) return ""

  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(source))
  const encoded = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
  return `sha256:${encoded}`
}

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

const readRemainingSeconds = async (email: string, nowMs: number) => {
  const emailKey = await hashCooldownEmail(email)
  if (!emailKey) return 0

  const current = cleanupCooldownMap(nowMs)
  const expiresAtMs = current[emailKey]
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
  const [remainingSeconds, setRemainingSeconds] = useState(0)

  useEffect(() => {
    let isActive = true
    const sync = () => {
      readRemainingSeconds(normalizedEmail, Date.now()).then((nextRemainingSeconds) => {
        if (isActive) setRemainingSeconds(nextRemainingSeconds)
      })
    }
    sync()

    if (!normalizedEmail) {
      return () => {
        isActive = false
      }
    }

    const intervalId = window.setInterval(sync, 1000)
    return () => {
      isActive = false
      window.clearInterval(intervalId)
    }
  }, [normalizedEmail])

  const startCooldown = useCallback(
    async (nextEmail?: string) => {
      const targetEmail = normalizeCooldownEmail(nextEmail ?? normalizedEmail)
      if (!targetEmail || typeof window === "undefined") return

      const nowMs = Date.now()
      const current = cleanupCooldownMap(nowMs)
      const targetEmailKey = await hashCooldownEmail(targetEmail)
      if (!targetEmailKey) return

      current[targetEmailKey] = nowMs + cooldownSeconds * 1000
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
