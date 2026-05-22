import { createPortal } from "react-dom"
import { BlockEditorTableOverlayMenus } from "./BlockEditorEngine.tableOverlayMenus"
import { BlockEditorTableOverlayRails } from "./BlockEditorEngine.tableOverlayRails"
import type { BlockEditorTableOverlayLayerProps } from "./BlockEditorEngine.tableOverlayTypes"

export const BlockEditorTableOverlayLayer = (props: BlockEditorTableOverlayLayerProps) => {
  const tableOverlay = (
    <>
      <BlockEditorTableOverlayRails {...props} />
      <BlockEditorTableOverlayMenus {...props} />
    </>
  )

  return typeof document !== "undefined" ? createPortal(tableOverlay, document.body) : tableOverlay
}
