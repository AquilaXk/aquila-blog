import type { Editor } from "@tiptap/core"
import { NodeSelection, TextSelection } from "@tiptap/pm/state"
import type { KeyboardEvent as ReactKeyboardEvent } from "react"
import { focusElementWithoutScroll } from "./blockEditorEngineDocumentModel"
import {
  markNextEditorPointerAfterCodeSelection,
  preserveWindowScrollForRichBlockSelectAll,
  preserveWindowScrollPositionAcrossFrames,
  type WindowScrollAnchor,
} from "./blockHandleLayoutModel"

type CodeBlockPositionArgs = {
  editor: Editor
  getPos: (() => number | undefined) | boolean
  nodeSize: number
}

const CODE_BLOCK_EDITOR_CONTENT_SELECTOR = ".aq-code-editor-content"
const CODE_SCROLL_PRESERVE_CANCEL_DISTANCE_PX = 3_200
const shouldCancelCodeScrollPreserve = (scrollAnchor: WindowScrollAnchor) => () => Math.abs(window.scrollX - scrollAnchor.x) > CODE_SCROLL_PRESERVE_CANCEL_DISTANCE_PX || Math.abs((document.scrollingElement?.scrollTop ?? window.scrollY) - scrollAnchor.y) > CODE_SCROLL_PRESERVE_CANCEL_DISTANCE_PX

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

export const selectCodeDomTextContents = (root: HTMLElement | null) => {
  const selected = selectDomTextContents(root)
  if (selected) {
    markNextEditorPointerAfterCodeSelection()
    preserveWindowScrollForRichBlockSelectAll()
  }
  return selected
}

export const resolveVisibleCodeRootForSelectAll = (options: { ignoreTableAnchor?: boolean; ignoreTableDragSelectionText?: boolean } = {}) => {
  const activeElement = document.activeElement instanceof Element ? document.activeElement : null
  const selection = window.getSelection()
  const anchorElement = selection?.anchorNode instanceof Element ? selection.anchorNode : selection?.anchorNode?.parentElement ?? null
  if (activeElement?.closest("th, td") || (!options.ignoreTableAnchor && anchorElement?.closest("th, td")) || (!options.ignoreTableDragSelectionText && document.documentElement.hasAttribute("data-table-drag-selection-text"))) return null
  const activeRoot = activeElement?.closest<HTMLElement>(CODE_BLOCK_EDITOR_CONTENT_SELECTOR)
  if (activeRoot) return activeRoot
  const selectionRoot = anchorElement?.closest<HTMLElement>(CODE_BLOCK_EDITOR_CONTENT_SELECTOR)
  if (selectionRoot) return selectionRoot
  const canResolveHoveredCodeRoot =
    activeElement instanceof HTMLElement &&
    activeElement.classList.contains("ProseMirror")
  const hoveredRoot = document.querySelector<HTMLElement>(`${CODE_BLOCK_EDITOR_CONTENT_SELECTOR}:hover`)
  if (hoveredRoot && canResolveHoveredCodeRoot) return hoveredRoot
  if (canResolveHoveredCodeRoot) {
    const viewportCenterY = window.innerHeight / 2
    return Array.from(document.querySelectorAll<HTMLElement>(CODE_BLOCK_EDITOR_CONTENT_SELECTOR)).find((root) => {
      const rect = root.getBoundingClientRect()
      return rect.top <= viewportCenterY && rect.bottom >= viewportCenterY
    }) ?? null
  }
  return null
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
  const scrollAnchor = { x: window.scrollX, y: document.scrollingElement?.scrollTop ?? window.scrollY }
  markNextEditorPointerAfterCodeSelection()
  preserveWindowScrollForRichBlockSelectAll()
  editor.view.dispatch(editor.state.tr.setSelection(nextSelection))
  preserveWindowScrollPositionAcrossFrames(scrollAnchor, 240, 4, 4_800, false, false, true, false, false, shouldCancelCodeScrollPreserve(scrollAnchor), true)
  window.scrollTo(scrollAnchor.x, scrollAnchor.y)
  focusElementWithoutScroll(editor.view.dom as HTMLElement)
  return true
}

type CodeNativeDragEvent = {
  target: EventTarget | null
  nativeEvent?: Event
  preventDefault: () => void
  stopPropagation: () => void
}

const stopNativeCodeDrag = (event: CodeNativeDragEvent) => {
  event.preventDefault()
  event.stopPropagation()
  event.nativeEvent?.stopImmediatePropagation()
}

export const preventNativeCodeDragStart = (event: CodeNativeDragEvent, shell: HTMLElement | null) => {
  if (!(event.target instanceof Node) || !shell?.contains(event.target)) return false
  stopNativeCodeDrag(event)
  return true
}

export const preventInternalCodeDrop = (event: CodeNativeDragEvent, shell: HTMLElement | null) => {
  const selection = window.getSelection()
  const selectionText = selection?.toString().trim() ?? ""
  const anchorElement =
    selection?.anchorNode instanceof Element ? selection.anchorNode : selection?.anchorNode?.parentElement ?? null
  const focusElement =
    selection?.focusNode instanceof Element ? selection.focusNode : selection?.focusNode?.parentElement ?? null
  const hasNativeCodeSelection = Boolean(
    selectionText &&
      shell &&
      anchorElement &&
      focusElement &&
      shell.contains(anchorElement) &&
      shell.contains(focusElement)
  )
  const persistedCodeSelectionText = shell?.getAttribute("data-code-drag-selection-text")?.trim()
  const hasInternalCodeSelection = Boolean(
    shell && (hasNativeCodeSelection || persistedCodeSelectionText)
  )
  if (!hasInternalCodeSelection) return false
  stopNativeCodeDrag(event)
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
