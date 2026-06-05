import type { Editor as TiptapEditor } from "@tiptap/core"
import { EditorContent } from "@tiptap/react"
import type {
  Dispatch,
  DragEvent as ReactDragEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  MutableRefObject,
  PointerEvent as ReactPointerEvent,
  RefObject,
  SetStateAction,
} from "react"
import AppIcon from "src/components/icons/AppIcon"
import { INLINE_TEXT_COLOR_OPTIONS } from "src/libs/markdown/inlineColor"
import type { BlockSelectionOverlayState, TopLevelBlockHandleState } from "./blockSelectionModel"
import type { DraggedBlockState, DropIndicatorState } from "./blockDragModel"
import {
  BlockDropIndicator,
  BlockHandleButton,
  BlockHandleGrip,
  BlockHandlePlus,
  BlockHandleRail,
  BlockSelectionOverlay,
  BubbleToolbar,
  DraggedBlockGhost,
  DraggedBlockGhostBadge,
  DraggedBlockGhostCard,
  EditorViewport,
  FloatingBlockActionButton,
  FloatingBlockActionList,
  FloatingBlockMenu,
  FloatingBlockMenuButton,
  FloatingBlockMenuDivider,
  FloatingBlockMenuGrid,
  FloatingBlockMenuHeader,
  FloatingBubbleToolbar,
  MobileBlockActionBar,
  TextBubbleColorSwatch,
  TextBubbleColorTrigger,
  TextBubbleDisclosure,
  TextBubbleDivider,
  TextBubbleIconButton,
  TextBubbleMenuButton,
  TextBubbleTextStyleTrigger,
  TextBubbleToolbar,
  ToolbarButton,
} from "./BlockEditorEngine.styles"
import type { BlockEditorBlockMenuState, ToolbarMouseDownHandler } from "./BlockEditorEngine.layers"
import {
  INLINE_TEXT_STYLE_OPTIONS,
  isInlineMarkCommandActive,
  type InlineTextStyleOption,
} from "./inlineToolbarModel"
import type { DraggedNestedListItemState, NestedListItemDropIndicatorState } from "./nestedListItemDragModel"
import type { FloatingBubbleState } from "./useFloatingBubbleState"
import type { BlockInsertCatalogItem } from "./writerEditorPreset"

