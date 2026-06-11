import type { Editor as TiptapEditor } from "@tiptap/core"
import { NodeSelection } from "@tiptap/pm/state"
import { CellSelection, tableEditingKey } from "@tiptap/pm/tables"
import {
  cancelAllWindowScrollPreserves,
  cancelTablePointerScrollPreserves,
  clearNextEditorPointerAfterTable,
  preserveWindowScrollForRichBlockSelectAll,
  preserveWindowScrollForTableSelectAll,
  preserveWindowScrollPositionAcrossFrames,
  type WindowScrollAnchor,
} from "./blockHandleLayoutModel"
import { createSafeTextSelectionOutsideTable } from "./tableStructureModel"

export const isPrimarySelectAllKeyboardEvent = (event: KeyboardEvent) => {
  if (event.defaultPrevented || event.altKey || event.shiftKey) return false
  if (!(event.metaKey || event.ctrlKey)) return false
  return event.code === "KeyA" || event.key.toLowerCase() === "a"
}

const resolveElement = (target: EventTarget | Node | null | undefined) => {
  if (target instanceof Element) return target
  if (target instanceof Node) return target.parentElement
  return null
}

const TABLE_TEXT_SELECTION_CONTROL_SELECTOR = [
  "[data-table-axis-rail='true']",
  "[data-table-affordance]",
  "[data-table-menu-root='true']",
  "[data-table-menu-trigger='true']",
  "[data-testid^='table-column-resize-boundary-']",
  "[data-testid='table-structure-menu-button']",
  "[data-testid='table-corner-handle']",
  "[data-testid='table-corner-grow-handle']",
  ".column-resize-handle",
].join(", ")
export const resolveTableTextCellAtPoint = (
  clientX: number,
  clientY: number,
  target?: EventTarget | Node | null,
  options: { allowControlFallback?: boolean } = {}
) => {
  const pointElements = document.elementsFromPoint(clientX, clientY),
    targetElement = resolveElement(target)
  return !options.allowControlFallback &&
    (targetElement?.closest(TABLE_TEXT_SELECTION_CONTROL_SELECTOR) ||
      pointElements[0]?.closest(TABLE_TEXT_SELECTION_CONTROL_SELECTOR))
    ? null
    : pointElements
        .find((element) => Boolean(element.closest("th, td")))
        ?.closest("th, td") ?? targetElement?.closest("th, td")
}

export const resolveTableTextSelectionRangeCells = (
  clientX: number,
  clientY: number,
  target?: EventTarget | Node | null,
  options: { allowControlFallback?: boolean } = {}
) => {
  const pointCell = resolveTableTextCellAtPoint(
    clientX,
    clientY,
    target,
    options
  )
  const selection = window.getSelection()
  const anchorElement =
    selection?.anchorNode instanceof Element
      ? selection.anchorNode
      : selection?.anchorNode?.parentElement ?? null
  const selectedText = selection?.toString().trim() ?? ""
  const pointTable = pointCell?.closest("table")
  const anchorCell =
    anchorElement?.closest("th, td") ??
    Array.from(pointTable?.querySelectorAll<HTMLElement>("th, td") ?? []).find(
      (cell) => {
        const cellText = normalizeCellText(cell)
        return (
          cellText === selectedText ||
          cellText.includes(selectedText) ||
          selectedText.includes(cellText)
        )
      }
    )
  return pointCell instanceof HTMLElement &&
    anchorCell instanceof HTMLElement &&
    selectedText &&
    pointTable === anchorCell.closest("table")
    ? { anchorCell, pointCell }
    : null
}

type SingleCellTableCellIdentity = {
  cellIndex: number
  table: HTMLTableElement | null
  tableText: string
}
type PendingSingleCellNativeTextSelection = {
  cell: HTMLElement
  identity: SingleCellTableCellIdentity
  range: Range
}
type SingleCellNativeTextSelectionSnapshot = {
  cell: HTMLElement
  expiresAt: number
  identity: SingleCellTableCellIdentity
  range: Range
  scrollAnchor: WindowScrollAnchor
  text: string
}
let pendingTableTextSelectionRangeCells: {
    anchorCell: HTMLElement
    pointCell: HTMLElement
  } | null = null,
  explicitTableTextDragStart: {
    cell: HTMLElement
    scrollAnchor: WindowScrollAnchor
    x: number
    y: number
  } | null = null,
  lastTableTextPointerHover: {
    cell: HTMLElement
    expiresAt: number
    identity: SingleCellTableCellIdentity
    scrollAnchor: WindowScrollAnchor
    text: string
    x: number
    y: number
  } | null = null,
  lastSingleCellTextDragStart: {
    cell: HTMLElement
    expiresAt: number
    identity: SingleCellTableCellIdentity
    scrollAnchor: WindowScrollAnchor
    text: string
    x: number
    y: number
  } | null = null,
  pendingSingleCellNativeTextSelection: PendingSingleCellNativeTextSelection | null =
    null,
  lastObservedSingleCellNativeTextSelection: SingleCellNativeTextSelectionSnapshot | null =
    null,
  suppressSingleCellNativeTextSelectionUntil = 0
let activeTableTextRangePreserveCancel: (() => void) | null = null
let activeSingleCellNativeTextSelectionCancel: (() => void) | null = null
let hasActiveTableTextSelection = false
let hasRecentTableTextSelectionContext = false
let shouldClearActiveTableTextSelectionOnBlur = false
let lastTableSelectionRoot: HTMLElement | null = null
let lastTableSelectionExitTarget: Element | null = null
let tableTextSelectionClearGeneration = 0
let tableTextSelectionFinalizeSuppressedUntil = 0
let tableStructuralSelectionOwnerUntil = 0
const RECENT_TABLE_TEXT_SELECTION_CONTEXT_ATTR =
  "data-table-recent-text-selection-context"
export const TABLE_DRAG_SELECTION_TEXT_ATTR = "data-table-drag-selection-text"
export const TABLE_DRAG_SELECTION_TEXT_SELECTOR = `[${TABLE_DRAG_SELECTION_TEXT_ATTR}]`
export const TABLE_AXIS_SELECTION_SURFACE_CANCEL_EVENT =
  "aq-table-axis-selection-surface-cancel"
const TABLE_TEXT_HIGHLIGHT_NAME = "aq-table-text-selection"
const SINGLE_CELL_NATIVE_SELECTION_PRESERVE_FRAMES = 540,
  SINGLE_CELL_NATIVE_SELECTION_PRESERVE_MIN_MS = 9_000
const TABLE_TEXT_SCROLL_PRESERVE_CANCEL_DISTANCE_PX = 3_200
export const getTableTextSelectionClearGeneration = () =>
  tableTextSelectionClearGeneration
export const isTableTextSelectionClearGenerationCurrent = (
  generation: number
) => generation === tableTextSelectionClearGeneration
const getNow = () =>
  typeof performance !== "undefined" ? performance.now() : Date.now()
const isTableTextSelectionFinalizeSuppressed = () =>
  getNow() < tableTextSelectionFinalizeSuppressedUntil
const shouldCancelTableTextScrollPreserve =
  (scrollAnchor: WindowScrollAnchor) => () =>
    Math.abs(window.scrollX - scrollAnchor.x) >
      TABLE_TEXT_SCROLL_PRESERVE_CANCEL_DISTANCE_PX ||
    Math.abs(
      (document.scrollingElement?.scrollTop ?? window.scrollY) - scrollAnchor.y
    ) > TABLE_TEXT_SCROLL_PRESERVE_CANCEL_DISTANCE_PX
export const suppressSingleCellNativeTextSelectionPreserve = (
  durationMs = 1_200
) => {
  suppressSingleCellNativeTextSelectionUntil = Math.max(
    suppressSingleCellNativeTextSelectionUntil,
    getNow() + durationMs
  )
  activeSingleCellNativeTextSelectionCancel?.()
  pendingSingleCellNativeTextSelection = null
  lastObservedSingleCellNativeTextSelection = null
  lastSingleCellTextDragStart = null
}
export const markTableStructuralSelectionOwner = (durationMs = 720) => {
  tableStructuralSelectionOwnerUntil = Math.max(
    tableStructuralSelectionOwnerUntil,
    getNow() + durationMs
  )
}
export const isTableStructuralSelectionOwnerActive = () =>
  getNow() < tableStructuralSelectionOwnerUntil
export const clearTableStructuralSelectionOwner = () => {
  tableStructuralSelectionOwnerUntil = 0
}
const resolveTableSelectedCellMarkerRoots = (editorRoot: HTMLElement) => {
  const roots = new Set<ParentNode>()
  roots.add(editorRoot)
  if (typeof document !== "undefined") roots.add(document)
  const editorSurface = editorRoot.closest(
    "[data-testid='block-editor-prosemirror']"
  )
  const editorContent = editorRoot.closest(".aq-block-editor__content")
  if (editorSurface) roots.add(editorSurface)
  if (editorContent) roots.add(editorContent)
  return Array.from(roots)
}
export const hasTableSelectedCellDomMarkers = (editorRoot: HTMLElement) =>
  resolveTableSelectedCellMarkerRoots(editorRoot).some((root) =>
    root.querySelector(".selectedCell")
  )
