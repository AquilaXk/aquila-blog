import { RefObject, useEffect } from "react"

const normalizeHeaderLabel = (value: string, index: number) => {
  const trimmed = value.trim()
  if (!trimmed) return `항목 ${index + 1}`
  return trimmed
}

const buildHeaderLabels = (table: HTMLTableElement) => {
  const headRows = table.tHead ? Array.from(table.tHead.rows) : []
  if (!headRows.length) {
    const fallbackHeadCells = Array.from(table.querySelectorAll<HTMLTableCellElement>("tr:first-of-type th"))
    return fallbackHeadCells.map((cell, index) => normalizeHeaderLabel(cell.textContent || "", index))
  }

  const matrix: string[][] = []
  let maxColumns = 0

  headRows.forEach((row, rowIndex) => {
    matrix[rowIndex] ||= []
    let colIndex = 0

    Array.from(row.cells).forEach((cell) => {
      const colSpan = Math.max(1, cell.colSpan || 1)
      const rowSpan = Math.max(1, cell.rowSpan || 1)
      const label = normalizeHeaderLabel(cell.textContent || "", colIndex)

      while (matrix[rowIndex][colIndex] !== undefined) {
        colIndex += 1
      }

      for (let r = rowIndex; r < rowIndex + rowSpan; r += 1) {
        matrix[r] ||= []
        for (let c = colIndex; c < colIndex + colSpan; c += 1) {
          matrix[r][c] = label
        }
      }

      colIndex += colSpan
      maxColumns = Math.max(maxColumns, colIndex)
    })
  })

  return Array.from({ length: maxColumns }, (_, columnIndex) => {
    const path = matrix
      .map((row) => (row[columnIndex] || "").trim())
      .filter(Boolean)
      .filter((value, index, source) => index === 0 || value !== source[index - 1])

    if (!path.length) return `항목 ${columnIndex + 1}`
    return path.join(" · ")
  })
}

const useResponsiveTableEffect = (rootRef?: RefObject<HTMLElement>, contentKey?: string) => {
  useEffect(() => {
    const root = rootRef?.current
    if (!root) return

    const tables = Array.from(root.querySelectorAll<HTMLTableElement>("table"))
    tables.forEach((table) => {
      table.classList.add("aq-table-responsive")
      const labels = buildHeaderLabels(table)

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
        let visualColumnIndex = 0
        cells.forEach((cell, index) => {
          const colSpan = Math.max(1, cell.colSpan || 1)
          const columnLabels = labels
            .slice(visualColumnIndex, visualColumnIndex + colSpan)
            .filter(Boolean)
            .filter((value, labelIndex, source) => labelIndex === 0 || value !== source[labelIndex - 1])
          const label =
            columnLabels.join(" · ") ||
            labels[visualColumnIndex] ||
            `항목 ${index + 1}`
          cell.setAttribute("data-label", label)
          visualColumnIndex += colSpan
        })
      })
    })
  }, [contentKey, rootRef])
}

export default useResponsiveTableEffect
