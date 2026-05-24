import type { Editor as TiptapEditor } from "@tiptap/core"
import { TextSelection } from "@tiptap/pm/state"
import { useEffect, useRef } from "react"
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from "react"
import {
  markNextEditorPointerAfterTable,
  preserveWindowScrollForEditorPointerFocus,
  preserveWindowScrollPositionAcrossFrames,
  type WindowScrollAnchor,
} from "./blockHandleLayoutModel"
import { isTableSelectionActive } from "./tableStructureModel"
import { restoreTableCellTextSelectionIfEscaped } from "./tableTextSelectionModel"
import {
  areFloatingBubbleStatesEqual,
  hideFloatingBubbleState,
  resolveFloatingBubbleStateFromCoords,
  type FloatingBubbleState,
} from "./useFloatingBubbleState"

type SetState<T> = Dispatch<SetStateAction<T>>

const CODE_BLOCK_EDITOR_CONTENT_SELECTOR = ".aq-code-editor-content"

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
  const tableTextDragStartRef = useRef<{
    cell: HTMLElement; scrollPreserveStarted: boolean; scrollAnchor: WindowScrollAnchor; x: number; y: number
  } | null>(null)
  const codeTextDragStartRef = useRef<{ root: HTMLElement; x: number; y: number } | null>(null)

  useEffect(() => {
    const currentEditor = editorRef.current ?? editor
    if (!currentEditor) return
    let rafId: number | null = null
    let codeDragSelectionPreserveRafId: number | null = null

    const rememberTableTextDragStart = (event: MouseEvent | PointerEvent) => {
      if (event.button !== 0) return null
      const activeEditor = editorRef.current ?? currentEditor
      if (!activeEditor) return null
      if (!(event.target instanceof Node) || !activeEditor.view.dom.contains(event.target)) {
        tableTextDragStartRef.current = null
        return null
      }
      const targetElement = event.target instanceof Element ? event.target : event.target.parentElement
      const tableTextCell = targetElement?.closest("th, td")
      const scrollAnchor = {
        x: window.scrollX,
        y: document.scrollingElement?.scrollTop ?? window.scrollY,
      }
      if (tableTextCell instanceof HTMLElement) {
        tableTextCell.removeAttribute("data-table-drag-selection-text")
        markNextEditorPointerAfterTable()
      }
      tableTextDragStartRef.current =
        tableTextCell instanceof HTMLElement
          ? { cell: tableTextCell, scrollPreserveStarted: false, scrollAnchor, x: event.clientX, y: event.clientY }
          : null
      return tableTextDragStartRef.current
    }

    const hasMovedTableTextDrag = (event: MouseEvent | PointerEvent) => {
      const tableTextDragStart = tableTextDragStartRef.current
      return Boolean(
        tableTextDragStart &&
          (Math.abs(event.clientX - tableTextDragStart.x) > 4 ||
            Math.abs(event.clientY - tableTextDragStart.y) > 4)
      )
    }

    const restoreActiveTableTextDragSelection = (
      restoreWhenEmpty = false,
      forceStartedCellSelection = false
    ) => {
      const activeEditor = editorRef.current ?? currentEditor
      const tableTextDragStart = tableTextDragStartRef.current
      if (!activeEditor || !tableTextDragStart) return false
      return restoreTableCellTextSelectionIfEscaped(
        activeEditor,
        tableTextDragStart.cell,
        tableTextDragStart.scrollAnchor,
        restoreWhenEmpty,
        forceStartedCellSelection
      )
    }

    const preserveActiveTableTextDragScroll = () => {
      const tableTextDragStart = tableTextDragStartRef.current
      if (!tableTextDragStart || tableTextDragStart.scrollPreserveStarted) return
      tableTextDragStart.scrollPreserveStarted = true
      preserveWindowScrollPositionAcrossFrames(tableTextDragStart.scrollAnchor, 24, 4, 720, false, false)
    }

    const isSelectionInsideCodeDragRoot = (root: HTMLElement) => {
      const selection = window.getSelection()
      if (!selection) return false
      const anchorElement =
        selection.anchorNode instanceof Element
          ? selection.anchorNode
          : selection.anchorNode?.parentElement ?? null
      const focusElement =
        selection.focusNode instanceof Element
          ? selection.focusNode
          : selection.focusNode?.parentElement ?? null
      const selectionInsideCodeRoot =
        Boolean(anchorElement && root.contains(anchorElement)) ||
        Boolean(focusElement && root.contains(focusElement))
      return Boolean(selection.toString().trim() && selectionInsideCodeRoot)
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
      }
      const cancelPreservedSelection = () => {
        if (codeDragSelectionPreserveRafId !== null) {
          window.cancelAnimationFrame(codeDragSelectionPreserveRafId)
        }
        codeDragSelectionPreserveRafId = null
        cleanupPreservedSelection()
      }
      const restore = () => {
        if (!root.isConnected) {
          codeDragSelectionPreserveRafId = null
          cleanupPreservedSelection()
          return
        }
        restoreIfMissing()
        frame += 1
        const elapsedMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt
        if (frame < 72 || elapsedMs < 1_120) {
          codeDragSelectionPreserveRafId = window.requestAnimationFrame(restore)
        } else {
          codeDragSelectionPreserveRafId = null
          cleanupPreservedSelection()
        }
      }
      document.addEventListener("selectionchange", handlePreservedSelectionChange, true)
      window.addEventListener("pointerdown", cancelPreservedSelection, { capture: true, passive: true, once: true })
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
      return Boolean(
        codeTextDragStart &&
          (Math.abs(event.clientX - codeTextDragStart.x) > 4 ||
            Math.abs(event.clientY - codeTextDragStart.y) > 4)
      )
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
      const targetElement =
        eventTarget instanceof Element ? eventTarget : eventTarget instanceof Node ? eventTarget.parentElement : null
      const codeShellTarget = targetElement?.closest(".aq-code-shell")
      const insideEditorDom = eventTarget instanceof Node && activeEditor.view.dom.contains(eventTarget)
      if (!insideEditorDom && !codeShellTarget) return
      if (codeShellTarget) {
        const codeContentRoot = codeShellTarget.querySelector<HTMLElement>(".aq-code-editor-content")
        const codeSelectionRoot =
          codeShellTarget.querySelector<HTMLElement>(".aq-code-highlight-layer") ?? codeContentRoot
        codeShellTarget.removeAttribute("data-code-drag-selection-text")
        codeTextDragStartRef.current = codeSelectionRoot
          ? {
              root: codeSelectionRoot,
              x: event.clientX,
              y: event.clientY,
            }
          : null
        clearWindowTextSelection()
        event.preventDefault()
        event.stopPropagation()
      } else {
        codeTextDragStartRef.current = null
      }
      if (insideEditorDom) {
        rememberTableTextDragStart(event)
        const blockSelectionActive = Boolean(
          document.querySelector("[data-testid='keyboard-block-selection-overlay']")
        )
        preserveWindowScrollForEditorPointerFocus(
          event.target,
          isTableSelectionActive(activeEditor),
          blockSelectionActive
        )
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
      const activeEditor = editorRef.current ?? currentEditor
      if (!activeEditor) return
      const eventTarget = event.target
      const targetElement =
        eventTarget instanceof Element ? eventTarget : eventTarget instanceof Node ? eventTarget.parentElement : null
      const codeShellTarget = targetElement?.closest(".aq-code-shell")
      const insideEditorDom = eventTarget instanceof Node && activeEditor.view.dom.contains(eventTarget)
      if (!insideEditorDom && !codeShellTarget) return
      if (codeTextDragStartRef.current && !codeShellTarget) {
        event.preventDefault()
        event.stopPropagation()
        event.stopImmediatePropagation?.()
        return
      }
      if (codeShellTarget) {
        const codeContentRoot = codeShellTarget.querySelector<HTMLElement>(".aq-code-editor-content")
        const codeSelectionRoot =
          codeShellTarget.querySelector<HTMLElement>(".aq-code-highlight-layer") ?? codeContentRoot
        codeShellTarget.removeAttribute("data-code-drag-selection-text")
        codeTextDragStartRef.current = codeSelectionRoot
          ? {
              root: codeSelectionRoot,
              x: event.clientX,
              y: event.clientY,
            }
          : null
        clearWindowTextSelection()
      }
      if (!insideEditorDom) return
      rememberTableTextDragStart(event)
      if (!targetElement?.closest(".column-resize-handle")) return
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation?.()
    }

    const handleWindowPointerMove = (event: PointerEvent) => {
      if (event.pointerType && event.pointerType !== "mouse") return
      if (hasMovedCodeTextDrag(event)) {
        selectCodeDragRootWhenNativeSelectionIsMissing()
      }
      if (!hasMovedTableTextDrag(event)) return
      preserveActiveTableTextDragScroll()
      if (restoreActiveTableTextDragSelection(true)) {
        syncBubbleOnMouseUpRef.current = true
      }
    }

    const handleWindowMouseMove = (event: MouseEvent) => {
      if (hasMovedCodeTextDrag(event)) {
        selectCodeDragRootWhenNativeSelectionIsMissing()
      }
      if (!hasMovedTableTextDrag(event)) return
      preserveActiveTableTextDragScroll()
      if (restoreActiveTableTextDragSelection(true)) {
        syncBubbleOnMouseUpRef.current = true
      }
    }

    const handleWindowPointerUp = (event: PointerEvent) => {
      const tableTextDragStart = tableTextDragStartRef.current
      const codeTextDragStart = codeTextDragStartRef.current
      if (!mouseTextSelectionInProgressRef.current && !tableTextDragStart && !codeTextDragStart) return
      if (event.pointerType && event.pointerType !== "mouse") return
      const activeEditor = editorRef.current ?? currentEditor
      const tableTextDragMoved = hasMovedTableTextDrag(event)
      if (hasMovedCodeTextDrag(event)) {
        selectCodeDragRootWhenNativeSelectionIsMissing()
      }
      if (
        activeEditor &&
          tableTextDragMoved &&
          restoreActiveTableTextDragSelection(true, true)
      ) {
        preserveActiveTableTextDragScroll()
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
    window.addEventListener("pointerup", handleWindowPointerUp, true)
    window.addEventListener("pointercancel", handleWindowPointerUp, true)
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
      window.removeEventListener("pointerup", handleWindowPointerUp, true)
      window.removeEventListener("pointercancel", handleWindowPointerUp, true)
      if (rafId !== null && typeof window !== "undefined") {
        window.cancelAnimationFrame(rafId)
      }
      if (codeDragSelectionPreserveRafId !== null && typeof window !== "undefined") {
        window.cancelAnimationFrame(codeDragSelectionPreserveRafId)
      }
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
