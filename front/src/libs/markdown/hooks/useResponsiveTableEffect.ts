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

      const bodyRows =
        table.tBodies.length > 0
          ? Array.from(table.tBodies).flatMap((section) => Array.from(section.rows))
          : Array.from(table.querySelectorAll<HTMLTableRowElement>("tr")).filter((row) => {
              if (row.closest("thead")) return false
              return Array.from(row.cells).some((cell) => cell.tagName === "TD")
            })

      bodyRows.forEach((row) => {
        const cells = Array.from(row.children).filter((child): child is HTMLTableCellElement => {
          return child instanceof HTMLTableCellElement && (child.tagName === "TD" || child.tagName === "TH")
        })
        cells.forEach((cell, index) => {
          const label = labels[index] || `항목 ${index + 1}`
          cell.setAttribute("data-label", label)
        })
      })
    })
  }, [contentKey, rootRef])
}

export default useResponsiveTableEffect