export const BlockEditorFloatingBubbleLayer = ({
  activeInlineColor,
  activeInlineTextStyleOption,
  applyInlineColor,
  applyInlineTextStyle,
  bubbleInlineColorMenuRef,
  bubbleState,
  bubbleTextStyleMenuRef,
  bubbleToolbarHoveredRef,
  cancelBubbleHide,
  disabled,
  editor,
  handleToolbarButtonMouseDown,
  insertInlineFormula,
  isBubbleInlineColorMenuOpen,
  isBubbleTextStyleMenuOpen,
  isInlineCodeActive,
  openLinkPrompt,
  runBoldAction,
  runInlineCodeAction,
  runItalicAction,
  runStrikeAction,
  scheduleBubbleHide,
  setIsBubbleInlineColorMenuOpen,
  setIsBubbleTextStyleMenuOpen,
}: {
  activeInlineColor: string | null
  activeInlineTextStyleOption: InlineTextStyleOption
  applyInlineColor: (color: string | null) => void
  applyInlineTextStyle: (styleId: InlineTextStyleOption["id"]) => void
  bubbleInlineColorMenuRef: RefObject<HTMLDetailsElement | null>
  bubbleState: FloatingBubbleState
  bubbleTextStyleMenuRef: RefObject<HTMLDetailsElement | null>
  bubbleToolbarHoveredRef: MutableRefObject<boolean>
  cancelBubbleHide: () => void
  disabled: boolean
  editor: TiptapEditor | null
  handleToolbarButtonMouseDown: ToolbarMouseDownHandler
  insertInlineFormula: () => void
  isBubbleInlineColorMenuOpen: boolean
  isBubbleTextStyleMenuOpen: boolean
  isInlineCodeActive: boolean
  openLinkPrompt: () => void
  runBoldAction: () => void
  runInlineCodeAction: () => void
  runItalicAction: () => void
  runStrikeAction: () => void
  scheduleBubbleHide: () => void
  setIsBubbleInlineColorMenuOpen: Dispatch<SetStateAction<boolean>>
  setIsBubbleTextStyleMenuOpen: Dispatch<SetStateAction<boolean>>
}) =>
  editor && bubbleState.visible && (bubbleState.mode === "text" || bubbleState.mode === "image") ? (
    <FloatingBubbleToolbar
      data-anchor={bubbleState.anchor}
      data-placement={bubbleState.placement}
      onPointerEnter={() => {
        bubbleToolbarHoveredRef.current = true
        cancelBubbleHide()
      }}
      onPointerLeave={() => {
        bubbleToolbarHoveredRef.current = false
        scheduleBubbleHide()
      }}
      style={{
        left: `${bubbleState.left}px`,
        top: `${bubbleState.top}px`,
      }}
    >
      {bubbleState.mode === "text" ? (
        <TextBubbleToolbar data-testid="editor-text-bubble-toolbar">
          <TextBubbleDisclosure ref={bubbleTextStyleMenuRef as RefObject<HTMLDetailsElement>} open={isBubbleTextStyleMenuOpen}>
            <summary
              aria-label="글자 크기"
              title="글자 크기"
              data-active={activeInlineTextStyleOption.id !== "paragraph"}
              onMouseDown={handleToolbarButtonMouseDown}
              onClick={(event: ReactMouseEvent<HTMLElement>) => {
                event.preventDefault()
                setIsBubbleTextStyleMenuOpen((prev) => !prev)
                setIsBubbleInlineColorMenuOpen(false)
              }}
            >
              <TextBubbleTextStyleTrigger>{activeInlineTextStyleOption.shortLabel}</TextBubbleTextStyleTrigger>
            </summary>
            {isBubbleTextStyleMenuOpen ? (
              <div className="body">
                {INLINE_TEXT_STYLE_OPTIONS.map((option) => (
                  <TextBubbleMenuButton
                    key={option.id}
                    type="button"
                    data-active={activeInlineTextStyleOption.id === option.id}
                    onClick={() => applyInlineTextStyle(option.id)}
                  >
                    <span>{option.shortLabel}</span>
                    <strong>{option.label}</strong>
                  </TextBubbleMenuButton>
                ))}
              </div>
            ) : null}
          </TextBubbleDisclosure>

          <TextBubbleDisclosure ref={bubbleInlineColorMenuRef as RefObject<HTMLDetailsElement>} open={isBubbleInlineColorMenuOpen}>
            <summary
              aria-label="글자색"
              title="글자색"
              data-active={Boolean(activeInlineColor)}
              onMouseDown={handleToolbarButtonMouseDown}
              onClick={(event: ReactMouseEvent<HTMLElement>) => {
                event.preventDefault()
                setIsBubbleInlineColorMenuOpen((prev) => !prev)
                setIsBubbleTextStyleMenuOpen(false)
              }}
            >
              <TextBubbleColorTrigger>
                <span>A</span>
                <i style={activeInlineColor ? { background: activeInlineColor } : undefined} aria-hidden="true" />
              </TextBubbleColorTrigger>
            </summary>
            {isBubbleInlineColorMenuOpen ? (
              <div className="body">
                <TextBubbleMenuButton
                  type="button"
                  data-active={!activeInlineColor}
                  onMouseDown={handleToolbarButtonMouseDown}
                  onClick={() => applyInlineColor(null)}
                >
                  <TextBubbleColorSwatch data-empty="true" aria-hidden="true" />
                  <strong>기본색</strong>
                </TextBubbleMenuButton>
                {INLINE_TEXT_COLOR_OPTIONS.map((option) => (
                  <TextBubbleMenuButton
                    key={option.value}
                    type="button"
                    data-active={activeInlineColor === option.value}
                    disabled={disabled || isInlineCodeActive}
                    onMouseDown={handleToolbarButtonMouseDown}
                    onClick={() => applyInlineColor(option.value)}
                  >
                    <TextBubbleColorSwatch style={{ background: option.value }} aria-hidden="true" />
                    <strong>{option.label}</strong>
                  </TextBubbleMenuButton>
                ))}
              </div>
            ) : null}
          </TextBubbleDisclosure>

          <TextBubbleDivider aria-hidden="true" />

          <TextBubbleIconButton
            type="button"
            data-active={isInlineMarkCommandActive(editor, "bold")}
            aria-label="굵게"
            title="굵게"
            onMouseDown={handleToolbarButtonMouseDown}
            onClick={runBoldAction}
          >
            <span>B</span>
          </TextBubbleIconButton>
          <TextBubbleIconButton
            type="button"
            data-active={isInlineMarkCommandActive(editor, "italic")}
            aria-label="기울임"
            title="기울임"
            onMouseDown={handleToolbarButtonMouseDown}
            onClick={runItalicAction}
          >
            <AppIcon name="italic" aria-hidden="true" />
          </TextBubbleIconButton>
          <TextBubbleIconButton
            type="button"
            data-active={isInlineMarkCommandActive(editor, "strike")}
            aria-label="취소선"
            title="취소선"
            onMouseDown={handleToolbarButtonMouseDown}
            onClick={runStrikeAction}
          >
            <span style={{ textDecoration: "line-through" }}>S</span>
          </TextBubbleIconButton>
          <TextBubbleIconButton
            type="button"
            data-active={editor.isActive("link")}
            aria-label="링크"
            title="링크"
            onMouseDown={handleToolbarButtonMouseDown}
            onClick={openLinkPrompt}
          >
            <AppIcon name="link" aria-hidden="true" />
          </TextBubbleIconButton>
          <TextBubbleDivider aria-hidden="true" />
          <TextBubbleIconButton
            type="button"
            data-active={isInlineCodeActive}
            aria-label="인라인 코드"
            title="인라인 코드"
            onMouseDown={handleToolbarButtonMouseDown}
            onClick={runInlineCodeAction}
          >
            <span>&lt;/&gt;</span>
          </TextBubbleIconButton>
          <TextBubbleIconButton
            type="button"
            data-active={editor.isActive("inlineFormula")}
            aria-label="인라인 수식"
            title="인라인 수식"
            onMouseDown={handleToolbarButtonMouseDown}
            onClick={insertInlineFormula}
          >
            <span>√x</span>
          </TextBubbleIconButton>
        </TextBubbleToolbar>
      ) : bubbleState.mode === "image" ? (
        <BubbleToolbar>
          <ToolbarButton type="button" data-active={editor.getAttributes("resizableImage").align === "left"} onMouseDown={handleToolbarButtonMouseDown} onClick={() => editor.chain().focus().updateAttributes("resizableImage", { align: "left" }).run()}>
            좌측
          </ToolbarButton>
          <ToolbarButton type="button" data-active={editor.getAttributes("resizableImage").align === "center"} onMouseDown={handleToolbarButtonMouseDown} onClick={() => editor.chain().focus().updateAttributes("resizableImage", { align: "center" }).run()}>
            가운데
          </ToolbarButton>
          <ToolbarButton type="button" data-active={editor.getAttributes("resizableImage").align === "wide"} onMouseDown={handleToolbarButtonMouseDown} onClick={() => editor.chain().focus().updateAttributes("resizableImage", { align: "wide" }).run()}>
            와이드
          </ToolbarButton>
          <ToolbarButton type="button" data-active={editor.getAttributes("resizableImage").align === "full"} onMouseDown={handleToolbarButtonMouseDown} onClick={() => editor.chain().focus().updateAttributes("resizableImage", { align: "full" }).run()}>
            전체 폭
          </ToolbarButton>
        </BubbleToolbar>
      ) : null}
    </FloatingBubbleToolbar>
  ) : null

