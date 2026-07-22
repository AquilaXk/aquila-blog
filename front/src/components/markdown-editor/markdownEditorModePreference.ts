import type { MarkdownEditorMode } from "./markdownEditorModeTabs"

export const MARKDOWN_EDITOR_MODE_STORAGE_KEY = "aquila.markdown-editor.mode"

const ALLOWED_MODES: MarkdownEditorMode[] = ["write", "preview", "split"]

export const DEFAULT_MARKDOWN_EDITOR_MODE: MarkdownEditorMode = "split"

export const isMarkdownEditorMode = (value: unknown): value is MarkdownEditorMode =>
  typeof value === "string" && ALLOWED_MODES.includes(value as MarkdownEditorMode)

type ModePreferenceStorage = Pick<Storage, "getItem"> | null | undefined

export const readMarkdownEditorModePreference = (
  storage: ModePreferenceStorage = typeof window === "undefined" ? null : window.localStorage
): MarkdownEditorMode => {
  if (!storage) return DEFAULT_MARKDOWN_EDITOR_MODE

  try {
    const stored = storage.getItem(MARKDOWN_EDITOR_MODE_STORAGE_KEY)
    if (stored && isMarkdownEditorMode(stored)) return stored
  } catch {
    return DEFAULT_MARKDOWN_EDITOR_MODE
  }

  return DEFAULT_MARKDOWN_EDITOR_MODE
}

/** SSR/hydration must render the default mode before client storage is available. */
export const resolveMarkdownEditorModeAfterHydration = (
  renderedMode: MarkdownEditorMode,
  storage: ModePreferenceStorage = typeof window === "undefined" ? null : window.localStorage
): MarkdownEditorMode => {
  const storedMode = readMarkdownEditorModePreference(storage)
  return renderedMode === storedMode ? renderedMode : storedMode
}

export const writeMarkdownEditorModePreference = (
  mode: MarkdownEditorMode,
  storage: Pick<Storage, "setItem"> | null | undefined = typeof window === "undefined"
    ? null
    : window.localStorage
): void => {
  if (!storage || !isMarkdownEditorMode(mode)) return

  try {
    storage.setItem(MARKDOWN_EDITOR_MODE_STORAGE_KEY, mode)
  } catch {
    // Ignore quota/private-mode failures; in-memory mode still works for this session.
  }
}
