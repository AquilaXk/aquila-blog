import type { Editor as TiptapEditor } from "@tiptap/core"
import type { Plugin } from "@tiptap/pm/state"

export type EditorHistorySnapshot = {
  plugin: Plugin
  state: unknown
}

const getPluginRuntimeKey = (plugin: Plugin) =>
  (plugin as Plugin & { key?: string }).key ?? ""

const findHistoryPlugin = (editor: TiptapEditor): Plugin | null =>
  editor.state.plugins.find((plugin) => getPluginRuntimeKey(plugin).startsWith("history$")) ?? null

export const captureEmptyEditorHistoryState = (editor: TiptapEditor): EditorHistorySnapshot | null => {
  const historyPlugin = findHistoryPlugin(editor)
  return historyPlugin ? { plugin: historyPlugin, state: historyPlugin.getState(editor.state) } : null
}

export const getEditorUndoDepth = (editor: TiptapEditor) => {
  const historyPlugin = findHistoryPlugin(editor)
  const historyState = historyPlugin?.getState(editor.state) as
    | { done?: { eventCount?: number } }
    | undefined
  return typeof historyState?.done?.eventCount === "number" ? historyState.done.eventCount : 0
}

export const resetEditorUndoHistory = (
  editor: TiptapEditor,
  snapshot: EditorHistorySnapshot | null
) => {
  if (!snapshot) return
  if (!editor.state.plugins.includes(snapshot.plugin)) return
  if (getEditorUndoDepth(editor) === 0) return

  editor.view.dispatch(
    editor.state.tr
      .setMeta("addToHistory", false)
      .setMeta(snapshot.plugin, { historyState: snapshot.state })
  )
}
