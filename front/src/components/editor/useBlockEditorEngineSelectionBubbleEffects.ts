import type { Editor as TiptapEditor } from "@tiptap/core"
import { TextSelection } from "@tiptap/pm/state"
import { useEffect, useRef, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from "react"
import { cancelTablePointerScrollPreserves, clearNextEditorPointerAfterTable, markNextEditorPointerAfterCodeSelection, markNextEditorPointerAfterTable, preserveWindowScrollForCodePointerFocus, preserveWindowScrollForEditorPointerFocus, preserveWindowScrollPositionAcrossFrames, type WindowScrollAnchor } from "./blockHandleLayoutModel"
import { resolveMultiCellTableDomSelectionBubbleState, resolvePersistedTableTextSelectionBubbleState } from "./floatingBubbleDomRangeModel"
import { collapseTableCellTextSelectionToPoint } from "./tableTextCaretModel"
import { isTableSelectionActive } from "./tableStructureModel"
import { TABLE_DRAG_SELECTION_TEXT_ATTR, TABLE_DRAG_SELECTION_TEXT_SELECTOR, cancelActiveTableCellTextSelectionPreserves, clearTableTextSelectionForStructuralSelection, collapseStaleTableEditorSelection, getTableTextSelectionClearGeneration, isTableStructuralSelectionOwnerActive, isTableTextSelectionClearGenerationCurrent, preservePendingSingleCellNativeTextSelectionAcrossFrames, preserveTableCellTextSelectionAcrossFrames, resolveTableTextCellAtPoint, resolveTableTextSelectionRangeCells, restoreTableCellTextSelectionIfEscaped, selectTableCellTextRange, watchTableCellTextSelectionExternalClear } from "./tableTextSelectionModel"
import { areFloatingBubbleStatesEqual, hasNativeEditorTextSelection, hideFloatingBubbleState, resolveFloatingBubbleStateFromCoords, resolveHeadingSelectionBubbleState, type FloatingBubbleState } from "./useFloatingBubbleState"
const CODE_BLOCK_EDITOR_CONTENT_SELECTOR = ".aq-code-editor-content", CODE_BLOCK_TEXT_SURFACE_SELECTOR = `${CODE_BLOCK_EDITOR_CONTENT_SELECTOR}, .aq-code-highlight-layer`, CODE_BLOCK_INTERACTIVE_CONTROL_SELECTOR = "[data-code-language-control='true'], [data-block-handle-rail='true'], [data-block-menu-root='true']", BLOCK_EDITOR_ROOT_SELECTOR = "[data-testid='block-editor-prosemirror'], .ProseMirror"
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
  setBubbleState: Dispatch<SetStateAction<FloatingBubbleState>>
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
  const tableTextDragStartRef = useRef<{ cell: HTMLElement; coveredControlFallback: boolean; endCell: HTMLElement | null; scrollPreserveStarted: boolean; selectionPreserveStarted: boolean; scrollAnchor: WindowScrollAnchor; x: number; y: number } | null>(null), tableTextDragInitialSelectionTextRef = useRef("")
  const tableTextDragPendingStartRef = useRef<{ cell: HTMLElement; coveredControlFallback: boolean; endCell: HTMLElement | null; scrollPreserveStarted: boolean; selectionPreserveStarted: boolean; scrollAnchor: WindowScrollAnchor; x: number; y: number } | null>(null)
  const codeTextDragStartRef = useRef<{ root: HTMLElement; scrollPreserveStarted: boolean; scrollAnchor: WindowScrollAnchor; x: number; y: number } | null>(null), nonTableTextDragStartRef = useRef<{ x: number; y: number } | null>(null)
  useEffect(() => {
    const currentEditor = editorRef.current ?? editor
    if (!currentEditor) return
    let rafId: number | null = null, bubbleSettleTimeoutId: number | null = null
    let codeDragSelectionPreserveRafId: number | null = null
    let cleanupCodeDragSelectionPreserve: (() => void) | null = null, cleanupTableDragScrollPreserve: (() => void) | null = null, cleanupTableDragSelectionPreserve: (() => void) | null = null
    let tableTextSelectionExternalClearWatcher: ReturnType<typeof watchTableCellTextSelectionExternalClear> | null = null
    let codeDragSelectionPreserveGeneration = 0
    const cancelTableTextDragPreserves = () => { cleanupTableDragScrollPreserve?.(); cleanupTableDragScrollPreserve = null; cleanupTableDragSelectionPreserve?.(); cleanupTableDragSelectionPreserve = null; cancelActiveTableCellTextSelectionPreserves(); cancelTablePointerScrollPreserves(); clearNextEditorPointerAfterTable(); tableTextSelectionExternalClearWatcher?.reset() }
    const handleTableTextSelectionExternalClear = () => { cancelTableTextDragPreserves(); const activeEditor = editorRef.current ?? currentEditor, toolbarActive = Boolean(bubbleToolbarHoveredRef.current || document.querySelector("[data-testid='editor-text-bubble-toolbar']:hover, [data-testid='editor-text-bubble-toolbar'] details[open]")); if (activeEditor && !toolbarActive) collapseStaleTableEditorSelection(activeEditor) }
    const clearWindowTextSelectionOnly = () => { window.getSelection()?.removeAllRanges(); document.querySelectorAll(TABLE_DRAG_SELECTION_TEXT_SELECTOR).forEach((element) => element.removeAttribute(TABLE_DRAG_SELECTION_TEXT_ATTR)); document.documentElement.removeAttribute(TABLE_DRAG_SELECTION_TEXT_ATTR) }
    const clearImmediateWindowTextSelection = () => { cancelTableTextDragPreserves(); clearWindowTextSelectionOnly() }
    const cancelCodeDragSelectionPreserve = () => {
      codeDragSelectionPreserveGeneration += 1
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
      nonTableTextDragStartRef.current = null; codeTextDragStartRef.current = codeSelectionRoot ? { root: codeSelectionRoot, scrollPreserveStarted: false, scrollAnchor, x: event.clientX, y: event.clientY } : null
      if (codeSelectionRoot) codeSelectionRoot.closest(".aq-code-shell")?.removeAttribute("data-code-drag-selection-text")
      return codeTextDragStartRef.current
    }
    const findCodeShellTarget = (targetElement: Element | null | undefined, pointElements: Element[]) =>
      targetElement?.closest(".aq-code-shell") ?? pointElements.find((element) => Boolean(element.closest(".aq-code-shell")))?.closest(".aq-code-shell")
    const findCodeTextSurfaceTarget = (targetElement: Element | null | undefined, pointElements: Element[]) =>
      targetElement?.closest(CODE_BLOCK_TEXT_SURFACE_SELECTOR) ?? pointElements.find((element) => Boolean(element.closest(CODE_BLOCK_TEXT_SURFACE_SELECTOR)))?.closest(CODE_BLOCK_TEXT_SURFACE_SELECTOR)
    const normalizeCodeSelectionText = (value: string) => value.replace(/\s+/g, " ").trim()
    const rememberCodeTextDragStartAtPoint = (event: MouseEvent | PointerEvent) => { const targetElement = event.target instanceof Element ? event.target : event.target instanceof Node ? event.target.parentElement : null, pointElements = document.elementsFromPoint(event.clientX, event.clientY); if (findCodeTextSurfaceTarget(targetElement, pointElements)) return null; return rememberCodeTextDragStart(findCodeShellTarget(targetElement, pointElements), event) }
    const prepareNonTableEditorPointerTarget = (event: MouseEvent | PointerEvent) => { const activeEditor = editorRef.current ?? currentEditor; if (!activeEditor) return false; const targetElement = event.target instanceof Element ? event.target : event.target instanceof Node ? event.target.parentElement : null, pointElements = document.elementsFromPoint(event.clientX, event.clientY), codeShellTarget = findCodeShellTarget(targetElement, pointElements), pointInsideEditor = pointElements.some((element) => Boolean(element.closest(BLOCK_EDITOR_ROOT_SELECTOR))), insideEditorDom = event.target instanceof Node && (activeEditor.view.dom.contains(event.target) || Boolean(targetElement?.closest(BLOCK_EDITOR_ROOT_SELECTOR)) || pointInsideEditor), tableTarget = Boolean(targetElement?.closest("th, td") || pointElements.some((element) => Boolean(element.closest("th, td")))), toolbarOrControlTarget = Boolean(targetElement?.closest("[data-testid='editor-text-bubble-toolbar'], button, summary, [role='button']") || pointElements.some((element) => Boolean(element.closest("[data-testid='editor-text-bubble-toolbar']")))); if (!insideEditorDom || codeShellTarget || tableTarget || toolbarOrControlTarget) return false; nonTableTextDragStartRef.current = { x: event.clientX, y: event.clientY }; cancelTableTextDragPreserves(); collapseStaleTableEditorSelection(activeEditor); return true }
    const updateTableTextDragEndCellFromPoint = (event: MouseEvent | PointerEvent) => { const tableTextDragStart = tableTextDragStartRef.current, pointCell = resolveTableTextCellAtPoint(event.clientX, event.clientY, event.target, { allowControlFallback: Boolean(tableTextDragStart) }); if (tableTextDragStart && pointCell instanceof HTMLElement && pointCell.closest("table") === tableTextDragStart.cell.closest("table")) tableTextDragStart.endCell = pointCell }
    const rememberTableTextDragStartFromSelection = (event: MouseEvent | PointerEvent) => { if (isTableStructuralSelectionOwnerActive()) return null; const activeEditor = editorRef.current ?? currentEditor, pointCell = resolveTableTextCellAtPoint(event.clientX, event.clientY, event.target), selection = window.getSelection(), anchorElement = selection?.anchorNode instanceof Element ? selection.anchorNode : selection?.anchorNode?.parentElement ?? null, anchorCell = anchorElement?.closest("th, td"); if (!activeEditor || !(pointCell instanceof HTMLElement) || !(anchorCell instanceof HTMLElement) || !selection?.toString().trim() || pointCell.closest("table") !== anchorCell.closest("table") || !activeEditor.view.dom.contains(anchorCell)) return null; const scrollAnchor = { x: window.scrollX, y: document.scrollingElement?.scrollTop ?? window.scrollY }; nonTableTextDragStartRef.current = null; cancelTableTextDragPreserves(); markNextEditorPointerAfterTable(); tableTextDragStartRef.current = { cell: anchorCell, coveredControlFallback: false, endCell: pointCell, scrollPreserveStarted: false, selectionPreserveStarted: false, scrollAnchor, x: event.clientX, y: event.clientY }; return tableTextDragStartRef.current }
    const restoreTableTextDragSelectionFromNativeRange = (event: MouseEvent | PointerEvent) => { if (isTableStructuralSelectionOwnerActive()) return false; const activeEditor = editorRef.current ?? currentEditor, rangeCells = resolveTableTextSelectionRangeCells(event.clientX, event.clientY, event.target, { allowControlFallback: Boolean(tableTextDragStartRef.current) }); if (!activeEditor || !rangeCells || rangeCells.anchorCell !== rangeCells.pointCell || !activeEditor.view.dom.contains(rangeCells.anchorCell)) return false; nonTableTextDragStartRef.current = null; tableTextDragStartRef.current = { cell: rangeCells.anchorCell, coveredControlFallback: false, endCell: rangeCells.pointCell, scrollPreserveStarted: true, selectionPreserveStarted: false, scrollAnchor: { x: window.scrollX, y: document.scrollingElement?.scrollTop ?? window.scrollY }, x: event.clientX, y: event.clientY }; const restored = restoreTableCellTextSelectionIfEscaped(activeEditor, rangeCells.anchorCell, null, true, true, false, rangeCells.pointCell); if (restored) tableTextSelectionExternalClearWatcher?.markActive(); return restored }
    const rememberTableTextDragStart = (event: MouseEvent | PointerEvent, _allowTableControlCellFallback = false, allowOutsideCoveredControlFallback = false) => { if (isTableStructuralSelectionOwnerActive()) return null
      if (event.button !== 0 && event.buttons !== 1) return null
      const activeEditor = editorRef.current ?? currentEditor
      if (!activeEditor) return null
      const targetElement = event.target instanceof Element ? event.target : event.target instanceof Node ? event.target.parentElement : null
      const pointElements = document.elementsFromPoint(event.clientX, event.clientY)
      const pointInsideEditor = pointElements.some((element) => Boolean(element.closest(BLOCK_EDITOR_ROOT_SELECTOR)))
      const tableTextCell = resolveTableTextCellAtPoint(event.clientX, event.clientY, event.target, { allowControlFallback: true })
      const tableControlTarget = targetElement?.closest(TABLE_TEXT_DRAG_CONTROL_SELECTOR) ?? pointElements[0]?.closest(TABLE_TEXT_DRAG_CONTROL_SELECTOR), tableControlKind = tableControlTarget?.getAttribute("data-table-affordance")
      const tableCellRect = tableTextCell instanceof HTMLElement ? tableTextCell.getBoundingClientRect() : null, coveredControlFallback = Boolean(tableCellRect && (tableControlKind === "row-handle" || tableControlKind === "column-handle") && event.clientX >= tableCellRect.left && event.clientX <= tableCellRect.right && event.clientY >= tableCellRect.top && event.clientY <= tableCellRect.bottom)
      if (!(event.target instanceof Node) || (!activeEditor.view.dom.contains(event.target) && !targetElement?.closest(BLOCK_EDITOR_ROOT_SELECTOR) && !pointInsideEditor && !(allowOutsideCoveredControlFallback && coveredControlFallback))) { tableTextDragStartRef.current = null; return null }
      if (tableControlTarget && (!coveredControlFallback || !(tableTextCell instanceof HTMLElement))) { tableTextDragStartRef.current = null; return null }
      const scrollAnchor = { x: window.scrollX, y: document.scrollingElement?.scrollTop ?? window.scrollY }
      if (tableTextCell instanceof HTMLElement) {
        nonTableTextDragStartRef.current = null; cancelTableTextDragPreserves(); tableTextDragInitialSelectionTextRef.current = window.getSelection()?.toString().trim() ?? ""
        tableTextCell.removeAttribute("data-table-drag-selection-text")
        markNextEditorPointerAfterTable()
      }
      tableTextDragStartRef.current = tableTextCell instanceof HTMLElement ? { cell: tableTextCell, coveredControlFallback, endCell: tableTextCell, scrollPreserveStarted: false, selectionPreserveStarted: false, scrollAnchor, x: event.clientX, y: event.clientY } : null
      return tableTextDragStartRef.current
    }
    const hasMovedTableTextDrag = (event: MouseEvent | PointerEvent) => { const tableTextDragStart = tableTextDragStartRef.current; return Boolean(tableTextDragStart && (Math.abs(event.clientX - tableTextDragStart.x) > 4 || Math.abs(event.clientY - tableTextDragStart.y) > 4)) }
    const restoreActiveTableTextDragSelection = (restoreWhenEmpty = false, forceStartedCellSelection = false, preserveScroll = true) => { if (isTableStructuralSelectionOwnerActive()) return false; const activeEditor = editorRef.current ?? currentEditor, tableTextDragStart = tableTextDragStartRef.current; if (!activeEditor || !tableTextDragStart) return false; const restored = restoreTableCellTextSelectionIfEscaped(activeEditor, tableTextDragStart.cell, preserveScroll ? tableTextDragStart.scrollAnchor : null, restoreWhenEmpty, forceStartedCellSelection, preserveScroll, tableTextDragStart.endCell); if (restored) tableTextSelectionExternalClearWatcher?.markActive(); return restored }
    const preserveActiveTableTextDragScroll = () => {
      const tableTextDragStart = tableTextDragStartRef.current
      if (!tableTextDragStart || tableTextDragStart.scrollPreserveStarted) return
      tableTextDragStart.scrollPreserveStarted = true; cleanupTableDragScrollPreserve?.(); cleanupTableDragScrollPreserve = preserveWindowScrollPositionAcrossFrames(tableTextDragStart.scrollAnchor, 72, 4, 1_120, false, false, true, true) ?? null
    }
    const preserveActiveTableTextDragSelection = (activeEditor: TiptapEditor) => {
      const tableTextDragStart = tableTextDragStartRef.current
      if (!tableTextDragStart || tableTextDragStart.selectionPreserveStarted) return
      tableTextDragStart.selectionPreserveStarted = true; cleanupTableDragSelectionPreserve?.(); cleanupTableDragSelectionPreserve = preserveTableCellTextSelectionAcrossFrames(activeEditor, tableTextDragStart.cell, tableTextDragStart.scrollAnchor, () => tableTextDragStartRef.current?.endCell ?? null) ?? null
    }
    const preserveActiveCodeTextDragScroll = () => {
      const codeTextDragStart = codeTextDragStartRef.current
      if (!codeTextDragStart || codeTextDragStart.scrollPreserveStarted) return
      codeTextDragStart.scrollPreserveStarted = true
      preserveWindowScrollPositionAcrossFrames(codeTextDragStart.scrollAnchor, 192, 4, 3_200, false, false, true)
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
      markNextEditorPointerAfterCodeSelection()
      selection.removeAllRanges()
      selection.addRange(range)
      root.closest(".aq-code-shell")?.setAttribute("data-code-drag-selection-text", selection.toString() || root.innerText || root.textContent || "")
      return true
    }
    const preserveCodeDragRootSelectionAcrossFrames = (root: HTMLElement) => {
      const preserveGeneration = ++codeDragSelectionPreserveGeneration, isCurrentPreserveGeneration = () => preserveGeneration === codeDragSelectionPreserveGeneration
      if (codeDragSelectionPreserveRafId !== null) {
        window.cancelAnimationFrame(codeDragSelectionPreserveRafId); codeDragSelectionPreserveRafId = null; cleanupCodeDragSelectionPreserve?.(); cleanupCodeDragSelectionPreserve = null
      }
      const codeShell = root.closest(".aq-code-shell"), rootTextSnapshot = (root.innerText || root.textContent || "").trim(), resolveCurrentRoot = () => codeShell?.isConnected ? codeShell.querySelector<HTMLElement>(CODE_BLOCK_EDITOR_CONTENT_SELECTOR) ?? root : Array.from(document.querySelectorAll<HTMLElement>(CODE_BLOCK_EDITOR_CONTENT_SELECTOR)).find((candidate) => (candidate.innerText || candidate.textContent || "").includes(rootTextSnapshot.slice(0, 48))) ?? root
      const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now()
      let frame = 0
      let restoring = false
      const persistSelectionText = (currentRoot: HTMLElement) => { if (isCurrentPreserveGeneration()) currentRoot.closest(".aq-code-shell")?.setAttribute("data-code-drag-selection-text", window.getSelection()?.toString() || currentRoot.innerText || currentRoot.textContent || "") }
      const restoreIfMissing = () => {
        if (!isCurrentPreserveGeneration()) return false; const currentRoot = resolveCurrentRoot()
        persistSelectionText(currentRoot)
        if (!currentRoot.isConnected) return false; if (isSelectionInsideCodeDragRoot(currentRoot) && window.getSelection()?.toString() === (currentRoot.innerText || currentRoot.textContent || "")) return true
        restoring = true
        selectCodeDragRoot(currentRoot)
        restoring = false
        persistSelectionText(currentRoot)
        return true
      }
      const handlePreservedSelectionChange = () => { if (restoring || !isCurrentPreserveGeneration()) return; const currentRoot = resolveCurrentRoot(), selection = window.getSelection(), anchor = selection?.anchorNode instanceof Element ? selection.anchorNode : selection?.anchorNode?.parentElement ?? null, focus = selection?.focusNode instanceof Element ? selection.focusNode : selection?.focusNode?.parentElement ?? null; if (selection?.toString().trim() && (!anchor || !focus || !currentRoot.contains(anchor) || !currentRoot.contains(focus))) { cancelCodeDragSelectionPreserve(); return }; restoreIfMissing() }
      const cleanupPreservedSelection = () => { document.removeEventListener("selectionchange", handlePreservedSelectionChange, true); window.removeEventListener("pointerdown", cancelPreservedSelection, true); window.removeEventListener("mousedown", cancelPreservedSelection, true); window.removeEventListener("click", cancelPreservedSelection, true); window.removeEventListener("keydown", cancelPreservedSelectionForKeydown, true); window.removeEventListener("wheel", cancelPreservedSelectionForKeydown, true) }
      const isCurrentCodeDragEvent = (event: Event) => { const codeTextDragStart = codeTextDragStartRef.current; const targetElement = event.target instanceof Element ? event.target : event.target instanceof Node ? event.target.parentElement : null; const currentRoot = resolveCurrentRoot(), currentShell = currentRoot.closest(".aq-code-shell") ?? codeShell; return Boolean(targetElement && (currentRoot.contains(targetElement) || currentShell?.contains(targetElement)) && codeTextDragStart?.scrollPreserveStarted && codeTextDragStart.root === currentRoot) }, cancelPreservedSelection = (event: Event) => { if (!isCurrentPreserveGeneration()) return; if (!isCurrentCodeDragEvent(event)) cancelCodeDragSelectionPreserve() }
      const cancelPreservedSelectionForKeydown = () => { if (isCurrentPreserveGeneration()) cancelCodeDragSelectionPreserve() }
      const restore = () => {
        if (!isCurrentPreserveGeneration()) { cleanupPreservedSelection(); return }; if (!resolveCurrentRoot().isConnected) { codeDragSelectionPreserveRafId = null; codeDragSelectionPreserveGeneration += 1; cleanupPreservedSelection(); return }
        restoreIfMissing()
        frame += 1
        const elapsedMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt
        if (frame < 168 || elapsedMs < 2_800) {
          codeDragSelectionPreserveRafId = window.requestAnimationFrame(restore)
        } else {
          codeDragSelectionPreserveRafId = null
          codeDragSelectionPreserveGeneration += 1
          cleanupPreservedSelection()
        }
      }
      document.addEventListener("selectionchange", handlePreservedSelectionChange, true)
      window.addEventListener("pointerdown", cancelPreservedSelection, { capture: true, passive: true })
      window.addEventListener("mousedown", cancelPreservedSelection, { capture: true, passive: true })
      window.addEventListener("click", cancelPreservedSelection, true)
      window.addEventListener("keydown", cancelPreservedSelectionForKeydown, true)
      window.addEventListener("wheel", cancelPreservedSelectionForKeydown, { capture: true, passive: true })
      cleanupCodeDragSelectionPreserve = cleanupPreservedSelection
      restore()
    }
    const selectCodeDragRootWhenNativeSelectionIsMissing = () => {
      const codeTextDragStart = codeTextDragStartRef.current
      if (!codeTextDragStart?.root.isConnected) return false
      if (isSelectionInsideCodeDragRoot(codeTextDragStart.root)) { const rootText = codeTextDragStart.root.innerText || codeTextDragStart.root.textContent || ""; const selectionText = window.getSelection()?.toString() || ""; if (rootText && normalizeCodeSelectionText(selectionText) !== normalizeCodeSelectionText(rootText)) return false; codeTextDragStart.root.closest(".aq-code-shell")?.setAttribute("data-code-drag-selection-text", selectionText || rootText); return true }
      const selected = selectCodeDragRoot(codeTextDragStart.root); if (selected) preserveCodeDragRootSelectionAcrossFrames(codeTextDragStart.root); return selected
    }
    const hasMovedCodeTextDrag = (event: MouseEvent | PointerEvent) => { const codeTextDragStart = codeTextDragStartRef.current; return Boolean(codeTextDragStart && (Math.abs(event.clientX - codeTextDragStart.x) > 4 || Math.abs(event.clientY - codeTextDragStart.y) > 4)) }
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
      const domSelection = typeof window !== "undefined" ? window.getSelection() : null
      const range = domSelection && domSelection.rangeCount > 0 ? domSelection.getRangeAt(0) : null
      const commonAncestor = range?.commonAncestorContainer instanceof Element ? range.commonAncestorContainer : range?.commonAncestorContainer?.parentElement ?? null
      const isCodeBlockNodeViewSelection = Boolean(commonAncestor?.closest(CODE_BLOCK_EDITOR_CONTENT_SELECTOR))
      const anchorCell = (domSelection?.anchorNode instanceof Element ? domSelection.anchorNode : domSelection?.anchorNode?.parentElement ?? null)?.closest("th, td"), focusCell = (domSelection?.focusNode instanceof Element ? domSelection.focusNode : domSelection?.focusNode?.parentElement ?? null)?.closest("th, td"), isMultiCellTableDomSelection = Boolean(anchorCell && focusCell && anchorCell !== focusCell && anchorCell.closest("table") === focusCell.closest("table")), isSingleCellTableDomSelection = Boolean(anchorCell && focusCell && anchorCell === focusCell && activeEditor.view.dom.contains(anchorCell))
      const isTableStructuralSelection = hasTableStructuralSelection(activeEditor)
      const multiCellTableBubbleState =
        resolveMultiCellTableDomSelectionBubbleState(activeEditor.view.dom, CODE_BLOCK_EDITOR_CONTENT_SELECTOR) ??
        resolvePersistedTableTextSelectionBubbleState(activeEditor.view.dom)
      if (selection.empty && ((!anchorCell && !focusCell) || isSingleCellTableDomSelection) && !isTableStructuralSelection && typeof window !== "undefined" && !isTableColumnRailResizeActive()) {
        if (
          range &&
          domSelection &&
          !domSelection.isCollapsed &&
          commonAncestor &&
          activeEditor.view.dom.contains(commonAncestor) &&
          !isCodeBlockNodeViewSelection &&
          !isMultiCellTableDomSelection
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
      const canShowTextToolbar = !selection.empty && !isImageNodeSelected && !activeEditor.isActive("codeBlock") && !activeEditor.isActive("rawMarkdownBlock") && !isTableStructuralSelection
      const canShowMultiCellTableTextToolbar = Boolean(multiCellTableBubbleState && !isImageNodeSelected && !activeEditor.isActive("codeBlock") && !activeEditor.isActive("rawMarkdownBlock") && !isTableStructuralSelection)

      if ((canShowTextToolbar || canShowMultiCellTableTextToolbar) && mouseTextSelectionInProgressRef.current) {
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

      if (multiCellTableBubbleState && canShowMultiCellTableTextToolbar) {
        cancelBubbleHide()
        setBubbleState((prev) => areFloatingBubbleStatesEqual(prev, multiCellTableBubbleState) ? prev : multiCellTableBubbleState)
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
      const baseBubbleState = resolveFloatingBubbleStateFromCoords(
        isImageNodeSelected ? "image" : "text",
        startCoords,
        endCoords
      )
      const nextBubbleState = resolveHeadingSelectionBubbleState(baseBubbleState, activeEditor.view.dom)
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
      if (tableTextSelectionExternalClearWatcher?.cancelIfCleared()) { scheduleSyncBubble(); return }
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
      if (targetElement?.closest(CODE_BLOCK_INTERACTIVE_CONTROL_SELECTOR)) { codeTextDragStartRef.current = null; nonTableTextDragStartRef.current = null; cancelCodeDragSelectionPreserve(); return }
      const pointElements = document.elementsFromPoint(event.clientX, event.clientY)
      const codeShellTarget = findCodeShellTarget(targetElement, pointElements)
      const existingSelectionText = window.getSelection()?.toString().trim() ?? ""
      const allowTableControlCellFallback = Boolean(existingSelectionText) && !isTableSelectionActive(activeEditor), targetTableControl = targetElement?.closest(TABLE_TEXT_DRAG_CONTROL_SELECTOR), tableAxisHandleTarget = targetTableControl?.getAttribute("data-table-affordance"); if (tableAxisHandleTarget === "row-handle" || tableAxisHandleTarget === "column-handle") { clearTableTextSelectionForStructuralSelection(); tableTextDragStartRef.current = null; tableTextDragPendingStartRef.current = null; nonTableTextDragStartRef.current = null; mouseTextSelectionInProgressRef.current = false; syncBubbleOnMouseUpRef.current = false; return }
      const pointInsideEditor = !targetElement?.closest("[data-table-menu-root='true']") && (!targetTableControl || allowTableControlCellFallback) && pointElements.some((element) => Boolean(element.closest(BLOCK_EDITOR_ROOT_SELECTOR))), insideEditorDom = eventTarget instanceof Node && (activeEditor.view.dom.contains(eventTarget) || Boolean(targetElement?.closest(BLOCK_EDITOR_ROOT_SELECTOR)) || pointInsideEditor)
      let tableTextDragStart = insideEditorDom ? rememberTableTextDragStart(event, allowTableControlCellFallback) : null
      if (tableTextDragStart?.coveredControlFallback && targetTableControl?.getAttribute("data-table-affordance")?.endsWith("-handle")) { tableTextDragPendingStartRef.current = tableTextDragStart; tableTextDragStartRef.current = null; tableTextDragStart = null }
      if (!insideEditorDom && !codeShellTarget) { nonTableTextDragStartRef.current = null; if (targetTableControl?.getAttribute("data-table-affordance")?.endsWith("-handle")) { const pending = rememberTableTextDragStart(event, false, true); tableTextDragPendingStartRef.current = pending?.coveredControlFallback ? pending : null; tableTextDragStartRef.current = null } return }
      if (insideEditorDom && !codeShellTarget && !tableTextDragStart) { nonTableTextDragStartRef.current = { x: event.clientX, y: event.clientY }; collapseStaleTableEditorSelection(activeEditor) } else if (tableTextDragStart) { nonTableTextDragStartRef.current = null; preserveActiveTableTextDragScroll() } if (codeShellTarget) preserveWindowScrollForCodePointerFocus(true); else if (insideEditorDom && !tableTextDragStart) { const blockSelectionActive = Boolean(document.querySelector("[data-testid='keyboard-block-selection-overlay']")); preserveWindowScrollForEditorPointerFocus(event.target, isTableSelectionActive(activeEditor), blockSelectionActive) }
      if (codeShellTarget) {
        cancelTableTextDragPreserves(); cancelCodeDragSelectionPreserve()
        const codeTextDragStart = rememberCodeTextDragStart(codeShellTarget, event)
        const shellSurfaceTarget = codeTextDragStart && !findCodeTextSurfaceTarget(targetElement, pointElements)
        if (codeTextDragStart && shellSurfaceTarget) { (event as MouseEvent & { __aqCodePointerHandled?: boolean }).__aqCodePointerHandled = true; event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.(); preserveActiveCodeTextDragScroll(); selectCodeDragRoot(codeTextDragStart.root); preserveCodeDragRootSelectionAcrossFrames(codeTextDragStart.root) } else { codeTextDragStart?.root.focus({ preventScroll: true }); codeTextDragStartRef.current = null }
      } else {
        codeTextDragStartRef.current = null
        if (insideEditorDom) {
          cancelCodeDragSelectionPreserve()
          if (!tableTextDragStart) clearImmediateWindowTextSelection(); else if (!existingSelectionText) clearWindowTextSelectionOnly()
        }
      }
      if (insideEditorDom) {
        if (tableTextDragStart?.coveredControlFallback && existingSelectionText) { event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.(); restoreTableCellTextSelectionIfEscaped(activeEditor, tableTextDragStart.cell, tableTextDragStart.scrollAnchor, true, true); preserveActiveTableTextDragSelection(activeEditor); preserveActiveTableTextDragScroll() }
      }
      const columnResizeHandleTarget = pointElements.find((element) => Boolean(element.closest("[data-testid^='table-column-resize-boundary-']"))) ?? event.target
      if (tryStartTableColumnResizeFromDomHandle(columnResizeHandleTarget, event.pointerId, event.clientX)) {
        event.preventDefault()
        event.stopPropagation()
        event.stopImmediatePropagation?.()
        cancelTableTextDragPreserves()
        mouseTextSelectionInProgressRef.current = false
        syncBubbleOnMouseUpRef.current = false
        tableTextDragStartRef.current = null; nonTableTextDragStartRef.current = null
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
      if (targetElement?.closest(CODE_BLOCK_INTERACTIVE_CONTROL_SELECTOR)) { codeTextDragStartRef.current = null; nonTableTextDragStartRef.current = null; cancelCodeDragSelectionPreserve(); return }
      const pointElements = document.elementsFromPoint(event.clientX, event.clientY), codeShellTarget = findCodeShellTarget(targetElement, pointElements), existingSelectionText = window.getSelection()?.toString().trim() ?? ""
      const allowTableControlCellFallback = Boolean(existingSelectionText) && !isTableSelectionActive(activeEditor), targetTableControl = targetElement?.closest(TABLE_TEXT_DRAG_CONTROL_SELECTOR), tableAxisHandleTarget = targetTableControl?.getAttribute("data-table-affordance"); if (tableAxisHandleTarget === "row-handle" || tableAxisHandleTarget === "column-handle") { clearTableTextSelectionForStructuralSelection(); tableTextDragStartRef.current = null; tableTextDragPendingStartRef.current = null; nonTableTextDragStartRef.current = null; mouseTextSelectionInProgressRef.current = false; syncBubbleOnMouseUpRef.current = false; return }
      const pointInsideEditor = !targetElement?.closest("[data-table-menu-root='true']") && (!targetTableControl || allowTableControlCellFallback) && pointElements.some((element) => Boolean(element.closest(BLOCK_EDITOR_ROOT_SELECTOR))), insideEditorDom = eventTarget instanceof Node && (activeEditor.view.dom.contains(eventTarget) || Boolean(targetElement?.closest(BLOCK_EDITOR_ROOT_SELECTOR)) || pointInsideEditor), columnResizeTarget = targetElement?.closest(".column-resize-handle")
      let tableTextDragStart = insideEditorDom && !codeShellTarget ? tableTextDragStartRef.current ?? rememberTableTextDragStart(event, allowTableControlCellFallback) : null
      if (tableTextDragStart?.coveredControlFallback && targetTableControl?.getAttribute("data-table-affordance")?.endsWith("-handle")) { tableTextDragPendingStartRef.current = tableTextDragStart; tableTextDragStartRef.current = null; tableTextDragStart = null }
      if (!insideEditorDom && !codeShellTarget) { nonTableTextDragStartRef.current = null; if (targetTableControl?.getAttribute("data-table-affordance")?.endsWith("-handle")) { const pending = rememberTableTextDragStart(event, false, true); tableTextDragPendingStartRef.current = pending?.coveredControlFallback ? pending : null; tableTextDragStartRef.current = null } return }
      if (insideEditorDom && !codeShellTarget && !tableTextDragStart) { nonTableTextDragStartRef.current = nonTableTextDragStartRef.current ?? { x: event.clientX, y: event.clientY }; collapseStaleTableEditorSelection(activeEditor) } else if (tableTextDragStart) { nonTableTextDragStartRef.current = null; preserveActiveTableTextDragScroll() } if (codeTextDragStartRef.current && !codeShellTarget) codeTextDragStartRef.current = null
      if (codeShellTarget) {
        cancelTableTextDragPreserves(); const codeTextSurfaceTarget = findCodeTextSurfaceTarget(targetElement, pointElements)
        if (codeTextSurfaceTarget) { cancelCodeDragSelectionPreserve(); codeShellTarget.querySelector<HTMLElement>(CODE_BLOCK_EDITOR_CONTENT_SELECTOR)?.focus({ preventScroll: true }); codeTextDragStartRef.current = null } else {
          if (codeTextDragStartRef.current && !codeTextDragStartRef.current.root.isConnected) { const nextCodeTextDragStart = rememberCodeTextDragStart(codeShellTarget, event); if (nextCodeTextDragStart) { event.preventDefault(); event.stopPropagation(); preserveActiveCodeTextDragScroll(); selectCodeDragRoot(nextCodeTextDragStart.root); preserveCodeDragRootSelectionAcrossFrames(nextCodeTextDragStart.root); return } }
          if (codeTextDragStartRef.current?.root.isConnected && (codeTextDragStartRef.current.scrollPreserveStarted || isSelectionInsideCodeDragRoot(codeTextDragStartRef.current.root))) { event.preventDefault(); event.stopPropagation(); preserveActiveCodeTextDragScroll(); selectCodeDragRoot(codeTextDragStartRef.current.root); preserveCodeDragRootSelectionAcrossFrames(codeTextDragStartRef.current.root); return }
          cancelCodeDragSelectionPreserve()
          const codeTextDragStart = rememberCodeTextDragStart(codeShellTarget, event)
          const shellSurfaceTarget = codeTextDragStart && !codeTextSurfaceTarget
          if (codeTextDragStart && shellSurfaceTarget) { (event as MouseEvent & { __aqCodePointerHandled?: boolean }).__aqCodePointerHandled = true; event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.(); preserveActiveCodeTextDragScroll(); selectCodeDragRoot(codeTextDragStart.root); preserveCodeDragRootSelectionAcrossFrames(codeTextDragStart.root); return }
          codeTextDragStartRef.current = null
        }
      } else if (insideEditorDom) {
        codeTextDragStartRef.current = null; cancelCodeDragSelectionPreserve()
        if (tableTextDragStart && tableTextDragStart.coveredControlFallback && existingSelectionText && !columnResizeTarget) { event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.(); restoreTableCellTextSelectionIfEscaped(activeEditor, tableTextDragStart.cell, tableTextDragStart.scrollAnchor, true, true); preserveActiveTableTextDragSelection(activeEditor); preserveActiveTableTextDragScroll() } else if (!tableTextDragStart) clearImmediateWindowTextSelection(); else if (!existingSelectionText) clearWindowTextSelectionOnly()
      }
      if (!insideEditorDom) return
      if (!tableTextDragStartRef.current && !tableTextDragPendingStartRef.current) rememberTableTextDragStart(event, allowTableControlCellFallback)
      if (!columnResizeTarget) return; nonTableTextDragStartRef.current = null
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation?.()
    }
    const handleWindowPointerMove = (event: PointerEvent) => { if (isTableStructuralSelectionOwnerActive()) { tableTextDragStartRef.current = null; tableTextDragPendingStartRef.current = null; nonTableTextDragStartRef.current = null; return }
      if (event.pointerType && event.pointerType !== "mouse") return; if (event.buttons === 0) { prepareNonTableEditorPointerTarget(event); return } { const staleNonTableStart = nonTableTextDragStartRef.current; if (staleNonTableStart && event.buttons === 1 && resolveTableTextCellAtPoint(staleNonTableStart.x, staleNonTableStart.y, document.elementFromPoint(staleNonTableStart.x, staleNonTableStart.y))) nonTableTextDragStartRef.current = null }
      if (!nonTableTextDragStartRef.current && !codeTextDragStartRef.current && event.buttons === 1 && !tableTextDragStartRef.current && rememberCodeTextDragStartAtPoint(event)) { event.preventDefault(); event.stopPropagation(); preserveActiveCodeTextDragScroll(); selectCodeDragRootWhenNativeSelectionIsMissing(); return }
      if (hasMovedCodeTextDrag(event)) {
        event.preventDefault()
        event.stopPropagation()
        preserveActiveCodeTextDragScroll()
        selectCodeDragRootWhenNativeSelectionIsMissing()
        return
      }
      if (event.buttons === 1 && restoreTableTextDragSelectionFromNativeRange(event)) { event.preventDefault(); event.stopPropagation(); syncBubbleOnMouseUpRef.current = true; return }
      if (!tableTextDragStartRef.current && !isTableColumnRailResizeActive() && event.buttons === 1 && rememberTableTextDragStartFromSelection(event)) { event.preventDefault(); event.stopPropagation(); preserveActiveTableTextDragScroll(); if (restoreActiveTableTextDragSelection(true, true)) syncBubbleOnMouseUpRef.current = true; const activeEditor = editorRef.current ?? currentEditor; if (activeEditor) preserveActiveTableTextDragSelection(activeEditor); return }
      if (!nonTableTextDragStartRef.current && !tableTextDragStartRef.current && !isTableColumnRailResizeActive() && event.buttons === 1 && rememberTableTextDragStart(event)) { updateTableTextDragEndCellFromPoint(event); event.preventDefault(); event.stopPropagation(); preserveActiveTableTextDragScroll(); if (restoreActiveTableTextDragSelection(true, true)) syncBubbleOnMouseUpRef.current = true; const activeEditor = editorRef.current ?? currentEditor; if (activeEditor) preserveActiveTableTextDragSelection(activeEditor); return }
      if (!hasMovedTableTextDrag(event)) return
      updateTableTextDragEndCellFromPoint(event)
      event.preventDefault()
      event.stopPropagation()
      preserveActiveTableTextDragScroll()
      if (restoreActiveTableTextDragSelection(true, true)) {
        syncBubbleOnMouseUpRef.current = true
      }
      const activeEditor = editorRef.current ?? currentEditor
      if (activeEditor) preserveActiveTableTextDragSelection(activeEditor)
    }

    const handleWindowMouseMove = (event: MouseEvent) => { if (isTableStructuralSelectionOwnerActive()) { tableTextDragStartRef.current = null; tableTextDragPendingStartRef.current = null; nonTableTextDragStartRef.current = null; return }
      if (event.buttons === 0) { prepareNonTableEditorPointerTarget(event); return } { const staleNonTableStart = nonTableTextDragStartRef.current; if (staleNonTableStart && event.buttons === 1 && resolveTableTextCellAtPoint(staleNonTableStart.x, staleNonTableStart.y, document.elementFromPoint(staleNonTableStart.x, staleNonTableStart.y))) nonTableTextDragStartRef.current = null } if (!nonTableTextDragStartRef.current && !codeTextDragStartRef.current && event.buttons === 1 && !tableTextDragStartRef.current && rememberCodeTextDragStartAtPoint(event)) { event.preventDefault(); event.stopPropagation(); preserveActiveCodeTextDragScroll(); selectCodeDragRootWhenNativeSelectionIsMissing(); return }
      if (hasMovedCodeTextDrag(event)) {
        event.preventDefault()
        event.stopPropagation()
        preserveActiveCodeTextDragScroll()
        selectCodeDragRootWhenNativeSelectionIsMissing()
        return
      }
      if (event.buttons === 1 && restoreTableTextDragSelectionFromNativeRange(event)) { event.preventDefault(); event.stopPropagation(); syncBubbleOnMouseUpRef.current = true; return }
      if (!tableTextDragStartRef.current && !isTableColumnRailResizeActive() && event.buttons === 1 && rememberTableTextDragStartFromSelection(event)) { event.preventDefault(); event.stopPropagation(); preserveActiveTableTextDragScroll(); if (restoreActiveTableTextDragSelection(true, true)) syncBubbleOnMouseUpRef.current = true; const activeEditor = editorRef.current ?? currentEditor; if (activeEditor) preserveActiveTableTextDragSelection(activeEditor); return }
      if (!nonTableTextDragStartRef.current && !tableTextDragStartRef.current && !isTableColumnRailResizeActive() && event.buttons === 1 && rememberTableTextDragStart(event)) { updateTableTextDragEndCellFromPoint(event); event.preventDefault(); event.stopPropagation(); preserveActiveTableTextDragScroll(); if (restoreActiveTableTextDragSelection(true, true)) syncBubbleOnMouseUpRef.current = true; const activeEditor = editorRef.current ?? currentEditor; if (activeEditor) preserveActiveTableTextDragSelection(activeEditor); return }
      if (!hasMovedTableTextDrag(event)) return
      updateTableTextDragEndCellFromPoint(event)
      event.preventDefault()
      event.stopPropagation()
      preserveActiveTableTextDragScroll()
      if (restoreActiveTableTextDragSelection(true, true)) {
        syncBubbleOnMouseUpRef.current = true
      }
      const activeEditor = editorRef.current ?? currentEditor
      if (activeEditor) preserveActiveTableTextDragSelection(activeEditor)
    }
    const completeTextDragSelection = (event: PointerEvent | MouseEvent) => {
      let tableTextDragStart = tableTextDragStartRef.current
      const pendingTableTextDragStart = tableTextDragPendingStartRef.current
      const codeTextDragStart = codeTextDragStartRef.current
      const activeEditor = editorRef.current ?? currentEditor, rawNativeTableRangeSnapshot = activeEditor ? resolveTableTextSelectionRangeCells(event.clientX, event.clientY, event.target) : null, nativeTableRangeSnapshot = rawNativeTableRangeSnapshot?.anchorCell !== rawNativeTableRangeSnapshot?.pointCell ? rawNativeTableRangeSnapshot : null
      if (isTableStructuralSelectionOwnerActive() && !tableTextDragStart && !pendingTableTextDragStart) { tableTextDragStartRef.current = null; tableTextDragPendingStartRef.current = null; nonTableTextDragStartRef.current = null; mouseTextSelectionInProgressRef.current = false; cancelTableTextDragPreserves(); cancelActiveTableCellTextSelectionPreserves(); return }
      const activeWindowSelection = window.getSelection()
      if (activeEditor && hasTableStructuralSelection(activeEditor) && (activeWindowSelection?.toString().trim() || tableTextDragStart)) { const nativeTableRange = activeWindowSelection && activeWindowSelection.rangeCount > 0 ? activeWindowSelection.getRangeAt(0).cloneRange() : null, completedTableTextDrag = tableTextDragStart, restoreNativeTableRange = () => { try { const nextSelection = window.getSelection(); nextSelection?.removeAllRanges(); if (nativeTableRange) nextSelection?.addRange(nativeTableRange.cloneRange()); else if (completedTableTextDrag?.cell.isConnected) { const range = document.createRange(); range.selectNodeContents(completedTableTextDrag.cell); nextSelection?.addRange(range) } document.querySelectorAll(TABLE_DRAG_SELECTION_TEXT_SELECTOR).forEach((element) => element.removeAttribute(TABLE_DRAG_SELECTION_TEXT_ATTR)); document.documentElement.removeAttribute(TABLE_DRAG_SELECTION_TEXT_ATTR) } catch {} }; tableTextDragStartRef.current = null; tableTextDragPendingStartRef.current = null; nonTableTextDragStartRef.current = null; mouseTextSelectionInProgressRef.current = false; cancelTableTextDragPreserves(); collapseStaleTableEditorSelection(activeEditor); restoreNativeTableRange(); window.requestAnimationFrame(restoreNativeTableRange); window.setTimeout(restoreNativeTableRange, 40); tableTextSelectionExternalClearWatcher?.markActive(); syncBubbleOnMouseUpRef.current = true; return }
      if (!mouseTextSelectionInProgressRef.current && !tableTextDragStart && !pendingTableTextDragStart && !codeTextDragStart && !nativeTableRangeSnapshot) return
      if ("pointerType" in event && event.pointerType && event.pointerType !== "mouse") return; if (activeEditor && hasTableStructuralSelection(activeEditor)) { tableTextDragStartRef.current = null; tableTextDragPendingStartRef.current = null; nonTableTextDragStartRef.current = null; mouseTextSelectionInProgressRef.current = false; clearImmediateWindowTextSelection(); return } { const targetElement = event.target instanceof Element ? event.target : event.target instanceof Node ? event.target.parentElement : null; if (targetElement?.closest(TABLE_TEXT_DRAG_CONTROL_SELECTOR) && !tableTextDragStart && !pendingTableTextDragStart) { tableTextDragStartRef.current = null; tableTextDragPendingStartRef.current = null; nonTableTextDragStartRef.current = null; mouseTextSelectionInProgressRef.current = false; clearImmediateWindowTextSelection(); return } }
      if (!tableTextDragStart && pendingTableTextDragStart && Math.abs(event.clientX - pendingTableTextDragStart.x) > 4 && Math.abs(event.clientX - pendingTableTextDragStart.x) >= Math.abs(event.clientY - pendingTableTextDragStart.y)) { tableTextDragStartRef.current = pendingTableTextDragStart; tableTextDragStart = pendingTableTextDragStart }
      if (activeEditor && nativeTableRangeSnapshot) { const targetElement = event.target instanceof Element ? event.target : event.target instanceof Node ? event.target.parentElement : null, shouldRestoreNativeTableRangeSnapshot = !targetElement?.closest(TABLE_TEXT_DRAG_CONTROL_SELECTOR) && !targetElement?.closest("[data-table-axis-rail='true']"); if (shouldRestoreNativeTableRangeSnapshot) { const clearGeneration = getTableTextSelectionClearGeneration(), restoreNativeTableRangeSnapshot = () => { if (isTableTextSelectionClearGenerationCurrent(clearGeneration)) restoreTableCellTextSelectionIfEscaped(activeEditor, nativeTableRangeSnapshot.anchorCell, null, true, true, false, nativeTableRangeSnapshot.pointCell) }; restoreNativeTableRangeSnapshot(); window.requestAnimationFrame(restoreNativeTableRangeSnapshot); window.setTimeout(() => { if (!isTableTextSelectionClearGenerationCurrent(clearGeneration)) return; const text = selectTableCellTextRange(nativeTableRangeSnapshot.anchorCell, nativeTableRangeSnapshot.pointCell); nativeTableRangeSnapshot.anchorCell.setAttribute("data-table-drag-selection-text", text || nativeTableRangeSnapshot.anchorCell.textContent?.replace(/\s+/g, " ").trim() || "") }, 80) } }
      updateTableTextDragEndCellFromPoint(event)
      const tableTextDragMoved = hasMovedTableTextDrag(event)
      const codeTextDragMoved = hasMovedCodeTextDrag(event)
      if (codeTextDragMoved) {
        event.preventDefault()
        event.stopPropagation()
        preserveActiveCodeTextDragScroll()
        const selectedCodeFallback = selectCodeDragRootWhenNativeSelectionIsMissing()
        if (selectedCodeFallback && codeTextDragStart?.root.isConnected) preserveCodeDragRootSelectionAcrossFrames(codeTextDragStart.root)
      }
      if (activeEditor && tableTextDragStart && !tableTextDragMoved) { const selection = window.getSelection(), currentSelectionText = selection?.toString().trim() ?? "", collapsedTableCaret = event.type === "pointerup" && currentSelectionText === tableTextDragInitialSelectionTextRef.current && collapseTableCellTextSelectionToPoint(activeEditor, event.clientX, event.clientY, event.target); if (!collapsedTableCaret) { const anchorElement = selection?.anchorNode instanceof Element ? selection.anchorNode : selection?.anchorNode?.parentElement ?? null, focusElement = selection?.focusNode instanceof Element ? selection.focusNode : selection?.focusNode?.parentElement ?? null, anchorCell = anchorElement?.closest("th, td"), focusCell = focusElement?.closest("th, td"); if (currentSelectionText && anchorCell && focusCell && anchorCell.closest("table") === focusCell.closest("table") && activeEditor.view.dom.contains(anchorCell)) syncBubbleOnMouseUpRef.current = true } }
      if (activeEditor && tableTextDragStart && (tableTextDragMoved || tableTextDragStart.coveredControlFallback)) { const completedTableTextDrag = tableTextDragStart, completedMultiCellDrag = Boolean(completedTableTextDrag.endCell && completedTableTextDrag.endCell !== completedTableTextDrag.cell); cancelTableTextDragPreserves(); if (completedMultiCellDrag && completedTableTextDrag.endCell) { const endCell = completedTableTextDrag.endCell; selectTableCellTextRange(completedTableTextDrag.cell, endCell); cleanupTableDragSelectionPreserve = preserveTableCellTextSelectionAcrossFrames(activeEditor, completedTableTextDrag.cell, completedTableTextDrag.scrollAnchor, () => endCell); event.preventDefault(); event.stopPropagation(); syncBubbleOnMouseUpRef.current = true } else { const restoreSingleCellAfterRelease = () => preservePendingSingleCellNativeTextSelectionAcrossFrames(completedTableTextDrag.cell, completedTableTextDrag.scrollAnchor), restored = restoreActiveTableTextDragSelection(true, true, false), preservedSingleCell = preservePendingSingleCellNativeTextSelectionAcrossFrames(completedTableTextDrag.cell, completedTableTextDrag.scrollAnchor); preserveWindowScrollPositionAcrossFrames(completedTableTextDrag.scrollAnchor, 420, 4, 7_000, false, false, true); window.requestAnimationFrame(restoreSingleCellAfterRelease); window.setTimeout(restoreSingleCellAfterRelease, 80); window.setTimeout(restoreSingleCellAfterRelease, 240); if (restored || preservedSingleCell) { event.preventDefault(); event.stopPropagation(); syncBubbleOnMouseUpRef.current = true; if (!preservedSingleCell) window.requestAnimationFrame(() => restoreTableCellTextSelectionIfEscaped(activeEditor, completedTableTextDrag.cell, null, true, true, false, completedTableTextDrag.endCell)) } } }
      tableTextDragStartRef.current = null; tableTextDragInitialSelectionTextRef.current = ""
      tableTextDragPendingStartRef.current = null
      codeTextDragStartRef.current = null; nonTableTextDragStartRef.current = null
      mouseTextSelectionInProgressRef.current = false
      if (!syncBubbleOnMouseUpRef.current && activeEditor && hasNativeEditorTextSelection(activeEditor.view.dom)) syncBubbleOnMouseUpRef.current = true
      if (!syncBubbleOnMouseUpRef.current && document.documentElement.hasAttribute("data-table-drag-selection-text")) syncBubbleOnMouseUpRef.current = true
      if (!syncBubbleOnMouseUpRef.current) return
      syncBubbleOnMouseUpRef.current = false
      scheduleSyncBubble(); if (bubbleSettleTimeoutId === null) bubbleSettleTimeoutId = window.setTimeout(() => { bubbleSettleTimeoutId = null; scheduleSyncBubble() }, 96)
    }
    const resolveCodeDragCopyText = () => { const selection = window.getSelection(), selectedText = selection?.toString().trim() ?? "", anchorElement = selection?.anchorNode instanceof Element ? selection.anchorNode : selection?.anchorNode?.parentElement ?? null, focusElement = selection?.focusNode instanceof Element ? selection.focusNode : selection?.focusNode?.parentElement ?? null, activeElement = document.activeElement instanceof Element ? document.activeElement : null, anchorShell = anchorElement?.closest(".aq-code-shell") ?? null, focusShell = focusElement?.closest(".aq-code-shell") ?? null, activeShell = activeElement?.closest(".aq-code-shell") ?? null, codeShell = anchorShell && anchorShell === focusShell ? anchorShell : activeShell?.getAttribute("data-code-drag-selection-text")?.trim() ? activeShell : null; if (!codeShell) return ""; return selectedText && anchorShell === codeShell && focusShell === codeShell ? selectedText : codeShell.getAttribute("data-code-drag-selection-text")?.trim() || "" }, handleDocumentCopyCapture = (event: ClipboardEvent) => { const copyText = resolveCodeDragCopyText(); if (!copyText) return; event.preventDefault(); event.clipboardData?.setData("text/plain", copyText) }, handleDocumentCopyKeyDown = (event: KeyboardEvent) => { if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== "c") return; const copyText = resolveCodeDragCopyText(); if (!copyText) return; event.preventDefault(); void navigator.clipboard?.writeText(copyText) }
    tableTextSelectionExternalClearWatcher = watchTableCellTextSelectionExternalClear(currentEditor.view.dom, () => Boolean(mouseTextSelectionInProgressRef.current || tableTextDragStartRef.current || tableTextDragPendingStartRef.current), handleTableTextSelectionExternalClear)
    scheduleSyncBubble()
    currentEditor.on("selectionUpdate", scheduleSyncBubble)
    currentEditor.on("focus", scheduleSyncBubble)
    document.addEventListener("selectionchange", handleDocumentSelectionChange)
    document.addEventListener("pointerdown", handleEditorPointerDownCapture, true)
    document.addEventListener("mousedown", handleEditorMouseDownCapture, true); document.addEventListener("copy", handleDocumentCopyCapture, true); window.addEventListener("keydown", handleDocumentCopyKeyDown, true)
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
      document.removeEventListener("mousedown", handleEditorMouseDownCapture, true); document.removeEventListener("copy", handleDocumentCopyCapture, true); window.removeEventListener("keydown", handleDocumentCopyKeyDown, true)
      window.removeEventListener("scroll", scheduleSyncBubble, true)
      window.removeEventListener("resize", scheduleSyncBubble)
      window.removeEventListener("pointermove", handleWindowPointerMove, true)
      window.removeEventListener("mousemove", handleWindowMouseMove, true)
      window.removeEventListener("pointerup", completeTextDragSelection, true)
      window.removeEventListener("pointercancel", completeTextDragSelection, true)
      window.removeEventListener("mouseup", completeTextDragSelection, true)
      tableTextSelectionExternalClearWatcher?.dispose()
      if (rafId !== null && typeof window !== "undefined") window.cancelAnimationFrame(rafId); if (bubbleSettleTimeoutId !== null && typeof window !== "undefined") window.clearTimeout(bubbleSettleTimeoutId)
      cancelTableTextDragPreserves()
      cancelCodeDragSelectionPreserve()
      mouseTextSelectionInProgressRef.current = false
      syncBubbleOnMouseUpRef.current = false
      tableTextDragStartRef.current = null; tableTextDragPendingStartRef.current = null
      codeTextDragStartRef.current = null; nonTableTextDragStartRef.current = null
      cancelBubbleHide()
    }
  }, [bubbleToolbarHoveredRef, cancelBubbleHide, clearWindowTextSelection, editor, editorRef, hasTableStructuralSelection, hideTableQuickRailImmediately, isTableColumnRailResizeActive, mouseTextSelectionInProgressRef, scheduleBubbleHide, scheduleTableQuickRailHide, setBubbleState, syncBubbleOnMouseUpRef, syncTableQuickRailFromElement, tableMenuState, tryStartTableColumnResizeFromDomHandle])
}