export const clearTableSelectedCellDomMarkers = (
  editorRoot: HTMLElement,
  editor?: TiptapEditor | null
) => {
  let tableEditingMetaCleared = false
  const clearMarkers = () => {
    if (
      editor &&
      !tableEditingMetaCleared &&
      tableEditingKey.getState(editor.state) !== null
    ) {
      editor.view.dispatch(editor.state.tr.setMeta(tableEditingKey, -1))
      tableEditingMetaCleared = true
    }
    if (editor?.state.selection instanceof CellSelection) return
    resolveTableSelectedCellMarkerRoots(editorRoot).forEach((root) => {
      root
        .querySelectorAll(".selectedCell")
        .forEach((element) => element.classList.remove("selectedCell"))
    })
  }
  clearMarkers()
  if (!editor || typeof window === "undefined") return
  const startedAt = performance.now()
  const observedRoot =
    editorRoot.closest("[data-testid='block-editor-prosemirror']") ?? editorRoot
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
    if (!editor.view.dom.isConnected || performance.now() - startedAt > 650) {
      observer?.disconnect()
      return
    }
    clearMarkers()
    window.requestAnimationFrame(maintain)
  }
  window.requestAnimationFrame(maintain)
}
const clearTableDragSelectionTextAttributes = () => {
  document
    .querySelectorAll(TABLE_DRAG_SELECTION_TEXT_SELECTOR)
    .forEach((element) =>
      element.removeAttribute(TABLE_DRAG_SELECTION_TEXT_ATTR)
    )
  document.documentElement.removeAttribute(TABLE_DRAG_SELECTION_TEXT_ATTR)
}
const clearPendingTableTextSelectionState = () => {
  pendingTableTextSelectionRangeCells = null
  explicitTableTextDragStart = null
  pendingSingleCellNativeTextSelection = null
  lastObservedSingleCellNativeTextSelection = null
  lastSingleCellTextDragStart = null
}
const clearTableTextRangeHighlight = (options: { markBlur?: boolean } = {}) => {
  const shouldClearTableSelection =
    hasActiveTableTextSelection ||
    hasTableTextSelectionState(document.documentElement)
  if (shouldClearTableSelection && (options.markBlur ?? true)) {
    shouldClearActiveTableTextSelectionOnBlur = true
  }
  hasActiveTableTextSelection = false
  clearTableDragSelectionTextAttributes()
  ;(
    CSS as typeof CSS & { highlights?: { delete: (name: string) => void } }
  ).highlights?.delete(TABLE_TEXT_HIGHLIGHT_NAME)
}
const paintTableTextRangeHighlight = (range: Range) => {
  const HighlightCtor = (
      window as typeof window & { Highlight?: new (range: Range) => unknown }
    ).Highlight,
    highlights = (
      CSS as typeof CSS & {
        highlights?: { set: (name: string, highlight: unknown) => void }
      }
    ).highlights
  if (!HighlightCtor || !highlights) return
  if (!document.getElementById("aq-table-text-highlight-style")) {
    const style = document.createElement("style")
    style.id = "aq-table-text-highlight-style"
    style.textContent = `::highlight(${TABLE_TEXT_HIGHLIGHT_NAME}){background:#0a5b9d;color:white}`
    document.head.append(style)
  }
  highlights.set(
    TABLE_TEXT_HIGHLIGHT_NAME,
    new HighlightCtor(range.cloneRange())
  )
}
const resolveExplicitTableTextCellFromGeometry = (
  clientX: number,
  clientY: number,
  explicitDragStart: { cell: HTMLElement; x: number; y: number } | null
) => {
  const table = explicitDragStart?.cell.closest("table")
  if (!explicitDragStart || !table) return null
  const cells = Array.from(
    table.querySelectorAll<HTMLElement>("th, td")
  ).filter((cell) => {
    const rect = cell.getBoundingClientRect()
    return (
      cell.closest("table") === table &&
      clientY >= rect.top - 3 &&
      clientY <= rect.bottom + 3 &&
      clientX >= rect.left - 10 &&
      clientX <= rect.right + 10
    )
  })
  if (!cells.length) return null
  const forward =
    clientY > explicitDragStart.y + 3 ||
    (Math.abs(clientY - explicitDragStart.y) <= 3 &&
      clientX >= explicitDragStart.x)
  return cells[forward ? cells.length - 1 : 0]
}
const resolveExplicitTableTextSelectionRangeCells = (
  clientX: number,
  clientY: number,
  target?: EventTarget | Node | null,
  explicitDragStart = explicitTableTextDragStart,
  options: { allowControlFallback?: boolean; preferGeometry?: boolean } = {}
) => {
  const directCell = resolveTableTextCellAtPoint(
      clientX,
      clientY,
      target,
      options
    ),
    geometryCell = options.preferGeometry
      ? resolveExplicitTableTextCellFromGeometry(
          clientX,
          clientY,
          explicitDragStart
        )
      : null,
    pointCell = geometryCell ?? directCell
  return explicitDragStart &&
    pointCell instanceof HTMLElement &&
    pointCell.closest("table") === explicitDragStart.cell.closest("table") &&
    (Math.abs(clientX - explicitDragStart.x) > 4 ||
      Math.abs(clientY - explicitDragStart.y) > 4)
    ? { anchorCell: explicitDragStart.cell, pointCell }
    : null
}
const preserveExplicitTableTextSelectionFromPoint = (
  clientX: number,
  clientY: number,
  target?: EventTarget | Node | null
) => {
  const rangeCells = resolveExplicitTableTextSelectionRangeCells(
    clientX,
    clientY,
    target,
    explicitTableTextDragStart,
    {
      allowControlFallback: Boolean(explicitTableTextDragStart),
      preferGeometry: true,
    }
  )
  if (!rangeCells || rangeCells.anchorCell === rangeCells.pointCell)
    return false
  pendingTableTextSelectionRangeCells = rangeCells
  selectTableCellTextRange(rangeCells.anchorCell, rangeCells.pointCell)
  preserveTableTextRangeAcrossFrames(
    rangeCells.anchorCell,
    rangeCells.pointCell
  )
  return true
}
const preserveExplicitTableTextSelectionFromMoveEvent = (
  event: MouseEvent | PointerEvent
) => {
  if (event.buttons !== 1) {
    const hoverCell = resolveTableTextCellAtPoint(
      event.clientX,
      event.clientY,
      event.target
    )
    lastTableTextPointerHover =
      hoverCell instanceof HTMLElement
        ? {
            cell: hoverCell,
            expiresAt: getNow() + 900,
            identity: createSingleCellTableIdentity(hoverCell),
            scrollAnchor: {
              x: window.scrollX,
              y: document.scrollingElement?.scrollTop ?? window.scrollY,
            },
            text: normalizeCellText(hoverCell),
            x: event.clientX,
            y: event.clientY,
          }
        : null
    pendingTableTextSelectionRangeCells = null
    return
  }
  const geometryRangeCells = explicitTableTextDragStart
    ? resolveExplicitTableTextSelectionRangeCells(
        event.clientX,
        event.clientY,
        event.target,
        explicitTableTextDragStart,
        { allowControlFallback: true, preferGeometry: true }
      )
    : null
  const directRangeCells =
    resolveExplicitTableTextSelectionRangeCells(
      event.clientX,
      event.clientY,
      event.target,
      explicitTableTextDragStart,
      { allowControlFallback: Boolean(explicitTableTextDragStart) }
    ) ??
    resolveTableTextSelectionRangeCells(
      event.clientX,
      event.clientY,
      event.target,
      { allowControlFallback: Boolean(explicitTableTextDragStart) }
    )
  const rangeCells = geometryRangeCells ?? directRangeCells
  if (
    explicitTableTextDragStart &&
    (!rangeCells || rangeCells.anchorCell === rangeCells.pointCell)
  )
    rememberSingleCellNativeTextSelectionAfterNativeUpdate(
      explicitTableTextDragStart.cell
    )
  if (rangeCells && rangeCells.anchorCell !== rangeCells.pointCell) {
    activeSingleCellNativeTextSelectionCancel?.()
    pendingSingleCellNativeTextSelection = null
    lastObservedSingleCellNativeTextSelection = null
    pendingTableTextSelectionRangeCells = rangeCells
    selectTableCellTextRange(rangeCells.anchorCell, rangeCells.pointCell)
    preserveTableTextRangeAcrossFrames(
      rangeCells.anchorCell,
      rangeCells.pointCell
    )
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    return
  }
  if (!rangeCells) {
    const selection = window.getSelection(),
      anchorCell = resolveElement(selection?.anchorNode)?.closest("th, td"),
      focusCell = resolveElement(selection?.focusNode)?.closest("th, td"),
      escapedSelectionCell =
        explicitTableTextDragStart?.cell ??
        (anchorCell && !focusCell
          ? anchorCell
          : focusCell && !anchorCell
          ? focusCell
          : null)
    if (
      preserveSingleCellNativeTextSelection(
        escapedSelectionCell instanceof HTMLElement
          ? escapedSelectionCell
          : null
      )
    ) {
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      return
    }
  }
  pendingTableTextSelectionRangeCells =
    rangeCells ?? pendingTableTextSelectionRangeCells
}
const createSingleCellTableIdentity = (
  cell: HTMLElement
): SingleCellTableCellIdentity => {
  const table = cell.closest("table"),
    cells = table
      ? Array.from(table.querySelectorAll<HTMLElement>("th, td"))
      : []
  return {
    cellIndex: cells.indexOf(cell),
    table,
    tableText: normalizeCellText(table),
  }
}
const resolveSingleCellByIdentity = (
  identity: SingleCellTableCellIdentity | null | undefined
) => {
  if (!identity || identity.cellIndex < 0) return null
  const readCellAtIndex = (table: HTMLTableElement | null) =>
      Array.from(table?.querySelectorAll<HTMLElement>("th, td") ?? [])[
        identity.cellIndex
      ] ?? null,
    sameTableCell = identity.table?.isConnected
      ? readCellAtIndex(identity.table)
      : null
  if (sameTableCell || !identity.tableText) return sameTableCell
  for (const table of Array.from(
    document.querySelectorAll<HTMLTableElement>("table")
  )) {
    if (normalizeCellText(table) !== identity.tableText) continue
    const candidate = readCellAtIndex(table)
    if (candidate) return candidate
  }
  return null
}
const resolveSingleCellNativeScrollAnchor = (
  cell: HTMLElement,
  scrollAnchorOverride?: WindowScrollAnchor | null
) => {
  const cellText = normalizeCellText(cell),
    now = getNow(),
    currentScrollAnchor = {
      x: window.scrollX,
      y: document.scrollingElement?.scrollTop ?? window.scrollY,
    },
    isSameIdentityCell = (
      tracked: {
        cell: HTMLElement
        expiresAt: number
        identity: SingleCellTableCellIdentity
        text: string
      } | null
    ) => {
      if (!tracked || tracked.expiresAt <= now) return false
      const trackedCell =
        tracked.cell === cell
          ? cell
          : resolveSingleCellByIdentity(tracked.identity)
      return Boolean(
        trackedCell === cell ||
          (trackedCell?.isConnected &&
            trackedCell.closest("table") === cell.closest("table") &&
            (tracked.text === cellText ||
              Boolean(tracked.text && cellText.includes(tracked.text))))
      )
    },
    matchesLastStart = isSameIdentityCell(lastSingleCellTextDragStart),
    matchesHover = isSameIdentityCell(lastTableTextPointerHover)
  return (
    [
      scrollAnchorOverride ?? null,
      explicitTableTextDragStart?.cell === cell
        ? explicitTableTextDragStart.scrollAnchor
        : null,
      matchesLastStart ? lastSingleCellTextDragStart!.scrollAnchor : null,
      lastObservedSingleCellNativeTextSelection?.cell === cell &&
      lastObservedSingleCellNativeTextSelection.expiresAt > now
        ? lastObservedSingleCellNativeTextSelection.scrollAnchor
        : null,
      matchesHover ? lastTableTextPointerHover!.scrollAnchor : null,
    ].reduce<WindowScrollAnchor | null>(
      (best, candidate) =>
        !candidate
          ? best
          : !best ||
            (Math.abs(best.x - candidate.x) <= 4 && candidate.y > best.y + 24)
          ? candidate
          : best,
      null
    ) ?? currentScrollAnchor
  )
}
const preserveNativeSingleCellRangeAcrossFrames = (
  cell: HTMLElement,
  range: Range,
  scrollAnchorOverride?: WindowScrollAnchor | null
) => {
  if (
    getNow() < suppressSingleCellNativeTextSelectionUntil ||
    (!range.toString().trim() && !normalizeCellText(cell))
  )
    return false
  activeSingleCellNativeTextSelectionCancel?.()
  rememberSingleCellNativeTextSelectionSnapshot(
    cell,
    range,
    scrollAnchorOverride
  )
  const clearGeneration = tableTextSelectionClearGeneration,
    scrollAnchor = resolveSingleCellNativeScrollAnchor(
      cell,
      scrollAnchorOverride
    ),
    startedAt = getNow()
  let cancelled = false,
    frame = 0,
    pointerCancelArmed = !explicitTableTextDragStart
  const shouldCancelForFarScroll =
    shouldCancelTableTextScrollPreserve(scrollAnchor)
  function armPointerCancel() {
    pointerCancelArmed = true
  }
  function restoreScrollPosition() {
    const currentY = document.scrollingElement?.scrollTop ?? window.scrollY
    if (shouldCancelForFarScroll()) {
      cancel()
      return
    }
    if (
      Math.abs(window.scrollX - scrollAnchor.x) > 4 ||
      Math.abs(currentY - scrollAnchor.y) > 4
    )
      window.scrollTo(scrollAnchor.x, scrollAnchor.y)
  }
  function restoreOnScroll() {
    if (
      !cancelled &&
      isTableTextSelectionClearGenerationCurrent(clearGeneration) &&
      cell.isConnected
    )
      restoreScrollPosition()
  }
  function cleanup() {
    window.removeEventListener("pointerdown", cancel, true)
    window.removeEventListener("mousedown", cancel, true)
    window.removeEventListener("pointerup", armPointerCancel, true)
    window.removeEventListener("mouseup", armPointerCancel, true)
    window.removeEventListener("wheel", cancel, true)
    window.removeEventListener("scroll", restoreOnScroll, true)
    window.removeEventListener("keydown", cancel, true)
    if (activeSingleCellNativeTextSelectionCancel === cancel)
      activeSingleCellNativeTextSelectionCancel = null
  }
  function cancel(event?: Event) {
    if (
      (event?.type === "pointerdown" || event?.type === "mousedown") &&
      !pointerCancelArmed
    )
      return
    cancelled = true
    cleanup()
  }
  const restore = () => {
    if (cancelled) return
    if (
      !isTableTextSelectionClearGenerationCurrent(clearGeneration) ||
      !cell.isConnected
    ) {
      cleanup()
      return
    }
    if (shouldCancelForFarScroll()) {
      cancel()
      return
    }
    try {
      const selection = window.getSelection(),
        anchorElement = resolveElement(selection?.anchorNode),
        focusElement = resolveElement(selection?.focusNode),
        hasOwnedSelection = Boolean(
          selection?.rangeCount &&
            selection.toString().trim() &&
            anchorElement &&
            focusElement &&
            cell.contains(anchorElement) &&
            cell.contains(focusElement)
        )
      if (!hasOwnedSelection) {
        selection?.removeAllRanges()
        selection?.addRange(range.cloneRange())
      }
      restoreScrollPosition()
    } catch {
      cleanup()
      return
    }
    frame += 1
    if (
      frame < SINGLE_CELL_NATIVE_SELECTION_PRESERVE_FRAMES ||
      getNow() - startedAt < SINGLE_CELL_NATIVE_SELECTION_PRESERVE_MIN_MS
    )
      window.requestAnimationFrame(restore)
    else cleanup()
  }
  activeSingleCellNativeTextSelectionCancel = cancel
  window.addEventListener("pointerdown", cancel, true)
  window.addEventListener("mousedown", cancel, true)
  window.addEventListener("pointerup", armPointerCancel, {
    capture: true,
    once: true,
  })
  window.addEventListener("mouseup", armPointerCancel, {
    capture: true,
    once: true,
  })
  window.addEventListener("wheel", cancel, {
    capture: true,
    passive: true,
    once: true,
  })
  window.addEventListener("scroll", restoreOnScroll, {
    capture: true,
    passive: true,
  })
  window.addEventListener("keydown", cancel, { capture: true, once: true })
  restore()
  return true
}
const rememberSingleCellNativeTextSelectionSnapshot = (
  cell: HTMLElement,
  range: Range,
  scrollAnchorOverride?: WindowScrollAnchor | null
) => {
  const text = (range.toString() || normalizeCellText(cell))
    .replace(/\s+/g, " ")
    .trim()
  if (!text || getNow() < suppressSingleCellNativeTextSelectionUntil) return
  const identity = createSingleCellTableIdentity(cell),
    scrollAnchor = resolveSingleCellNativeScrollAnchor(
      cell,
      scrollAnchorOverride
    )
  pendingSingleCellNativeTextSelection = {
    cell,
    identity,
    range: range.cloneRange(),
  }
  lastObservedSingleCellNativeTextSelection = {
    cell,
    expiresAt: getNow() + SINGLE_CELL_NATIVE_SELECTION_PRESERVE_MIN_MS,
    identity,
    range: range.cloneRange(),
    scrollAnchor,
    text,
  }
}
const resolveSingleCellNativeTextSelectionSnapshot = (cell: HTMLElement) => {
  if (
    lastObservedSingleCellNativeTextSelection &&
    lastObservedSingleCellNativeTextSelection.expiresAt <= getNow()
  )
    lastObservedSingleCellNativeTextSelection = null
  const pendingText = pendingSingleCellNativeTextSelection
      ? normalizeCellText(pendingSingleCellNativeTextSelection.cell)
      : "",
    observedSnapshot = lastObservedSingleCellNativeTextSelection,
    observedText = observedSnapshot?.text ?? "",
    identityCell =
      resolveSingleCellByIdentity(
        pendingSingleCellNativeTextSelection?.identity
      ) ?? resolveSingleCellByIdentity(observedSnapshot?.identity),
    currentCell = cell.isConnected
      ? cell
      : identityCell ??
        Array.from(document.querySelectorAll<HTMLElement>("th, td")).find(
          (candidate) => {
            const candidateText = normalizeCellText(candidate)
            return Boolean(
              (pendingText && candidateText === pendingText) ||
                (observedText && candidateText.includes(observedText))
            )
          }
        )
  if (!currentCell) return null
  let range: Range | null =
    pendingSingleCellNativeTextSelection &&
    currentCell === pendingSingleCellNativeTextSelection.cell &&
    currentCell.isConnected
      ? pendingSingleCellNativeTextSelection.range.cloneRange()
      : null
  if (
    !range &&
    observedSnapshot &&
    currentCell === observedSnapshot.cell &&
    currentCell.isConnected
  )
    range = observedSnapshot.range.cloneRange()
  if (!range) {
    const selection = window.getSelection(),
      anchorElement = resolveElement(selection?.anchorNode),
      focusElement = resolveElement(selection?.focusNode)
    if (
      selection?.rangeCount &&
      selection.toString().trim() &&
      anchorElement &&
      focusElement &&
      currentCell.contains(anchorElement) &&
      currentCell.contains(focusElement)
    )
      range = selection.getRangeAt(0).cloneRange()
  }
  if (!range) {
    range = document.createRange()
    range.selectNodeContents(currentCell)
  }
  return { cell: currentCell, range }
}
const preserveSingleCellNativeTextSelection = (
  cell: HTMLElement | null | undefined,
  scrollAnchor?: WindowScrollAnchor | null
) => {
  const selection = window.getSelection(),
    selectedText = selection?.toString().trim() ?? ""
  if (!cell || !selection || selection.rangeCount === 0 || !selectedText)
    return false
  const anchorElement = resolveElement(selection.anchorNode),
    focusElement = resolveElement(selection.focusNode),
    anchorInside = Boolean(anchorElement && cell.contains(anchorElement)),
    focusInside = Boolean(focusElement && cell.contains(focusElement))
  if (
    !anchorInside &&
    !focusInside &&
    !normalizeCellText(cell).includes(selectedText.replace(/\s+/g, " "))
  )
    return false
  const range =
    anchorInside && focusInside
      ? selection.getRangeAt(0).cloneRange()
      : document.createRange()
  if (!(anchorInside && focusInside)) range.selectNodeContents(cell)
  rememberSingleCellNativeTextSelectionSnapshot(cell, range, scrollAnchor)
  return preserveNativeSingleCellRangeAcrossFrames(cell, range, scrollAnchor)
}
const rememberSingleCellNativeTextSelection = (
  cell: HTMLElement | null | undefined
) => {
  const selection = window.getSelection(),
    selectedText = selection?.toString().trim() ?? ""
  if (!cell || !selection || selection.rangeCount === 0 || !selectedText)
    return false
  const anchorElement = resolveElement(selection.anchorNode),
    focusElement = resolveElement(selection.focusNode),
    range = document.createRange()
  if (
    anchorElement &&
    focusElement &&
    cell.contains(anchorElement) &&
    cell.contains(focusElement)
  )
    rememberSingleCellNativeTextSelectionSnapshot(
      cell,
      selection.getRangeAt(0).cloneRange()
    )
  else if (
    normalizeCellText(cell).includes(selectedText.replace(/\s+/g, " "))
  ) {
    range.selectNodeContents(cell)
    rememberSingleCellNativeTextSelectionSnapshot(cell, range)
  } else return false
  return true
}
const rememberSingleCellNativeTextSelectionAfterNativeUpdate = (
  cell: HTMLElement | null | undefined
) => {
  if (!cell) return
  rememberSingleCellNativeTextSelection(cell)
  window.requestAnimationFrame(() =>
    rememberSingleCellNativeTextSelection(cell)
  )
  window.setTimeout(() => rememberSingleCellNativeTextSelection(cell), 32)
  window.setTimeout(() => rememberSingleCellNativeTextSelection(cell), 96)
}
const restorePendingSingleCellNativeTextSelection = (
  cell: HTMLElement | null | undefined,
  scrollAnchor?: WindowScrollAnchor | null
) => {
  if (
    !cell ||
    (!pendingSingleCellNativeTextSelection &&
      !lastObservedSingleCellNativeTextSelection)
  )
    return false
  const snapshot = resolveSingleCellNativeTextSelectionSnapshot(cell)
  return snapshot
    ? preserveNativeSingleCellRangeAcrossFrames(
        snapshot.cell,
        snapshot.range,
        scrollAnchor
      )
    : false
}
export const preservePendingSingleCellNativeTextSelectionAcrossFrames = (
  cell: HTMLElement | null | undefined,
  scrollAnchor?: WindowScrollAnchor | null
) => {
  if (!cell) return false
  const snapshot = resolveSingleCellNativeTextSelectionSnapshot(cell)
  return snapshot
    ? preserveNativeSingleCellRangeAcrossFrames(
        snapshot.cell,
        snapshot.range,
        scrollAnchor
      )
    : false
}
const preserveEscapedTableEndpointSelection = () => {
  if (getNow() < suppressSingleCellNativeTextSelectionUntil) return
  const selection = window.getSelection()
  if (!selection?.toString().trim()) return
  const anchorCell = resolveElement(selection.anchorNode)?.closest("th, td"),
    focusCell = resolveElement(selection.focusNode)?.closest("th, td")
  if (anchorCell instanceof HTMLElement && focusCell === anchorCell) {
    rememberSingleCellNativeTextSelection(anchorCell)
    return
  }
  const escapedSelectionCell =
    anchorCell && !focusCell
      ? anchorCell
      : focusCell && !anchorCell
      ? focusCell
      : null
  if (escapedSelectionCell instanceof HTMLElement)
    preserveSingleCellNativeTextSelection(escapedSelectionCell)
}
const preserveTableTextRangeAcrossFrames = (
  anchorCell: HTMLElement,
  pointCell: HTMLElement
) => {
  activeSingleCellNativeTextSelectionCancel?.()
  pendingSingleCellNativeTextSelection = null
  lastObservedSingleCellNativeTextSelection = null
  activeTableTextRangePreserveCancel?.()
  let cancelled = false,
    frame = 0
  const startedAt =
    typeof performance !== "undefined" ? performance.now() : Date.now()
  const clearGeneration = tableTextSelectionClearGeneration
  const cleanup = () => {
    window.removeEventListener("pointerdown", cancel, true)
    window.removeEventListener("mousedown", cancel, true)
    window.removeEventListener("wheel", cancel, true)
    window.removeEventListener("scroll", cancel, true)
    window.removeEventListener("keydown", cancel, true)
    if (activeTableTextRangePreserveCancel === cancel)
      activeTableTextRangePreserveCancel = null
  }
  const cancel = (event?: Event) => {
    cancelled = true
    clearTableTextRangeHighlight({
      markBlur: !(event instanceof KeyboardEvent),
    })
    cleanup()
  }
  const restore = () => {
    if (cancelled) return
    if (!isTableTextSelectionClearGenerationCurrent(clearGeneration)) {
      cancel()
      return
    }
    selectTableCellTextRange(anchorCell, pointCell)
    frame += 1
    const elapsedMs =
      (typeof performance !== "undefined" ? performance.now() : Date.now()) -
      startedAt
    if (frame < 96 || elapsedMs < 1_600) {
      window.requestAnimationFrame(restore)
    }
  }
  activeTableTextRangePreserveCancel = cancel
  window.addEventListener("pointerdown", cancel, { capture: true, once: true })
  window.addEventListener("mousedown", cancel, { capture: true, once: true })
  window.addEventListener("wheel", cancel, {
    capture: true,
    passive: true,
    once: true,
  })
  window.addEventListener("scroll", cancel, {
    capture: true,
    passive: true,
    once: true,
  })
  window.addEventListener("keydown", cancel, { capture: true, once: true })
  window.requestAnimationFrame(restore)
  return cancel
}

