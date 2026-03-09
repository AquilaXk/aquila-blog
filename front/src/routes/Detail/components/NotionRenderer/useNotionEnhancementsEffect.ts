import { RefObject, useEffect } from "react"
import { ExtendedRecordMap } from "notion-types"
import { SchemeType } from "src/types"

const useNotionEnhancementsEffect = (
  rootRef: RefObject<HTMLElement>,
  recordMap: ExtendedRecordMap,
  scheme: SchemeType
) => {
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    let isApplyingEnhancements = false

    const applyAdmonitions = () => {
      const callouts = root.querySelectorAll<HTMLElement>(".notion-callout")
      callouts.forEach((callout) => {
        callout.classList.remove(
          "notion-admonition",
          "notion-admonition-tip",
          "notion-admonition-info",
          "notion-admonition-warning",
          "notion-admonition-outline",
          "notion-admonition-example",
          "notion-admonition-summary"
        )
        callout.removeAttribute("data-admonition-title")
        const existingCalloutText =
          callout.querySelector<HTMLElement>(".notion-callout-text")
        existingCalloutText?.removeAttribute("data-admonition-title")
        callout
          .querySelectorAll<HTMLElement>(".notion-text[data-admonition-heading='true']")
          .forEach((el) => el.removeAttribute("data-admonition-heading"))

        const icon = callout
          .querySelector<HTMLElement>(".notion-page-icon-inline")
          ?.textContent?.trim()

        let kind:
          | "tip"
          | "info"
          | "warning"
          | "outline"
          | "example"
          | "summary"
          | null = null
        if (icon?.includes("💡")) kind = "tip"
        if (icon?.includes("ℹ") || icon?.includes("ℹ️")) kind = "info"
        if (icon?.includes("⚠") || icon?.includes("⚠️")) kind = "warning"
        if (icon?.includes("📋")) kind = "outline"
        if (icon?.includes("✅")) kind = "example"
        if (icon?.includes("📚")) kind = "summary"
        if (!kind) return

        callout.classList.add("notion-admonition", `notion-admonition-${kind}`)
        const titleByKind = {
          tip: "Tip",
          info: "Info",
          warning: "Warning",
          outline: "모범 개요",
          example: "예시답안",
          summary: "핵심 개념 정리",
        } as const

        const calloutText = callout.querySelector<HTMLElement>(".notion-callout-text")
        let parsedTitle: string | null = null
        if (calloutText) {
          const textBlocks = Array.from(
            calloutText.querySelectorAll<HTMLElement>(".notion-text")
          )
          for (const block of textBlocks) {
            const headingEl = block.querySelector<HTMLElement>("strong, b")
            const headingText = headingEl?.textContent?.trim()
            if (headingText) {
              parsedTitle = headingText
              const blockText = block.textContent?.trim() || ""
              if (blockText === headingText) {
                block.setAttribute("data-admonition-heading", "true")
              }
              break
            }
          }
        }

        const finalTitle = parsedTitle || titleByKind[kind]
        callout.setAttribute("data-admonition-title", finalTitle)
        calloutText?.setAttribute("data-admonition-title", finalTitle)
      })
    }

    const applySimpleTableColumnWidths = () => {
      const tables = root.querySelectorAll<HTMLTableElement>(".notion-simple-table")
      tables.forEach((table) => {
        const hasPageReferences = !!table.querySelector(
          ".notion-page-link, .notion-link .notion-page-title"
        )
        if (hasPageReferences) {
          const rows = Array.from(table.rows)
          const colCount = rows.reduce(
            (max, row) => Math.max(max, row.cells.length),
            0
          )
          const autoSizedColgroup = table.querySelector("colgroup[data-autosize='true']")
          if (autoSizedColgroup) {
            autoSizedColgroup.remove()
          }
          delete table.dataset.colWidthSignature
          table.dataset.pageLinkTable = "true"

          const meaningfulColumns = Array.from({ length: colCount }, () => false)
          rows.forEach((row) => {
            Array.from(row.cells).forEach((cell, colIdx) => {
              const text = (cell.textContent || "")
                .replace(/[\u3164\u200b\u00a0]/g, " ")
                .replace(/\s+/g, " ")
                .trim()
              const hasAnyLink = !!cell.querySelector("a")
              if (text.length > 0 || hasAnyLink) {
                meaningfulColumns[colIdx] = true
              }
            })
          })

          const visibleColumns = meaningfulColumns
            .map((isVisible, idx) => (isVisible ? idx : -1))
            .filter((idx) => idx >= 0)
          const effectiveColumns = visibleColumns.length
            ? visibleColumns
            : Array.from({ length: colCount }, (_, idx) => idx)
          const visibleSet = new Set(effectiveColumns)

          rows.forEach((row) => {
            Array.from(row.cells).forEach((cell) => {
              const cellIdx = cell.cellIndex
              const isVisibleCell = visibleSet.has(cellIdx)
              cell.style.removeProperty("width")
              cell.style.width =
                isVisibleCell && effectiveColumns.length
                  ? `${100 / effectiveColumns.length}%`
                  : "0"
              cell.style.verticalAlign = "top"
              cell.style.display = isVisibleCell ? "table-cell" : "none"
            })
          })
          return
        }

        delete table.dataset.pageLinkTable

        const rows = Array.from(table.rows)
        if (!rows.length) return

        const colCount = rows.reduce(
          (max, row) => Math.max(max, row.cells.length),
          0
        )
        if (!colCount) return

        const weights = Array.from({ length: colCount }, () => 1)

        rows.forEach((row) => {
          Array.from(row.cells).forEach((cell, colIdx) => {
            const text = (cell.textContent || "").replace(/\s+/g, " ").trim()
            const len = text.length
            const normalized = Math.max(6, Math.min(40, len))
            weights[colIdx] = Math.max(weights[colIdx], normalized)
          })
        })

        const total = weights.reduce((sum, w) => sum + w, 0)
        if (!total) return
        const widthSignature = weights.join(",")
        if (table.dataset.colWidthSignature === widthSignature) return

        let colgroup = table.querySelector("colgroup[data-autosize='true']")
        if (!colgroup) {
          colgroup = document.createElement("colgroup")
          colgroup.setAttribute("data-autosize", "true")
          table.prepend(colgroup)
        }
        colgroup.innerHTML = ""

        weights.forEach((weight) => {
          const col = document.createElement("col")
          col.style.width = `${(weight / total) * 100}%`
          colgroup!.appendChild(col)
        })
        table.dataset.colWidthSignature = widthSignature
      })
    }

    const applyEnhancements = () => {
      if (isApplyingEnhancements) return
      isApplyingEnhancements = true
      try {
        applyAdmonitions()
        applySimpleTableColumnWidths()
      } finally {
        isApplyingEnhancements = false
      }
    }

    applyEnhancements()

    const observer = new MutationObserver(() => {
      if (isApplyingEnhancements) return
      applyEnhancements()
    })
    observer.observe(root, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [recordMap, scheme, rootRef])
}

export default useNotionEnhancementsEffect
