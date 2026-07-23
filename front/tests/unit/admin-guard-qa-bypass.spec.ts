import { expect, test } from "@playwright/test"
import { shouldBypassAdminGuardForQa } from "../../src/libs/server/adminGuard"

const ENV_KEYS = ["NODE_ENV", "ADMIN_GUARD_QA_BYPASS", "ENABLE_QA_ROUTES"] as const

const withEnv = (overrides: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>, run: () => void) => {
  const previous = new Map<string, string | undefined>()
  for (const key of ENV_KEYS) {
    previous.set(key, process.env[key])
  }
  try {
    for (const key of ENV_KEYS) {
      const value = overrides[key]
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
    run()
  } finally {
    for (const key of ENV_KEYS) {
      const value = previous.get(key)
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
}

test("production blocks ADMIN_GUARD_QA_BYPASS even when set", () => {
  withEnv(
    {
      NODE_ENV: "production",
      ADMIN_GUARD_QA_BYPASS: "true",
      ENABLE_QA_ROUTES: "true",
    },
    () => {
      expect(shouldBypassAdminGuardForQa()).toBe(false)
    },
  )
})

test("non-production allows ADMIN_GUARD_QA_BYPASS for Playwright/QA", () => {
  withEnv(
    {
      NODE_ENV: "test",
      ADMIN_GUARD_QA_BYPASS: "true",
      ENABLE_QA_ROUTES: undefined,
    },
    () => {
      expect(shouldBypassAdminGuardForQa()).toBe(true)
    },
  )
})

test("non-production allows ENABLE_QA_ROUTES without ADMIN_GUARD_QA_BYPASS", () => {
  withEnv(
    {
      NODE_ENV: "development",
      ADMIN_GUARD_QA_BYPASS: undefined,
      ENABLE_QA_ROUTES: "true",
    },
    () => {
      expect(shouldBypassAdminGuardForQa()).toBe(true)
    },
  )
})
