import type { Editor as TiptapEditor } from "@tiptap/core"
import { TextSelection } from "@tiptap/pm/state"
import { useEffect, useRef } from "react"
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from "react"
import { markNextEditorPointerAfterTable, preserveWindowScrollForEditorPointerFocus, preserveWindowScrollPositionAcrossFrames, type WindowScrollAnchor } from "./blockHandleLayoutModel"
import { isTableSelectionActive } from "./tableStructureModel"
import { preserveTableCellTextSelectionAcrossFrames, restoreTableCellTextSelectionIfEscaped } from "./tableTextSelectionModel"
import { areFloatingBubbleStatesEqual, hideFloatingBubbleState, resolveFloatingBubbleStateFromCoords, type FloatingBubbleState } from "./useFloatingBubbleState"

type SetState<T> = Dispatch<SetStateAction<T>>

const CODE_BLOCK_EDITOR_CONTENT_SELECTOR = ".aq-code-editor-content"
const BLOCK_EDITOR_ROOT_SELECTOR = "[data-testid='block-editor-prosemirror'], .ProseMirror"
const TABLE_TEXT_DRAG_CONTROL_SELECTOR = "[data-table-axis-rail='true'], [data-table-affordance], [data-table-menu-root='true'], [data-table-menu-trigger='true'], [data-testid^='table-column-resize-boundary-'], [data-testid='table-structure-menu-button'], [data-testid='table-corner-handle'], [data-testid='table-corner-grow-handle'], .column-resize-handle"
type UseBlockEditorEngineSelectionBubbleEffectsArgs = {
  bubbleToolbarHoveredRef: RefObject<boolean>
  cancelBubbleHide: () => void
  clearWindowTextSelection: () => void
  editor: TiptapEditor | null
  editorRef: RefObject<TiptapEditor | null>
  hasTableStructuralSelection: (editor: TiptapEditor) => boolean
  hideTableQuickRailImmediately: () => void
  isTableColumnRailResizeActive: () => boolean
  mouseTextSelectionInProgressRef: MutableRefObject<boolean>
  scheduleBubbleHide: () => void
  scheduleTableQuickRailHide: () => void
  setBubbleState: SetState<FloatingBubbleState>
  syncBubbleOnMouseUpRef: MutableRefObject<boolean>
  syncTableQuickRailFromElement: (element: Element, clientX?: number, clientY?: number) => void
  tableMenuState: unknown
  tryStartTableColumnResizeFromDomHandle: (target: EventTarget | null, pointerId: number, clientX: number) => boolean
}

