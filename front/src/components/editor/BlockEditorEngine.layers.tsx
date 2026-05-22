import type { Editor as TiptapEditor } from "@tiptap/core"
import { EditorContent } from "@tiptap/react"
import type {
  ChangeEvent,
  CSSProperties,
  Dispatch,
  DragEvent as ReactDragEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  MouseEventHandler,
  MutableRefObject,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  RefObject,
  SetStateAction,
} from "react"
import { createPortal } from "react-dom"
import AppIcon from "src/components/icons/AppIcon"
import { INLINE_TEXT_COLOR_OPTIONS } from "src/libs/markdown/inlineColor"
import type {
  TableAffordanceGeometry,
} from "./tableAffordanceModel"
import { TABLE_EDGE_ADD_BUTTON_SIZE_PX } from "./tableAffordanceModel"
import type {
  DraggedTableAxisState,
  TableAxis,
  TableAxisDragGhostPosition,
  TableAxisReorderIndicatorState,
} from "./tableAxisDragModel"
import type {
  TableCornerGrowStepMetrics,
  TableCornerPreviewState,
} from "./tableCornerGrowModel"
import type { TableColumnDragGuideState } from "./tableResizeInteractionModel"
import type {
  CompactTableAffordanceKind,
  TableMenuKind,
  TableMenuState,
  TableOverflowCoachmarkState,
} from "./tableFloatingUiModel"
import { TABLE_OVERFLOW_MODE_WIDE } from "./tableWidthModel"
import type {
  BlockSelectionOverlayState,
  TopLevelBlockHandleState,
} from "./blockSelectionModel"
import type {
  DraggedBlockState,
  DropIndicatorState,
} from "./blockDragModel"
import type {
  DraggedNestedListItemState,
  NestedListItemDropIndicatorState,
} from "./nestedListItemDragModel"
import type { FloatingBubbleState } from "./useFloatingBubbleState"
import type { BlockInsertCatalogItem } from "./writerEditorPreset"
import {
  INLINE_TEXT_STYLE_OPTIONS,
  isInlineMarkCommandActive,
  type InlineTextStyleOption,
} from "./inlineToolbarModel"
import { getSlashActionGlyph } from "./slashMenuModel"
import {
  Toolbar,
  ToolbarActions,
  ToolbarGroup,
  ToolbarSeparator,
  ToolbarMoreDisclosure,
  ToolbarColorDisclosure,
  ColorTriggerIcon,
  ColorOptionButton,
  ColorOptionLabel,
  ColorOptionSwatch,
  ToolbarRibbonButton,
  ToolbarButton,
  HiddenFileInput,
  TablePresetSwatches,
  TablePresetSwatch,
  TableColorInput,
  SlashMenu,
  SlashQuerySummary,
  SlashMenuBody,
  SlashMenuSection,
  SlashMenuSectionLabel,
  SlashActionList,
  SlashActionIcon,
  SlashActionMain,
  SlashActionTitleRow,
  SlashActionHint,
  SlashActionButton,
  SlashEmptyState,
  EditorViewport,
  BubbleToolbar,
  TextBubbleToolbar,
  TextBubbleIconButton,
  TextBubbleDivider,
  TextBubbleDisclosure,
  TextBubbleTextStyleTrigger,
  TextBubbleColorTrigger,
  TextBubbleColorSwatch,
  TextBubbleMenuButton,
  FloatingBubbleToolbar,
  TableHandleIcon,
  TableAxisRail,
  TableCornerHandle,
  TableColumnDragGuide,
  TableColumnResizeBoundaryHandle,
  TableAxisSelectionOutline,
  TableCornerPreviewOutline,
  TableRowDragShadow,
  TableAxisReorderIndicator,
  TableQuickRailButton,
  TableHandleButton,
  TableCornerGrowButton,
  TableCellMenuButton,
  TableTrailingAddBar,
  FloatingTableMenu,
  TableOverflowCoachmark,
  TableOverflowCoachmarkBody,
  TableOverflowCoachmarkTitle,
  TableOverflowCoachmarkDescription,
  TableOverflowCoachmarkAction,
  TableMenuHeader,
  TableMenuHeaderEyebrow,
  TableMenuHeaderTitle,
  TableMenuHeaderDescription,
  TableMenuCompactSection,
  TableMenuSectionTitle,
  TableMenuCompactList,
  TableMenuCompactAction,
  TableMenuSegmentedRow,
  TableMenuSegmentedButton,
  TableMenuHint,
  BlockHandleRail,
  BlockHandleButton,
  BlockHandleGrip,
  BlockHandlePlus,
  DraggedBlockGhost,
  DraggedBlockGhostBadge,
  DraggedBlockGhostCard,
  BlockDropIndicator,
  BlockSelectionOverlay,
  MobileBlockActionBar,
  FloatingBlockMenu,
  FloatingBlockMenuHeader,
  FloatingBlockMenuDivider,
  FloatingBlockMenuGrid,
  FloatingBlockMenuButton,
  FloatingBlockActionList,
  FloatingBlockActionButton,
  AuxDisclosure,
  QuickInsertBar,
  QuickInsertActions,
  QuickInsertButton,
} from "./BlockEditorEngine.styles"

