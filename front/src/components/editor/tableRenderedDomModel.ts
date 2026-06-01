import { TABLE_MIN_COLUMN_WIDTH_PX } from "src/libs/markdown/tableMetadata"
import type { TableAffordanceGeometry } from "./tableAffordanceModel"

const RENDERED_TABLE_SELECTOR =
  ".aq-block-editor__content .tableWrapper table, .aq-block-editor__content table"
const FIRST_ROW_CELL_SELECTOR =
  "thead tr:first-of-type > th, thead tr:first-of-type > td, tbody tr:first-of-type > th, tbody tr:first-of-type > td, tr:first-of-type > th, tr:first-of-type > td"

export const findActiveRenderedTable = (
  viewport: HTMLElement | null,
  quickRailGeometry: TableAffordanceGeometry | null,
  preferredTable?: HTMLTableElement | null
) => {
  if (!viewport) return null

  const renderedTables = Array.from(viewport.querySelectorAll<HTMLTableElement>(RENDERED_TABLE_SELECTOR))
  if (!renderedTables.length) return null
  const connectedPreferredTable =
    preferredTable?.isConnected && viewport.contains(preferredTable) ? preferredTable : null
  if (!quickRailGeometry) return connectedPreferredTable ?? renderedTables[0] ?? null

  const withinHorizontalTolerance = (left: number, right: number) =>
    Math.abs(left - quickRailGeometry.tableLeft) <= 6 &&
    Math.abs(right - (quickRailGeometry.tableLeft + quickRailGeometry.width)) <= 6
  const withinFullTolerance = (rect: DOMRect) =>
    withinHorizontalTolerance(rect.left, rect.right) && Math.abs(rect.top - quickRailGeometry.tableTop) <= 6

  return (
    renderedTables.find((table) => {
      const rect = table.getBoundingClientRect()
      return withinFullTolerance(rect)
    }) ??
    renderedTables.find((table) => {
      const rect = table.getBoundingClientRect()
      return withinHorizontalTolerance(rect.left, rect.right)
    }) ?? connectedPreferredTable ?? renderedTables[0] ?? null
  )
}

export const resolveTableScopedSelectedCell = (tableElement: ParentNode | null) =>
  (tableElement?.querySelector(".selectedCell") as HTMLElement | null) ?? null

export const resolveActiveRenderedTableForFloatingUi = (
  viewport: HTMLElement | null,
  quickRailGeometry: TableAffordanceGeometry | null,
  preferredTable?: HTMLTableElement | null
) =>
  findActiveRenderedTable(viewport, quickRailGeometry, preferredTable) ??
  (viewport?.querySelector(RENDERED_TABLE_SELECTOR) as HTMLTableElement | null)

export const readRenderedColumnWidths = (tableElement: HTMLElement | null) => {
  if (!tableElement) return []

  return Array.from(tableElement.querySelectorAll<HTMLElement>(FIRST_ROW_CELL_SELECTOR)).map((cell) =>
    Math.max(TABLE_MIN_COLUMN_WIDTH_PX, Math.round(cell.getBoundingClientRect().width))
  )
}