export const finalizeTableTextSelectionFromPoint = (
  clientX: number,
  clientY: number,
  target?: EventTarget | Node | null
) => {
  if (isTableTextSelectionFinalizeSuppressed()) {
    pendingTableTextSelectionRangeCells = null
    explicitTableTextDragStart = null
    return false
  }
  const targetElement = resolveElement(target)
  const explicitDragStart =
    explicitTableTextDragStart ??
    (lastSingleCellTextDragStart &&
    lastSingleCellTextDragStart.expiresAt > getNow()
      ? lastSingleCellTextDragStart
      : null)
  explicitTableTextDragStart = null
  if (
    isTableStructuralSelectionOwnerActive() ||
    (targetElement?.closest(TABLE_TEXT_SELECTION_CONTROL_SELECTOR) &&
      !explicitDragStart)
  ) {
    clearPendingTableTextSelectionState()
    cancelActiveTableCellTextSelectionPreserves()
    clearTableTextRangeHighlight({ markBlur: false })
    window.getSelection()?.removeAllRanges()
    return false
  }
  if (!explicitDragStart) lastSingleCellTextDragStart = null
  const selection = window.getSelection(),
    anchorCell = resolveElement(selection?.anchorNode)?.closest("th, td"),
    focusCell = resolveElement(selection?.focusNode)?.closest("th, td"),
    escapedSelectionCell =
      anchorCell && !focusCell
        ? anchorCell
        : focusCell && !anchorCell
        ? focusCell
        : null
  const sameCellNativeSelectionPreserved = explicitDragStart
    ? (Math.abs(clientX - explicitDragStart.x) > 4 ||
        Math.abs(clientY - explicitDragStart.y) > 4) &&
      (preserveSingleCellNativeTextSelection(
        explicitDragStart.cell,
        explicitDragStart.scrollAnchor
      ) ||
        restorePendingSingleCellNativeTextSelection(
          explicitDragStart.cell,
          explicitDragStart.scrollAnchor
        ) ||
        preservePendingSingleCellNativeTextSelectionAcrossFrames(
          explicitDragStart.cell,
          explicitDragStart.scrollAnchor
        ))
    : preserveSingleCellNativeTextSelection(
        escapedSelectionCell instanceof HTMLElement
          ? escapedSelectionCell
          : null
      )
  const allowControlFallback = Boolean(
    explicitDragStart || pendingTableTextSelectionRangeCells
  )
  const explicitRangeCells = resolveExplicitTableTextSelectionRangeCells(
      clientX,
      clientY,
      target,
      explicitDragStart,
      { allowControlFallback, preferGeometry: true }
    ),
    directRangeCells = resolveTableTextSelectionRangeCells(
      clientX,
      clientY,
      target,
      { allowControlFallback }
    ),
    rangeCells =
      (explicitRangeCells &&
      explicitRangeCells.anchorCell !== explicitRangeCells.pointCell
        ? explicitRangeCells
        : null) ??
      directRangeCells ??
      pendingTableTextSelectionRangeCells ??
      explicitRangeCells
  if (
    explicitDragStart &&
    (!rangeCells || rangeCells.anchorCell === rangeCells.pointCell) &&
    (Math.abs(clientX - explicitDragStart.x) > 4 ||
      Math.abs(clientY - explicitDragStart.y) > 4)
  ) {
    const preserveFallback = () => {
      if (!window.getSelection()?.toString().trim())
        preservePendingSingleCellNativeTextSelectionAcrossFrames(
          explicitDragStart.cell,
          explicitDragStart.scrollAnchor
        )
    }
    window.requestAnimationFrame(preserveFallback)
    window.setTimeout(preserveFallback, 80)
    window.setTimeout(preserveFallback, 240)
  }
  pendingTableTextSelectionRangeCells = null
  if (!rangeCells || rangeCells.anchorCell === rangeCells.pointCell) {
    if (!sameCellNativeSelectionPreserved)
      pendingSingleCellNativeTextSelection = null
    return sameCellNativeSelectionPreserved
  }
  lastSingleCellTextDragStart = null
  pendingSingleCellNativeTextSelection = null
  lastObservedSingleCellNativeTextSelection = null
  cancelActiveTableCellTextSelectionPreserves()
  const clearGeneration = tableTextSelectionClearGeneration
  const restore = () => {
    if (!isTableTextSelectionClearGenerationCurrent(clearGeneration)) return
    selectTableCellTextRange(rangeCells.anchorCell, rangeCells.pointCell)
  }
  window.requestAnimationFrame(restore)
  window.setTimeout(restore, 80)
  window.setTimeout(restore, 180)
  preserveTableTextRangeAcrossFrames(
    rangeCells.anchorCell,
    rangeCells.pointCell
  )
  return true
}

