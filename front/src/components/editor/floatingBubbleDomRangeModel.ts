import {
  resolveFloatingBubbleStateFromCoords,
  type FloatingBubbleState,
} from "./useFloatingBubbleState"

const resolveElement = (node: Node | null | undefined) =>
  node instanceof Element ? node : node?.parentElement ?? null

const normalizeText = (value: string | null | undefined) => value?.replace(/\s+/g, " ").trim() ?? ""

const resolveTextBoundary = (element: HTMLElement, edge: "end" | "start") => {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  let firstText: Text | null = null
  let lastText: Text | null = null
  while (walker.nextNode()) {
    const textNode = walker.currentNode as Text
    firstText ??= textNode
    lastText = textNode
  }
  const textNode = edge === "start" ? firstText : lastText
  return textNode
    ? { node: textNode, offset: edge === "start" ? 0 : textNode.data.length }
    : { node: element, offset: edge === "start" ? 0 : element.childNodes.length }
}

const isBeforeOrSame = (start: HTMLElement, end: HTMLElement) =>
  start === end || Boolean(start.compareDocumentPosition(end) & Node.DOCUMENT_POSITION_FOLLOWING)

const createCellRange = (startCell: HTMLElement, endCell: HTMLElement) => {
  const range = document.createRange()
  const forward = isBeforeOrSame(startCell, endCell)
  const rangeStartCell = forward ? startCell : endCell
  const rangeEndCell = forward ? endCell : startCell
  const startBoundary = resolveTextBoundary(rangeStartCell, "start")
  const endBoundary = resolveTextBoundary(rangeEndCell, "end")
  range.setStart(startBoundary.node, startBoundary.offset)
  range.setEnd(endBoundary.node, endBoundary.offset)
  return range
}

const findPersistedSelectionCell = (editorRoot: HTMLElement) => {
  const selectionMarkers = Array.from(
    editorRoot.querySelectorAll<HTMLElement>("[data-table-drag-selection-text]")
  )
  for (const marker of selectionMarkers) {
    const cell = marker.matches("th, td") ? marker : marker.closest("th, td")
    if (cell instanceof HTMLElement) return cell
  }
  return null
}

const findRangeWithTextInTable = (table: HTMLTableElement, persistedText: string) => {
  const cells = Array.from(table.querySelectorAll<HTMLElement>("th, td"))
  const cellTexts = cells.map((cell) => normalizeText(cell.innerText || cell.textContent))
  for (let startIndex = 0; startIndex < cells.length; startIndex += 1) {
    let joinedCellText = ""
    for (let endIndex = startIndex; endIndex < cells.length; endIndex += 1) {
      const range = createCellRange(cells[startIndex], cells[endIndex])
      const rangeText = normalizeText(range.toString())
      joinedCellText = normalizeText(`${joinedCellText} ${cellTexts[endIndex]}`)
      if (rangeText === persistedText || joinedCellText === persistedText) return range
      if (rangeText.length > persistedText.length && !rangeText.includes(persistedText)) break
    }
  }
  return null
}

const resolvePersistedTableSelectionRange = (editorRoot: HTMLElement) => {
  const persistedText = normalizeText(document.documentElement.getAttribute("data-table-drag-selection-text"))
  const startCell = findPersistedSelectionCell(editorRoot)
  const table = startCell?.closest("table")
  if (!persistedText) return null
  if (startCell && table) {
    const cells = Array.from(table.querySelectorAll<HTMLElement>("th, td"))
    for (const endCell of cells) {
      const range = createCellRange(startCell, endCell)
      if (normalizeText(range.toString()) === persistedText) return range
    }
  }
  for (const candidateTable of Array.from(editorRoot.querySelectorAll<HTMLTableElement>("table"))) {
    const range = findRangeWithTextInTable(candidateTable, persistedText)
    if (range) return range
  }
  return null
}

const resolveBubbleStateFromRange = (range: Range) => {
  const rangeRects = Array.from(range.getClientRects()).filter(
    (rect) => rect.width > 1 && rect.height > 1
  )
  const startRect = rangeRects[0] ?? range.getBoundingClientRect()
  const endRect = rangeRects[rangeRects.length - 1] ?? startRect
  if (startRect.width <= 1 || startRect.height <= 1) return null
  return resolveFloatingBubbleStateFromCoords("text", startRect, endRect)
}

export const resolveMultiCellTableDomSelectionBubbleState = (
  editorRoot: HTMLElement,
  codeBlockSelector: string
): FloatingBubbleState | null => {
  if (typeof window === "undefined") return null
  const domSelection = window.getSelection()
  const range = domSelection && domSelection.rangeCount > 0 ? domSelection.getRangeAt(0) : null
  const commonAncestor = resolveElement(range?.commonAncestorContainer)
  if (
    !range ||
    !domSelection ||
    domSelection.isCollapsed ||
    !commonAncestor ||
    !editorRoot.contains(commonAncestor) ||
    commonAncestor.closest(codeBlockSelector)
  ) {
    return null
  }

  const anchorCell = resolveElement(domSelection.anchorNode)?.closest("th, td")
  const focusCell = resolveElement(domSelection.focusNode)?.closest("th, td")
  if (!anchorCell || !focusCell || anchorCell === focusCell || anchorCell.closest("table") !== focusCell.closest("table")) {
    return null
  }

  return resolveBubbleStateFromRange(range)
}

export const resolvePersistedTableTextSelectionBubbleState = (
  editorRoot: HTMLElement
): FloatingBubbleState | null => {
  const range = resolvePersistedTableSelectionRange(editorRoot)
  if (!range) return null
  const selection = window.getSelection()
  const rangeTable = resolveElement(range.commonAncestorContainer)?.closest("table")
  const anchorElement = resolveElement(selection?.anchorNode)
  const focusElement = resolveElement(selection?.focusNode)
  const selectionInsideRangeTable = Boolean(
    rangeTable &&
      anchorElement &&
      focusElement &&
      rangeTable.contains(anchorElement) &&
      rangeTable.contains(focusElement)
  )
  const selectedText = selection?.toString().trim() ?? ""
  if (selection && selectedText && !selection.isCollapsed && selectionInsideRangeTable && selection.rangeCount > 0) {
    return resolveBubbleStateFromRange(selection.getRangeAt(0))
  }
  if (selectedText && !selection?.isCollapsed && !selectionInsideRangeTable) return null
  if (selection && (!selectedText || selection.isCollapsed)) {
    selection.removeAllRanges()
    if (typeof selection.setBaseAndExtent === "function") {
      selection.setBaseAndExtent(range.startContainer, range.startOffset, range.endContainer, range.endOffset)
    } else {
      selection.addRange(range)
    }
  }
  return resolveBubbleStateFromRange(range)
}
