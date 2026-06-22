import { expect, test } from "@playwright/test"
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { FEED_EXPLORER_RESTORE_KEY_PREFIX } from "../src/libs/feed/feedRestoreCache"
import {
  OPTIONAL_TRACKING_CONSENT_STORAGE_KEY,
  registeredBrowserStorageKeys,
} from "../src/libs/privacy/browserStorageRegistry"

const srcRoot = path.resolve(__dirname, "../src")
const sourceConstantPattern =
  /const\s+([A-Za-z0-9_]*(?:KEY|PREFIX|COOKIE)[A-Za-z0-9_]*)\s*=\s*"([^"]+)"/g
const storageApiCallPattern =
  /\b(?:localStorage|sessionStorage)\.(?:getItem|setItem|removeItem)\(\s*([A-Za-z0-9_]+)/g
const cookieApiCallPattern = /\b(?:setCookie|deleteCookie|getCookieValue)\(\s*([A-Za-z0-9_]+)/g

const listSourceFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const resolved = path.join(directory, entry.name)
    if (entry.isDirectory()) return listSourceFiles(resolved)
    return /\.(ts|tsx)$/.test(entry.name) ? [resolved] : []
  })

const collectStorageConstants = () =>
  listSourceFiles(srcRoot).flatMap((filePath) => {
    const source = readFileSync(filePath, "utf8")
    const hasBrowserStorageApi = /\b(?:localStorage|sessionStorage|setCookie|document\.cookie)/.test(source)
    const storageApiConstantNames = new Set(
      [
        ...Array.from(source.matchAll(storageApiCallPattern), (match) => match[1]),
        ...Array.from(source.matchAll(cookieApiCallPattern), (match) => match[1]),
      ],
    )

    return Array.from(source.matchAll(sourceConstantPattern), (match) => ({
      name: match[1],
      key: match[2],
      filePath: path.relative(srcRoot, filePath),
    })).filter(
      (sourceConstant) =>
        storageApiConstantNames.has(sourceConstant.name) ||
        (hasBrowserStorageApi && sourceConstant.name.includes("PREFIX") && !sourceConstant.key.startsWith("/")),
    )
  })

test("browser storage registry includes privacy and runtime keys used by public flows", () => {
  expect(registeredBrowserStorageKeys).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ area: "cookie", key: "apiKey", purpose: "auth-session" }),
      expect.objectContaining({ area: "cookie", key: "accessToken", purpose: "auth-session" }),
      expect.objectContaining({ area: "cookie", key: "refreshToken", purpose: "auth-session" }),
      expect.objectContaining({ area: "cookie", key: "sessionKey", purpose: "auth-session" }),
      expect.objectContaining({ area: "cookie", key: "signup_session", purpose: "signup-verification-session" }),
      expect.objectContaining({ area: "cookie", key: "scheme", purpose: "theme-preference" }),
      expect.objectContaining({ area: "localStorage", key: OPTIONAL_TRACKING_CONSENT_STORAGE_KEY }),
      expect.objectContaining({ area: "localStorage", key: "auth.login.keepSignedIn" }),
      expect.objectContaining({ area: "localStorage", key: "auth.login.ipSecurityOn" }),
      expect.objectContaining({ area: "localStorage", key: "admin.editor.localDraft.v1" }),
      expect.objectContaining({ area: "sessionStorage", key: "auth.signupMailCooldown.v1" }),
      expect.objectContaining({
        area: "sessionStorage",
        key: "auth:me:anon-probe-suppress-until:v1",
      }),
      expect.objectContaining({ area: "sessionStorage", key: "__aquila_client_runtime_recovery__" }),
      expect.objectContaining({ area: "sessionStorage", key: FEED_EXPLORER_RESTORE_KEY_PREFIX }),
    ])
  )
})

test("browser storage registry covers source storage constants", () => {
  const registeredKeys = new Set(registeredBrowserStorageKeys.map((entry) => entry.key))
  const sourceConstants = collectStorageConstants()

  expect(sourceConstants).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: "KEEP_SIGNED_IN_KEY", key: "auth.login.keepSignedIn" }),
    expect.objectContaining({ name: "IP_SECURITY_KEY", key: "auth.login.ipSecurityOn" }),
    expect.objectContaining({ name: "SIGNUP_MAIL_COOLDOWN_STORAGE_KEY", key: "auth.signupMailCooldown.v1" }),
    expect.objectContaining({ name: "LOCAL_DRAFT_STORAGE_KEY", key: "admin.editor.localDraft.v1" }),
    expect.objectContaining({
      name: "PUBLIC_CURSOR_DISABLED_SESSION_KEY",
      key: "posts:public-cursor-disabled:v1",
    }),
    expect.objectContaining({ name: "CLOUD_VIDEO_UPLOAD_SESSION_STORAGE_PREFIX", key: "aquila-cloud-video-upload-session" }),
  ]))

  for (const sourceConstant of sourceConstants) {
    expect(
      registeredKeys.has(sourceConstant.key),
      `${sourceConstant.name}=${sourceConstant.key} in ${sourceConstant.filePath} must be registered`,
    ).toBe(true)
  }

  expect(registeredKeys.has("scheme"), "theme scheme cookie is read from document.cookie and must be registered").toBe(true)
})

test("browser storage registry records retention and deletion metadata for every entry", () => {
  for (const entry of registeredBrowserStorageKeys) {
    expect(entry.key).toBeTruthy()
    expect(entry.purpose).toBeTruthy()
    expect(entry.retention).toBeTruthy()
    expect(entry.deletion).toBeTruthy()
    expect(entry.stores).toBeTruthy()
  }
})

test("signup cooldown registry documents hashed storage instead of raw email identifiers", () => {
  const cooldownEntry = registeredBrowserStorageKeys.find((entry) => entry.key === "auth.signupMailCooldown.v1")
  const hookSource = readFileSync(path.join(srcRoot, "hooks/useSignupMailCooldown.ts"), "utf8")

  expect(cooldownEntry).toEqual(
    expect.objectContaining({
      area: "sessionStorage",
      stores: expect.stringContaining("hashed email key"),
    })
  )
  expect(hookSource).toContain("hashCooldownEmail")
  expect(hookSource).toContain("current[targetEmailKey]")
  expect(hookSource).not.toContain("fallbackHash")
  expect(hookSource).not.toContain("fnv1a")
  expect(hookSource).not.toContain("current[targetEmail] =")
  expect(hookSource).not.toContain("current[normalizedEmail]")
})