const resolveTableDragStartScrollAnchor = (
  currentScrollAnchor: WindowScrollAnchor,
  hoverAnchor: WindowScrollAnchor | null
) =>
  !hoverAnchor || Math.abs(currentScrollAnchor.x - hoverAnchor.x) > 4
    ? currentScrollAnchor
    : currentScrollAnchor.y > hoverAnchor.y + 24
    ? currentScrollAnchor
    : hoverAnchor
export const resolveTableTextDragScrollAnchorFromEvent = (
  event: MouseEvent | PointerEvent,
  startCell?: HTMLElement | null
) => {
  const directStartCell = resolveTableTextCellAtPoint(
      event.clientX,
      event.clientY,
      event.target
    ),
    currentScrollAnchor = {
      x: window.scrollX,
      y: document.scrollingElement?.scrollTop ?? window.scrollY,
    },
    hoverCell =
      lastTableTextPointerHover &&
      lastTableTextPointerHover.expiresAt > getNow() &&
      lastTableTextPointerHover.cell.isConnected &&
      Math.abs(event.clientX - lastTableTextPointerHover.x) <= 32 &&
      Math.abs(event.clientY - lastTableTextPointerHover.y) <= 32
        ? lastTableTextPointerHover
        : null,
    resolvedStartCell =
      startCell ??
      (directStartCell instanceof HTMLElement
        ? directStartCell
        : hoverCell?.cell ?? null),
    startCellText = normalizeCellText(resolvedStartCell),
    hoverAnchor =
      hoverCell &&
      resolvedStartCell instanceof HTMLElement &&
      (hoverCell.cell === resolvedStartCell ||
        hoverCell.text === startCellText ||
        Boolean(hoverCell.text && startCellText.includes(hoverCell.text)))
        ? hoverCell.scrollAnchor
        : null
  return resolveTableDragStartScrollAnchor(currentScrollAnchor, hoverAnchor)
}
const rememberExplicitTableTextDragStart = (
  event: MouseEvent | PointerEvent
) => {
  if (
    event.button !== 0 ||
    ("pointerType" in event &&
      event.pointerType &&
      event.pointerType !== "mouse")
  )
    return
  const targetElement = resolveElement(event.target)
  if (
    isTableStructuralSelectionOwnerActive() ||
    targetElement?.closest(TABLE_TEXT_SELECTION_CONTROL_SELECTOR)
  ) {
    clearPendingTableTextSelectionState()
    return
  }
  if (
    event.type === "mousedown" &&
    explicitTableTextDragStart &&
    Math.abs(event.clientX - explicitTableTextDragStart.x) <= 4 &&
    Math.abs(event.clientY - explicitTableTextDragStart.y) <= 4
  )
    return
  pendingSingleCellNativeTextSelection = null
  lastObservedSingleCellNativeTextSelection = null
  const hoverCell =
      lastTableTextPointerHover &&
      lastTableTextPointerHover.expiresAt > getNow() &&
      lastTableTextPointerHover.cell.isConnected &&
      Math.abs(event.clientX - lastTableTextPointerHover.x) <= 32 &&
      Math.abs(event.clientY - lastTableTextPointerHover.y) <= 32
        ? lastTableTextPointerHover
        : null,
    directStartCell = resolveTableTextCellAtPoint(
      event.clientX,
      event.clientY,
      event.target
    ),
    startCell =
      directStartCell instanceof HTMLElement
        ? directStartCell
        : hoverCell?.cell ?? null,
    startCellText = normalizeCellText(startCell),
    scrollAnchor = resolveTableTextDragScrollAnchorFromEvent(
      event,
      startCell instanceof HTMLElement ? startCell : null
    )
  explicitTableTextDragStart =
    startCell instanceof HTMLElement
      ? { cell: startCell, scrollAnchor, x: event.clientX, y: event.clientY }
      : null
  if (explicitTableTextDragStart) {
    cancelAllWindowScrollPreserves()
    preserveWindowScrollPositionAcrossFrames(
      scrollAnchor,
      420,
      4,
      7_000,
      false,
      false,
      true,
      false,
      false,
      shouldCancelTableTextScrollPreserve(scrollAnchor),
      true,
      Number.POSITIVE_INFINITY,
      "table"
    )
  }
  lastSingleCellTextDragStart =
    explicitTableTextDragStart && startCell instanceof HTMLElement
      ? {
          ...explicitTableTextDragStart,
          expiresAt: getNow() + SINGLE_CELL_NATIVE_SELECTION_PRESERVE_MIN_MS,
          identity: createSingleCellTableIdentity(startCell),
          text: startCellText,
        }
      : null
}
const finalizeTableTextSelectionFromPointerCancel = (event: PointerEvent) => {
  const explicitDragStart = explicitTableTextDragStart
  if (
    explicitDragStart &&
    Math.abs(event.clientX - explicitDragStart.x) <= 4 &&
    Math.abs(event.clientY - explicitDragStart.y) <= 4
  )
    return
  if (
    finalizeTableTextSelectionFromPoint(
      event.clientX,
      event.clientY,
      event.target
    )
  )
    return
  if (explicitDragStart) explicitTableTextDragStart = explicitDragStart
}
if (typeof window !== "undefined" && typeof document !== "undefined") {
  const tableSelectionWindow = window as typeof window & {
    __aqTableTextSelectionFinalizerInstalled?: boolean
  }
  if (!tableSelectionWindow.__aqTableTextSelectionFinalizerInstalled) {
    tableSelectionWindow.__aqTableTextSelectionFinalizerInstalled = true
    window.addEventListener(
      "pointerdown",
      rememberExplicitTableTextDragStart,
      true
    )
    window.addEventListener(
      "mousedown",
      rememberExplicitTableTextDragStart,
      true
    )
    window.addEventListener(
      "pointermove",
      preserveExplicitTableTextSelectionFromMoveEvent,
      true
    )
    window.addEventListener(
      "mousemove",
      preserveExplicitTableTextSelectionFromMoveEvent,
      true
    )
    document.addEventListener(
      "selectionchange",
      preserveEscapedTableEndpointSelection,
      true
    )
    window.addEventListener(
      "dragover",
      (event) => {
        if (
          preserveExplicitTableTextSelectionFromPoint(
            event.clientX,
            event.clientY,
            event.target
          )
        )
          event.preventDefault()
      },
      true
    )
    window.addEventListener(
      "dragenter",
      (event) => {
        if (
          preserveExplicitTableTextSelectionFromPoint(
            event.clientX,
            event.clientY,
            event.target
          )
        )
          event.preventDefault()
      },
      true
    )
    window.addEventListener(
      "pointerup",
      (event) =>
        finalizeTableTextSelectionFromPoint(
          event.clientX,
          event.clientY,
          event.target
        ),
      true
    )
    window.addEventListener(
      "pointercancel",
      finalizeTableTextSelectionFromPointerCancel,
      true
    )
    window.addEventListener(
      "mouseup",
      (event) =>
        finalizeTableTextSelectionFromPoint(
          event.clientX,
          event.clientY,
          event.target
        ),
      true
    )
    window.addEventListener(
      "dragend",
      (event) =>
        finalizeTableTextSelectionFromPoint(
          event.clientX,
          event.clientY,
          event.target
        ),
      true
    )
    window.addEventListener(
      "drop",
      (event) =>
        finalizeTableTextSelectionFromPoint(
          event.clientX,
          event.clientY,
          event.target
        ),
      true
    )
  }
}