export type BlockEditorToolbarAction = {
  id: string
  label: ReactNode
  ariaLabel: string
  run: () => void
  active: boolean
  disabled?: boolean
}

export type BlockEditorBlockMenuState =
  | {
      blockIndex: number
      left: number
      top: number
    }
  | null

export type BlockEditorSlashMenuState =
  | {
      left: number
      top: number
      from: number
      to: number
      placement: "top" | "bottom"
    }
  | null

type SlashMenuEntry = {
  key: string
  sectionTitle: string
  item: BlockInsertCatalogItem
}

type TableRailLayout = {
  cornerLeft: number
  cornerTop: number
  columnGripLeft: number
  columnGripTop: number
  columnAddBarLeft: number
  columnAddBarTop: number
  rowGripLeft: number
  rowGripTop: number
  rowAddBarLeft: number
  rowAddBarTop: number
  cellMenuLeft: number
  cellMenuTop: number
}

type ActiveTableCellAttrs = {
  textAlign?: "left" | "center" | "right" | null
  backgroundColor?: string | null
}

type ActiveTableStructureState = {
  hasHeaderRow: boolean
  hasHeaderColumn: boolean
  overflowMode: string | null
}

const TABLE_CELL_COLOR_PRESETS = [
  { label: "하늘", value: "#dbeafe" },
  { label: "하늘 진함", value: "#bfdbfe" },
  { label: "민트", value: "#dcfce7" },
  { label: "청록", value: "#ccfbf1" },
  { label: "노랑", value: "#fef3c7" },
  { label: "주황", value: "#fed7aa" },
  { label: "장미", value: "#ffe4e6" },
  { label: "보라", value: "#ede9fe" },
  { label: "라일락", value: "#ddd6fe" },
  { label: "회색", value: "#e2e8f0" },
] as const

type ToolbarMouseDownHandler = MouseEventHandler<HTMLElement>

