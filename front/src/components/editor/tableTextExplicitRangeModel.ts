type TableTextRangeCells = {
  anchorCell: HTMLElement
  pointCell: HTMLElement
}

let recentExplicitTableTextRangeCells:
  | (TableTextRangeCells & { expiresAt: number })
  | null = null

const getNow = () =>
  typeof performance !== "undefined" ? performance.now() : Date.now()

const getFreshRecentExplicitTableTextRange = () =>
  recentExplicitTableTextRangeCells &&
  recentExplicitTableTextRangeCells.expiresAt > getNow() &&
  recentExplicitTableTextRangeCells.anchorCell.isConnected &&
  recentExplicitTableTextRangeCells.pointCell.isConnected
    ? recentExplicitTableTextRangeCells
    : null

const normalizeCellText = (cell: Element | null | undefined) =>
  cell?.textContent?.replace(/\s+/g, " ").trim() ?? ""

const isBeforeOrSame = (start: HTMLElement, end: HTMLElement) =>
  start === end ||
  Boolean(start.compareDocumentPosition(end) & Node.DOCUMENT_POSITION_FOLLOWING)

export const clearRecentExplicitTableTextRange = () => {
  recentExplicitTableTextRangeCells = null
}

export const rememberRecentExplicitTableTextRange = (
  rangeCells: TableTextRangeCells
) => {
  const recentRange = getFreshRecentExplicitTableTextRange()
  if (
    recentRange &&
    recentRange.anchorCell.closest("table") === rangeCells.anchorCell.closest("table")
  ) {
    const cells = [
      recentRange.anchorCell,
      recentRange.pointCell,
      rangeCells.anchorCell,
      rangeCells.pointCell,
    ].sort((left, right) => (isBeforeOrSame(left, right) ? -1 : 1))
    rangeCells = { anchorCell: cells[0], pointCell: cells[cells.length - 1] }
  }
  recentExplicitTableTextRangeCells = {
    ...rangeCells,
    expiresAt: getNow() + 2_400,
  }
  return rangeCells
}

export const resolveRecentExplicitTableTextRange = (
  directRangeCells: TableTextRangeCells | null
) => {
  const recentRange = getFreshRecentExplicitTableTextRange()
  return recentRange &&
    (!directRangeCells ||
      directRangeCells.anchorCell.closest("table") ===
        recentRange.anchorCell.closest("table"))
    ? recentRange
    : null
}

export const restoreRecentExplicitTableTextRangeIfEndpointMissing = (
  selection: Selection,
  selectRange: (anchorCell: HTMLElement, pointCell: HTMLElement) => string,
  preserveRange: (anchorCell: HTMLElement, pointCell: HTMLElement) => unknown
) => {
  const recentRange = getFreshRecentExplicitTableTextRange()
  if (!recentRange) return false
  const table = recentRange.anchorCell.closest("table"),
    selectionText = selection.toString().replace(/\s+/g, " ").trim(),
    anchorText = normalizeCellText(recentRange.anchorCell),
    pointText = normalizeCellText(recentRange.pointCell)
  if (
    !table ||
    recentRange.pointCell.closest("table") !== table ||
    !(
      (anchorText && !selectionText.includes(anchorText)) ||
      (pointText && !selectionText.includes(pointText))
    )
  )
    return false
  selectRange(recentRange.anchorCell, recentRange.pointCell)
  preserveRange(recentRange.anchorCell, recentRange.pointCell)
  return true
}
