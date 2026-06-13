import type { Editor as TiptapEditor } from "@tiptap/core"
import { TextSelection } from "@tiptap/pm/state"

export type EditorNativeTextSelectionRestore = {
  restore: (afterRestore?: () => void) => void
  textLength: number
}

const resolveElement = (node: Node | null | undefined) =>
  node instanceof Element ? node : node?.parentElement ?? null

const resolvePointRange = (x: number, y: number) => {
  if ("caretRangeFromPoint" in document) {
    const range = document.caretRangeFromPoint(x, y)
    if (range) return range
  }
  const position = document.caretPositionFromPoint?.(x, y)
  if (!position) return null
  const range = document.createRange()
  range.setStart(position.offsetNode, position.offset)
  range.collapse(true)
  return range
}

const isRangePointAfter = (start: Range, end: Range) => {
  const startPoint = document.createRange()
  startPoint.setStart(start.startContainer, start.startOffset)
  startPoint.collapse(true)
  const endPoint = document.createRange()
  endPoint.setStart(end.startContainer, end.startOffset)
  endPoint.collapse(true)
  return startPoint.compareBoundaryPoints(Range.START_TO_START, endPoint) > 0
}

const selectEditorRangeFromPoints = (
  editorRoot: HTMLElement,
  points: { endX: number; endY: number; startX: number; startY: number },
  excludeSelector?: string
) => {
  const start = resolvePointRange(points.startX, points.startY),
    end = resolvePointRange(points.endX, points.endY)
  if (!start || !end) return false
  const startElement = resolveElement(start.startContainer),
    endElement = resolveElement(end.startContainer)
  if (
    !startElement ||
    !endElement ||
    !editorRoot.contains(startElement) ||
    !editorRoot.contains(endElement) ||
    Boolean(
      excludeSelector &&
        (startElement.closest(excludeSelector) ||
          endElement.closest(excludeSelector))
    )
  )
    return false
  const range = document.createRange()
  if (isRangePointAfter(start, end)) {
    range.setStart(end.startContainer, end.startOffset)
    range.setEnd(start.startContainer, start.startOffset)
  } else {
    range.setStart(start.startContainer, start.startOffset)
    range.setEnd(end.startContainer, end.startOffset)
  }
  if (range.collapsed || !range.toString().trim()) return false
  const selection = window.getSelection()
  if (!selection) return false
  selection.removeAllRanges()
  selection.addRange(range)
  return true
}

export const captureEditorNativeTextSelectionRestore = (
  editorRoot: HTMLElement | null | undefined,
  options: {
    excludeSelector?: string
    fallbackPoints?: { endX: number; endY: number; startX: number; startY: number }
  } = {}
) => {
  if (!editorRoot || typeof window === "undefined") return null
  let selection = window.getSelection()
  if ((!selection || selection.rangeCount === 0 || selection.isCollapsed || !selection.toString().trim()) && options.fallbackPoints) {
    selectEditorRangeFromPoints(editorRoot, options.fallbackPoints, options.excludeSelector)
    selection = window.getSelection()
  }
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed)
    return null
  const selectedText = selection.toString().trim()
  if (!selectedText) return null

  const anchorElement = resolveElement(selection.anchorNode),
    focusElement = resolveElement(selection.focusNode)
  if (
    !anchorElement ||
    !focusElement ||
    !editorRoot.contains(anchorElement) ||
    !editorRoot.contains(focusElement) ||
    Boolean(
      options.excludeSelector &&
        (anchorElement.closest(options.excludeSelector) ||
          focusElement.closest(options.excludeSelector))
    )
  )
    return null

  const range = selection.getRangeAt(0).cloneRange()
  const startedAt =
    typeof performance !== "undefined" ? performance.now() : Date.now()
  let cancelled = false
  const cleanup = () => {
    cancelled = true
    window.removeEventListener("pointerdown", cleanup, true)
    window.removeEventListener("mousedown", cleanup, true)
    window.removeEventListener("wheel", cleanup, true)
    window.removeEventListener("keydown", cleanup, true)
  }
  const restore = (afterRestore?: () => void) => {
    if (cancelled) return
    if (
      !editorRoot.isConnected ||
      !range.startContainer.isConnected ||
      !range.endContainer.isConnected
    )
      return
    const currentSelection = window.getSelection()
    if (!currentSelection) return
    const currentText = currentSelection.toString().trim()
    const shouldRestore =
      currentSelection.rangeCount === 0 ||
      currentSelection.isCollapsed ||
      (currentText.length < selectedText.length &&
        (!currentText || selectedText.includes(currentText)))
    if (!shouldRestore) return
    currentSelection.removeAllRanges()
    currentSelection.addRange(range.cloneRange())
    afterRestore?.()
  }

  return {
    restore: (afterRestore?: () => void) => {
      let frame = 0
      const tick = () => {
        restore(afterRestore)
        frame += 1
        const elapsedMs =
          (typeof performance !== "undefined"
            ? performance.now()
            : Date.now()) - startedAt
        if (!cancelled && (frame < 96 || elapsedMs < 1_600))
          window.requestAnimationFrame(tick)
        else cleanup()
      }
      window.addEventListener("pointerdown", cleanup, {
        capture: true,
        once: true,
      })
      window.addEventListener("mousedown", cleanup, {
        capture: true,
        once: true,
      })
      window.addEventListener("wheel", cleanup, {
        capture: true,
        passive: true,
        once: true,
      })
      window.addEventListener("keydown", cleanup, { capture: true, once: true })
      window.requestAnimationFrame(tick)
      window.setTimeout(() => restore(afterRestore), 80)
      window.setTimeout(() => restore(afterRestore), 180)
      window.setTimeout(() => restore(afterRestore), 900)
    },
    textLength: selectedText.length,
  }
}

export const syncNativeEditorTextSelectionToProseMirror = (
  editor: TiptapEditor,
  options: { allowCollapsed?: boolean; excludeSelector?: string } = {}
) => {
  const editorRoot = editor.view.dom as HTMLElement,
    selection = window.getSelection()
  if (
    !selection ||
    selection.rangeCount === 0 ||
    (!options.allowCollapsed &&
      (selection.isCollapsed || !selection.toString().trim()))
  )
    return false
  const range = selection.getRangeAt(0),
    startElement = resolveElement(range.startContainer),
    endElement = resolveElement(range.endContainer)
  if (
    !startElement ||
    !endElement ||
    !editorRoot.contains(startElement) ||
    !editorRoot.contains(endElement) ||
    Boolean(options.excludeSelector && (startElement.closest(options.excludeSelector) || endElement.closest(options.excludeSelector)))
  )
    return false
  try {
    const from = editor.view.posAtDOM(range.startContainer, range.startOffset),
      to = editor.view.posAtDOM(range.endContainer, range.endOffset),
      start = Math.min(from, to),
      end = Math.max(from, to)
    if (start === end && !options.allowCollapsed) return false
    if (editor.state.selection.from === start && editor.state.selection.to === end) return true
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, start, end)))
    return true
  } catch {
    return false
  }
}
