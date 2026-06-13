export const resolveClosestTableCellAtPoint = (
  table: Element | null | undefined,
  clientX: number,
  clientY: number
) => {
  let closestCell: HTMLElement | null = null
  let closestDistance = Number.POSITIVE_INFINITY

  table?.querySelectorAll<HTMLElement>("th, td").forEach((cell) => {
    const rect = cell.getBoundingClientRect()
    if (
      cell.closest("table") !== table ||
      clientX < rect.left - 1 ||
      clientX > rect.right + 1 ||
      clientY < rect.top - 1 ||
      clientY > rect.bottom + 1
    )
      return

    const dx = clientX - (rect.left + rect.width / 2)
    const dy = clientY - (rect.top + rect.height / 2)
    const distance = dx * dx + dy * dy
    if (distance < closestDistance) {
      closestCell = cell
      closestDistance = distance
    }
  })

  return closestCell
}
