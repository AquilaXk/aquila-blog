import type { Editor } from "@tiptap/core"
import { NodeSelection, TextSelection } from "@tiptap/pm/state"
import type { KeyboardEvent as ReactKeyboardEvent } from "react"
import { focusElementWithoutScroll } from "./blockEditorEngineDocumentModel"
import { preserveWindowScrollForRichBlockSelectAll } from "./blockHandleLayoutModel"

type CodeBlockPositionArgs = {
  editor: Editor
  getPos: (() => number | undefined) | boolean
  nodeSize: number
}

export const isPrimarySelectAllShortcut = (event: ReactKeyboardEvent<HTMLElement>) => {
  if (event.altKey || event.shiftKey) return false
  if (!(event.metaKey || event.ctrlKey)) return false
  return event.key.toLowerCase() === "a"
}

export const selectDomTextContents = (root: HTMLElement | null) => {
  if (!root) return false
  const selection = window.getSelection()
  if (!selection) return false

  const range = document.createRange()
  range.selectNodeContents(root)
  selection.removeAllRanges()
  selection.addRange(range)
  root.focus({ preventScroll: true })
  return true
}

export const selectDomTextOffsetRange = (
  root: HTMLElement | null,
  fromOffset: number,
  toOffset: number
) => {
  if (!root) return false
  const selection = window.getSelection()
  if (!selection) return false

  const textLength = root.textContent?.length ?? 0
  const startOffset = Math.max(0, Math.min(textLength, Math.min(fromOffset, toOffset)))
  const endOffset = Math.max(0, Math.min(textLength, Math.max(fromOffset, toOffset)))
  if (startOffset === endOffset) return false

  const resolveTextPosition = (offset: number) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let remaining = offset
    let current = walker.nextNode()
    while (current) {
      const currentLength = current.textContent?.length ?? 0
      if (remaining <= currentLength) {
        return { node: current, offset: remaining }
      }
      remaining -= currentLength
      current = walker.nextNode()
    }
    return null
  }

  const start = resolveTextPosition(startOffset)
  const end = resolveTextPosition(endOffset)
  if (!start || !end) return false

  const range = document.createRange()
  range.setStart(start.node, start.offset)
  range.setEnd(end.node, end.offset)
  selection.removeAllRanges()
  selection.addRange(range)
  root.focus({ preventScroll: true })
  return true
}

export const resolveCodeBlockCopyText = (shell: HTMLElement | null) => {
  const contentRoot = shell?.querySelector<HTMLElement>(".aq-code-editor-content") ?? null
  const selection = window.getSelection()
  const anchorElement = selection?.anchorNode instanceof Element ? selection.anchorNode : selection?.anchorNode?.parentElement ?? null
  const focusElement = selection?.focusNode instanceof Element ? selection.focusNode : selection?.focusNode?.parentElement ?? null
  const selectionText = selection?.toString() || ""
  const selectionInsideCode = Boolean(
    selectionText &&
    contentRoot &&
    anchorElement &&
    focusElement &&
    contentRoot.contains(anchorElement) &&
    contentRoot.contains(focusElement)
  )
  const fallbackText = shell?.getAttribute("data-code-drag-selection-text") || ""
  return selectionInsideCode ? selectionText : fallbackText
}

export const selectCodeBlockText = ({ editor, getPos, nodeSize }: CodeBlockPositionArgs) => {
  if (typeof getPos !== "function") return false
  const codeBlockPos = getPos()
  if (typeof codeBlockPos !== "number") return false
  const from = codeBlockPos + 1
  const to = codeBlockPos + Math.max(1, nodeSize - 1)
  const nextSelection = TextSelection.create(editor.state.doc, from, to)
  preserveWindowScrollForRichBlockSelectAll()
  editor.view.dispatch(editor.state.tr.setSelection(nextSelection))
  focusElementWithoutScroll(editor.view.dom as HTMLElement)
  return true
}

export const resolveCodeBlockPasteRange = ({ editor, getPos, nodeSize }: CodeBlockPositionArgs) => {
  const { selection } = editor.state

  if (selection instanceof NodeSelection && selection.node.type.name === "codeBlock") {
    return {
      from: selection.from + 1,
      to: selection.to - 1,
    }
  }

  const { $from } = selection
  for (let depth = $from.depth; depth >= 0; depth -= 1) {
    if ($from.node(depth).type.name !== "codeBlock") continue
    return {
      from: selection.from,
      to: selection.to,
    }
  }

  if (typeof getPos !== "function") return null
  const codeBlockPos = getPos()
  if (typeof codeBlockPos !== "number") return null

  return {
    from: codeBlockPos + 1,
    to: codeBlockPos + nodeSize - 1,
  }
}