const normalizeCellText = (cell: Element | null | undefined) =>
  cell?.textContent?.replace(/\s+/g, " ").trim() ?? ""

const resolveCellTable = (cell: HTMLElement | null | undefined) =>
  cell?.closest("table") ?? null
const isConnectedTableCell = (cell: HTMLElement) =>
  cell.isConnected && document.documentElement.contains(cell)
const resolveTableSelectAllRangeCells = (cell: HTMLElement) => {
  const table = resolveCellTable(cell)
  if (!table) return null
  const cells = Array.from(
    table.querySelectorAll<HTMLElement>("th, td")
  ).filter(
    (candidate) =>
      candidate.closest("table") === table && isConnectedTableCell(candidate)
  )
  const startedCell = cells[0]
  const endCell = cells[cells.length - 1]
  return startedCell && endCell ? { endCell, startedCell } : null
}

const resolveCurrentTableTextRangeCells = (
  startedCell: HTMLElement,
  endCell: HTMLElement
) => {
  const startedTable = resolveCellTable(startedCell)
  if (
    isConnectedTableCell(startedCell) &&
    isConnectedTableCell(endCell) &&
    startedTable &&
    resolveCellTable(endCell) === startedTable
  ) {
    return { endCell, startedCell }
  }

  const startedText = normalizeCellText(startedCell)
  const endText = normalizeCellText(endCell)
  const hasStartedText = Boolean(startedText)
  const hasEndText = Boolean(endText)
  const originalCells = startedTable
    ? Array.from(startedTable.querySelectorAll<HTMLElement>("th, td"))
    : []
  const startedIndex = originalCells.indexOf(startedCell)
  const endIndex = originalCells.indexOf(endCell)
  if ((!hasStartedText || !hasEndText) && startedIndex >= 0 && endIndex >= 0) {
    return {
      endCell: originalCells[endIndex],
      startedCell: originalCells[startedIndex],
    }
  }
  for (const table of Array.from(document.querySelectorAll("table"))) {
    const cells = Array.from(table.querySelectorAll<HTMLElement>("th, td"))
    const indexedStartedCell = startedIndex >= 0 ? cells[startedIndex] : null
    const indexedEndCell = endIndex >= 0 ? cells[endIndex] : null
    if (
      indexedStartedCell &&
      indexedEndCell &&
      normalizeCellText(indexedStartedCell) === startedText &&
      normalizeCellText(indexedEndCell) === endText
    ) {
      return { endCell: indexedEndCell, startedCell: indexedStartedCell }
    }

    if (!hasStartedText || !hasEndText) {
      continue
    }

    const textStartedCell = cells.find(
      (cell) => normalizeCellText(cell) === startedText
    )
    const textEndCell = cells.find(
      (cell) => normalizeCellText(cell) === endText
    )
    if (textStartedCell && textEndCell) {
      return { endCell: textEndCell, startedCell: textStartedCell }
    }
  }
  return null
}

const resolveConnectedTableCell = (
  editor: TiptapEditor,
  startedCell: HTMLElement
) => {
  if (startedCell.isConnected && editor.view.dom.contains(startedCell)) {
    return startedCell
  }

  const startedText = normalizeCellText(startedCell)
  if (!startedText) return null

  return (
    Array.from(editor.view.dom.querySelectorAll<HTMLElement>("th, td")).find(
      (candidate) => normalizeCellText(candidate) === startedText
    ) ?? null
  )
}

const resolveOwnedTableRangeEndCell = (
  editor: TiptapEditor,
  startedCell: HTMLElement,
  endCell: HTMLElement | null | undefined
) => {
  if (!endCell) return null
  const currentCell = resolveConnectedTableCell(editor, endCell)
  const startedTable = resolveCellTable(startedCell)
  if (
    !currentCell ||
    !startedTable ||
    resolveCellTable(currentCell) !== startedTable
  ) {
    return null
  }
  return currentCell
}

const resolveTextBoundary = (element: HTMLElement, edge: "end" | "start") => {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  let firstText: Text | null = null
  let lastText: Text | null = null
  while (walker.nextNode()) {
    const textNode = walker.currentNode as Text
    if (!firstText) firstText = textNode
    lastText = textNode
  }
  const textNode = edge === "start" ? firstText : lastText
  if (textNode) {
    return {
      node: textNode,
      offset: edge === "start" ? 0 : textNode.data.length,
    }
  }
  return {
    node: element,
    offset: edge === "start" ? 0 : element.childNodes.length,
  }
}

const isElementBeforeOrSame = (start: HTMLElement, end: HTMLElement) =>
  start === end ||
  Boolean(start.compareDocumentPosition(end) & Node.DOCUMENT_POSITION_FOLLOWING)

