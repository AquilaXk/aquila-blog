import type { Editor as TiptapEditor } from "@tiptap/core"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import { NodeSelection, TextSelection } from "@tiptap/pm/state"
import { CellSelection, tableEditingKey } from "@tiptap/pm/tables"
import type { BlockEditorDoc } from "./serialization"
import { shouldCenterBlockHandleForNode } from "./blockHandleLayoutModel"
import {
  createSafeTextSelectionOutsideTable,
  isTableSelectionActive,
} from "./tableStructureModel"
import { cancelTableAxisSelectionSurface } from "./tableTextSelectionModel"

export type TopLevelBlockHandleState = {
  visible: boolean
  kind: "top-level" | "list-item"
  blockIndex: number
  listPath: number[]
  itemIndex: number | null
  left: number
  top: number
  bottom: number
  width: number
}

export type BlockSelectionOverlayState = {
  visible: boolean
  left: number
  top: number
  width: number
  height: number
}

export type BlockSelectionPointerEventLike = {
  button: number
  detail: number
  clientX: number
  clientY: number
  target: EventTarget | null
  metaKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
}

type BlockSelectionRect = Pick<DOMRect, "left" | "right" | "top" | "bottom">

export const BLOCK_HANDLE_POSITION_EPSILON_PX = 0.4
export const BLOCK_OUTER_SELECT_LEFT_GUTTER_PX = 76
export const BLOCK_OUTER_SELECT_LEFT_EDGE_GAP_PX = 2
export const BLOCK_OUTER_SELECT_VERTICAL_MARGIN_PX = 10
export const BLOCK_SELECTION_CONTROL_SELECTOR = [
  "[data-block-handle-rail='true']",
  "[data-testid='block-drag-handle']",
].join(", ")

const createTableBlockSelectionCollapse = (
  doc: ProseMirrorNode,
  pos: number,
  bias = -1
) => {
  const safeOutsideSelection = createSafeTextSelectionOutsideTable(
    doc,
    pos,
    bias
  )
  if (safeOutsideSelection) return safeOutsideSelection

  const safePos = Math.max(0, Math.min(pos, doc.content.size))
  return TextSelection.near(doc.resolve(safePos), bias)
}

const sameListPath = (left: number[], right: number[]) =>
  left.length === right.length &&
  left.every((value, index) => value === right[index])

const isWithinBlockHandleEpsilon = (prev: number, next: number) =>
  Math.abs(prev - next) <= BLOCK_HANDLE_POSITION_EPSILON_PX

export const isStableBlockHandleState = (
  prev: TopLevelBlockHandleState,
  next: TopLevelBlockHandleState
) =>
  prev.visible === next.visible &&
  prev.kind === next.kind &&
  prev.blockIndex === next.blockIndex &&
  prev.itemIndex === next.itemIndex &&
  sameListPath(prev.listPath, next.listPath) &&
  isWithinBlockHandleEpsilon(prev.left, next.left) &&
  isWithinBlockHandleEpsilon(prev.top, next.top) &&
  isWithinBlockHandleEpsilon(prev.bottom, next.bottom) &&
  isWithinBlockHandleEpsilon(prev.width, next.width)

export const isStableBlockSelectionOverlayState = (
  prev: BlockSelectionOverlayState,
  next: BlockSelectionOverlayState
) =>
  prev.visible === next.visible &&
  isWithinBlockHandleEpsilon(prev.left, next.left) &&
  isWithinBlockHandleEpsilon(prev.top, next.top) &&
  isWithinBlockHandleEpsilon(prev.width, next.width) &&
  isWithinBlockHandleEpsilon(prev.height, next.height)

export const getTopLevelBlockIndexFromSelection = (editor: TiptapEditor) => {
  const { selection } = editor.state
  return Math.max(0, selection.$from.index(0))
}

export const getTopLevelBlockPosition = (
  editor: TiptapEditor,
  blockIndex: number
) => {
  const { doc } = editor.state
  if (doc.childCount === 0) return 1
  const clampedIndex = Math.max(0, Math.min(blockIndex, doc.childCount - 1))
  let position = 1
  for (let index = 0; index < clampedIndex; index += 1) {
    position += doc.child(index).nodeSize
  }
  return position
}

export const getTopLevelBlockNodePosition = (
  editor: TiptapEditor,
  blockIndex: number
) => Math.max(0, getTopLevelBlockPosition(editor, blockIndex) - 1)

export const getFirstEditableTextPositionInNode = (
  node: ProseMirrorNode | null | undefined,
  startPos: number
): number | null => {
  if (!node) return null
  if (node.isTextblock) {
    return startPos + 1
  }

  if (!node.childCount) {
    return null
  }

  let childPos = startPos + 1
  for (let index = 0; index < node.childCount; index += 1) {
    const child = node.child(index)
    const nested = getFirstEditableTextPositionInNode(child, childPos)
    if (nested !== null) {
      return nested
    }
    childPos += child.nodeSize
  }

  return null
}