export const BlockEditorToolbarLayer = ({
  activeInlineColor,
  applyInlineColor,
  disabled,
  handleToolbarButtonMouseDown,
  inlineColorMenuRef,
  isInlineCodeActive,
  isInlineColorMenuOpen,
  isToolbarMoreOpen,
  setIsInlineColorMenuOpen,
  setIsToolbarMoreOpen,
  toolbarActions,
  toolbarMoreActions,
}: {
  activeInlineColor: string | null
  applyInlineColor: (color: string | null) => void
  disabled: boolean
  handleToolbarButtonMouseDown: ToolbarMouseDownHandler
  inlineColorMenuRef: RefObject<HTMLDetailsElement | null>
  isInlineCodeActive: boolean
  isInlineColorMenuOpen: boolean
  isToolbarMoreOpen: boolean
  setIsInlineColorMenuOpen: Dispatch<SetStateAction<boolean>>
  setIsToolbarMoreOpen: Dispatch<SetStateAction<boolean>>
  toolbarActions: BlockEditorToolbarAction[]
  toolbarMoreActions: BlockEditorToolbarAction[]
}) => (
  <Toolbar>
    <ToolbarActions>
      <ToolbarGroup>
        {toolbarActions.slice(0, 4).map((action) => (
          <ToolbarRibbonButton
            key={action.id}
            type="button"
            data-active={action.active}
            data-tone="heading"
            onMouseDown={handleToolbarButtonMouseDown}
            onClick={() => action.run()}
            disabled={disabled || action.disabled}
            aria-label={action.ariaLabel}
            title={action.ariaLabel}
          >
            {action.label}
          </ToolbarRibbonButton>
        ))}
      </ToolbarGroup>
      <ToolbarSeparator aria-hidden="true" />
      <ToolbarGroup>
        {toolbarActions.slice(4, 7).map((action) => (
          <ToolbarRibbonButton
            key={action.id}
            type="button"
            data-active={action.active}
            onMouseDown={handleToolbarButtonMouseDown}
            onClick={() => action.run()}
            disabled={disabled || action.disabled}
            aria-label={action.ariaLabel}
            title={action.ariaLabel}
          >
            {action.label}
          </ToolbarRibbonButton>
        ))}
        <ToolbarColorDisclosure ref={inlineColorMenuRef as RefObject<HTMLDetailsElement>} open={isInlineColorMenuOpen}>
          <summary
            aria-label="글자색"
            title="글자색"
            data-active={Boolean(activeInlineColor)}
            onClick={(event: ReactMouseEvent<HTMLElement>) => {
              event.preventDefault()
              setIsInlineColorMenuOpen((prev) => !prev)
              setIsToolbarMoreOpen(false)
            }}
          >
            <ColorTriggerIcon data-active={Boolean(activeInlineColor)}>
              <span>A</span>
              <i style={activeInlineColor ? { background: activeInlineColor } : undefined} aria-hidden="true" />
            </ColorTriggerIcon>
          </summary>
          {isInlineColorMenuOpen ? (
            <div className="body">
              <ColorOptionButton
                type="button"
                data-active={!activeInlineColor}
                onMouseDown={handleToolbarButtonMouseDown}
                onClick={() => applyInlineColor(null)}
              >
                <ColorOptionLabel>
                  <ColorOptionSwatch data-empty="true" aria-hidden="true" />
                  <span>기본색</span>
                </ColorOptionLabel>
              </ColorOptionButton>
              {INLINE_TEXT_COLOR_OPTIONS.map((option) => (
                <ColorOptionButton
                  key={option.value}
                  type="button"
                  data-active={activeInlineColor === option.value}
                  disabled={disabled || isInlineCodeActive}
                  onMouseDown={handleToolbarButtonMouseDown}
                  onClick={() => applyInlineColor(option.value)}
                >
                  <ColorOptionLabel>
                    <ColorOptionSwatch style={{ background: option.value }} aria-hidden="true" />
                    <span>{option.label}</span>
                  </ColorOptionLabel>
                </ColorOptionButton>
              ))}
            </div>
          ) : null}
        </ToolbarColorDisclosure>
      </ToolbarGroup>
      <ToolbarSeparator aria-hidden="true" />
      <ToolbarGroup>
        {toolbarActions.slice(7).map((action) => (
          <ToolbarRibbonButton
            key={action.id}
            type="button"
            data-active={action.active}
            onMouseDown={handleToolbarButtonMouseDown}
            onClick={() => action.run()}
            disabled={disabled || action.disabled}
            aria-label={action.ariaLabel}
            title={action.ariaLabel}
          >
            {action.label}
          </ToolbarRibbonButton>
        ))}
      </ToolbarGroup>
      <ToolbarSeparator aria-hidden="true" />
      <ToolbarMoreDisclosure open={isToolbarMoreOpen}>
        <summary
          aria-label="추가 도구"
          title="추가 도구"
          onClick={(event: ReactMouseEvent<HTMLElement>) => {
            event.preventDefault()
            setIsToolbarMoreOpen((prev) => !prev)
            setIsInlineColorMenuOpen(false)
          }}
        >
          <span aria-hidden="true">⋯</span>
        </summary>
        {isToolbarMoreOpen ? (
          <div className="body">
            {toolbarMoreActions.map((action) => (
              <ToolbarButton
                key={action.id}
                type="button"
                data-active={action.active}
                onMouseDown={handleToolbarButtonMouseDown}
                onClick={() => action.run()}
                disabled={disabled || action.disabled}
                aria-label={action.ariaLabel}
                title={action.ariaLabel}
              >
                {action.label}
              </ToolbarButton>
            ))}
          </div>
        ) : null}
      </ToolbarMoreDisclosure>
    </ToolbarActions>
  </Toolbar>
)

