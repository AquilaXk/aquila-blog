import type { Editor } from "@tiptap/core"
import { NodeSelection, TextSelection } from "@tiptap/pm/state"
import type { KeyboardEvent as ReactKeyboardEvent } from "react"

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
  root.focus()
  return true
}

export const selectCodeBlockText = ({ editor, getPos, nodeSize }: CodeBlockPositionArgs) => {
  if (typeof getPos !== "function") return false
  const codeBlockPos = getPos()
  if (typeof codeBlockPos !== "number") return false
  const from = codeBlockPos + 1
  const to = codeBlockPos + Math.max(1, nodeSize - 1)
  const nextSelection = TextSelection.create(editor.state.doc, from, to)
  editor.view.dispatch(editor.state.tr.setSelection(nextSelection).scrollIntoView())
  editor.view.focus()
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
