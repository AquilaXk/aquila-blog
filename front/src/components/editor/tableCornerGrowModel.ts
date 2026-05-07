import {
  TABLE_MIN_COLUMN_WIDTH_PX,
  TABLE_MIN_ROW_HEIGHT_PX,
} from "src/libs/markdown/tableMetadata"
import type { TableAffordanceGeometry } from "./tableAffordanceModel"

export type TableCornerGrowStepMetrics = {
  columnStepPx: number
  rowStepPx: number
}

export type TableCornerGrowState = {
  pointerId: number
  startClientX: number
  startClientY: number
  baseLeft: number
  baseTop: number
  baseWidth: number
  baseHeight: number
  columnStepPx: number
  rowStepPx: number
  maxShrinkColumnSteps: number
  maxShrinkRowSteps: number
}

export type TableCornerPreviewState = {
  visible: boolean
  left: number
  top: number
  width: number
  height: number
  columnSteps: number
  rowSteps: number
}

export const resolveTableCornerPreviewState = (
  state: TableCornerGrowState,
  clientX: number,
  clientY: number
): TableCornerPreviewState => {
  const rawColumnSteps = Math.trunc((clientX - state.startClientX) / state.columnStepPx)
  const rawRowSteps = Math.trunc((clientY - state.startClientY) / state.rowStepPx)
  const columnSteps = Math.max(-state.maxShrinkColumnSteps, rawColumnSteps)
  const rowSteps = Math.max(-state.maxShrinkRowSteps, rawRowSteps)

  if (columnSteps === 0 && rowSteps === 0) {
    return {
      visible: false,
      left: state.baseLeft,
      top: state.baseTop,
      width: state.baseWidth,
      height: state.baseHeight,
      columnSteps: 0,
      rowSteps: 0,
    }
  }

  return {
    visible: true,
    left: state.baseLeft,
    top: state.baseTop,
    width: Math.max(TABLE_MIN_COLUMN_WIDTH_PX, state.baseWidth + columnSteps * state.columnStepPx),
    height: Math.max(TABLE_MIN_ROW_HEIGHT_PX, state.baseHeight + rowSteps * state.rowStepPx),
    columnSteps,
    rowSteps,
  }
}

export const resolveTableCornerGrowStepMetrics = (
  geometry: TableAffordanceGeometry
): TableCornerGrowStepMetrics => {
  const lastColumnSegment = geometry.columnSegments[geometry.columnSegments.length - 1]

  return {
    columnStepPx: Math.max(
      TABLE_MIN_COLUMN_WIDTH_PX,
      Math.round(lastColumnSegment?.width ?? geometry.columnWidth ?? TABLE_MIN_COLUMN_WIDTH_PX)
    ),
    rowStepPx: Math.max(
      TABLE_MIN_ROW_HEIGHT_PX,
      Math.round(geometry.rowHeight || TABLE_MIN_ROW_HEIGHT_PX)
    ),
  }
}

export const resolveTableCornerGrowStepMetricsFromDataset = (
  dataset: DOMStringMap | undefined,
  fallbackMetrics: TableCornerGrowStepMetrics
): TableCornerGrowStepMetrics => {
  const columnStepPx = Number(dataset?.columnStep || "0")
  const rowStepPx = Number(dataset?.rowStep || "0")

  if (Number.isFinite(columnStepPx) && columnStepPx > 0 && Number.isFinite(rowStepPx) && rowStepPx > 0) {
    return {
      columnStepPx,
      rowStepPx,
    }
  }

  return fallbackMetrics
}
