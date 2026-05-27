const TABLE_TEXT_NATIVE_DRAG_CONTROL_SELECTOR =
  "[data-table-axis-rail='true'], [data-table-affordance], [data-table-menu-root='true'], [data-table-menu-trigger='true'], [data-testid^='table-column-resize-boundary-'], [data-testid='table-structure-menu-button'], [data-testid='table-corner-handle'], [data-testid='table-corner-grow-handle'], .column-resize-handle"

const resolveElement = (target: EventTarget | Node | null | undefined) => {
  if (target instanceof Element) return target
  if (target instanceof Node) return target.parentElement
  return null
}

const isInternalTableTextDrag = (event: DragEvent) => {
  const targetElement = resolveElement(event.target)
  const table = targetElement?.closest("table")
  if (!targetElement || !table || targetElement.closest(TABLE_TEXT_NATIVE_DRAG_CONTROL_SELECTOR)) return false

  const selection = window.getSelection()
  const anchorElement = resolveElement(selection?.anchorNode)
  const focusElement = resolveElement(selection?.focusNode)
  const selectedText =
    selection?.toString().trim() ||
    document.documentElement.getAttribute("data-table-drag-selection-text")?.trim() ||
    document.querySelector("[data-table-drag-selection-text]")?.getAttribute("data-table-drag-selection-text")?.trim() ||
    ""

  return Boolean(selectedText && anchorElement && focusElement && table.contains(anchorElement) && table.contains(focusElement))
}

const stopInternalTableTextDrag = (event: DragEvent) => {
  if (!isInternalTableTextDrag(event)) return
  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation()
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  const tableDragWindow = window as typeof window & { __aqTableTextNativeDragGuardInstalled?: boolean }
  if (!tableDragWindow.__aqTableTextNativeDragGuardInstalled) {
    tableDragWindow.__aqTableTextNativeDragGuardInstalled = true
    window.addEventListener("dragstart", stopInternalTableTextDrag, true)
    window.addEventListener("drop", stopInternalTableTextDrag, true)
  }
}

export {}