export const BlockEditorBlockHandleLayer = ({
  blockHandleRailRef,
  blockHandleState,
  handleBlockDragHandleClick,
  handleBlockDragHandleMouseDown,
  handleBlockDragHandlePointerDown,
  handleBlockHandleKeyDown,
  isCoarsePointer,
  onBlockAddClick,
  onRailPointerEnter,
  onRailPointerLeave,
}: {
  blockHandleRailRef: RefObject<HTMLDivElement | null>
  blockHandleState: TopLevelBlockHandleState
  handleBlockDragHandleClick: (event: ReactMouseEvent<HTMLButtonElement>) => void
  handleBlockDragHandleMouseDown: (event: ReactMouseEvent<HTMLButtonElement>) => void
  handleBlockDragHandlePointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void
  handleBlockHandleKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => void
  isCoarsePointer: boolean
  onBlockAddClick: (event: ReactMouseEvent<HTMLButtonElement>) => void
  onRailPointerEnter: () => void
  onRailPointerLeave: () => void
}) =>
  !isCoarsePointer ? (
    <BlockHandleRail
      ref={blockHandleRailRef as RefObject<HTMLDivElement>}
      data-block-handle-rail="true"
      data-visible={blockHandleState.visible}
      onPointerEnter={onRailPointerEnter}
      onPointerLeave={onRailPointerLeave}
      style={{
        left: `${blockHandleState.left}px`,
        top: `${blockHandleState.top}px`,
      }}
    >
      <BlockHandleButton type="button" aria-label="블록 추가" title="블록 추가" onClick={onBlockAddClick}>
        <BlockHandlePlus aria-hidden="true">
          <span />
          <span />
        </BlockHandlePlus>
      </BlockHandleButton>
      <BlockHandleButton
        type="button"
        aria-label={blockHandleState.kind === "list-item" ? "목록 항목 이동" : "블록 이동"}
        title={blockHandleState.kind === "list-item" ? "목록 항목 이동" : "블록 이동"}
        data-variant="drag"
        data-testid={blockHandleState.visible ? "block-drag-handle" : undefined}
        onMouseDown={handleBlockDragHandleMouseDown}
        onKeyDown={handleBlockHandleKeyDown}
        onClick={handleBlockDragHandleClick}
        onPointerDown={handleBlockDragHandlePointerDown}
      >
        <BlockHandleGrip aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
        </BlockHandleGrip>
      </BlockHandleButton>
    </BlockHandleRail>
  ) : null