export const BlockEditorQuickInsertLayer = ({
  attachmentFileInputRef,
  handleAttachmentInputChange,
  handleImageInputChange,
  imageFileInputRef,
  isQuickInsertActionDisabled,
  quickInsertActions,
}: {
  attachmentFileInputRef: RefObject<HTMLInputElement | null>
  handleAttachmentInputChange: (event: ChangeEvent<HTMLInputElement>) => void | Promise<void>
  handleImageInputChange: (event: ChangeEvent<HTMLInputElement>) => void | Promise<void>
  imageFileInputRef: RefObject<HTMLInputElement | null>
  isQuickInsertActionDisabled: (action: BlockInsertCatalogItem) => boolean
  quickInsertActions: BlockInsertCatalogItem[]
}) => (
  <>
    <QuickInsertBar aria-label="빠른 블록 삽입">
      <QuickInsertActions>
        {quickInsertActions.map((action) => (
          <QuickInsertButton
            key={action.id}
            type="button"
            onClick={() => {
              if (isQuickInsertActionDisabled(action)) return
              void action.insertAtCursor()
            }}
            disabled={isQuickInsertActionDisabled(action)}
          >
            {action.label}
          </QuickInsertButton>
        ))}
      </QuickInsertActions>
    </QuickInsertBar>

    <HiddenFileInput
      ref={imageFileInputRef as RefObject<HTMLInputElement>}
      type="file"
      accept="image/*"
      data-testid="editor-image-file-input"
      onChange={(event) => {
        void handleImageInputChange(event)
      }}
    />

    <HiddenFileInput
      ref={attachmentFileInputRef as RefObject<HTMLInputElement>}
      type="file"
      data-testid="editor-attachment-file-input"
      onChange={(event) => {
        void handleAttachmentInputChange(event)
      }}
    />
  </>
)

