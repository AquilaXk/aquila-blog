import type { BlockEditorEngineProps } from "./blockEditorEngineTypes"
import {
  BlockEditorPreviewLayer,
  BlockEditorQuickInsertLayer,
  BlockEditorSlashMenuLayer,
  BlockEditorToolbarLayer,
  BlockEditorViewportLayer,
} from "./BlockEditorEngine.layers"
import { BlockEditorTableOverlayLayer } from "./BlockEditorEngine.tableOverlayLayer"
import { Shell } from "./BlockEditorEngine.styles"
import "./tableTextNativeDragGuard"
import { useBlockEditorEngineController } from "./useBlockEditorEngineController"

const BlockEditorEngine = (props: BlockEditorEngineProps) => {
  const controller = useBlockEditorEngineController(props)

  return (
    <Shell className={props.className}>
      <BlockEditorToolbarLayer
        activeInlineColor={controller.activeInlineColor}
        applyInlineColor={controller.applyInlineColor}
        disabled={controller.disabled}
        handleToolbarButtonMouseDown={controller.handleToolbarButtonMouseDown}
        inlineColorMenuRef={controller.inlineColorMenuRef}
        isInlineCodeActive={controller.isInlineCodeActive}
        isInlineColorMenuOpen={controller.isInlineColorMenuOpen}
        isToolbarMoreOpen={controller.isToolbarMoreOpen}
        setIsInlineColorMenuOpen={controller.setIsInlineColorMenuOpen}
        setIsToolbarMoreOpen={controller.setIsToolbarMoreOpen}
        toolbarActions={controller.toolbarActions}
        toolbarMoreActions={controller.toolbarMoreActions}
      />
      <BlockEditorQuickInsertLayer
        attachmentFileInputRef={controller.attachmentFileInputRef}
        handleAttachmentInputChange={controller.handleAttachmentInputChange}
        handleImageInputChange={controller.handleImageInputChange}
        imageFileInputRef={controller.imageFileInputRef}
        isQuickInsertActionDisabled={controller.isQuickInsertActionDisabled}
        quickInsertActions={controller.quickInsertActions}
      />
      <BlockEditorSlashMenuLayer
        disabled={controller.disabled}
        executeSlashCatalogAction={controller.executeSlashCatalogAction}
        flatSlashEntries={controller.flatSlashEntries}
        handleSlashActionPointerMove={controller.handleSlashActionPointerMove}
        handleSlashMenuKeyDown={controller.handleSlashMenuKeyDown}
        isSlashActionDisabled={controller.isSlashActionDisabled}
        isSlashMenuOpen={controller.isSlashMenuOpen}
        selectedSlashIndex={controller.selectedSlashIndex}
        slashInteractionMode={controller.slashInteractionMode}
        slashMenuRef={controller.slashMenuRef}
        slashMenuState={controller.slashMenuState}
        slashQuery={controller.slashQuery}
        slashSections={controller.slashSections}
      />
      <BlockEditorViewportLayer
        activeInlineColor={controller.activeInlineColor}
        activeInlineTextStyleOption={controller.activeInlineTextStyleOption}
        applyInlineColor={controller.applyInlineColor}
        applyInlineTextStyle={controller.applyInlineTextStyle}
        blockHandleRailRef={controller.blockHandleRailRef}
        blockHandleState={controller.blockHandleState}
        blockInsertCatalog={controller.blockInsertCatalog}
        blockMenuState={controller.blockMenuState}
        blockSelectionOverlayState={controller.blockSelectionOverlayState}
        bubbleInlineColorMenuRef={controller.bubbleInlineColorMenuRef}
        bubbleState={controller.bubbleState}
        bubbleTextStyleMenuRef={controller.bubbleTextStyleMenuRef}
        bubbleToolbarHoveredRef={controller.bubbleToolbarHoveredRef}
        cancelBubbleHide={controller.cancelBubbleHide}
        closeBlockMenus={controller.closeBlockMenus}
        deleteBlock={controller.deleteBlock}
        disabled={controller.disabled}
        dragGhostPosition={controller.dragGhostPosition}
        draggedBlockState={controller.draggedBlockState}
        draggedNestedListItemState={controller.draggedNestedListItemState}
        dropIndicatorState={controller.dropIndicatorState}
        duplicateBlock={controller.duplicateBlock}
        editor={controller.editor}
        handleBlockDragHandleClick={controller.handleBlockDragHandleClick}
        handleBlockDragHandleMouseDown={controller.handleBlockDragHandleMouseDown}
        handleBlockDragHandlePointerDown={controller.handleBlockDragHandlePointerDown}
        handleBlockHandleKeyDown={controller.handleBlockHandleKeyDown}
        handleToolbarButtonMouseDown={controller.handleToolbarButtonMouseDown}
        handleViewportDragEnd={controller.handleViewportDragEnd}
        handleViewportDragOver={controller.handleViewportDragOver}
        handleViewportDragStart={controller.handleViewportDragStart}
        handleViewportDrop={controller.handleViewportDrop}
        handleViewportKeyDownCapture={controller.handleViewportKeyDownCapture}
        handleViewportMouseMove={controller.handleViewportMouseMove}
        handleViewportPointerDown={controller.handleViewportPointerDown}
        handleViewportPointerLeave={controller.handleViewportPointerLeave}
        handleViewportPointerMove={controller.handleViewportPointerMove}
        insertInlineFormula={controller.insertInlineFormula}
        isBubbleInlineColorMenuOpen={controller.isBubbleInlineColorMenuOpen}
        isBubbleTextStyleMenuOpen={controller.isBubbleTextStyleMenuOpen}
        isCoarsePointer={controller.isCoarsePointer}
        isInlineCodeActive={controller.isInlineCodeActive}
        moveBlockByStep={controller.moveBlockByStep}
        nestedListItemDropIndicatorState={controller.nestedListItemDropIndicatorState}
        onBlockAddClick={controller.handleBlockHandleAddClick}
        onBlockMenuPointerEnter={controller.handleBlockMenuPointerEnter}
        onBlockMenuPointerLeave={controller.handleBlockMenuPointerLeave}
        onCompositionEnd={controller.handleEditorViewportCompositionEnd}
        onCompositionStart={controller.handleEditorViewportCompositionStart}
        onCompositionUpdate={controller.handleEditorViewportCompositionUpdate}
        onHandleRailPointerEnter={controller.handleBlockHandleRailPointerEnter}
        onHandleRailPointerLeave={controller.handleBlockHandleRailPointerLeave}
        openLinkPrompt={controller.openLinkPrompt}
        runBoldAction={controller.runBoldAction}
        runInlineCodeAction={controller.runInlineCodeAction}
        runItalicAction={controller.runItalicAction}
        runStrikeAction={controller.runStrikeAction}
        scheduleBubbleHide={controller.scheduleBubbleHide}
        selectedListItemContext={controller.selectedListItemContext}
        setIsBubbleInlineColorMenuOpen={controller.setIsBubbleInlineColorMenuOpen}
        setIsBubbleTextStyleMenuOpen={controller.setIsBubbleTextStyleMenuOpen}
        viewportRef={controller.viewportRef}
      />
      <BlockEditorTableOverlayLayer
        {...controller.tableOverlayLayerProps}
        handleToolbarButtonMouseDown={controller.handleToolbarButtonMouseDown}
        normalizeTableColorInputValue={controller.normalizeTableColorInputValue}
      />
      <BlockEditorPreviewLayer
        isPreviewOpen={controller.isPreviewOpen}
        preview={controller.preview}
        setIsPreviewOpen={controller.setIsPreviewOpen}
      />
    </Shell>
  )
}

export default BlockEditorEngine
