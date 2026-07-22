import { expect, test } from "@playwright/test"
import {
  LOCAL_DRAFT_CREATE_STORAGE_KEY,
  LOCAL_DRAFT_MAX_AGE_MS,
  LOCAL_DRAFT_POST_SLOT_LIMIT,
  LOCAL_DRAFT_POST_STORAGE_KEY_PREFIX,
  LOCAL_DRAFT_V1_STORAGE_KEY,
  describeLocalDraftSlot,
  localDraftStorageKey,
  migrateLocalDraftV1Once,
  persistLocalDraft,
  readLocalDraft,
  removeLocalDraft,
  resolveLocalDraftSource,
} from "../../src/routes/Admin/editorStudioStorageModel"
import type { LocalDraftPayload } from "../../src/routes/Admin/editorStudioMetaModel"

const createStorage = (): Storage => {
  const store = new Map<string, string>()
  return {
    get length() {
      return store.size
    },
    clear() {
      store.clear()
    },
    getItem(key: string) {
      return store.get(key) ?? null
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null
    },
    removeItem(key: string) {
      store.delete(key)
    },
    setItem(key: string, value: string) {
      store.set(key, value)
    },
  }
}

const setGlobal = (key: "window", value: unknown) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, key)
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value,
    writable: true,
  })
  return () => {
    if (previous) {
      Object.defineProperty(globalThis, key, previous)
    } else {
      delete (globalThis as Record<string, unknown>)[key]
    }
  }
}

const withLocalStorage = (run: (storage: Storage) => void) => {
  const storage = createStorage()
  const restoreWindow = setGlobal("window", { localStorage: storage })
  try {
    run(storage)
  } finally {
    restoreWindow()
  }
}

const baseDraft = (
  overrides: Partial<LocalDraftPayload> & Pick<LocalDraftPayload, "source" | "savedAt" | "title">
): LocalDraftPayload => ({
  content: "body",
  summary: "",
  thumbnailUrl: "",
  thumbnailFocusX: 50,
  thumbnailFocusY: 50,
  thumbnailZoom: 1,
  tags: [],
  category: "",
  visibility: "PUBLIC_LISTED",
  ...overrides,
})

