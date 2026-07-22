import { type KeyboardEvent as ReactKeyboardEvent, type MutableRefObject, useCallback } from "react"
import {
  isComposingEditorKeyboardEvent,
  isSaveShortcut,
  planFormatShortcutMutation,
  planHardBreak,
  planListEnterContinuation,
  planTabIndentMutation,
  resolveFormatShortcut,
} from "./markdownEditorKeyboardModel"
import type { PlannedTextMutation } from "./markdownEditorTextMutation"

type TextareaSelection = {
  from: number
  to: number
}

type UseMarkdownEditorTextareaKeyboardArgs = {
  disabled: boolean
  valueRef: MutableRefObject<string>
  allowNativeTabAfterEscapeRef: MutableRefObject<boolean>
  rememberTextareaSelection: () => TextareaSelection
  applyMutationPlan: (plan: PlannedTextMutation) => boolean
  setTextareaSelection: (from: number, to?: number) => void
  onRequestSave?: () => void
}

export const useMarkdownEditorTextareaKeyboard = ({
  disabled,
  valueRef,
  allowNativeTabAfterEscapeRef,
  rememberTextareaSelection,
  applyMutationPlan,
  setTextareaSelection,
  onRequestSave,
}: UseMarkdownEditorTextareaKeyboardArgs) => {
  const handleTabKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      if (allowNativeTabAfterEscapeRef.current) {
        allowNativeTabAfterEscapeRef.current = false
        return
      }
      const { from, to } = rememberTextareaSelection()
      const tabPlan = planTabIndentMutation(valueRef.current, from, to, event.shiftKey)
      if (!tabPlan) {
        if (event.shiftKey) return
        event.preventDefault()
        return
      }
      event.preventDefault()
      applyMutationPlan(tabPlan)
    },
    [allowNativeTabAfterEscapeRef, applyMutationPlan, rememberTextareaSelection, valueRef]
  )

  const handleEnterKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLTextAreaElement>): boolean => {
      if (event.key !== "Enter") return false

      if (event.shiftKey) {
        event.preventDefault()
        const { from, to } = rememberTextareaSelection()
        applyMutationPlan(planHardBreak(from, to))
        return true
      }

      if (event.metaKey || event.ctrlKey || event.altKey) return false

      const { from, to } = rememberTextareaSelection()
      const listPlan = planListEnterContinuation(valueRef.current, from, to)
      if (!listPlan) return true
      event.preventDefault()
      applyMutationPlan(listPlan)
      return true
    },
    [applyMutationPlan, rememberTextareaSelection, valueRef]
  )

  const handleSaveShortcutKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLTextAreaElement>): boolean => {
      if (!isSaveShortcut(event)) return false
      if (!onRequestSave) return true
      event.preventDefault()
      onRequestSave()
      return true
    },
    [onRequestSave]
  )

  const handleFormatShortcutKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLTextAreaElement>): boolean => {
      const formatShortcut = resolveFormatShortcut(event)
      if (!formatShortcut) return false
      event.preventDefault()
      const { from, to } = rememberTextareaSelection()
      applyMutationPlan(planFormatShortcutMutation(valueRef.current, from, to, formatShortcut))
      return true
    },
    [applyMutationPlan, rememberTextareaSelection, valueRef]
  )

  const handleHomeEndKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLTextAreaElement>): boolean => {
      if (event.shiftKey || (!event.metaKey && !event.ctrlKey)) return false
      if (event.key === "Home") {
        event.preventDefault()
        setTextareaSelection(0)
        return true
      }
      if (event.key === "End") {
        event.preventDefault()
        setTextareaSelection(valueRef.current.length)
        return true
      }
      return false
    },
    [setTextareaSelection, valueRef]
  )

  const handleTextareaKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      if (disabled || isComposingEditorKeyboardEvent(event)) return

      if (event.key === "Escape") {
        allowNativeTabAfterEscapeRef.current = true
        return
      }

      if (event.key === "Tab") {
        handleTabKeyDown(event)
        return
      }

      allowNativeTabAfterEscapeRef.current = false

      if (handleEnterKeyDown(event)) return
      if (handleSaveShortcutKeyDown(event)) return
      if (handleFormatShortcutKeyDown(event)) return
      handleHomeEndKeyDown(event)
    },
    [
      allowNativeTabAfterEscapeRef,
      disabled,
      handleEnterKeyDown,
      handleFormatShortcutKeyDown,
      handleHomeEndKeyDown,
      handleSaveShortcutKeyDown,
      handleTabKeyDown,
    ]
  )

  return { handleTextareaKeyDown }
}