export const selectTableCellTextRange = (
  startedCell: HTMLElement,
  endCell: HTMLElement
) => {
  const selection = window.getSelection()
  activeSingleCellNativeTextSelectionCancel?.()
  if (!selection) return ""
  const resolvedCells = resolveCurrentTableTextRangeCells(startedCell, endCell)
  if (!resolvedCells) return ""
  hasActiveTableTextSelection = true
  const range = document.createRange()
  const forward = isElementBeforeOrSame(
    resolvedCells.startedCell,
    resolvedCells.endCell
  )
  const rangeStartCell = forward
      ? resolvedCells.startedCell
      : resolvedCells.endCell,
    rangeEndCell = forward ? resolvedCells.endCell : resolvedCells.startedCell
  const startBoundary = resolveTextBoundary(rangeStartCell, "start")
  const endBoundary = resolveTextBoundary(rangeEndCell, "end")
  range.setStart(startBoundary.node, startBoundary.offset)
  range.setEnd(endBoundary.node, endBoundary.offset)
  selection.removeAllRanges()
  if (typeof selection.setBaseAndExtent === "function")
    selection.setBaseAndExtent(
      startBoundary.node,
      startBoundary.offset,
      endBoundary.node,
      endBoundary.offset
    )
  else selection.addRange(range)
  let nativeSelectedText = selection.toString()
  const rangeSelectedText = range.toString(),
    normalizedNativeSelectedText = nativeSelectedText
      .replace(/\s+/g, " ")
      .trim(),
    normalizedRangeSelectedText = rangeSelectedText.replace(/\s+/g, " ").trim(),
    shouldUseRangeSelection =
      rangeStartCell !== rangeEndCell &&
      Boolean(normalizedRangeSelectedText) &&
      normalizedNativeSelectedText !== normalizedRangeSelectedText
  if (shouldUseRangeSelection) {
    selection.removeAllRanges()
    selection.addRange(range.cloneRange())
    nativeSelectedText = selection.toString()
  }
  const selectedText = shouldUseRangeSelection
    ? rangeSelectedText
    : nativeSelectedText || rangeSelectedText
  resolvedCells.startedCell.setAttribute(
    TABLE_DRAG_SELECTION_TEXT_ATTR,
    selectedText || normalizeCellText(resolvedCells.startedCell)
  )
  document.documentElement.setAttribute(
    TABLE_DRAG_SELECTION_TEXT_ATTR,
    selectedText || normalizeCellText(resolvedCells.startedCell)
  )
  paintTableTextRangeHighlight(range)
  return selectedText
}

const isSelectionInsideSameTable = (
  selection: Selection,
  table: Element | null
) => {
  if (!table) return false
  const anchorElement = resolveElement(selection.anchorNode)
  const focusElement = resolveElement(selection.focusNode)
  return Boolean(
    anchorElement &&
      focusElement &&
      table.contains(anchorElement) &&
      table.contains(focusElement)
  )
}
const isTableCellEndpointSelection = (
  selection: Selection,
  cell: HTMLElement
) => {
  const anchorElement = resolveElement(selection.anchorNode)
  const focusElement = resolveElement(selection.focusNode)
  return Boolean(
    anchorElement &&
      focusElement &&
      cell.contains(anchorElement) &&
      cell.contains(focusElement)
  )
}

const asTableCell = (element: Element | null) =>
  element instanceof HTMLElement ? element : null

type ActiveTableCellPath = {
  tableIndex: number
  rowIndex: number
  cellIndex: number
}

let lastActiveTableCell: HTMLElement | null = null
let lastActiveTableCellPath: ActiveTableCellPath | null = null
let tableAxisSelectionRestoreGeneration = 0
const activeTableCellScrollPreserveCancels = new Set<() => void>()
const activeTableCellSelectionPreserveCancels = new Set<() => void>()
const TABLE_TEXT_DRAG_SCROLL_PRESERVE_FRAMES = 540
const TABLE_TEXT_DRAG_SCROLL_PRESERVE_MIN_MS = 9_000

export const cancelTableAxisSelectionRestore = () => {
  tableAxisSelectionRestoreGeneration += 1
}

export const cancelTableAxisSelectionSurface = () => {
  cancelTableAxisSelectionRestore()
  clearTableStructuralSelectionOwner()
  if (typeof window === "undefined") return
  window.dispatchEvent(new Event(TABLE_AXIS_SELECTION_SURFACE_CANCEL_EVENT))
}

export const getTableAxisSelectionRestoreGeneration = () =>
  tableAxisSelectionRestoreGeneration

export const cancelActiveTableCellScrollPreserves = () => {
  activeTableCellScrollPreserveCancels.forEach((cancel) => cancel())
  activeTableCellScrollPreserveCancels.clear()
}

export const cancelActiveTableCellTextSelectionPreserves = () => {
  lastSingleCellTextDragStart = null
  activeTableCellSelectionPreserveCancels.forEach((cancel) => cancel())
  activeTableCellSelectionPreserveCancels.clear()
  activeSingleCellNativeTextSelectionCancel?.()
  activeTableTextRangePreserveCancel?.()
  clearTableTextRangeHighlight()
  cancelActiveTableCellScrollPreserves()
}

export const clearTableTextSelectionForStructuralSelection = (
  options: {
    clearWindowSelection?: boolean
    markStructuralSelectionOwner?: boolean
  } = {}
) => {
  cancelTableAxisSelectionRestore()
  if (options.markStructuralSelectionOwner === false) {
    clearTableStructuralSelectionOwner()
  } else {
    markTableStructuralSelectionOwner()
  }
  tableTextSelectionClearGeneration += 1
  tableTextSelectionFinalizeSuppressedUntil = getNow() + 180
  clearPendingTableTextSelectionState()
  hasRecentTableTextSelectionContext = false
  cancelActiveTableCellTextSelectionPreserves()
  suppressSingleCellNativeTextSelectionPreserve(1_200)
  cancelAllWindowScrollPreserves()
  cancelTablePointerScrollPreserves()
  shouldClearActiveTableTextSelectionOnBlur = false
  lastTableSelectionExitTarget = null
  clearTableTextRangeHighlight({ markBlur: false })
  document.documentElement.removeAttribute(
    RECENT_TABLE_TEXT_SELECTION_CONTEXT_ATTR
  )
  if (options.clearWindowSelection !== false && typeof window !== "undefined") {
    window.getSelection()?.removeAllRanges()
  }
}

export const clearTableTextSelectionForBlockSelection = (
  options: { clearWindowSelection?: boolean } = {}
) =>
  clearTableTextSelectionForStructuralSelection({
    ...options,
    markStructuralSelectionOwner: false,
  })

const isWindowSelectionInsideEditorTable = (editorRoot: HTMLElement) => {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return false
  const anchorElement = resolveElement(selection.anchorNode)
  const focusElement = resolveElement(selection.focusNode)
  const anchorCell = anchorElement?.closest("th, td")
  const focusCell = focusElement?.closest("th, td")
  const anchorTable = anchorCell?.closest("table")
  return Boolean(
    anchorCell &&
      focusCell &&
      anchorTable &&
      focusCell.closest("table") === anchorTable &&
      editorRoot.contains(anchorTable)
  )
}
const hasTableTextSelectionState = (editorRoot: HTMLElement) =>
  Boolean(
    document.documentElement
      .getAttribute(TABLE_DRAG_SELECTION_TEXT_ATTR)
      ?.trim() || editorRoot.querySelector(TABLE_DRAG_SELECTION_TEXT_SELECTOR)
  ) || isWindowSelectionInsideEditorTable(editorRoot)

const resolveDomElementAtEditorPos = (editor: TiptapEditor, pos: number) => {
  const docSize = editor.state.doc.content.size
  const safePos = Math.max(0, Math.min(docSize, pos))
  try {
    return resolveElement(editor.view.domAtPos(safePos).node)
  } catch {
    return null
  }
}

const isEditorSelectionInsideTable = (editor: TiptapEditor) => {
  const { selection } = editor.state
  if (selection.empty) return false

  const fromElement = resolveDomElementAtEditorPos(editor, selection.from)
  const toElement = resolveDomElementAtEditorPos(
    editor,
    Math.max(selection.from, selection.to - 1)
  )
  return Boolean(fromElement?.closest("th, td") || toElement?.closest("th, td"))
}

const captureActiveTableCellPath = (
  editorRoot: HTMLElement | null | undefined,
  cell: HTMLElement
) => {
  if (!editorRoot) return null
  const table = cell.closest("table")
  const row = cell.closest("tr")
  if (
    !(table instanceof HTMLTableElement) ||
    !(row instanceof HTMLTableRowElement)
  )
    return null
  const tableNodes = Array.from(editorRoot.querySelectorAll("table"))
  const rowNodes = Array.from(table.querySelectorAll("tr"))
  const cellNodes = Array.from(row.querySelectorAll("th, td"))
  const tableIndex = tableNodes.indexOf(table)
  const rowIndex = rowNodes.indexOf(row)
  const cellIndex = cellNodes.indexOf(cell)
  if (tableIndex < 0 || rowIndex < 0 || cellIndex < 0) return null
  return {
    tableIndex,
    rowIndex,
    cellIndex,
  }
}

const resolveActiveTableCellFromPath = (
  editorRoot: HTMLElement | null | undefined,
  path: ActiveTableCellPath | null
) => {
  if (!editorRoot || !path) return null
  const tableNodes = Array.from(editorRoot.querySelectorAll("table"))
  const table = tableNodes[path.tableIndex]
  if (!(table instanceof HTMLTableElement)) return null
  const rowNodes = Array.from(table.querySelectorAll("tr"))
  const row = rowNodes[path.rowIndex]
  if (!(row instanceof HTMLElement)) return null
  const cellNodes = Array.from(row.querySelectorAll("th, td"))
  const cell = cellNodes[path.cellIndex]
  return cell instanceof HTMLElement && editorRoot.contains(cell) ? cell : null
}
export const collapseStaleTableEditorSelection = (
  editor: TiptapEditor,
  pointer?: {
    clientX: number
    clientY: number
    target?: EventTarget | Node | null
  }
) => {
  if (!isEditorSelectionInsideTable(editor)) return false
  const { doc, selection } = editor.state,
    targetElement = resolveElement(pointer?.target),
    pointerTableTarget = Boolean(
      targetElement?.closest("th, td, table, .tableWrapper, .aq-table-shell")
    ),
    pointerPos =
      pointer && !pointerTableTarget
        ? editor.view.posAtCoords({
            left: pointer.clientX,
            top: pointer.clientY,
          })?.pos ?? null
        : null
  if (
    pointer &&
    !pointerTableTarget &&
    (pendingSingleCellNativeTextSelection ||
      lastObservedSingleCellNativeTextSelection ||
      isWindowSelectionInsideEditorTable(editor.view.dom))
  )
    suppressSingleCellNativeTextSelectionPreserve()
  const collapsePos = Math.max(
    0,
    Math.min(doc.content.size, pointerPos ?? selection.to)
  )
  try {
    const nextSelection = createSafeTextSelectionOutsideTable(
      doc,
      collapsePos,
      pointerPos === null ? -1 : 1
    )
    if (!nextSelection) return false
    editor.view.dispatch(editor.state.tr.setSelection(nextSelection))
    if (editor.view.dom instanceof HTMLElement) {
      editor.view.dom.focus({ preventScroll: true })
    }
    return true
  } catch {
    return false
  }
}