export const getEditableTextPositionForTopLevelBlock = (
  editor: TiptapEditor,
  blockIndex: number
) => {
  const { doc } = editor.state
  if (doc.childCount === 0) return null
  const clampedIndex = Math.max(0, Math.min(blockIndex, doc.childCount - 1))
  const topLevelBlock = doc.child(clampedIndex)
  if (
    ![
      "paragraph",
      "heading",
      "blockquote",
      "bulletList",
      "orderedList",
      "taskList",
      "calloutBlock",
      "toggleBlock",
    ].includes(topLevelBlock.type.name)
  ) {
    return null
  }

  const blockPosition = getTopLevelBlockPosition(editor, clampedIndex)
  return getFirstEditableTextPositionInNode(topLevelBlock, blockPosition)
}

const focusEditorViewWithoutScroll = (editor: TiptapEditor) => {
  if (typeof window === "undefined") {
    editor.view.focus()
    return
  }

  const previousScrollX = window.scrollX
  const previousScrollY = window.scrollY
  editor.view.focus()
  if (
    window.scrollX !== previousScrollX ||
    window.scrollY !== previousScrollY
  ) {
    window.scrollTo(previousScrollX, previousScrollY)
  }
}

const resolveTableSelectedCellMarkerRoots = (editor: TiptapEditor) => {
  const roots = new Set<ParentNode>()
  roots.add(editor.view.dom)
  const editorSurface = editor.view.dom.closest(
    "[data-testid='block-editor-prosemirror']"
  )
  const editorContent = editor.view.dom.closest(".aq-block-editor__content")
  if (editorSurface) roots.add(editorSurface)
  if (editorContent) roots.add(editorContent)
  return Array.from(roots)
}

const clearTableSelectedCellDomMarkers = (editor: TiptapEditor) => {
  if (typeof document === "undefined") return
  let tableEditingMetaCleared = false
  const clearMarkers = () => {
    if (
      !tableEditingMetaCleared &&
      tableEditingKey.getState(editor.state) !== null
    ) {
      editor.view.dispatch(editor.state.tr.setMeta(tableEditingKey, -1))
      tableEditingMetaCleared = true
    }
    if (editor.state.selection instanceof CellSelection) return
    resolveTableSelectedCellMarkerRoots(editor).forEach((root) => {
      root
        .querySelectorAll(".selectedCell")
        .forEach((element) => element.classList.remove("selectedCell"))
    })
  }
  clearMarkers()
  if (typeof window === "undefined") return
  const startedAt = performance.now()
  const observedRoot =
    editor.view.dom.closest("[data-testid='block-editor-prosemirror']") ??
    editor.view.dom
  const observer =
    typeof MutationObserver === "undefined"
      ? null
      : new MutationObserver(clearMarkers)
  observer?.observe(observedRoot, {
    attributeFilter: ["class"],
    attributes: true,
    subtree: true,
  })
  const maintain = () => {
    if (
      !editor.view.dom.isConnected ||
      performance.now() - startedAt > 650
    ) {
      observer?.disconnect()
      return
    }
    clearMarkers()
    window.requestAnimationFrame(maintain)
  }
  window.requestAnimationFrame(maintain)
}

