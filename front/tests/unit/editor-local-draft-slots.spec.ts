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
import {
  localDraftSourcesEqual,
  type LocalDraftPayload,
} from "../../src/routes/Admin/editorStudioMetaModel"
import {
  decideLocalDraftAutosave,
  isLocalDraftAutosaveGatedForPostIdTransition,
  isLocalDraftBaselineSettleLoadingKey,
  resolveCreateWritePostId,
  resolveLocalDraftShouldAdoptBaseline,
} from "../../src/routes/Admin/useEditorStudioDraftLifecycleModel"

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

  test("keeps v1 legacy draft when create.v2 write fails", () => {
    withLocalStorage((storage) => {
      const legacy = JSON.stringify({
        title: "legacy-keep",
        content: "legacy body",
        summary: "",
        thumbnailUrl: "",
        tags: [],
        category: "",
        visibility: "PRIVATE",
        savedAt: new Date().toISOString(),
      })
      storage.setItem(LOCAL_DRAFT_V1_STORAGE_KEY, legacy)
      const originalSetItem = storage.setItem.bind(storage)
      storage.setItem = (key: string, value: string) => {
        if (key === LOCAL_DRAFT_CREATE_STORAGE_KEY) {
          throw new Error("quota exceeded")
        }
        originalSetItem(key, value)
      }

      migrateLocalDraftV1Once()
      expect(storage.getItem(LOCAL_DRAFT_V1_STORAGE_KEY)).toBe(legacy)
      expect(storage.getItem(LOCAL_DRAFT_CREATE_STORAGE_KEY)).toBeNull()
    })
  })

  test("keeps v1 when create.v2 exists but is corrupt or expired", () => {
    withLocalStorage((storage) => {
      const legacy = JSON.stringify({
        title: "legacy-recover",
        content: "legacy body",
        summary: "",
        thumbnailUrl: "",
        tags: [],
        category: "",
        visibility: "PRIVATE",
        savedAt: new Date().toISOString(),
      })
      storage.setItem(LOCAL_DRAFT_V1_STORAGE_KEY, legacy)
      storage.setItem(LOCAL_DRAFT_CREATE_STORAGE_KEY, "{not-json")

      migrateLocalDraftV1Once()
      expect(readLocalDraft({ kind: "create" })?.title).toBe("legacy-recover")
      expect(storage.getItem(LOCAL_DRAFT_V1_STORAGE_KEY)).toBeNull()

      storage.setItem(LOCAL_DRAFT_V1_STORAGE_KEY, legacy)
      storage.setItem(
        LOCAL_DRAFT_CREATE_STORAGE_KEY,
        JSON.stringify({
          title: "expired-create",
          content: "expired",
          summary: "",
          thumbnailUrl: "",
          tags: [],
          category: "",
          visibility: "PRIVATE",
          savedAt: new Date(Date.now() - LOCAL_DRAFT_MAX_AGE_MS - 1).toISOString(),
          source: { kind: "create" },
        })
      )

      migrateLocalDraftV1Once()
      expect(readLocalDraft({ kind: "create" })?.title).toBe("legacy-recover")
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

  test("persists and reads postVersion for post-slot drafts", () => {
    withLocalStorage(() => {
      persistLocalDraft(
        baseDraft({
          title: "versioned",
          source: { kind: "post", postId: "21" },
          savedAt: new Date().toISOString(),
          postVersion: 7,
        })
      )
      expect(readLocalDraft({ kind: "post", postId: "21" })?.postVersion).toBe(7)

      persistLocalDraft(
        baseDraft({
          title: "create",
          source: { kind: "create" },
          savedAt: new Date().toISOString(),
          postVersion: null,
        })
      )
      expect(readLocalDraft({ kind: "create" })?.postVersion).toBeNull()
    })
  })

  test("localDraftSourcesEqual distinguishes create and post slots", () => {
    expect(localDraftSourcesEqual({ kind: "create" }, { kind: "create" })).toBe(true)
    expect(localDraftSourcesEqual({ kind: "create" }, { kind: "post", postId: "1" })).toBe(false)
    expect(
      localDraftSourcesEqual({ kind: "post", postId: "1" }, { kind: "post", postId: "1" })
    ).toBe(true)
    expect(
      localDraftSourcesEqual({ kind: "post", postId: "1" }, { kind: "post", postId: "2" })
    ).toBe(false)
  })

  test("autosave adopts baseline after load settle so server content does not overwrite restorable draft", () => {
    const serverFingerprint = '{"title":"server"}'
    const draftFingerprint = '{"title":"local-draft"}'

    expect(
      decideLocalDraftAutosave({
        loadingKey: "",
        shouldAdoptBaseline: true,
        isPostIdTransitionGated: false,
        hasDraftContent: true,
        editorFingerprint: serverFingerprint,
        lastArmedFingerprint: draftFingerprint,
        pendingRestorableDraftFingerprint: draftFingerprint,
      })
    ).toEqual({ action: "adopt-baseline", fingerprint: serverFingerprint })

    expect(
      decideLocalDraftAutosave({
        loadingKey: "",
        shouldAdoptBaseline: false,
        isPostIdTransitionGated: false,
        hasDraftContent: true,
        editorFingerprint: serverFingerprint,
        lastArmedFingerprint: draftFingerprint,
        pendingRestorableDraftFingerprint: draftFingerprint,
      })
    ).toEqual({ action: "skip" })

    expect(
      decideLocalDraftAutosave({
        loadingKey: "",
        shouldAdoptBaseline: false,
        isPostIdTransitionGated: false,
        hasDraftContent: true,
        editorFingerprint: '{"title":"user-edit"}',
        lastArmedFingerprint: serverFingerprint,
        pendingRestorableDraftFingerprint: draftFingerprint,
      })
    ).toEqual({ action: "schedule" })
  })

  test("autosave does not recreate a cleared slot until editor fingerprint changes", () => {
    const publishedFingerprint = '{"title":"published"}'

    expect(
      decideLocalDraftAutosave({
        loadingKey: "",
        shouldAdoptBaseline: true,
        isPostIdTransitionGated: false,
        hasDraftContent: true,
        editorFingerprint: publishedFingerprint,
        lastArmedFingerprint: "",
        pendingRestorableDraftFingerprint: null,
      })
    ).toEqual({ action: "adopt-baseline", fingerprint: publishedFingerprint })

    expect(
      decideLocalDraftAutosave({
        loadingKey: "",
        shouldAdoptBaseline: false,
        isPostIdTransitionGated: false,
        hasDraftContent: true,
        editorFingerprint: publishedFingerprint,
        lastArmedFingerprint: publishedFingerprint,
        pendingRestorableDraftFingerprint: null,
      })
    ).toEqual({ action: "skip" })

    expect(
      decideLocalDraftAutosave({
        loadingKey: "",
        shouldAdoptBaseline: false,
        isPostIdTransitionGated: false,
        hasDraftContent: true,
        editorFingerprint: '{"title":"edited-again"}',
        lastArmedFingerprint: publishedFingerprint,
        pendingRestorableDraftFingerprint: null,
      })
    ).toEqual({ action: "schedule" })
  })

  test("unrelated loading settle reschedules pending dirty editor instead of adopting baseline", () => {
    expect(isLocalDraftBaselineSettleLoadingKey("postOne")).toBe(true)
    expect(isLocalDraftBaselineSettleLoadingKey("publishTempPost")).toBe(true)
    expect(isLocalDraftBaselineSettleLoadingKey("uploadThumbnail")).toBe(false)
    expect(isLocalDraftBaselineSettleLoadingKey("postList")).toBe(false)

    const baselineFingerprint = '{"title":"baseline"}'
    const dirtyFingerprint = '{"title":"pending-edit"}'

    expect(
      decideLocalDraftAutosave({
        loadingKey: "",
        shouldAdoptBaseline: false,
        isPostIdTransitionGated: false,
        hasDraftContent: true,
        editorFingerprint: dirtyFingerprint,
        lastArmedFingerprint: baselineFingerprint,
        pendingRestorableDraftFingerprint: null,
      })
    ).toEqual({ action: "schedule" })

    expect(
      decideLocalDraftAutosave({
        loadingKey: "",
        shouldAdoptBaseline: true,
        isPostIdTransitionGated: false,
        hasDraftContent: true,
        editorFingerprint: dirtyFingerprint,
        lastArmedFingerprint: baselineFingerprint,
        pendingRestorableDraftFingerprint: null,
      })
    ).toEqual({ action: "adopt-baseline", fingerprint: dirtyFingerprint })
  })

  test("write settle adopts request fingerprint and schedules when editor diverged in flight", () => {
    const requestFingerprint = '{"title":"published-request"}'
    const inFlightEditFingerprint = '{"title":"edited-while-publishing"}'

    expect(
      decideLocalDraftAutosave({
        loadingKey: "",
        shouldAdoptBaseline: true,
        baselineFingerprint: requestFingerprint,
        isPostIdTransitionGated: false,
        hasDraftContent: true,
        editorFingerprint: inFlightEditFingerprint,
        lastArmedFingerprint: requestFingerprint,
        pendingRestorableDraftFingerprint: null,
      })
    ).toEqual({
      action: "adopt-baseline-and-schedule",
      fingerprint: requestFingerprint,
    })

    expect(
      decideLocalDraftAutosave({
        loadingKey: "",
        shouldAdoptBaseline: true,
        baselineFingerprint: requestFingerprint,
        isPostIdTransitionGated: false,
        hasDraftContent: true,
        editorFingerprint: requestFingerprint,
        lastArmedFingerprint: "",
        pendingRestorableDraftFingerprint: null,
      })
    ).toEqual({ action: "adopt-baseline", fingerprint: requestFingerprint })
  })

  test("load baseline adopts after success signal even when a non-baseline loadingKey raced idle first", () => {
    // uploadThumbnail (or any non-baseline key) can clear loadingKey before postOne
    // finishes. Adoption must still arm once the success signal is pending and idle.
    expect(
      resolveLocalDraftShouldAdoptBaseline({
        loadingKey: "uploadThumbnail",
        pendingSuccessfulBaseline: true,
      })
    ).toBe(false)

    expect(
      resolveLocalDraftShouldAdoptBaseline({
        loadingKey: "",
        pendingSuccessfulBaseline: false,
      })
    ).toBe(false)

    expect(
      resolveLocalDraftShouldAdoptBaseline({
        loadingKey: "",
        pendingSuccessfulBaseline: true,
      })
    ).toBe(true)

    const serverFingerprint = '{"title":"server-loaded"}'
    const draftFingerprint = '{"title":"local-draft"}'
    expect(
      decideLocalDraftAutosave({
        loadingKey: "",
        shouldAdoptBaseline: true,
        baselineFingerprint: null,
        isPostIdTransitionGated: false,
        hasDraftContent: true,
        editorFingerprint: serverFingerprint,
        lastArmedFingerprint: "",
        pendingRestorableDraftFingerprint: draftFingerprint,
      })
    ).toEqual({ action: "adopt-baseline", fingerprint: serverFingerprint })
  })

  test("failed load/publish settle does not adopt baseline without success signal", () => {
    const dirtyFingerprint = '{"title":"unsaved-edit"}'
    const baselineFingerprint = '{"title":"baseline"}'

    // loadingKey cleared after failure: shouldAdoptBaseline stays false → reschedule.
    expect(
      decideLocalDraftAutosave({
        loadingKey: "",
        shouldAdoptBaseline: false,
        isPostIdTransitionGated: false,
        hasDraftContent: true,
        editorFingerprint: dirtyFingerprint,
        lastArmedFingerprint: baselineFingerprint,
        pendingRestorableDraftFingerprint: null,
      })
    ).toEqual({ action: "schedule" })

    expect(
      decideLocalDraftAutosave({
        loadingKey: "",
        shouldAdoptBaseline: true,
        isPostIdTransitionGated: false,
        hasDraftContent: true,
        editorFingerprint: dirtyFingerprint,
        lastArmedFingerprint: baselineFingerprint,
        pendingRestorableDraftFingerprint: null,
      })
    ).toEqual({ action: "adopt-baseline", fingerprint: dirtyFingerprint })
  })

  test("resolveCreateWritePostId rejects missing or blank ids", () => {
    expect(resolveCreateWritePostId(undefined)).toEqual({
      ok: false,
      statusText: "글 작성 응답에 글 ID가 없습니다. 로컬 임시저장은 유지됩니다. 다시 시도해주세요.",
    })
    expect(resolveCreateWritePostId(null)).toEqual({
      ok: false,
      statusText: "글 작성 응답에 글 ID가 없습니다. 로컬 임시저장은 유지됩니다. 다시 시도해주세요.",
    })
    expect(resolveCreateWritePostId({})).toEqual({
      ok: false,
      statusText: "글 작성 응답에 글 ID가 없습니다. 로컬 임시저장은 유지됩니다. 다시 시도해주세요.",
    })
    expect(resolveCreateWritePostId({ id: "" })).toEqual({
      ok: false,
      statusText: "글 작성 응답에 글 ID가 없습니다. 로컬 임시저장은 유지됩니다. 다시 시도해주세요.",
    })
    expect(resolveCreateWritePostId({ id: "   " })).toEqual({
      ok: false,
      statusText: "글 작성 응답에 글 ID가 없습니다. 로컬 임시저장은 유지됩니다. 다시 시도해주세요.",
    })
    expect(resolveCreateWritePostId({ id: 42 })).toEqual({ ok: true, postId: "42" })
    expect(resolveCreateWritePostId({ id: " 7 " })).toEqual({ ok: true, postId: "7" })
  })

  test("gates create-slot autosave while post id transition awaits load", () => {
    expect(isLocalDraftAutosaveGatedForPostIdTransition("create", "42")).toBe(true)
    expect(isLocalDraftAutosaveGatedForPostIdTransition("create", "")).toBe(false)
    expect(isLocalDraftAutosaveGatedForPostIdTransition("edit", "42")).toBe(false)

    expect(
      decideLocalDraftAutosave({
        loadingKey: "",
        shouldAdoptBaseline: false,
        isPostIdTransitionGated: true,
        hasDraftContent: true,
        editorFingerprint: '{"title":"previous-edit-body"}',
        lastArmedFingerprint: '{"title":"old"}',
        pendingRestorableDraftFingerprint: null,
      })
    ).toEqual({ action: "skip" })

    // Successful load settle may still adopt baseline even during the transition edge.
    expect(
      decideLocalDraftAutosave({
        loadingKey: "",
        shouldAdoptBaseline: true,
        isPostIdTransitionGated: true,
        hasDraftContent: true,
        editorFingerprint: '{"title":"loaded"}',
        lastArmedFingerprint: '{"title":"previous-edit-body"}',
        pendingRestorableDraftFingerprint: null,
      })
    ).toEqual({ action: "adopt-baseline", fingerprint: '{"title":"loaded"}' })
  })
})