export const watchTableCellTextSelectionExternalClear = (
  editorRoot: HTMLElement,
  isDragActive: () => boolean,
  onExternalClear: () => void
) => {
  let hadTableTextSelectionState = false
  let clearRafId: number | null = null
  const reset = () => {
    hadTableTextSelectionState = false
  }
  const markActive = () => {
    hadTableTextSelectionState = true
  }
  const cancelIfCleared = () => {
    if (hasTableTextSelectionState(editorRoot)) {
      markActive()
      return false
    }
    if (!hadTableTextSelectionState || isDragActive()) return false
    reset()
    onExternalClear()
    return true
  }
  const scheduleClearCheck = () => {
    if (clearRafId !== null) return
    clearRafId = window.requestAnimationFrame(() => {
      clearRafId = null
      cancelIfCleared()
    })
  }
  const observer =
    typeof MutationObserver !== "undefined"
      ? new MutationObserver((records) => {
          if (
            !hadTableTextSelectionState &&
            hasTableTextSelectionState(editorRoot)
          ) {
            markActive()
            return
          }
          if (!hadTableTextSelectionState) return
          if (
            records.some(
              (record) =>
                record.type === "attributes" &&
                record.attributeName === TABLE_DRAG_SELECTION_TEXT_ATTR
            )
          ) {
            scheduleClearCheck()
          }
        })
      : null
  observer?.observe(editorRoot, {
    attributeFilter: [TABLE_DRAG_SELECTION_TEXT_ATTR],
    attributes: true,
    subtree: true,
  })
  observer?.observe(document.documentElement, {
    attributeFilter: [TABLE_DRAG_SELECTION_TEXT_ATTR],
    attributes: true,
  })
  return {
    cancelIfCleared,
    dispose: () => {
      observer?.disconnect()
      if (clearRafId !== null) window.cancelAnimationFrame(clearRafId)
    },
    markActive,
    reset,
  }
}

const hasOwnedTableCellTextSelection = (
  editor: TiptapEditor,
  startedCell: HTMLElement
) => {
  const currentCell = resolveConnectedTableCell(editor, startedCell)
  if (!currentCell) return false
  if (currentCell.getAttribute(TABLE_DRAG_SELECTION_TEXT_ATTR)?.trim()) {
    return true
  }

  const selection = window.getSelection()
  if (!selection?.toString().trim()) return false
  return isSelectionInsideSameTable(selection, resolveCellTable(currentCell))
}

const clearOwnedTableCellDragSelectionText = (
  editor: TiptapEditor,
  startedCell: HTMLElement
) => {
  resolveConnectedTableCell(editor, startedCell)?.removeAttribute(
    TABLE_DRAG_SELECTION_TEXT_ATTR
  )
  clearTableDragSelectionTextAttributes()
}

export const rememberActiveTableCellFromTarget = (
  eventTarget: EventTarget | Node | null | undefined,
  editorRoot?: HTMLElement | null
) => {
  if (editorRoot && editorRoot !== lastTableSelectionRoot) {
    lastTableSelectionRoot = editorRoot
    shouldClearActiveTableTextSelectionOnBlur = false
    hasActiveTableTextSelection = false
  }
  const targetElement = resolveElement(eventTarget)
  const cell = targetElement?.closest("th, td")
  if (
    cell instanceof HTMLElement &&
    (!editorRoot || editorRoot.contains(cell))
  ) {
    shouldClearActiveTableTextSelectionOnBlur = false
    lastTableSelectionExitTarget = null
    lastActiveTableCell = cell
    lastActiveTableCellPath = captureActiveTableCellPath(editorRoot, cell)
    return
  }
  if (!editorRoot || !targetElement || !editorRoot.contains(targetElement)) {
    return
  }

  const currentTable = targetElement.closest("table")
  if (!currentTable) {
    if (targetElement === editorRoot) {
      return
    }
    const currentCodeShell = targetElement.closest(".aq-code-shell")
    if (currentCodeShell) {
      hasRecentTableTextSelectionContext = false
      lastTableSelectionExitTarget = null
      document.documentElement.removeAttribute(
        RECENT_TABLE_TEXT_SELECTION_CONTEXT_ATTR
      )
    }
    if (
      !currentCodeShell &&
      (hasActiveTableTextSelection ||
        hasRecentTableTextSelectionContext ||
        document.documentElement.hasAttribute(
          RECENT_TABLE_TEXT_SELECTION_CONTEXT_ATTR
        ) ||
        hasTableTextSelectionState(editorRoot) ||
        lastActiveTableCell ||
        lastActiveTableCellPath)
    ) {
      shouldClearActiveTableTextSelectionOnBlur = true
      lastTableSelectionExitTarget = targetElement
    }
    lastActiveTableCell = null
    lastActiveTableCellPath = null
    return
  }

  const existingCell = lastActiveTableCell?.isConnected
    ? lastActiveTableCell
    : null
  if (!existingCell || existingCell.closest("table") !== currentTable) {
    lastActiveTableCell = null
    lastActiveTableCellPath = null
  }
}

export const selectActiveTableCellText = (
  editor: TiptapEditor,
  eventTarget: EventTarget | null
) => {
  if (typeof window === "undefined" || typeof document === "undefined")
    return false
  const selection = window.getSelection()
  if (!selection) return false

  const activeElement = resolveElement(document.activeElement)
  const anchorElement = resolveElement(selection.anchorNode)
  const focusElement = resolveElement(selection.focusNode)
  const targetElement = resolveElement(eventTarget)
  const hasDirectTableCellContext = Boolean(
    targetElement?.closest("th, td") ||
      anchorElement?.closest("th, td") ||
      focusElement?.closest("th, td")
  )
  const rememberedTableCellCandidate = lastActiveTableCell?.isConnected
    ? lastActiveTableCell
    : resolveActiveTableCellFromPath(editor.view.dom, lastActiveTableCellPath)
  if (
    !rememberedTableCellCandidate &&
    (targetElement?.closest(".aq-code-shell") ||
      anchorElement?.closest(".aq-code-shell") ||
      focusElement?.closest(".aq-code-shell") ||
      (!hasDirectTableCellContext && activeElement?.closest(".aq-code-shell")))
  ) {
    return false
  }

  const tableSelectionCandidate = resolveActiveTableCellFromPath(
    editor.view.dom,
    lastActiveTableCellPath
  )
  const rememberedCell = lastActiveTableCell?.isConnected
    ? lastActiveTableCell
    : tableSelectionCandidate
  const anchorCell = asTableCell(anchorElement?.closest("th, td") || null)
  const isEditorSelectionInsideCurrentTable =
    isEditorSelectionInsideTable(editor)
  const targetTable = targetElement?.closest("table")
  const activeTable = activeElement?.closest("table")
  const focusTable = focusElement?.closest("table")
  const rememberedTable = rememberedCell?.closest("table")
  const isSelectionInsideActiveTable = isWindowSelectionInsideEditorTable(
    editor.view.dom
  )
  const editorRoot = editor.view.dom,
    now = getNow(),
    pointHoverCell =
      lastTableTextPointerHover &&
      lastTableTextPointerHover.expiresAt > now &&
      lastTableTextPointerHover.cell.isConnected &&
      editorRoot.contains(lastTableTextPointerHover.cell) &&
      resolveTableTextCellAtPoint(
        lastTableTextPointerHover.x,
        lastTableTextPointerHover.y,
        lastTableTextPointerHover.cell
      ) === lastTableTextPointerHover.cell
        ? lastTableTextPointerHover.cell
        : null,
    recentClickCell =
      lastSingleCellTextDragStart &&
      lastSingleCellTextDragStart.expiresAt > now &&
      lastSingleCellTextDragStart.cell.isConnected &&
      editorRoot.contains(lastSingleCellTextDragStart.cell)
        ? lastSingleCellTextDragStart.cell
        : null
  const activeCell = asTableCell(activeElement?.closest("th, td") || null),
    targetCell = asTableCell(targetElement?.closest("th, td") || null),
    focusCell = asTableCell(focusElement?.closest("th, td") || null),
    hoverCell = asTableCell(
      editor.view.dom.querySelector("th:hover, td:hover") ||
        pointHoverCell ||
        recentClickCell
    )
  const hasTableSelectionState = hasTableTextSelectionState(editor.view.dom)
  const clearStaleTableTextSelection = (exitTarget?: Element | null) => {
    shouldClearActiveTableTextSelectionOnBlur = false
    hasActiveTableTextSelection = false
    hasRecentTableTextSelectionContext = false
    lastTableSelectionExitTarget = null
    document.documentElement.removeAttribute(
      RECENT_TABLE_TEXT_SELECTION_CONTEXT_ATTR
    )
    const outsideParagraph =
      exitTarget?.closest("p") ||
      targetElement?.closest("p") ||
      (!anchorElement?.closest("table") ? anchorElement?.closest("p") : null) ||
      (!focusElement?.closest("table") ? focusElement?.closest("p") : null) ||
      activeElement?.closest("p")
    selection.removeAllRanges()
    clearTableTextRangeHighlight()
    if (outsideParagraph) {
      const paragraphRange = document.createRange()
      paragraphRange.selectNodeContents(outsideParagraph)
      selection.addRange(paragraphRange)
    }
  }
  const exitTarget =
    lastTableSelectionExitTarget?.isConnected &&
    editor.view.dom.contains(lastTableSelectionExitTarget) &&
    !lastTableSelectionExitTarget.closest("table") &&
    !lastTableSelectionExitTarget.closest(".aq-code-shell")
      ? lastTableSelectionExitTarget
      : null
  if (
    shouldClearActiveTableTextSelectionOnBlur &&
    exitTarget &&
    !(targetCell || anchorCell || focusCell || activeCell || hoverCell)
  ) {
    clearStaleTableTextSelection(exitTarget)
    return true
  }
  if (
    targetCell ||
    anchorCell ||
    focusCell ||
    activeCell ||
    hoverCell ||
    isSelectionInsideActiveTable
  ) {
    shouldClearActiveTableTextSelectionOnBlur = false
  }
  const hasActiveCellContext = Boolean(
    !shouldClearActiveTableTextSelectionOnBlur &&
      activeCell &&
      activeTable &&
      (activeTable === targetTable || activeTable === focusTable)
  )
  const hasExplicitTableContext = Boolean(
    targetCell ||
      hoverCell ||
      hasActiveCellContext ||
      targetTable ||
      (!shouldClearActiveTableTextSelectionOnBlur && focusCell)
  )
  const hasTableContext = Boolean(
    targetTable ||
      targetCell ||
      hoverCell ||
      (!shouldClearActiveTableTextSelectionOnBlur &&
        (hasActiveCellContext || focusTable || activeTable))
  )
  const hasRecoveredTableContext = Boolean(
    (isSelectionInsideActiveTable || isEditorSelectionInsideCurrentTable) &&
      hasTableContext &&
      rememberedTable &&
      (!targetTable || targetTable === rememberedTable) &&
      !shouldClearActiveTableTextSelectionOnBlur
  )
  const hasRememberedTableContext = Boolean(
    rememberedCell &&
      rememberedTable &&
      (!targetTable || targetTable === rememberedTable) &&
      !shouldClearActiveTableTextSelectionOnBlur
  )
  const hasTableSelectionContext = Boolean(
    hasExplicitTableContext ||
      hasRecoveredTableContext ||
      hasRememberedTableContext
  )
  if (
    !hasTableSelectionContext &&
    (hasTableSelectionState || shouldClearActiveTableTextSelectionOnBlur)
  ) {
    clearStaleTableTextSelection()
    return true
  }
  const selectedCell =
    targetCell ??
    hoverCell ??
    (!shouldClearActiveTableTextSelectionOnBlur ? focusCell : null) ??
    ((isSelectionInsideActiveTable || isEditorSelectionInsideCurrentTable) &&
    hasExplicitTableContext
      ? activeCell
      : null) ??
    ((isSelectionInsideActiveTable || isEditorSelectionInsideCurrentTable) &&
    hasExplicitTableContext
      ? anchorCell
      : null) ??
    (hasTableSelectionContext
      ? tableSelectionCandidate ?? rememberedCell
      : null) ??
    null
  if (
    !selectedCell &&
    hasTableSelectionContext &&
    !tableSelectionCandidate &&
    !rememberedCell
  ) {
    return false
  }
  if (!selectedCell && !hasTableSelectionContext) {
    return false
  }
  if (!selectedCell && tableSelectionCandidate) {
    lastActiveTableCell = tableSelectionCandidate
  }
  if (!selectedCell || !selectedCell.isConnected) {
    return false
  }

  if (!editor.view.dom.contains(selectedCell)) return false
  if (activeCell && !activeCell.isConnected) return false

  const tableRangeCells = resolveTableSelectAllRangeCells(selectedCell)
  if (!tableRangeCells) return false
  cancelAllWindowScrollPreserves()
  cancelActiveTableCellTextSelectionPreserves()
  cancelTablePointerScrollPreserves()
  clearNextEditorPointerAfterTable()
  preserveWindowScrollForTableSelectAll()
  selectTableCellTextRange(tableRangeCells.startedCell, tableRangeCells.endCell)
  hasActiveTableTextSelection = true
  hasRecentTableTextSelectionContext = true
  document.documentElement.setAttribute(
    RECENT_TABLE_TEXT_SELECTION_CONTEXT_ATTR,
    "true"
  )
  return true
}