test.describe("editor local draft context slots", () => {
  test("resolves create and per-post storage keys", () => {
    expect(localDraftStorageKey({ kind: "create" })).toBe(LOCAL_DRAFT_CREATE_STORAGE_KEY)
    expect(localDraftStorageKey({ kind: "post", postId: "42" })).toBe(
      `${LOCAL_DRAFT_POST_STORAGE_KEY_PREFIX}42.v2`
    )
    expect(resolveLocalDraftSource("create", "")).toEqual({ kind: "create" })
    expect(resolveLocalDraftSource("edit", "42")).toEqual({ kind: "post", postId: "42" })
    expect(resolveLocalDraftSource("edit", "  ")).toEqual({ kind: "create" })
  })

  test("isolates create and post slots so edit autosave cannot overwrite create", () => {
    withLocalStorage((storage) => {
      persistLocalDraft(
        baseDraft({
          title: "create draft",
          content: "create body",
          source: { kind: "create" },
          savedAt: new Date().toISOString(),
        })
      )
      persistLocalDraft(
        baseDraft({
          title: "post draft",
          content: "post body",
          source: { kind: "post", postId: "7" },
          savedAt: new Date().toISOString(),
        })
      )

      expect(readLocalDraft({ kind: "create" })?.title).toBe("create draft")
      expect(readLocalDraft({ kind: "post", postId: "7" })?.title).toBe("post draft")
      expect(storage.getItem(LOCAL_DRAFT_CREATE_STORAGE_KEY)).toContain("create draft")
      expect(storage.getItem(`${LOCAL_DRAFT_POST_STORAGE_KEY_PREFIX}7.v2`)).toContain("post draft")
    })
  })

  test("migrates v1 once into create slot then removes v1", () => {
    withLocalStorage((storage) => {
      storage.setItem(
        LOCAL_DRAFT_V1_STORAGE_KEY,
        JSON.stringify({
          title: "legacy",
          content: "legacy body",
          summary: "",
          thumbnailUrl: "",
          tags: ["a"],
          category: "",
          visibility: "PRIVATE",
          savedAt: new Date().toISOString(),
        })
      )

      migrateLocalDraftV1Once()
      const createDraft = readLocalDraft({ kind: "create" })
      expect(createDraft?.title).toBe("legacy")
      expect(createDraft?.source).toEqual({ kind: "create" })
      expect(storage.getItem(LOCAL_DRAFT_V1_STORAGE_KEY)).toBeNull()

      storage.setItem(LOCAL_DRAFT_V1_STORAGE_KEY, JSON.stringify({ title: "again", savedAt: new Date().toISOString() }))
      migrateLocalDraftV1Once()
      expect(readLocalDraft({ kind: "create" })?.title).toBe("legacy")
      expect(storage.getItem(LOCAL_DRAFT_V1_STORAGE_KEY)).toBeNull()
    })
  })

  test("removeLocalDraft clears only the requested context slot", () => {
    withLocalStorage(() => {
      persistLocalDraft(
        baseDraft({
          title: "create",
          source: { kind: "create" },
          savedAt: new Date().toISOString(),
        })
      )
      persistLocalDraft(
        baseDraft({
          title: "post-9",
          source: { kind: "post", postId: "9" },
          savedAt: new Date().toISOString(),
        })
      )

      removeLocalDraft({ kind: "create" })
      expect(readLocalDraft({ kind: "create" })).toBeNull()
      expect(readLocalDraft({ kind: "post", postId: "9" })?.title).toBe("post-9")
    })
  })

  test("does not skip post draft keys when expired entries are removed during scan", () => {
    withLocalStorage((storage) => {
      const now = Date.now()
      const expiredSavedAt = new Date(now - LOCAL_DRAFT_MAX_AGE_MS - 1).toISOString()
      const validSavedAt = (offsetMs: number) => new Date(now - offsetMs).toISOString()

      storage.setItem(
        `${LOCAL_DRAFT_POST_STORAGE_KEY_PREFIX}1.v2`,
        JSON.stringify({
          title: "expired",
          content: "body",
          summary: "",
          thumbnailUrl: "",
          thumbnailFocusX: 50,
          thumbnailFocusY: 50,
          thumbnailZoom: 1,
          tags: [],
          category: "",
          visibility: "PUBLIC_LISTED",
          savedAt: expiredSavedAt,
          source: { kind: "post", postId: "1" },
        })
      )

      for (let index = 2; index <= LOCAL_DRAFT_POST_SLOT_LIMIT + 2; index += 1) {
        storage.setItem(
          `${LOCAL_DRAFT_POST_STORAGE_KEY_PREFIX}${index}.v2`,
          JSON.stringify({
            title: `post-${index}`,
            content: "body",
            summary: "",
            thumbnailUrl: "",
            thumbnailFocusX: 50,
            thumbnailFocusY: 50,
            thumbnailZoom: 1,
            tags: [],
            category: "",
            visibility: "PUBLIC_LISTED",
            savedAt: validSavedAt((LOCAL_DRAFT_POST_SLOT_LIMIT + 3 - index) * 1000),
            source: { kind: "post", postId: String(index) },
          })
        )
      }

      persistLocalDraft(
        baseDraft({
          title: "trigger",
          source: { kind: "post", postId: String(LOCAL_DRAFT_POST_SLOT_LIMIT + 3) },
          savedAt: new Date(now).toISOString(),
        })
      )

      const postKeys = Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter(
        (key): key is string => Boolean(key?.startsWith(LOCAL_DRAFT_POST_STORAGE_KEY_PREFIX))
      )
      expect(storage.getItem(`${LOCAL_DRAFT_POST_STORAGE_KEY_PREFIX}1.v2`)).toBeNull()
      expect(postKeys.length).toBe(LOCAL_DRAFT_POST_SLOT_LIMIT)
      expect(readLocalDraft({ kind: "post", postId: "2" })).toBeNull()
      expect(readLocalDraft({ kind: "post", postId: String(LOCAL_DRAFT_POST_SLOT_LIMIT + 3) })?.title).toBe(
        "trigger"
      )
    })
  })

  test("expires drafts older than 7 days and enforces post slot limit", () => {
    withLocalStorage((storage) => {
      const now = Date.now()
      persistLocalDraft(
        baseDraft({
          title: "expired",
          source: { kind: "create" },
          savedAt: new Date(now - LOCAL_DRAFT_MAX_AGE_MS - 1).toISOString(),
        })
      )
      expect(readLocalDraft({ kind: "create" })).toBeNull()
      expect(storage.getItem(LOCAL_DRAFT_CREATE_STORAGE_KEY)).toBeNull()

      for (let index = 0; index < LOCAL_DRAFT_POST_SLOT_LIMIT + 3; index += 1) {
        persistLocalDraft(
          baseDraft({
            title: `post-${index}`,
            source: { kind: "post", postId: String(index + 1) },
            savedAt: new Date(now - (LOCAL_DRAFT_POST_SLOT_LIMIT + 3 - index) * 1000).toISOString(),
          })
        )
      }

      const postKeys = Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter(
        (key): key is string => Boolean(key?.startsWith(LOCAL_DRAFT_POST_STORAGE_KEY_PREFIX))
      )
      expect(postKeys.length).toBe(LOCAL_DRAFT_POST_SLOT_LIMIT)
      expect(readLocalDraft({ kind: "post", postId: "1" })).toBeNull()
      expect(readLocalDraft({ kind: "post", postId: String(LOCAL_DRAFT_POST_SLOT_LIMIT + 3) })?.title).toBe(
        `post-${LOCAL_DRAFT_POST_SLOT_LIMIT + 2}`
      )
    })
  })

  test("describeLocalDraftSlot labels create and post restore targets", () => {
    expect(
      describeLocalDraftSlot(
        baseDraft({
          title: "초안",
          source: { kind: "create" },
          savedAt: "2026-07-22T01:23:45.000Z",
        })
      )
    ).toContain("새 글")

    const postLabel = describeLocalDraftSlot(
      baseDraft({
        title: "수정 중",
        source: { kind: "post", postId: "15" },
        savedAt: "2026-07-22T01:23:45.000Z",
      })
    )
    expect(postLabel).toContain("#15")
    expect(postLabel).toContain("수정 중")
  })
})
