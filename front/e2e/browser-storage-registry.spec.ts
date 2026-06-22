import { expect, test } from "@playwright/test"
import { FEED_EXPLORER_RESTORE_KEY_PREFIX } from "../src/libs/feed/feedRestoreCache"
import {
  OPTIONAL_TRACKING_CONSENT_STORAGE_KEY,
  registeredBrowserStorageKeys,
} from "../src/libs/privacy/browserStorageRegistry"

test("browser storage registry includes privacy and runtime keys used by public flows", () => {
  expect(registeredBrowserStorageKeys).toEqual([
    { area: "localStorage", key: OPTIONAL_TRACKING_CONSENT_STORAGE_KEY, purpose: "optional-tracking-consent" },
    { area: "cookie", key: "scheme", purpose: "theme-preference" },
    { area: "sessionStorage", key: "__aquila_client_runtime_recovery__", purpose: "runtime-recovery-prefix" },
    { area: "sessionStorage", key: FEED_EXPLORER_RESTORE_KEY_PREFIX, purpose: "feed-restore-prefix" },
    { area: "localStorage", key: "admin.editor.localDraft.v1", purpose: "editor-local-draft" },
  ])
})