export const restoreTableCellTextSelectionIfEscaped = (
  editor: TiptapEditor,
  startedCell: HTMLElement | null,
  scrollAnchor?: WindowScrollAnchor | null,
  restoreWhenEmpty = false,
  forceStartedCellSelection = false,
  preserveFallbackScroll = true,
  endCell: HTMLElement | null = null
) => {
  if (typeof window === "undefined" || typeof document === "undefined")
    return false
  if (isTableStructuralSelectionOwnerActive()) return false
  if (editor.state.selection instanceof NodeSelection) return false
  if (!startedCell) return false
  const currentCell = resolveConnectedTableCell(editor, startedCell)
  if (!currentCell) return false
  const rangeEndCell = resolveOwnedTableRangeEndCell(
    editor,
    currentCell,
    endCell
  )

  const selection = window.getSelection()
  if (!selection) return false

  const hasTextSelection = selection.toString().trim().length > 0
  const table = resolveCellTable(currentCell)
  const isOwnedTableSelection = isSelectionInsideSameTable(selection, table)
  if (
    hasTextSelection &&
    (isOwnedTableSelection ||
      isTableCellEndpointSelection(selection, currentCell))
  ) {
    currentCell.setAttribute(
      TABLE_DRAG_SELECTION_TEXT_ATTR,
      selection.toString()
    )
    clearNextEditorPointerAfterTable()
    if (
      !forceStartedCellSelection ||
      !rangeEndCell ||
      rangeEndCell === currentCell
    ) {
      return true
    }
  }
  if (!hasTextSelection && !restoreWhenEmpty) return false

  let restoredRangeText = ""
  if (rangeEndCell && rangeEndCell !== currentCell) {
    restoredRangeText = selectTableCellTextRange(currentCell, rangeEndCell)
  } else {
    const range = document.createRange()
    range.selectNodeContents(currentCell)
    selection.removeAllRanges()
    selection.addRange(range)
  }
  currentCell.setAttribute(
    TABLE_DRAG_SELECTION_TEXT_ATTR,
    restoredRangeText || selection.toString() || normalizeCellText(currentCell)
  )
  clearNextEditorPointerAfterTable()
  if (scrollAnchor) {
    const cancelScrollPreserve = preserveWindowScrollPositionAcrossFrames(
      scrollAnchor,
      TABLE_TEXT_DRAG_SCROLL_PRESERVE_FRAMES,
      4,
      TABLE_TEXT_DRAG_SCROLL_PRESERVE_MIN_MS,
      true,
      false,
      true,
      true,
      false,
      () =>
        shouldCancelTableTextScrollPreserve(scrollAnchor)() ||
        !hasOwnedTableCellTextSelection(editor, startedCell)
    )
    if (cancelScrollPreserve) {
      activeTableCellScrollPreserveCancels.add(cancelScrollPreserve)
      window.setTimeout(
        () => activeTableCellScrollPreserveCancels.delete(cancelScrollPreserve),
        TABLE_TEXT_DRAG_SCROLL_PRESERVE_MIN_MS + 250
      )
    }
  } else if (preserveFallbackScroll) {
    preserveWindowScrollForRichBlockSelectAll()
  }
  return true
}

export const preserveTableCellTextSelectionAcrossFrames = (
  editor: TiptapEditor,
  startedCell: HTMLElement,
  scrollAnchor: WindowScrollAnchor,
  resolveEndCell?: () => HTMLElement | null
) => {
  if (isTableStructuralSelectionOwnerActive()) return null
  const startedAt =
    typeof performance !== "undefined" ? performance.now() : Date.now()
  const clearGeneration = tableTextSelectionClearGeneration
  let frame = 0
  let cancelled = false,
    restoring = false,
    lastUserScrollIntentAt = 0
  const cancelScrollPreserve = preserveWindowScrollPositionAcrossFrames(
    scrollAnchor,
    TABLE_TEXT_DRAG_SCROLL_PRESERVE_FRAMES,
    4,
    TABLE_TEXT_DRAG_SCROLL_PRESERVE_MIN_MS,
    false,
    false,
    true,
    false,
    false,
    () =>
      shouldCancelTableTextScrollPreserve(scrollAnchor)() ||
      !hasOwnedTableCellTextSelection(editor, startedCell)
  )
  if (cancelScrollPreserve) {
    activeTableCellScrollPreserveCancels.add(cancelScrollPreserve)
  }
  const cleanup = () => {
    activeTableCellSelectionPreserveCancels.delete(cancel)
    if (cancelScrollPreserve) {
      activeTableCellScrollPreserveCancels.delete(cancelScrollPreserve)
      cancelScrollPreserve()
    }
    window.removeEventListener("pointerdown", cancel, true)
    window.removeEventListener("mousedown", cancel, true)
    window.removeEventListener("wheel", cancel, true)
    window.removeEventListener("keydown", cancel, true)
    window.removeEventListener("touchstart", rememberUserScrollIntent, true)
    window.removeEventListener("touchmove", rememberUserScrollIntent, true)
    window.removeEventListener("scroll", cancelIfRecentUserScrollIntent, true)
    document.removeEventListener(
      "selectionchange",
      cancelIfSelectionLeavesCell,
      true
    )
  }
  const cancel = () => {
    cancelled = true
    clearOwnedTableCellDragSelectionText(editor, startedCell)
    cancelActiveTableCellScrollPreserves()
    cleanup()
  }
  const rememberUserScrollIntent = () => {
    lastUserScrollIntentAt = getNow()
  }
  const cancelIfRecentUserScrollIntent = () => {
    if (lastUserScrollIntentAt && getNow() - lastUserScrollIntentAt <= 350)
      cancel()
  }
  const cancelIfSelectionLeavesCell = () => {
    if (restoring || cancelled) return
    const currentCell = resolveConnectedTableCell(editor, startedCell)
    if (!currentCell) {
      cancel()
      return
    }
    const selection = window.getSelection()
    const selectionText = selection?.toString().trim() ?? ""
    if (!selection || !selectionText) {
      cancel()
      return
    }
    if (!isSelectionInsideSameTable(selection, resolveCellTable(currentCell))) {
      cancel()
    }
  }
  window.addEventListener("pointerdown", cancel, { capture: true, once: true })
  window.addEventListener("mousedown", cancel, { capture: true, once: true })
  window.addEventListener("wheel", cancel, {
    capture: true,
    passive: true,
    once: true,
  })
  window.addEventListener("keydown", cancel, { capture: true, once: true })
  window.addEventListener("touchstart", rememberUserScrollIntent, {
    capture: true,
    passive: true,
  })
  window.addEventListener("touchmove", rememberUserScrollIntent, {
    capture: true,
    passive: true,
  })
  window.addEventListener("scroll", cancelIfRecentUserScrollIntent, {
    capture: true,
    passive: true,
  })
  document.addEventListener(
    "selectionchange",
    cancelIfSelectionLeavesCell,
    true
  )
  activeTableCellSelectionPreserveCancels.add(cancel)
  const restore = () => {
    if (cancelled) return
    if (isTableStructuralSelectionOwnerActive()) {
      cancel()
      return
    }
    if (!isTableTextSelectionClearGenerationCurrent(clearGeneration)) {
      cancel()
      return
    }
    if (frame > 0 && !hasOwnedTableCellTextSelection(editor, startedCell)) {
      cancel()
      return
    }
    restoring = true
    const restored = restoreTableCellTextSelectionIfEscaped(
      editor,
      startedCell,
      null,
      true,
      true,
      false,
      resolveEndCell?.() ?? null
    )
    restoring = false
    if (!restored) {
      cancel()
      return
    }
    frame += 1
    const elapsedMs =
      (typeof performance !== "undefined" ? performance.now() : Date.now()) -
      startedAt
    const currentCell = resolveConnectedTableCell(editor, startedCell)
    if (
      currentCell &&
      (frame < TABLE_TEXT_DRAG_SCROLL_PRESERVE_FRAMES ||
        elapsedMs < TABLE_TEXT_DRAG_SCROLL_PRESERVE_MIN_MS)
    ) {
      window.requestAnimationFrame(restore)
    } else {
      cleanup()
    }
  }
  restore()
  return cancel
}