export const useBlockEditorEngineSelectionBubbleEffects = ({
  bubbleToolbarHoveredRef,
  cancelBubbleHide,
  clearWindowTextSelection,
  editor,
  editorRef,
  hasTableStructuralSelection,
  hideTableQuickRailImmediately,
  isTableColumnRailResizeActive,
  mouseTextSelectionInProgressRef,
  scheduleBubbleHide,
  scheduleTableQuickRailHide,
  setBubbleState,
  syncBubbleOnMouseUpRef,
  syncTableQuickRailFromElement,
  tableMenuState,
  tryStartTableColumnResizeFromDomHandle,
}: UseBlockEditorEngineSelectionBubbleEffectsArgs) => {
  const tableTextDragStartRef = useRef<{ cell: HTMLElement; scrollPreserveStarted: boolean; scrollAnchor: WindowScrollAnchor; x: number; y: number } | null>(null)
  const codeTextDragStartRef = useRef<{ root: HTMLElement; scrollPreserveStarted: boolean; scrollAnchor: WindowScrollAnchor; x: number; y: number } | null>(null)

  useEffect(() => {
    const currentEditor = editorRef.current ?? editor
    if (!currentEditor) return
    let rafId: number | null = null
    let codeDragSelectionPreserveRafId: number | null = null
    let cleanupCodeDragSelectionPreserve: (() => void) | null = null
    const clearImmediateWindowTextSelection = () => window.getSelection()?.removeAllRanges()
    const cancelCodeDragSelectionPreserve = () => {
      if (codeDragSelectionPreserveRafId !== null) {
        window.cancelAnimationFrame(codeDragSelectionPreserveRafId)
        codeDragSelectionPreserveRafId = null
      }
      cleanupCodeDragSelectionPreserve?.()
      cleanupCodeDragSelectionPreserve = null
      document.querySelectorAll("[data-code-drag-selection-text]").forEach((element) => element.removeAttribute("data-code-drag-selection-text"))
    }

    const rememberCodeTextDragStart = (codeShellTarget: Element | null | undefined, event: MouseEvent | PointerEvent) => {
      const codeSelectionRoot = codeShellTarget?.querySelector<HTMLElement>(".aq-code-editor-content") ?? codeShellTarget?.querySelector<HTMLElement>(".aq-code-highlight-layer")
      const scrollAnchor = { x: window.scrollX, y: document.scrollingElement?.scrollTop ?? window.scrollY }
      codeTextDragStartRef.current = codeSelectionRoot
        ? {
            root: codeSelectionRoot,
            scrollPreserveStarted: false,
            scrollAnchor,
            x: event.clientX,
            y: event.clientY,
          }
        : null
      if (codeSelectionRoot) {
        codeSelectionRoot.closest(".aq-code-shell")?.removeAttribute("data-code-drag-selection-text")
      }
      return codeTextDragStartRef.current
    }
    const findCodeShellTarget = (targetElement: Element | null | undefined, pointElements: Element[]) =>
      targetElement?.closest(".aq-code-shell") ?? pointElements.find((element) => Boolean(element.closest(".aq-code-shell")))?.closest(".aq-code-shell")
    const rememberCodeTextDragStartAtPoint = (event: MouseEvent | PointerEvent) => {
      const targetElement = event.target instanceof Element ? event.target : event.target instanceof Node ? event.target.parentElement : null
      return rememberCodeTextDragStart(findCodeShellTarget(targetElement, document.elementsFromPoint(event.clientX, event.clientY)), event)
    }

    const rememberTableTextDragStart = (event: MouseEvent | PointerEvent, allowTableControlCellFallback = false) => {
      if (event.button !== 0) return null
      const activeEditor = editorRef.current ?? currentEditor
      if (!activeEditor) return null
      const targetElement = event.target instanceof Element ? event.target : event.target instanceof Node ? event.target.parentElement : null
      const pointElements = document.elementsFromPoint(event.clientX, event.clientY)
      const pointInsideEditor = pointElements.some((element) => Boolean(element.closest(BLOCK_EDITOR_ROOT_SELECTOR)))
      if (!(event.target instanceof Node) || (!activeEditor.view.dom.contains(event.target) && !targetElement?.closest(BLOCK_EDITOR_ROOT_SELECTOR) && !pointInsideEditor)) {
        tableTextDragStartRef.current = null
        return null
      }
      const pointElement = pointElements.find((element) => Boolean(element.closest("th, td"))) ?? document.elementFromPoint(event.clientX, event.clientY)
      const tableTextCell = pointElement?.closest("th, td") ?? targetElement?.closest("th, td")
      const tableControlTarget = targetElement?.closest(TABLE_TEXT_DRAG_CONTROL_SELECTOR) ?? pointElements[0]?.closest(TABLE_TEXT_DRAG_CONTROL_SELECTOR)
      if (tableControlTarget && (!allowTableControlCellFallback || !(tableTextCell instanceof HTMLElement))) { tableTextDragStartRef.current = null; return null }
      const scrollAnchor = { x: window.scrollX, y: document.scrollingElement?.scrollTop ?? window.scrollY }
      if (tableTextCell instanceof HTMLElement) {
        tableTextCell.removeAttribute("data-table-drag-selection-text")
        markNextEditorPointerAfterTable()
      }
      tableTextDragStartRef.current = tableTextCell instanceof HTMLElement ? { cell: tableTextCell, scrollPreserveStarted: false, scrollAnchor, x: event.clientX, y: event.clientY } : null
      return tableTextDragStartRef.current
    }

    const hasMovedTableTextDrag = (event: MouseEvent | PointerEvent) => {
      const tableTextDragStart = tableTextDragStartRef.current
      return Boolean(tableTextDragStart && (Math.abs(event.clientX - tableTextDragStart.x) > 4 || Math.abs(event.clientY - tableTextDragStart.y) > 4))
    }

    const restoreActiveTableTextDragSelection = (restoreWhenEmpty = false, forceStartedCellSelection = false) => {
      const activeEditor = editorRef.current ?? currentEditor
      const tableTextDragStart = tableTextDragStartRef.current
      if (!activeEditor || !tableTextDragStart) return false
      return restoreTableCellTextSelectionIfEscaped(activeEditor, tableTextDragStart.cell, tableTextDragStart.scrollAnchor, restoreWhenEmpty, forceStartedCellSelection)
    }

    const preserveActiveTableTextDragScroll = () => {
      const tableTextDragStart = tableTextDragStartRef.current
      if (!tableTextDragStart || tableTextDragStart.scrollPreserveStarted) return
      tableTextDragStart.scrollPreserveStarted = true
      preserveWindowScrollPositionAcrossFrames(tableTextDragStart.scrollAnchor, 72, 4, 1_120, false, false)
    }

    const preserveActiveCodeTextDragScroll = () => {
      const codeTextDragStart = codeTextDragStartRef.current
      if (!codeTextDragStart || codeTextDragStart.scrollPreserveStarted) return
      codeTextDragStart.scrollPreserveStarted = true
      preserveWindowScrollPositionAcrossFrames(codeTextDragStart.scrollAnchor, 168, 4, 2_800, false, false)
    }
    const isSelectionInsideCodeDragRoot = (root: HTMLElement) => {
      const selection = window.getSelection()
      if (!selection) return false
      const anchorElement = selection.anchorNode instanceof Element ? selection.anchorNode : selection.anchorNode?.parentElement ?? null
      const focusElement = selection.focusNode instanceof Element ? selection.focusNode : selection.focusNode?.parentElement ?? null
      const anchorInsideCodeRoot = Boolean(anchorElement && root.contains(anchorElement)), focusInsideCodeRoot = Boolean(focusElement && root.contains(focusElement))
      return Boolean(selection.toString().trim() && anchorInsideCodeRoot && focusInsideCodeRoot)
    }

    const selectCodeDragRoot = (root: HTMLElement) => {
      const selection = window.getSelection()
      if (!selection) return false
      root.focus({ preventScroll: true })
      const range = document.createRange()
      range.selectNodeContents(root)
      selection.removeAllRanges()
      selection.addRange(range)
      root.closest(".aq-code-shell")?.setAttribute("data-code-drag-selection-text", selection.toString())
      return true
    }

    const preserveCodeDragRootSelectionAcrossFrames = (root: HTMLElement) => {
      if (codeDragSelectionPreserveRafId !== null) return
      const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now()
      let frame = 0
      let restoring = false
      const restoreIfMissing = () => {
        if (!root.isConnected) return false
        if (isSelectionInsideCodeDragRoot(root)) return true
        restoring = true
        selectCodeDragRoot(root)
        restoring = false
        return true
      }
      const handlePreservedSelectionChange = () => {
        if (restoring) return
        restoreIfMissing()
      }
      const cleanupPreservedSelection = () => {
        document.removeEventListener("selectionchange", handlePreservedSelectionChange, true)
        window.removeEventListener("pointerdown", cancelPreservedSelection, true)
        window.removeEventListener("mousedown", cancelPreservedSelection, true)
      }
      const cancelPreservedSelection = () => cancelCodeDragSelectionPreserve()
      const restore = () => {
        if (!root.isConnected) {
          codeDragSelectionPreserveRafId = null
          cleanupPreservedSelection()
          return
        }
        restoreIfMissing()
        frame += 1
        const elapsedMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt
        if (frame < 168 || elapsedMs < 2_800) {
          codeDragSelectionPreserveRafId = window.requestAnimationFrame(restore)
        } else {
          codeDragSelectionPreserveRafId = null
          cleanupPreservedSelection()
        }
      }
      document.addEventListener("selectionchange", handlePreservedSelectionChange, true)
      window.addEventListener("pointerdown", cancelPreservedSelection, { capture: true, passive: true, once: true })
      window.addEventListener("mousedown", cancelPreservedSelection, { capture: true, passive: true, once: true })
      cleanupCodeDragSelectionPreserve = cleanupPreservedSelection
      restore()
    }

    const selectCodeDragRootWhenNativeSelectionIsMissing = () => {
      const codeTextDragStart = codeTextDragStartRef.current
      if (!codeTextDragStart?.root.isConnected) return false
      if (isSelectionInsideCodeDragRoot(codeTextDragStart.root)) return false
      const selected = selectCodeDragRoot(codeTextDragStart.root)
      if (selected) {
        preserveCodeDragRootSelectionAcrossFrames(codeTextDragStart.root)
      }
      return selected
    }

    const hasMovedCodeTextDrag = (event: MouseEvent | PointerEvent) => {
      const codeTextDragStart = codeTextDragStartRef.current
      return Boolean(codeTextDragStart && (Math.abs(event.clientX - codeTextDragStart.x) > 4 || Math.abs(event.clientY - codeTextDragStart.y) > 4))
    }

    const syncBubble = () => {
      const activeEditor = editorRef.current ?? currentEditor
      if (!activeEditor) {
        scheduleBubbleHide()
        if (!tableMenuState) {
          hideTableQuickRailImmediately()
        }
        return
      }

      let selection = activeEditor.state.selection
      if (selection.empty && typeof window !== "undefined" && !isTableColumnRailResizeActive()) {
        const domSelection = window.getSelection()
        const range =
          domSelection && domSelection.rangeCount > 0 ? domSelection.getRangeAt(0) : null
        const commonAncestor =
          range?.commonAncestorContainer instanceof Element
            ? range.commonAncestorContainer
            : range?.commonAncestorContainer?.parentElement ?? null

        const isCodeBlockNodeViewSelection = Boolean(
          commonAncestor?.closest(CODE_BLOCK_EDITOR_CONTENT_SELECTOR)
        )

        if (
          range &&
          domSelection &&
          !domSelection.isCollapsed &&
          commonAncestor &&
          activeEditor.view.dom.contains(commonAncestor) &&
          !isCodeBlockNodeViewSelection
        ) {
          const syncPmSelectionFromRange = (from: number, to: number) => {
            if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) return false
            const nextSelection = TextSelection.create(
              activeEditor.state.doc,
              Math.min(from, to),
              Math.max(from, to)
            )
            if (!nextSelection.eq(activeEditor.state.selection)) {
              activeEditor.view.dispatch(activeEditor.state.tr.setSelection(nextSelection))
              selection = activeEditor.state.selection
            }
            return true
          }

          let synced = false
          try {
            const from = activeEditor.view.posAtDOM(range.startContainer, range.startOffset)
            const to = activeEditor.view.posAtDOM(range.endContainer, range.endOffset)
            synced = syncPmSelectionFromRange(from, to)
          } catch {
            synced = false
          }

          if (!synced) {
            const rangeRects = Array.from(range.getClientRects())
            const startRect = rangeRects[0] ?? range.getBoundingClientRect()
            const endRect = rangeRects[rangeRects.length - 1] ?? startRect
            const startCoords = activeEditor.view.posAtCoords({
              left: startRect.left + 1,
              top: startRect.top + startRect.height / 2,
            })
            const endCoords = activeEditor.view.posAtCoords({
              left: Math.max(endRect.left + 1, endRect.right - 1),
              top: endRect.top + endRect.height / 2,
            })
            if (startCoords?.pos && endCoords?.pos) {
              syncPmSelectionFromRange(startCoords.pos, endCoords.pos)
            }
          }
        }
      }

      const isImageNodeSelected = activeEditor.isActive("resizableImage")
      const isTableActive = isTableSelectionActive(activeEditor)
      const isTableStructuralSelection = hasTableStructuralSelection(activeEditor)
      const canShowTextToolbar =
        !selection.empty &&
        !isImageNodeSelected &&
        !activeEditor.isActive("codeBlock") &&
        !activeEditor.isActive("rawMarkdownBlock") &&
        !isTableStructuralSelection

      if (canShowTextToolbar && mouseTextSelectionInProgressRef.current) {
        syncBubbleOnMouseUpRef.current = true
        if (bubbleToolbarHoveredRef.current) return
        setBubbleState((prev) =>
          prev.visible && prev.mode === "text" ? hideFloatingBubbleState(prev) : prev
        )
        if (!tableMenuState) {
          hideTableQuickRailImmediately()
        }
        return
      }

      if (!isImageNodeSelected && !canShowTextToolbar && !isTableActive) {
        if (bubbleToolbarHoveredRef.current) return
        scheduleBubbleHide()
        if (!tableMenuState) {
          scheduleTableQuickRailHide()
        }
        return
      }

      if (isTableActive && !canShowTextToolbar) {
        cancelBubbleHide()
        setBubbleState(hideFloatingBubbleState)
        const anchorDom = activeEditor.view.domAtPos(selection.from).node
        const anchorElement =
          anchorDom instanceof Element ? anchorDom : anchorDom.parentElement
        if (isTableStructuralSelection && anchorElement?.closest(".aq-table-shell, .tableWrapper, table")) {
          syncTableQuickRailFromElement(anchorElement)
          return
        }
        if (!tableMenuState) {
          hideTableQuickRailImmediately()
        }
        return
      }

      cancelBubbleHide()
      hideTableQuickRailImmediately()

      const startCoords = activeEditor.view.coordsAtPos(selection.from)
      const endCoords = activeEditor.view.coordsAtPos(isImageNodeSelected ? selection.from : selection.to)
      const nextBubbleState = resolveFloatingBubbleStateFromCoords(
        isImageNodeSelected ? "image" : "text",
        startCoords,
        endCoords
      )
      setBubbleState((prev) =>
        areFloatingBubbleStatesEqual(prev, nextBubbleState) ? prev : nextBubbleState
      )
    }

    const scheduleSyncBubble = () => {
      if (typeof window === "undefined") {
        syncBubble()
        return
      }
      if (rafId !== null) return
      rafId = window.requestAnimationFrame(() => {
        rafId = null
        syncBubble()
      })
    }

    const handleDocumentSelectionChange = () => {
      const activeEditor = editorRef.current ?? currentEditor
      if (!activeEditor) return
      if (isTableColumnRailResizeActive()) {
        clearWindowTextSelection()
        return
      }
      if (restoreActiveTableTextDragSelection()) {
        syncBubbleOnMouseUpRef.current = true
        return
      }
      const selection = window.getSelection()
      const anchorNode = selection?.anchorNode ?? null
      const anchorElement =
        anchorNode instanceof Element ? anchorNode : anchorNode?.parentElement ?? null
      if (anchorElement && !activeEditor.view.dom.contains(anchorElement)) return
      scheduleSyncBubble()
    }

    const handleEditorPointerDownCapture = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || event.button !== 0) return
      const activeEditor = editorRef.current ?? currentEditor
      if (!activeEditor) return
      const eventTarget = event.target
      const targetElement = eventTarget instanceof Element ? eventTarget : eventTarget instanceof Node ? eventTarget.parentElement : null
      const pointElements = document.elementsFromPoint(event.clientX, event.clientY)
      const codeShellTarget = findCodeShellTarget(targetElement, pointElements)
      const existingSelectionText = window.getSelection()?.toString().trim() ?? ""
      const allowTableControlCellFallback = Boolean(existingSelectionText) && !isTableSelectionActive(activeEditor)
      const targetTableControl = targetElement?.closest(TABLE_TEXT_DRAG_CONTROL_SELECTOR)
      const pointInsideEditor = !targetElement?.closest("[data-table-menu-root='true']") && (!targetTableControl || allowTableControlCellFallback) && pointElements.some((element) => Boolean(element.closest(BLOCK_EDITOR_ROOT_SELECTOR)))
      const insideEditorDom = eventTarget instanceof Node && (activeEditor.view.dom.contains(eventTarget) || Boolean(targetElement?.closest(BLOCK_EDITOR_ROOT_SELECTOR)) || pointInsideEditor)
      const tableTextDragStart = insideEditorDom ? rememberTableTextDragStart(event, allowTableControlCellFallback) : null
      if (!insideEditorDom && !codeShellTarget) return
      if (codeShellTarget) {
        cancelCodeDragSelectionPreserve()
        rememberCodeTextDragStart(codeShellTarget, event)
        clearImmediateWindowTextSelection()
      } else {
        codeTextDragStartRef.current = null
        if (insideEditorDom) {
          cancelCodeDragSelectionPreserve()
          if (!tableTextDragStart || !existingSelectionText) clearImmediateWindowTextSelection()
        }
      }
      if (insideEditorDom) {
        if (tableTextDragStart && existingSelectionText) {
          event.preventDefault()
          event.stopPropagation()
          restoreTableCellTextSelectionIfEscaped(activeEditor, tableTextDragStart.cell, tableTextDragStart.scrollAnchor, true, true)
        }
        const blockSelectionActive = Boolean(document.querySelector("[data-testid='keyboard-block-selection-overlay']"))
        preserveWindowScrollForEditorPointerFocus(event.target, isTableSelectionActive(activeEditor), blockSelectionActive)
      }
      if (tryStartTableColumnResizeFromDomHandle(event.target, event.pointerId, event.clientX)) {
        event.preventDefault()
        event.stopPropagation()
        event.stopImmediatePropagation?.()
        mouseTextSelectionInProgressRef.current = false
        syncBubbleOnMouseUpRef.current = false
        tableTextDragStartRef.current = null
        return
      }
      mouseTextSelectionInProgressRef.current = true
      syncBubbleOnMouseUpRef.current = false
      if (bubbleToolbarHoveredRef.current) return
      setBubbleState((prev) =>
        prev.visible && prev.mode === "text" ? hideFloatingBubbleState(prev) : prev
      )
    }

    const handleEditorMouseDownCapture = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return
      const activeEditor = editorRef.current ?? currentEditor
      if (!activeEditor) return
      const eventTarget = event.target
      const targetElement = eventTarget instanceof Element ? eventTarget : eventTarget instanceof Node ? eventTarget.parentElement : null
      const pointElements = document.elementsFromPoint(event.clientX, event.clientY)
      const codeShellTarget = findCodeShellTarget(targetElement, pointElements)
      const pointInsideEditor = !targetElement?.closest("[data-table-menu-root='true']") && !targetElement?.closest(TABLE_TEXT_DRAG_CONTROL_SELECTOR) && pointElements.some((element) => Boolean(element.closest(BLOCK_EDITOR_ROOT_SELECTOR)))
      const insideEditorDom = eventTarget instanceof Node && (activeEditor.view.dom.contains(eventTarget) || Boolean(targetElement?.closest(BLOCK_EDITOR_ROOT_SELECTOR)) || pointInsideEditor)
      if (!insideEditorDom && !codeShellTarget) return
      if (codeTextDragStartRef.current && !codeShellTarget) codeTextDragStartRef.current = null
      if (codeShellTarget) {
        cancelCodeDragSelectionPreserve()
        rememberCodeTextDragStart(codeShellTarget, event)
        clearImmediateWindowTextSelection()
      } else if (insideEditorDom) {
        codeTextDragStartRef.current = null
        cancelCodeDragSelectionPreserve()
        clearImmediateWindowTextSelection()
      }
      if (!insideEditorDom) return
      if (!tableTextDragStartRef.current) rememberTableTextDragStart(event)
      if (!targetElement?.closest(".column-resize-handle")) return
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation?.()
    }

    const handleWindowPointerMove = (event: PointerEvent) => {
      if (event.pointerType && event.pointerType !== "mouse") return
      if (!codeTextDragStartRef.current && event.buttons === 1 && !tableTextDragStartRef.current && rememberCodeTextDragStartAtPoint(event)) { event.preventDefault(); event.stopPropagation(); preserveActiveCodeTextDragScroll(); selectCodeDragRootWhenNativeSelectionIsMissing(); return }
      if (hasMovedCodeTextDrag(event)) {
        event.preventDefault()
        event.stopPropagation()
        preserveActiveCodeTextDragScroll()
        selectCodeDragRootWhenNativeSelectionIsMissing()
        return
      }
      if (!hasMovedTableTextDrag(event)) return
      event.preventDefault()
      event.stopPropagation()
      preserveActiveTableTextDragScroll()
      if (restoreActiveTableTextDragSelection(true, true)) {
        syncBubbleOnMouseUpRef.current = true
      }
    }

    const handleWindowMouseMove = (event: MouseEvent) => {
      if (!codeTextDragStartRef.current && event.buttons === 1 && !tableTextDragStartRef.current && rememberCodeTextDragStartAtPoint(event)) { event.preventDefault(); event.stopPropagation(); preserveActiveCodeTextDragScroll(); selectCodeDragRootWhenNativeSelectionIsMissing(); return }
      if (hasMovedCodeTextDrag(event)) {
        event.preventDefault()
        event.stopPropagation()
        preserveActiveCodeTextDragScroll()
        selectCodeDragRootWhenNativeSelectionIsMissing()
        return
      }
      if (!hasMovedTableTextDrag(event)) return
      event.preventDefault()
      event.stopPropagation()
      preserveActiveTableTextDragScroll()
      if (restoreActiveTableTextDragSelection(true, true)) {
        syncBubbleOnMouseUpRef.current = true
      }
    }

    const completeTextDragSelection = (event: PointerEvent | MouseEvent) => {
      const tableTextDragStart = tableTextDragStartRef.current
      const codeTextDragStart = codeTextDragStartRef.current
      if (!mouseTextSelectionInProgressRef.current && !tableTextDragStart && !codeTextDragStart) return
      if ("pointerType" in event && event.pointerType && event.pointerType !== "mouse") return
      const activeEditor = editorRef.current ?? currentEditor
      const tableTextDragMoved = hasMovedTableTextDrag(event)
      const codeTextDragMoved = hasMovedCodeTextDrag(event)
      if (codeTextDragMoved) {
        event.preventDefault()
        event.stopPropagation()
        preserveActiveCodeTextDragScroll()
        selectCodeDragRootWhenNativeSelectionIsMissing()
        if (codeTextDragStart?.root.isConnected) {
          preserveCodeDragRootSelectionAcrossFrames(codeTextDragStart.root)
        }
      }
      if (activeEditor && tableTextDragStart && tableTextDragMoved && restoreActiveTableTextDragSelection(true, true)) {
        event.preventDefault()
        event.stopPropagation()
        preserveActiveTableTextDragScroll()
        preserveTableCellTextSelectionAcrossFrames(activeEditor, tableTextDragStart.cell, tableTextDragStart.scrollAnchor)
        syncBubbleOnMouseUpRef.current = true
      }
      tableTextDragStartRef.current = null
      codeTextDragStartRef.current = null
      mouseTextSelectionInProgressRef.current = false
      if (!syncBubbleOnMouseUpRef.current) return
      syncBubbleOnMouseUpRef.current = false
      scheduleSyncBubble()
    }

    scheduleSyncBubble()
    currentEditor.on("selectionUpdate", scheduleSyncBubble)
    currentEditor.on("focus", scheduleSyncBubble)
    document.addEventListener("selectionchange", handleDocumentSelectionChange)
    document.addEventListener("pointerdown", handleEditorPointerDownCapture, true)
    document.addEventListener("mousedown", handleEditorMouseDownCapture, true)
    window.addEventListener("scroll", scheduleSyncBubble, { capture: true, passive: true })
    window.addEventListener("resize", scheduleSyncBubble, { passive: true })
    window.addEventListener("pointermove", handleWindowPointerMove, true)
    window.addEventListener("mousemove", handleWindowMouseMove, true)
    window.addEventListener("pointerup", completeTextDragSelection, true)
    window.addEventListener("pointercancel", completeTextDragSelection, true)
    window.addEventListener("mouseup", completeTextDragSelection, true)
    return () => {
      currentEditor.off("selectionUpdate", scheduleSyncBubble)
      currentEditor.off("focus", scheduleSyncBubble)
      document.removeEventListener("selectionchange", handleDocumentSelectionChange)
      document.removeEventListener("pointerdown", handleEditorPointerDownCapture, true)
      document.removeEventListener("mousedown", handleEditorMouseDownCapture, true)
      window.removeEventListener("scroll", scheduleSyncBubble, true)
      window.removeEventListener("resize", scheduleSyncBubble)
      window.removeEventListener("pointermove", handleWindowPointerMove, true)
      window.removeEventListener("mousemove", handleWindowMouseMove, true)
      window.removeEventListener("pointerup", completeTextDragSelection, true)
      window.removeEventListener("pointercancel", completeTextDragSelection, true)
      window.removeEventListener("mouseup", completeTextDragSelection, true)
      if (rafId !== null && typeof window !== "undefined") {
        window.cancelAnimationFrame(rafId)
      }
      cancelCodeDragSelectionPreserve()
      mouseTextSelectionInProgressRef.current = false
      syncBubbleOnMouseUpRef.current = false
      tableTextDragStartRef.current = null
      codeTextDragStartRef.current = null
      cancelBubbleHide()
    }
  }, [
    bubbleToolbarHoveredRef,
    cancelBubbleHide,
    clearWindowTextSelection,
    editor,
    editorRef,
    hasTableStructuralSelection,
    hideTableQuickRailImmediately,
    isTableColumnRailResizeActive,
    mouseTextSelectionInProgressRef,
    scheduleBubbleHide,
    scheduleTableQuickRailHide,
    setBubbleState,
    syncBubbleOnMouseUpRef,
    syncTableQuickRailFromElement,
    tableMenuState,
    tryStartTableColumnResizeFromDomHandle,
  ])
}