export const BlockEditorSlashMenuLayer = ({
  disabled,
  executeSlashCatalogAction,
  flatSlashEntries,
  handleSlashActionPointerMove,
  handleSlashMenuKeyDown,
  isSlashActionDisabled,
  isSlashMenuOpen,
  selectedSlashIndex,
  slashInteractionMode,
  slashMenuRef,
  slashMenuState,
  slashQuery,
  slashSections,
}: {
  disabled: boolean
  executeSlashCatalogAction: (item: BlockInsertCatalogItem) => void | Promise<void>
  flatSlashEntries: SlashMenuEntry[]
  handleSlashActionPointerMove: (flatIndex: number) => void
  handleSlashMenuKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void
  isSlashActionDisabled: (action: BlockInsertCatalogItem) => boolean
  isSlashMenuOpen: boolean
  selectedSlashIndex: number
  slashInteractionMode: "keyboard" | "pointer"
  slashMenuRef: RefObject<HTMLDivElement | null>
  slashMenuState: BlockEditorSlashMenuState
  slashQuery: string
  slashSections: Array<{ title: string; items: BlockInsertCatalogItem[] }>
}) =>
  isSlashMenuOpen ? (
    <SlashMenu
      data-testid="slash-menu"
      data-placement={slashMenuState?.placement ?? "bottom"}
      data-input-mode={slashInteractionMode}
      ref={slashMenuRef as RefObject<HTMLDivElement>}
      role="dialog"
      aria-label="블록 삽입 메뉴"
      onKeyDown={handleSlashMenuKeyDown}
      style={
        slashMenuState
          ? {
              left: `${slashMenuState.left}px`,
              top: `${slashMenuState.top}px`,
            }
          : undefined
      }
    >
      <SlashQuerySummary>
        <span>/ {slashQuery.trim().length ? slashQuery : "검색어를 입력하세요"}</span>
      </SlashQuerySummary>
      <SlashMenuBody>
        {slashSections.length ? (
          slashSections.map((section) => (
            <SlashMenuSection key={section.title}>
              <SlashMenuSectionLabel>{section.title}</SlashMenuSectionLabel>
              <SlashActionList>
                {section.items.map((action) => {
                  const entryKey = `${section.title}-${action.id}`
                  const flatIndex = flatSlashEntries.findIndex((entry) => entry.key === entryKey)
                  return (
                    <SlashActionButton
                      key={entryKey}
                      type="button"
                      data-slash-action-id={action.id}
                      data-active={flatIndex === selectedSlashIndex}
                      data-input-mode={slashInteractionMode}
                      disabled={disabled || isSlashActionDisabled(action)}
                      onMouseDown={(event) => event.preventDefault()}
                      onPointerEnter={() => handleSlashActionPointerMove(flatIndex)}
                      onPointerMove={() => handleSlashActionPointerMove(flatIndex)}
                      onClick={() => {
                        if (isSlashActionDisabled(action)) return
                        void executeSlashCatalogAction(action)
                      }}
                    >
                      <SlashActionIcon aria-hidden="true" data-role="slash-action-icon">
                        {getSlashActionGlyph(action)}
                      </SlashActionIcon>
                      <SlashActionMain>
                        <SlashActionTitleRow>
                          <strong>{action.label}</strong>
                        </SlashActionTitleRow>
                        {action.helper ? <span>{action.helper}</span> : null}
                      </SlashActionMain>
                      {action.slashHint ? <SlashActionHint>{action.slashHint}</SlashActionHint> : null}
                    </SlashActionButton>
                  )
                })}
              </SlashActionList>
            </SlashMenuSection>
          ))
        ) : (
          <SlashEmptyState>검색 결과가 없습니다.</SlashEmptyState>
        )}
      </SlashMenuBody>
    </SlashMenu>
  ) : null

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
  selectedListItemContext,
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
  selectedListItemContext: unknown
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
    {blockSelectionOverlayState.visible &&
    !draggedBlockState &&
    !draggedNestedListItemState &&
    !selectedListItemContext ? (
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


export const BlockEditorPreviewLayer = ({
  isPreviewOpen,
  preview,
  setIsPreviewOpen,
}: {
  isPreviewOpen: boolean
  preview: ReactNode
  setIsPreviewOpen: Dispatch<SetStateAction<boolean>>
}) =>
  preview ? (
    <AuxDisclosure open={isPreviewOpen}>
      <summary
        onClick={(event: ReactMouseEvent<HTMLElement>) => {
          event.preventDefault()
          setIsPreviewOpen((prev) => !prev)
        }}
      >
        <strong>공개 결과 미리보기</strong>
        <span>{isPreviewOpen ? "닫기" : "열기"}</span>
      </summary>
      {isPreviewOpen ? <div className="body">{preview}</div> : null}
    </AuxDisclosure>
  ) : null
