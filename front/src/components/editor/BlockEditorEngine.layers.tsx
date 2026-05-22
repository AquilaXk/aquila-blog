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

export type ToolbarMouseDownHandler = MouseEventHandler<HTMLElement>

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

export {
  BlockEditorFloatingBubbleLayer,
  BlockEditorBlockHandleLayer,
  BlockEditorViewportLayer,
} from "./BlockEditorEngine.viewportLayer"

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