export const selectTopLevelBlockNode = (
  editor: TiptapEditor,
  blockIndex: number
) => {
  const { doc } = editor.state
  if (doc.childCount === 0) return
  const clampedIndex = Math.max(0, Math.min(blockIndex, doc.childCount - 1))
  const topLevelBlock = doc.child(clampedIndex)
  const isTableBlockSelection = topLevelBlock.type.name === "table"
  cancelTableAxisSelectionSurface()
  clearTableSelectedCellDomMarkers(editor)
  if (isTableSelectionActive(editor)) {
    cancelTableAxisSelectionSurface()
    const collapseSelection = createTableBlockSelectionCollapse(
      doc,
      editor.state.selection.to,
      -1
    )
    editor.view.dispatch(
      editor.state.tr
        .setSelection(collapseSelection)
        .setMeta(tableEditingKey, -1)
    )
    clearTableSelectedCellDomMarkers(editor)
  }
  const collapseTableBlockSelection = () => {
    cancelTableAxisSelectionSurface()
    const collapseSelection = createTableBlockSelectionCollapse(
      editor.state.doc,
      getTopLevelBlockPosition(editor, clampedIndex),
      -1
    )
    editor.view.dispatch(
      editor.state.tr
        .setSelection(collapseSelection)
        .setMeta(tableEditingKey, -1)
    )
    clearTableSelectedCellDomMarkers(editor)
    return getTopLevelBlockNodePosition(editor, clampedIndex)
  }
  const dispatchNodeSelection = () => {
    if (isTableBlockSelection) return collapseTableBlockSelection()
    const nextPosition = getTopLevelBlockNodePosition(editor, clampedIndex)
    const selection = NodeSelection.create(editor.state.doc, nextPosition)
    editor.view.dispatch(editor.state.tr.setSelection(selection))
    return nextPosition
  }
  dispatchNodeSelection()
  focusEditorViewWithoutScroll(editor)

  if (typeof window === "undefined") return

  const startedAt = performance.now()
  const clearNativeSelection = () => {
    window.getSelection()?.removeAllRanges()
    document.documentElement.removeAttribute("data-table-drag-selection-text")
    document
      .querySelectorAll("[data-table-drag-selection-text]")
      .forEach((element) =>
        element.removeAttribute("data-table-drag-selection-text")
      )
  }
  const isBlockSelectionSurfaceActive = () => {
    const blockElement = editor.view.dom.children[clampedIndex]
    return (
      blockElement instanceof HTMLElement &&
      blockElement.getAttribute("data-block-selected") === "true"
    )
  }
  const preserveTopLevelSelection = () => {
    if (!editor.view.dom.isConnected || performance.now() - startedAt > 220) {
      return
    }
    if (!isBlockSelectionSurfaceActive()) return
    const nextPosition = getTopLevelBlockNodePosition(editor, clampedIndex)
    const { selection } = editor.state
    if (isTableBlockSelection) {
      if (isTableSelectionActive(editor)) {
        collapseTableBlockSelection()
        focusEditorViewWithoutScroll(editor)
      }
      clearNativeSelection()
      return
    }
    if (selection instanceof NodeSelection && selection.from === nextPosition) {
      clearNativeSelection()
      return
    }
    if (!isTableSelectionActive(editor)) return

    const collapseSelection = createSafeTextSelectionOutsideTable(
      editor.state.doc,
      selection.to,
      -1
    )
    if (collapseSelection) {
      editor.view.dispatch(editor.state.tr.setSelection(collapseSelection))
    }
    dispatchNodeSelection()
    clearNativeSelection()
    focusEditorViewWithoutScroll(editor)
  }
  window.requestAnimationFrame(preserveTopLevelSelection)
  window.setTimeout(preserveTopLevelSelection, 0)
  window.setTimeout(preserveTopLevelSelection, 80)
  window.setTimeout(preserveTopLevelSelection, 180)
  window.setTimeout(preserveTopLevelSelection, 220)
}

export const isTabBlockSelectionEligible = (
  editor: TiptapEditor,
  blockIndex: number | null
) => {
  if (blockIndex === null || isTableSelectionActive(editor)) return false
  const blocks = ((editor.getJSON() as BlockEditorDoc).content ??
    []) as BlockEditorDoc[]
  return shouldCenterBlockHandleForNode(blocks[blockIndex] ?? null)
}

const isSelectionPointerGesture = (event: BlockSelectionPointerEventLike) =>
  event.button === 0 &&
  event.detail >= 2 &&
  !event.metaKey &&
  !event.ctrlKey &&
  !event.altKey &&
  !event.shiftKey

const getEventTargetElement = (target: EventTarget | null) =>
  target instanceof Element
    ? target
    : target instanceof Node
    ? target.parentElement
    : null

const hasClosestTarget = (target: Element | null, selectors: string[]) =>
  Boolean(target && selectors.some((selector) => target.closest(selector)))

const isOuterSelectionHit = (
  event: BlockSelectionPointerEventLike,
  rect: BlockSelectionRect
) => {
  const withinVerticalRange =
    event.clientY >= rect.top - BLOCK_OUTER_SELECT_VERTICAL_MARGIN_PX &&
    event.clientY <= rect.bottom + BLOCK_OUTER_SELECT_VERTICAL_MARGIN_PX
  if (!withinVerticalRange) return false

  return (
    event.clientX >= rect.left - BLOCK_OUTER_SELECT_LEFT_GUTTER_PX &&
    event.clientX <= rect.left - BLOCK_OUTER_SELECT_LEFT_EDGE_GAP_PX
  )
}

export const resolveOuterBlockSelectionGesture = (
  event: BlockSelectionPointerEventLike,
  blockElement: HTMLElement | null
) => {
  if (!blockElement || !isSelectionPointerGesture(event)) return false

  const targetElement = getEventTargetElement(event.target)
  if (
    hasClosestTarget(targetElement, [
      "[data-block-handle-rail='true'] button",
      "[data-block-menu-root='true']",
      "[data-table-menu-root='true']",
      "[data-table-axis-rail='true']",
      "[data-table-corner-handle='true']",
      "[data-table-menu-trigger='true']",
    ])
  ) {
    return false
  }

  return isOuterSelectionHit(event, blockElement.getBoundingClientRect())
}

export const resolveOuterListItemSelectionGesture = (
  event: BlockSelectionPointerEventLike,
  listItemElement: HTMLElement | null
) => {
  if (!listItemElement || !isSelectionPointerGesture(event)) return false

  const targetElement = getEventTargetElement(event.target)
  if (
    hasClosestTarget(targetElement, [
      "[data-block-handle-rail='true'] button",
      "[data-block-menu-root='true']",
      "[data-table-menu-root='true']",
    ])
  ) {
    return false
  }

  return isOuterSelectionHit(event, listItemElement.getBoundingClientRect())
}
