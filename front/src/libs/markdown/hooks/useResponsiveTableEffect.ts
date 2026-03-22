import { RefObject, useEffect } from "react"

const normalizeHeaderLabel = (value: string, index: number) => {
  const trimmed = value.trim()
  if (!trimmed) return `항목 ${index + 1}`
  return trimmed
}

const useResponsiveTableEffect = (rootRef?: RefObject<HTMLElement>, contentKey?: string) => {
  useEffect(() => {
    const root = rootRef?.current
    if (!root) return

    const tables = Array.from(root.querySelectorAll<HTMLTableElement>("table"))
    tables.forEach((table) => {
      table.classList.add("aq-table-responsive")

      const headCells = Array.from(table.querySelectorAll<HTMLTableCellElement>("thead th"))
      const fallbackHeadCells =
        headCells.length > 0
          ? headCells
          : Array.from(table.querySelectorAll<HTMLTableCellElement>("tr:first-of-type th"))
      const labels = fallbackHeadCells.map((cell, index) =>
        normalizeHeaderLabel(cell.textContent || "", index)
      )

      const bodyRows = Array.from(table.querySelectorAll<HTMLTableRowElement>("tbody tr"))
      bodyRows.forEach((row) => {
        const cells = Array.from(row.querySelectorAll<HTMLTableCellElement>("td"))
        cells.forEach((cell, index) => {
          const label = labels[index] || `항목 ${index + 1}`
          cell.setAttribute("data-label", label)
        })
      })
    })
  }, [contentKey, rootRef])
}

export default useResponsiveTableEffect
