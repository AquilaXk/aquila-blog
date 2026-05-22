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

export const BlockEditorTableOverlayLayer = ({
  activeTableCellAttrs,
  activeTableStructureState,
  appendTableAxisAtEnd,
  canMergeSelectedTableCells,
  canSplitSelectedTableCell,
  cancelTableOverflowCoachmarkHide,
  cancelTableQuickRailHide,
  compactTableAffordanceKind,
  desktopTableRailLayout,
  draggedTableAxisState,
  editor,
  growTableFromCorner,
  handleTableColumnRailSegmentClick,
  handleTableRowGripClick,
  handleToolbarButtonMouseDown,
  hideTableOverflowCoachmark,
  hoveredTableCellMenuLayout,
  isCurrentTableColumnSelection,
  isCurrentTableRowSelection,
  isTableCornerGrowActive,
  isTableQuickRailHovered,
  normalizeTableColorInputValue,
  openSelectionAwareTableMenu,
  openTableMenu,
  resolveTableCornerGrowStepMetricsFromHandle,
  runTableMenuEditorAction,
  scheduleTableOverflowCoachmarkHide,
  scheduleTableQuickRailHide,
  shouldPersistTableHandles,
  shouldRenderTableAffordanceOverlay,
  shouldShowCellMergeSection,
  shouldShowColumnAddBar,
  shouldShowColumnRail,
  shouldShowDesktopTableHandles,
  shouldShowGrowHandle,
  shouldShowRowAddBar,
  shouldShowRowRail,
  shouldShowStructureMenuButton,
  shouldShowTableCellMenu,
  stabilizeTableSelectionSurface,
  startPendingTableAxisDrag,
  startTableColumnRailResize,
  startTableCornerGrow,
  tableAffordanceGeometry,
  tableAxisDragGhostPosition,
  tableAxisDragSuppressClickRef,
  tableAxisReorderIndicatorState,
  tableColumnDragGuideState,
  tableCornerGrowMousePointerId,
  tableCornerGrowRef,
  tableCornerGrowStepMetrics,
  tableCornerGrowSuppressClickRef,
  tableCornerPreviewState,
  tableEdgeHandleInsetPx,
  tableMenuKind,
  tableMenuState,
  tableOverflowCoachmarkState,
  updateActiveTableCellAttrs,
  updateActiveTableOverflowMode,
}: {
  activeTableCellAttrs: ActiveTableCellAttrs
  activeTableStructureState: ActiveTableStructureState
  appendTableAxisAtEnd: (axis: TableAxis) => void
  canMergeSelectedTableCells: boolean
  canSplitSelectedTableCell: boolean
  cancelTableOverflowCoachmarkHide: () => void
  cancelTableQuickRailHide: () => void
  compactTableAffordanceKind: CompactTableAffordanceKind
  desktopTableRailLayout: TableRailLayout | null
  draggedTableAxisState: DraggedTableAxisState
  editor: TiptapEditor | null
  growTableFromCorner: () => void
  handleTableColumnRailSegmentClick: (columnIndex: number, anchorRect: DOMRect) => void
  handleTableRowGripClick: (rowIndex: number, anchorRect: DOMRect) => void
  handleToolbarButtonMouseDown: ToolbarMouseDownHandler
  hideTableOverflowCoachmark: () => void
  hoveredTableCellMenuLayout: Pick<TableRailLayout, "cellMenuLeft" | "cellMenuTop"> | null
  isCurrentTableColumnSelection: (columnIndex: number) => boolean
  isCurrentTableRowSelection: (rowIndex: number) => boolean
  isTableCornerGrowActive: boolean
  isTableQuickRailHovered: boolean
  normalizeTableColorInputValue: (value: unknown) => string
  openSelectionAwareTableMenu: (kind: TableMenuKind, anchorRect: DOMRect) => void
  openTableMenu: (kind: TableMenuKind, anchorRect: DOMRect) => void
  resolveTableCornerGrowStepMetricsFromHandle: (handle: HTMLElement) => TableCornerGrowStepMetrics
  runTableMenuEditorAction: (action: (activeEditor: TiptapEditor) => void) => void
  scheduleTableOverflowCoachmarkHide: (delayMs?: number) => void
  scheduleTableQuickRailHide: (delayMs?: number) => void
  shouldPersistTableHandles: boolean
  shouldRenderTableAffordanceOverlay: boolean
  shouldShowCellMergeSection: boolean
  shouldShowColumnAddBar: boolean
  shouldShowColumnRail: boolean
  shouldShowDesktopTableHandles: boolean
  shouldShowGrowHandle: boolean
  shouldShowRowAddBar: boolean
  shouldShowRowRail: boolean
  shouldShowStructureMenuButton: boolean
  shouldShowTableCellMenu: boolean
  stabilizeTableSelectionSurface: (activeEditor: TiptapEditor) => void
  startPendingTableAxisDrag: (
    axis: TableAxis,
    axisIndex: number,
    pointerId: number,
    clientX: number,
    clientY: number
  ) => void
  startTableColumnRailResize: (pointerId: number, columnIndex: number, clientX: number) => void
  startTableCornerGrow: (
    pointerId: number,
    clientX: number,
    clientY: number,
    stepMetrics?: TableCornerGrowStepMetrics
  ) => void
  tableAffordanceGeometry: TableAffordanceGeometry
  tableAxisDragGhostPosition: TableAxisDragGhostPosition
  tableAxisDragSuppressClickRef: MutableRefObject<boolean>
  tableAxisReorderIndicatorState: TableAxisReorderIndicatorState
  tableColumnDragGuideState: TableColumnDragGuideState
  tableCornerGrowMousePointerId: number
  tableCornerGrowRef: RefObject<unknown>
  tableCornerGrowStepMetrics: TableCornerGrowStepMetrics
  tableCornerGrowSuppressClickRef: MutableRefObject<boolean>
  tableCornerPreviewState: TableCornerPreviewState
  tableEdgeHandleInsetPx: number
  tableMenuKind: TableMenuKind
  tableMenuState: TableMenuState
  tableOverflowCoachmarkState: TableOverflowCoachmarkState
  updateActiveTableCellAttrs: (attrs: Partial<ActiveTableCellAttrs>) => void
  updateActiveTableOverflowMode: (
    activeEditor: TiptapEditor,
    overflowMode: "normal" | typeof TABLE_OVERFLOW_MODE_WIDE
  ) => boolean
}) => {
  const tableOverlay = (
    <>
      {draggedTableAxisState?.axis === "row" && tableAxisDragGhostPosition ? (
        <TableRowDragShadow
          aria-hidden="true"
          data-testid="table-row-drag-shadow"
          style={{
            left: `${Math.round(draggedTableAxisState.previewLeft)}px`,
            top: `${Math.round(tableAxisDragGhostPosition.y)}px`,
            width: `${Math.round(draggedTableAxisState.previewWidth)}px`,
            height: `${Math.round(draggedTableAxisState.previewHeight)}px`,
          }}
        />
      ) : null}
      {tableAxisReorderIndicatorState.visible ? (
        <TableAxisReorderIndicator
          aria-hidden="true"
          data-axis={tableAxisReorderIndicatorState.axis}
          data-testid={
            tableAxisReorderIndicatorState.axis === "row"
              ? "table-row-reorder-indicator"
              : "table-column-reorder-indicator"
          }
          style={{
            left: `${tableAxisReorderIndicatorState.left}px`,
            top: `${tableAxisReorderIndicatorState.top}px`,
            width: `${Math.max(2, tableAxisReorderIndicatorState.width)}px`,
            height: `${Math.max(2, tableAxisReorderIndicatorState.height)}px`,
          }}
        />
      ) : null}
      {tableColumnDragGuideState.visible ? (
        <TableColumnDragGuide
          data-testid="table-column-drag-guide"
          style={{
            left: `${tableColumnDragGuideState.left}px`,
            top: `${tableColumnDragGuideState.top}px`,
            height: `${tableColumnDragGuideState.height}px`,
          }}
        />
      ) : null}
      {tableCornerPreviewState.visible ? (
        <TableCornerPreviewOutline
          aria-hidden="true"
          data-testid="table-corner-preview-outline"
          style={{
            left: `${Math.round(tableCornerPreviewState.left)}px`,
            top: `${Math.round(tableCornerPreviewState.top)}px`,
            width: `${Math.round(tableCornerPreviewState.width)}px`,
            height: `${Math.round(tableCornerPreviewState.height)}px`,
          }}
        />
      ) : null}
      {shouldShowDesktopTableHandles
        ? !tableColumnDragGuideState.visible
          ? tableAffordanceGeometry.columnSegments.map((segment, index) => {
              const isOuterEdge = index === tableAffordanceGeometry.columnSegments.length - 1
              const outerEdgeReservedOffset = isOuterEdge
                ? TABLE_EDGE_ADD_BUTTON_SIZE_PX + tableEdgeHandleInsetPx
                : 0
              return (
                <TableColumnResizeBoundaryHandle
                  key={`table-column-boundary-${index}`}
                  type="button"
                  data-testid={`table-column-resize-boundary-${index}`}
                  data-edge={isOuterEdge ? "outer" : "inner"}
                  aria-label={`열 ${index + 1} 경계 조절`}
                  onPointerEnter={cancelTableQuickRailHide}
                  onPointerLeave={() => {
                    if (!shouldPersistTableHandles) {
                      scheduleTableQuickRailHide()
                    }
                  }}
                  onPointerDown={(event: ReactPointerEvent<HTMLButtonElement>) => {
                    event.preventDefault()
                    event.stopPropagation()
                    startTableColumnRailResize(event.pointerId, index, event.clientX)
                  }}
                  style={{
                    left: `${Math.round(tableAffordanceGeometry.tableLeft + segment.left + segment.width)}px`,
                    top: `${Math.round(tableAffordanceGeometry.tableTop + outerEdgeReservedOffset)}px`,
                    height: `${Math.round(
                      Math.max(
                        44,
                        tableAffordanceGeometry.height - outerEdgeReservedOffset * (isOuterEdge ? 2 : 0)
                      )
                    )}px`,
                  }}
                />
              )
            })
          : null
        : null}
      {shouldRenderTableAffordanceOverlay ? (
        <>
          {isCurrentTableColumnSelection(tableAffordanceGeometry.columnIndex) ? (
            <TableAxisSelectionOutline
              data-axis="column"
              data-testid="table-column-selection-outline"
              style={{
                left: `${Math.round(tableAffordanceGeometry.columnLeft)}px`,
                top: `${Math.round(tableAffordanceGeometry.tableTop)}px`,
                width: `${Math.round(tableAffordanceGeometry.columnWidth)}px`,
                height: `${Math.round(tableAffordanceGeometry.height)}px`,
              }}
            />
          ) : null}
          {isCurrentTableRowSelection(tableAffordanceGeometry.rowIndex) ? (
            <TableAxisSelectionOutline
              data-axis="row"
              data-testid="table-row-selection-outline"
              style={{
                left: `${Math.round(tableAffordanceGeometry.tableLeft)}px`,
                top: `${Math.round(tableAffordanceGeometry.rowTop)}px`,
                width: `${Math.round(tableAffordanceGeometry.width)}px`,
                height: `${Math.round(tableAffordanceGeometry.rowHeight)}px`,
              }}
            />
          ) : null}
          {shouldShowStructureMenuButton || shouldShowGrowHandle ? (
            <TableCornerHandle
              data-table-corner-handle="true"
              data-testid="table-corner-handle"
              data-compact={compactTableAffordanceKind === "table"}
              onPointerEnter={cancelTableQuickRailHide}
              onPointerLeave={() => {
                if (!shouldPersistTableHandles) {
                  scheduleTableQuickRailHide()
                }
              }}
              style={{
                left: `${
                  desktopTableRailLayout?.cornerLeft ??
                  Math.round(tableAffordanceGeometry.cornerAnchor.left)
                }px`,
                top: `${desktopTableRailLayout?.cornerTop ?? Math.round(tableAffordanceGeometry.cornerAnchor.top)}px`,
              }}
            >
              {shouldShowGrowHandle ? (
                <TableCornerGrowButton
                  type="button"
                  title="표 크기 조절"
                  aria-label="표 크기 조절"
                  data-testid="table-corner-grow-handle"
                  data-table-affordance="grow-handle"
                  data-table-menu-trigger="true"
                  data-active={isTableCornerGrowActive}
                  data-column-step={tableCornerGrowStepMetrics.columnStepPx}
                  data-row-step={tableCornerGrowStepMetrics.rowStepPx}
                  onPointerDown={(event: ReactPointerEvent<HTMLButtonElement>) => {
                    event.preventDefault()
                    event.stopPropagation()
                    try {
                      event.currentTarget.setPointerCapture(event.pointerId)
                    } catch {}
                    startTableCornerGrow(
                      event.pointerId,
                      event.clientX,
                      event.clientY,
                      resolveTableCornerGrowStepMetricsFromHandle(event.currentTarget)
                    )
                  }}
                  onMouseDown={(event: ReactMouseEvent<HTMLButtonElement>) => {
                    event.preventDefault()
                    if (tableCornerGrowRef.current) return
                    startTableCornerGrow(
                      tableCornerGrowMousePointerId,
                      event.clientX,
                      event.clientY,
                      resolveTableCornerGrowStepMetricsFromHandle(event.currentTarget)
                    )
                  }}
                  onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
                    event.preventDefault()
                    event.stopPropagation()
                    if (tableCornerGrowSuppressClickRef.current) {
                      tableCornerGrowSuppressClickRef.current = false
                      return
                    }
                    growTableFromCorner()
                  }}
                >
                  <TableHandleIcon kind="grow" />
                </TableCornerGrowButton>
              ) : null}
              {shouldShowStructureMenuButton ? (
                <TableHandleButton
                  type="button"
                  title="표 구조 메뉴"
                  aria-label="표 구조 메뉴"
                  data-testid="table-structure-menu-button"
                  data-table-affordance="structure-menu"
                  data-table-menu-trigger="true"
                  data-compact={compactTableAffordanceKind === "table"}
                  onMouseDown={handleToolbarButtonMouseDown}
                  onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
                    event.preventDefault()
                    event.stopPropagation()
                    openSelectionAwareTableMenu("table", event.currentTarget.getBoundingClientRect())
                  }}
                >
                  <TableHandleIcon kind="more" />
                </TableHandleButton>
              ) : null}
            </TableCornerHandle>
          ) : null}
          {shouldShowRowRail ? (
            <TableAxisRail
              data-table-axis-rail="true"
              data-testid="table-row-rail"
              data-axis="row"
              onPointerEnter={cancelTableQuickRailHide}
              onPointerLeave={() => {
                if (!shouldPersistTableHandles) {
                  scheduleTableQuickRailHide()
                }
              }}
              style={{
                left: `${
                  desktopTableRailLayout?.rowGripLeft ??
                  Math.round(tableAffordanceGeometry.rowHandleAnchor.left)
                }px`,
                top: `${
                  desktopTableRailLayout?.rowGripTop ??
                  Math.round(tableAffordanceGeometry.rowHandleAnchor.top)
                }px`,
              }}
            >
              <TableQuickRailButton
                type="button"
                data-axis="row"
                data-table-affordance="row-handle"
                data-active={isCurrentTableRowSelection(tableAffordanceGeometry.rowIndex)}
                data-compact={compactTableAffordanceKind === "row"}
                title="행 메뉴"
                aria-label="행 메뉴"
                onMouseDown={handleToolbarButtonMouseDown}
                onPointerDown={(event: ReactPointerEvent<HTMLButtonElement>) => {
                  if (event.button !== 0) return
                  event.preventDefault()
                  event.stopPropagation()
                  startPendingTableAxisDrag("row", tableAffordanceGeometry.rowIndex, event.pointerId, event.clientX, event.clientY)
                }}
                onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
                  event.preventDefault()
                  event.stopPropagation()
                  if (tableAxisDragSuppressClickRef.current) {
                    tableAxisDragSuppressClickRef.current = false
                    return
                  }
                  handleTableRowGripClick(tableAffordanceGeometry.rowIndex, event.currentTarget.getBoundingClientRect())
                }}
              >
                <TableHandleIcon kind="grip" />
              </TableQuickRailButton>
            </TableAxisRail>
          ) : null}
          {shouldShowColumnRail ? (
            <TableAxisRail
              data-table-axis-rail="true"
              data-testid="table-column-rail"
              data-axis="column"
              onPointerEnter={cancelTableQuickRailHide}
              onPointerLeave={() => {
                if (!shouldPersistTableHandles) {
                  scheduleTableQuickRailHide()
                }
              }}
              style={{
                left: `${
                  desktopTableRailLayout?.columnGripLeft ??
                  Math.round(tableAffordanceGeometry.columnHandleAnchor.left)
                }px`,
                top: `${
                  desktopTableRailLayout?.columnGripTop ??
                  Math.round(tableAffordanceGeometry.columnHandleAnchor.top)
                }px`,
              }}
            >
              <TableQuickRailButton
                type="button"
                data-axis="column"
                data-table-affordance="column-handle"
                data-active={isCurrentTableColumnSelection(tableAffordanceGeometry.columnIndex)}
                data-compact={compactTableAffordanceKind === "column"}
                title="열 메뉴"
                aria-label="열 메뉴"
                onMouseDown={handleToolbarButtonMouseDown}
                onPointerDown={(event: ReactPointerEvent<HTMLButtonElement>) => {
                  if (event.button !== 0) return
                  event.preventDefault()
                  event.stopPropagation()
                  startPendingTableAxisDrag(
                    "column",
                    tableAffordanceGeometry.columnIndex,
                    event.pointerId,
                    event.clientX,
                    event.clientY
                  )
                }}
                onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
                  event.preventDefault()
                  event.stopPropagation()
                  if (tableAxisDragSuppressClickRef.current) {
                    tableAxisDragSuppressClickRef.current = false
                    return
                  }
                  handleTableColumnRailSegmentClick(tableAffordanceGeometry.columnIndex, event.currentTarget.getBoundingClientRect())
                }}
              >
                <TableHandleIcon kind="grip" />
              </TableQuickRailButton>
            </TableAxisRail>
          ) : null}
          {shouldShowColumnAddBar ? (
            <TableTrailingAddBar
              type="button"
              data-table-axis-rail="true"
              data-testid="table-column-add-bar"
              data-table-affordance="column-add"
              data-axis="column"
              title="열 추가"
              aria-label="열 추가"
              onPointerEnter={cancelTableQuickRailHide}
              onPointerLeave={() => {
                if (!shouldPersistTableHandles) {
                  scheduleTableQuickRailHide()
                }
              }}
              onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
                event.preventDefault()
                event.stopPropagation()
                appendTableAxisAtEnd("column")
              }}
              style={{
                left: `${
                  desktopTableRailLayout?.columnAddBarLeft ??
                  Math.round(tableAffordanceGeometry.columnAddAnchor.left)
                }px`,
                top: `${
                  desktopTableRailLayout?.columnAddBarTop ??
                  Math.round(tableAffordanceGeometry.columnAddAnchor.top)
                }px`,
              }}
            >
              <TableHandleIcon kind="plus" />
            </TableTrailingAddBar>
          ) : null}
          {shouldShowRowAddBar ? (
            <TableTrailingAddBar
              type="button"
              data-table-axis-rail="true"
              data-testid="table-row-add-bar"
              data-table-affordance="row-add"
              data-axis="row"
              title="행 추가"
              aria-label="행 추가"
              onPointerEnter={cancelTableQuickRailHide}
              onPointerLeave={() => {
                if (!shouldPersistTableHandles) {
                  scheduleTableQuickRailHide()
                }
              }}
              onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
                event.preventDefault()
                event.stopPropagation()
                appendTableAxisAtEnd("row")
              }}
              style={{
                left: `${
                  desktopTableRailLayout?.rowAddBarLeft ??
                  Math.round(tableAffordanceGeometry.rowAddAnchor.left)
                }px`,
                top: `${
                  desktopTableRailLayout?.rowAddBarTop ??
                  Math.round(tableAffordanceGeometry.rowAddAnchor.top)
                }px`,
              }}
            >
              <TableHandleIcon kind="plus" />
            </TableTrailingAddBar>
          ) : null}
          {shouldShowTableCellMenu ? (
            <TableCellMenuButton
              type="button"
              data-testid="table-cell-menu-button"
              data-table-affordance="cell-menu"
              data-table-menu-trigger="true"
              title="셀 스타일"
              aria-label="셀 스타일"
              onMouseDown={handleToolbarButtonMouseDown}
              onPointerEnter={cancelTableQuickRailHide}
              onPointerLeave={() => {
                if (!shouldPersistTableHandles) {
                  scheduleTableQuickRailHide()
                }
              }}
              onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
                event.preventDefault()
                event.stopPropagation()
                openTableMenu("cell", event.currentTarget.getBoundingClientRect())
              }}
              style={{
                left: `${
                  (isTableQuickRailHovered ? hoveredTableCellMenuLayout?.cellMenuLeft : null) ??
                  desktopTableRailLayout?.cellMenuLeft ??
                  Math.round(tableAffordanceGeometry.cellMenuAnchor.left)
                }px`,
                top: `${
                  (isTableQuickRailHovered ? hoveredTableCellMenuLayout?.cellMenuTop : null) ??
                  desktopTableRailLayout?.cellMenuTop ??
                  Math.round(tableAffordanceGeometry.cellMenuAnchor.top)
                }px`,
              }}
            >
              <TableHandleIcon kind="more" />
            </TableCellMenuButton>
          ) : null}
        </>
      ) : null}
      {tableOverflowCoachmarkState.visible ? (
        <TableOverflowCoachmark
          data-testid="table-overflow-policy-hint"
          style={{
            left: `${tableOverflowCoachmarkState.left}px`,
            top: `${tableOverflowCoachmarkState.top}px`,
          }}
          onPointerEnter={cancelTableOverflowCoachmarkHide}
          onPointerLeave={() => scheduleTableOverflowCoachmarkHide(2400)}
        >
          <TableOverflowCoachmarkBody>
            <TableOverflowCoachmarkTitle>페이지 너비에 맞춤 유지 중</TableOverflowCoachmarkTitle>
            <TableOverflowCoachmarkDescription>
              더 넓게 편집하려면 넓은 표로 전환하세요.
            </TableOverflowCoachmarkDescription>
          </TableOverflowCoachmarkBody>
          <TableOverflowCoachmarkAction
            type="button"
            data-testid="table-overflow-policy-hint-wide-action"
            onMouseDown={handleToolbarButtonMouseDown}
            onClick={() => {
              if (!editor) return
              updateActiveTableOverflowMode(editor, TABLE_OVERFLOW_MODE_WIDE)
              hideTableOverflowCoachmark()
              stabilizeTableSelectionSurface(editor)
            }}
          >
            넓은 표
          </TableOverflowCoachmarkAction>
        </TableOverflowCoachmark>
      ) : null}
      {tableMenuState ? (
        <FloatingTableMenu
          data-table-menu-root="true"
          data-testid={`table-${tableMenuState.kind}-menu`}
          style={{
            left: `${tableMenuState.left}px`,
            top: `${tableMenuState.top}px`,
          }}
        >
          <TableMenuHeader>
            <TableMenuHeaderEyebrow>
              {tableMenuKind === "row"
                ? "Axis"
                : tableMenuKind === "column"
                  ? "Axis"
                  : tableMenuKind === "cell"
                    ? "Cell"
                    : "Table"}
            </TableMenuHeaderEyebrow>
            <TableMenuHeaderTitle>
              {tableMenuKind === "row"
                ? "행 메뉴"
                : tableMenuKind === "column"
                  ? "열 메뉴"
                  : tableMenuKind === "cell"
                    ? "셀 스타일"
                    : "표 구조"}
            </TableMenuHeaderTitle>
            <TableMenuHeaderDescription>
              {tableMenuKind === "row"
                ? "현재 행에만 적용되는 삽입과 헤더 설정"
                : tableMenuKind === "column"
                  ? "현재 열에만 적용되는 삽입과 헤더 설정"
                  : tableMenuKind === "cell"
                    ? "정렬과 배경, 필요할 때만 셀 결합"
                    : "표 수준 폭 정책과 삭제만 유지"}
            </TableMenuHeaderDescription>
          </TableMenuHeader>
          {tableMenuKind === "cell" ? (
            <>
              <TableMenuCompactSection>
                <TableMenuSectionTitle>정렬</TableMenuSectionTitle>
                <TableMenuSegmentedRow data-columns="3">
                  <TableMenuSegmentedButton
                    type="button"
                    data-active={activeTableCellAttrs.textAlign === "left"}
                    onMouseDown={handleToolbarButtonMouseDown}
                    onClick={() => updateActiveTableCellAttrs({ textAlign: "left" })}
                  >
                    좌측
                  </TableMenuSegmentedButton>
                  <TableMenuSegmentedButton
                    type="button"
                    data-active={activeTableCellAttrs.textAlign === "center"}
                    onMouseDown={handleToolbarButtonMouseDown}
                    onClick={() => updateActiveTableCellAttrs({ textAlign: "center" })}
                  >
                    가운데
                  </TableMenuSegmentedButton>
                  <TableMenuSegmentedButton
                    type="button"
                    data-active={activeTableCellAttrs.textAlign === "right"}
                    onMouseDown={handleToolbarButtonMouseDown}
                    onClick={() => updateActiveTableCellAttrs({ textAlign: "right" })}
                  >
                    우측
                  </TableMenuSegmentedButton>
                </TableMenuSegmentedRow>
              </TableMenuCompactSection>
              <TableMenuCompactSection>
                <TableMenuSectionTitle>배경</TableMenuSectionTitle>
                <TableMenuSegmentedRow data-columns="2">
                  <TableMenuSegmentedButton
                    type="button"
                    data-active={activeTableCellAttrs.backgroundColor === "#f8fafc"}
                    onMouseDown={handleToolbarButtonMouseDown}
                    onClick={() => updateActiveTableCellAttrs({ backgroundColor: "#f8fafc" })}
                  >
                    기본
                  </TableMenuSegmentedButton>
                  <TableMenuSegmentedButton
                    type="button"
                    onMouseDown={handleToolbarButtonMouseDown}
                    onClick={() => updateActiveTableCellAttrs({ backgroundColor: null })}
                  >
                    배경 해제
                  </TableMenuSegmentedButton>
                </TableMenuSegmentedRow>
                <TablePresetSwatches aria-label="표 셀 배경 preset">
                  {TABLE_CELL_COLOR_PRESETS.map((preset) => (
                    <TablePresetSwatch
                      key={preset.value}
                      type="button"
                      title={preset.label}
                      aria-label={`${preset.label} 배경`}
                      data-active={activeTableCellAttrs.backgroundColor === preset.value}
                      style={{ "--table-swatch-color": preset.value } as CSSProperties}
                      onClick={() => updateActiveTableCellAttrs({ backgroundColor: preset.value })}
                    />
                  ))}
                  <TableColorInput
                    type="color"
                    aria-label="표 셀 배경색 선택"
                    value={normalizeTableColorInputValue(activeTableCellAttrs.backgroundColor)}
                    onChange={(event) =>
                      updateActiveTableCellAttrs({ backgroundColor: event.currentTarget.value })
                    }
                  />
                </TablePresetSwatches>
              </TableMenuCompactSection>
              {shouldShowCellMergeSection ? (
                <>
                  <FloatingBlockMenuDivider />
                  <TableMenuCompactSection>
                    <TableMenuSectionTitle>셀 구조</TableMenuSectionTitle>
                    <TableMenuCompactList>
                      {canMergeSelectedTableCells ? (
                        <TableMenuCompactAction
                          type="button"
                          onClick={() =>
                            runTableMenuEditorAction((activeEditor) => {
                              activeEditor.chain().focus().mergeCells().run()
                            })
                          }
                        >
                          셀 병합
                        </TableMenuCompactAction>
                      ) : null}
                      {canSplitSelectedTableCell ? (
                        <TableMenuCompactAction
                          type="button"
                          onClick={() =>
                            runTableMenuEditorAction((activeEditor) => {
                              activeEditor.chain().focus().splitCell().run()
                            })
                          }
                        >
                          셀 분리
                        </TableMenuCompactAction>
                      ) : null}
                    </TableMenuCompactList>
                  </TableMenuCompactSection>
                </>
              ) : null}
            </>
          ) : tableMenuKind === "row" ? (
            <>
              <TableMenuCompactSection>
                <TableMenuSectionTitle>행 액션</TableMenuSectionTitle>
                <TableMenuCompactList>
                  <TableMenuCompactAction
                    type="button"
                    data-active={activeTableStructureState.hasHeaderRow}
                    onClick={() =>
                      runTableMenuEditorAction((activeEditor) => {
                        activeEditor.chain().focus().toggleHeaderRow().run()
                      })
                    }
                  >
                    제목 행
                  </TableMenuCompactAction>
                  <TableMenuCompactAction
                    type="button"
                    onClick={() =>
                      runTableMenuEditorAction((activeEditor) => {
                        activeEditor.chain().focus().addRowBefore().run()
                      })
                    }
                  >
                    위에 행 추가
                  </TableMenuCompactAction>
                  <TableMenuCompactAction
                    type="button"
                    onClick={() =>
                      runTableMenuEditorAction((activeEditor) => {
                        activeEditor.chain().focus().addRowAfter().run()
                      })
                    }
                  >
                    아래에 행 추가
                  </TableMenuCompactAction>
                </TableMenuCompactList>
              </TableMenuCompactSection>
              <TableMenuHint>행 핸들을 드래그해 순서를 바꿀 수 있습니다.</TableMenuHint>
              <FloatingBlockMenuDivider />
              <TableMenuCompactList>
                <TableMenuCompactAction
                  type="button"
                  data-variant="danger"
                  onClick={() =>
                    runTableMenuEditorAction((activeEditor) => {
                      activeEditor.chain().focus().deleteRow().run()
                    })
                  }
                >
                  행 삭제
                </TableMenuCompactAction>
              </TableMenuCompactList>
            </>
          ) : tableMenuKind === "column" ? (
            <>
              <TableMenuCompactSection>
                <TableMenuSectionTitle>열 액션</TableMenuSectionTitle>
                <TableMenuCompactList>
                  <TableMenuCompactAction
                    type="button"
                    data-active={activeTableStructureState.hasHeaderColumn}
                    onClick={() =>
                      runTableMenuEditorAction((activeEditor) => {
                        activeEditor.chain().focus().toggleHeaderColumn().run()
                      })
                    }
                  >
                    제목 열
                  </TableMenuCompactAction>
                  <TableMenuCompactAction
                    type="button"
                    onClick={() =>
                      runTableMenuEditorAction((activeEditor) => {
                        activeEditor.chain().focus().addColumnBefore().run()
                      })
                    }
                  >
                    왼쪽 열 추가
                  </TableMenuCompactAction>
                  <TableMenuCompactAction
                    type="button"
                    onClick={() =>
                      runTableMenuEditorAction((activeEditor) => {
                        activeEditor.chain().focus().addColumnAfter().run()
                      })
                    }
                  >
                    오른쪽 열 추가
                  </TableMenuCompactAction>
                </TableMenuCompactList>
              </TableMenuCompactSection>
              <TableMenuHint>열 핸들을 드래그해 순서를 바꿀 수 있습니다.</TableMenuHint>
              <FloatingBlockMenuDivider />
              <TableMenuCompactList>
                <TableMenuCompactAction
                  type="button"
                  data-variant="danger"
                  onClick={() =>
                    runTableMenuEditorAction((activeEditor) => {
                      activeEditor.chain().focus().deleteColumn().run()
                    })
                  }
                >
                  열 삭제
                </TableMenuCompactAction>
              </TableMenuCompactList>
            </>
          ) : (
            <>
              <TableMenuCompactSection>
                <TableMenuSectionTitle>폭</TableMenuSectionTitle>
                <TableMenuSegmentedRow data-columns="2">
                  <TableMenuSegmentedButton
                    type="button"
                    data-testid="table-overflow-mode-normal"
                    data-active={activeTableStructureState.overflowMode !== TABLE_OVERFLOW_MODE_WIDE}
                    onClick={() =>
                      runTableMenuEditorAction((activeEditor) => {
                        updateActiveTableOverflowMode(activeEditor, "normal")
                      })
                    }
                  >
                    페이지 너비에 맞춤
                  </TableMenuSegmentedButton>
                  <TableMenuSegmentedButton
                    type="button"
                    data-testid="table-overflow-mode-wide"
                    data-active={activeTableStructureState.overflowMode === TABLE_OVERFLOW_MODE_WIDE}
                    onClick={() =>
                      runTableMenuEditorAction((activeEditor) => {
                        updateActiveTableOverflowMode(activeEditor, TABLE_OVERFLOW_MODE_WIDE)
                      })
                    }
                  >
                    넓은 표
                  </TableMenuSegmentedButton>
                </TableMenuSegmentedRow>
              </TableMenuCompactSection>
              <TableMenuHint>제목 행/열 토글은 행 메뉴와 열 메뉴에서 분리했습니다.</TableMenuHint>
              <FloatingBlockMenuDivider />
              <TableMenuCompactList>
                <TableMenuCompactAction
                  type="button"
                  data-variant="danger"
                  onClick={() =>
                    runTableMenuEditorAction((activeEditor) => {
                      activeEditor.chain().focus().deleteTable().run()
                    })
                  }
                >
                  표 삭제
                </TableMenuCompactAction>
              </TableMenuCompactList>
            </>
          )}
        </FloatingTableMenu>
      ) : null}
    </>
  )

  return typeof document !== "undefined" ? createPortal(tableOverlay, document.body) : tableOverlay
}

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