export const BlockEditorViewportLayer = ({
  activeInlineColor,
  activeInlineTextStyleOption,
  applyInlineColor,
  applyInlineTextStyle,
  blockHandleRailRef,
  blockHandleState,
  blockInsertCatalog,
  blockMenuState,
  blockSelectionOverlayState,
  bubbleInlineColorMenuRef,
  bubbleState,
  bubbleTextStyleMenuRef,
  bubbleToolbarHoveredRef,
  cancelBubbleHide,
  closeBlockMenus,
  deleteBlock,
  disabled,
  dragGhostPosition,
  draggedBlockState,
  draggedNestedListItemState,
  dropIndicatorState,
  duplicateBlock,
  editor,
  handleBlockDragHandleClick,
  handleBlockDragHandleMouseDown,
  handleBlockDragHandlePointerDown,
  handleBlockHandleKeyDown,
  handleToolbarButtonMouseDown,
  handleViewportDragEnd,
  handleViewportDragOver,
  handleViewportDragStart,
  handleViewportDrop,
  handleViewportKeyDownCapture,
  handleViewportMouseMove,
  handleViewportPointerDown,
  handleViewportPointerLeave,
  handleViewportPointerMove,
  insertInlineFormula,
  isBubbleInlineColorMenuOpen,
  isBubbleTextStyleMenuOpen,
  isCoarsePointer,
  isInlineCodeActive,
  moveBlockByStep,
  nestedListItemDropIndicatorState,
  onBlockAddClick,
  onBlockMenuPointerEnter,
  onBlockMenuPointerLeave,
  onCompositionEnd,
  onCompositionStart,
  onCompositionUpdate,
  onHandleRailPointerEnter,
  onHandleRailPointerLeave,
  openLinkPrompt,
  runBoldAction,
  runInlineCodeAction,
  runItalicAction,
  runStrikeAction,
  scheduleBubbleHide,
  setIsBubbleInlineColorMenuOpen,
  setIsBubbleTextStyleMenuOpen,
  viewportRef,
}: {
  activeInlineColor: string | null
  activeInlineTextStyleOption: InlineTextStyleOption
  applyInlineColor: (color: string | null) => void
  applyInlineTextStyle: (styleId: InlineTextStyleOption["id"]) => void
  blockHandleRailRef: RefObject<HTMLDivElement | null>
  blockHandleState: TopLevelBlockHandleState
  blockInsertCatalog: BlockInsertCatalogItem[]
  blockMenuState: BlockEditorBlockMenuState
  blockSelectionOverlayState: BlockSelectionOverlayState
  bubbleInlineColorMenuRef: RefObject<HTMLDetailsElement | null>
  bubbleState: FloatingBubbleState
  bubbleTextStyleMenuRef: RefObject<HTMLDetailsElement | null>
  bubbleToolbarHoveredRef: MutableRefObject<boolean>
  cancelBubbleHide: () => void
  closeBlockMenus: () => void
  deleteBlock: (blockIndex: number) => void
  disabled: boolean
  dragGhostPosition: { x: number; y: number } | null
  draggedBlockState: DraggedBlockState
  draggedNestedListItemState: DraggedNestedListItemState
  dropIndicatorState: DropIndicatorState
  duplicateBlock: (blockIndex: number) => void
  editor: TiptapEditor | null
  handleBlockDragHandleClick: (event: ReactMouseEvent<HTMLButtonElement>) => void
  handleBlockDragHandleMouseDown: (event: ReactMouseEvent<HTMLButtonElement>) => void
  handleBlockDragHandlePointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void
  handleBlockHandleKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => void
  handleToolbarButtonMouseDown: ToolbarMouseDownHandler
  handleViewportDragEnd: (event: ReactDragEvent<HTMLDivElement>) => void
  handleViewportDragOver: (event: ReactDragEvent<HTMLDivElement>) => void
  handleViewportDragStart: (event: ReactDragEvent<HTMLDivElement>) => void
  handleViewportDrop: (event: ReactDragEvent<HTMLDivElement>) => void
  handleViewportKeyDownCapture: (event: ReactKeyboardEvent<HTMLDivElement>) => void
  handleViewportMouseMove: (event: ReactMouseEvent<HTMLDivElement>) => void
  handleViewportPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void
  handleViewportPointerLeave: (event: ReactPointerEvent<HTMLDivElement>) => void
  handleViewportPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void
  insertInlineFormula: () => void
  isBubbleInlineColorMenuOpen: boolean
  isBubbleTextStyleMenuOpen: boolean
  isCoarsePointer: boolean
  isInlineCodeActive: boolean
  moveBlockByStep: (blockIndex: number, direction: -1 | 1) => void
  nestedListItemDropIndicatorState: NestedListItemDropIndicatorState
  onBlockAddClick: (event: ReactMouseEvent<HTMLButtonElement>) => void
  onBlockMenuPointerEnter: () => void
  onBlockMenuPointerLeave: () => void
  onCompositionEnd: () => void
  onCompositionStart: () => void
  onCompositionUpdate: () => void
  onHandleRailPointerEnter: () => void
  onHandleRailPointerLeave: () => void
  openLinkPrompt: () => void
  runBoldAction: () => void
  runInlineCodeAction: () => void
  runItalicAction: () => void
  runStrikeAction: () => void
  scheduleBubbleHide: () => void
  setIsBubbleInlineColorMenuOpen: Dispatch<SetStateAction<boolean>>
  setIsBubbleTextStyleMenuOpen: Dispatch<SetStateAction<boolean>>
  viewportRef: RefObject<HTMLDivElement | null>
}) => (
  <EditorViewport
    data-testid="block-editor-viewport"
    ref={viewportRef as RefObject<HTMLDivElement>}
    tabIndex={-1}
    onCompositionStart={onCompositionStart}
    onCompositionUpdate={onCompositionUpdate}
    onCompositionEnd={onCompositionEnd}
    onKeyDownCapture={handleViewportKeyDownCapture}
    onMouseMove={handleViewportMouseMove}
    onPointerMove={handleViewportPointerMove}
    onPointerLeave={handleViewportPointerLeave}
    onPointerDown={handleViewportPointerDown}
    onDragStart={handleViewportDragStart}
    onDragOver={handleViewportDragOver}
    onDrop={handleViewportDrop}
    onDragEnd={handleViewportDragEnd}
  >
    <BlockEditorFloatingBubbleLayer
      activeInlineColor={activeInlineColor}
      activeInlineTextStyleOption={activeInlineTextStyleOption}
      applyInlineColor={applyInlineColor}
      applyInlineTextStyle={applyInlineTextStyle}
      bubbleInlineColorMenuRef={bubbleInlineColorMenuRef}
      bubbleState={bubbleState}
      bubbleTextStyleMenuRef={bubbleTextStyleMenuRef}
      bubbleToolbarHoveredRef={bubbleToolbarHoveredRef}
      cancelBubbleHide={cancelBubbleHide}
      disabled={disabled}
      editor={editor}
      handleToolbarButtonMouseDown={handleToolbarButtonMouseDown}
      insertInlineFormula={insertInlineFormula}
      isBubbleInlineColorMenuOpen={isBubbleInlineColorMenuOpen}
      isBubbleTextStyleMenuOpen={isBubbleTextStyleMenuOpen}
      isInlineCodeActive={isInlineCodeActive}
      openLinkPrompt={openLinkPrompt}
      runBoldAction={runBoldAction}
      runInlineCodeAction={runInlineCodeAction}
      runItalicAction={runItalicAction}
      runStrikeAction={runStrikeAction}
      scheduleBubbleHide={scheduleBubbleHide}
      setIsBubbleInlineColorMenuOpen={setIsBubbleInlineColorMenuOpen}
      setIsBubbleTextStyleMenuOpen={setIsBubbleTextStyleMenuOpen}
    />
    <BlockEditorBlockHandleLayer
      blockHandleRailRef={blockHandleRailRef}
      blockHandleState={blockHandleState}
      handleBlockDragHandleClick={handleBlockDragHandleClick}
      handleBlockDragHandleMouseDown={handleBlockDragHandleMouseDown}
      handleBlockDragHandlePointerDown={handleBlockDragHandlePointerDown}
      handleBlockHandleKeyDown={handleBlockHandleKeyDown}
      isCoarsePointer={isCoarsePointer}
      onBlockAddClick={onBlockAddClick}
      onRailPointerEnter={onHandleRailPointerEnter}
      onRailPointerLeave={onHandleRailPointerLeave}
    />
    {(() => {
      const dragPreviewState = draggedBlockState ?? draggedNestedListItemState
      if (!dragPreviewState || !dragGhostPosition) return null
      return (
        <DraggedBlockGhost
          aria-hidden="true"
          data-testid="block-drag-ghost"
          style={{
            left: `${Math.round(dragGhostPosition.x + 18)}px`,
            top: `${Math.round(dragGhostPosition.y + 16)}px`,
            width: `${dragPreviewState.previewWidth}px`,
          }}
        >
          <DraggedBlockGhostBadge>
            <span aria-hidden="true">↕</span>
            <strong>글 옮기기</strong>
          </DraggedBlockGhostBadge>
          <DraggedBlockGhostCard style={{ maxHeight: `${dragPreviewState.previewHeight}px` }}>
            {dragPreviewState.previewText}
          </DraggedBlockGhostCard>
        </DraggedBlockGhost>
      )
    })()}
    {blockSelectionOverlayState.visible && !draggedBlockState && !draggedNestedListItemState ? (
      <BlockSelectionOverlay
        aria-hidden="true"
        data-testid="keyboard-block-selection-overlay"
        style={{
          left: `${blockSelectionOverlayState.left}px`,
          top: `${blockSelectionOverlayState.top}px`,
          width: `${blockSelectionOverlayState.width}px`,
          height: `${blockSelectionOverlayState.height}px`,
        }}
      />
    ) : null}
    {dropIndicatorState.visible ? (
      <BlockDropIndicator
        data-testid="block-drop-indicator"
        style={{
          left: `${dropIndicatorState.left}px`,
          top: `${dropIndicatorState.top}px`,
          width: `${dropIndicatorState.width}px`,
        }}
      />
    ) : null}
    {nestedListItemDropIndicatorState.visible ? (
      <BlockDropIndicator
        data-kind="task-item"
        style={{
          left: `${nestedListItemDropIndicatorState.left}px`,
          top: `${nestedListItemDropIndicatorState.top}px`,
          width: `${nestedListItemDropIndicatorState.width}px`,
        }}
      />
    ) : null}
    {isCoarsePointer && blockHandleState.visible && blockHandleState.kind === "top-level" ? (
      <MobileBlockActionBar
        style={{
          left: `${Math.max(16, blockHandleState.left + 54 + blockHandleState.width / 2)}px`,
          top: `${blockHandleState.bottom}px`,
          width: `${Math.min(blockHandleState.width, 520)}px`,
        }}
      >
        <ToolbarButton type="button" onMouseDown={handleToolbarButtonMouseDown} onClick={onBlockAddClick}>
          +
        </ToolbarButton>
        <ToolbarButton type="button" onMouseDown={handleToolbarButtonMouseDown} onClick={() => moveBlockByStep(blockHandleState.blockIndex, -1)}>
          위로
        </ToolbarButton>
        <ToolbarButton type="button" onMouseDown={handleToolbarButtonMouseDown} onClick={() => moveBlockByStep(blockHandleState.blockIndex, 1)}>
          아래로
        </ToolbarButton>
        <ToolbarButton type="button" onMouseDown={handleToolbarButtonMouseDown} onClick={() => duplicateBlock(blockHandleState.blockIndex)}>
          복제
        </ToolbarButton>
        <ToolbarButton type="button" data-variant="subtle-danger" onMouseDown={handleToolbarButtonMouseDown} onClick={() => deleteBlock(blockHandleState.blockIndex)}>
          삭제
        </ToolbarButton>
      </MobileBlockActionBar>
    ) : null}
    {blockMenuState ? (
      <FloatingBlockMenu
        data-block-menu-root="true"
        onPointerEnter={onBlockMenuPointerEnter}
        onPointerLeave={onBlockMenuPointerLeave}
        style={{
          left: `${blockMenuState.left}px`,
          top: `${blockMenuState.top}px`,
        }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <>
          <FloatingBlockMenuHeader>삽입</FloatingBlockMenuHeader>
          <FloatingBlockMenuGrid>
            {blockInsertCatalog.map((action) => (
              <FloatingBlockMenuButton
                key={action.id}
                type="button"
                disabled={action.disabled}
                onClick={() => {
                  if (action.disabled) return
                  void action.insertAtBlock(blockMenuState.blockIndex)
                  closeBlockMenus()
                }}
              >
                <strong>{action.label}</strong>
                {action.helper ? <span>{action.helper}</span> : null}
              </FloatingBlockMenuButton>
            ))}
          </FloatingBlockMenuGrid>
          <FloatingBlockMenuDivider />
          <FloatingBlockMenuHeader>이동 및 관리</FloatingBlockMenuHeader>
          <FloatingBlockActionList>
            <FloatingBlockActionButton type="button" onClick={() => moveBlockByStep(blockMenuState.blockIndex, -1)}>
              위로 이동
            </FloatingBlockActionButton>
            <FloatingBlockActionButton type="button" onClick={() => moveBlockByStep(blockMenuState.blockIndex, 1)}>
              아래로 이동
            </FloatingBlockActionButton>
            <FloatingBlockActionButton type="button" onClick={() => duplicateBlock(blockMenuState.blockIndex)}>
              복제
            </FloatingBlockActionButton>
            <FloatingBlockActionButton type="button" data-variant="danger" onClick={() => deleteBlock(blockMenuState.blockIndex)}>
              삭제
            </FloatingBlockActionButton>
          </FloatingBlockActionList>
        </>
      </FloatingBlockMenu>
    ) : null}
    <EditorContent
      editor={editor}
      data-testid="block-editor-content"
      spellCheck={false}
      autoCorrect="off"
      autoCapitalize="off"
      data-gramm="false"
    />
  </EditorViewport>
)
