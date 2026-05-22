import type { CSSProperties } from "react"
import { TABLE_OVERFLOW_MODE_WIDE } from "./tableWidthModel"
import type { BlockEditorTableOverlayLayerProps } from "./BlockEditorEngine.tableOverlayTypes"
import {
  FloatingBlockMenuDivider,
  FloatingTableMenu,
  TableColorInput,
  TableMenuCompactAction,
  TableMenuCompactList,
  TableMenuCompactSection,
  TableMenuHeader,
  TableMenuHeaderDescription,
  TableMenuHeaderEyebrow,
  TableMenuHeaderTitle,
  TableMenuHint,
  TableMenuSectionTitle,
  TableMenuSegmentedButton,
  TableMenuSegmentedRow,
  TableOverflowCoachmark,
  TableOverflowCoachmarkAction,
  TableOverflowCoachmarkBody,
  TableOverflowCoachmarkDescription,
  TableOverflowCoachmarkTitle,
  TablePresetSwatch,
  TablePresetSwatches,
} from "./BlockEditorEngine.styles"

const TABLE_CELL_COLOR_PRESETS = [
  { label: "하늘", value: "#dbeafe" },
  { label: "하늘 진함", value: "#bfdbfe" },
  { label: "민트", value: "#dcfce7" },
  { label: "청록", value: "#ccfbf1" },
  { label: "노랑", value: "#fef3c7" },
  { label: "주황", value: "#fed7aa" },
  { label: "분홍", value: "#fce7f3" },
  { label: "보라", value: "#ede9fe" },
  { label: "회색", value: "#e2e8f0" },
]

export const BlockEditorTableOverlayMenus = ({
  activeTableCellAttrs,
  activeTableStructureState,
  canMergeSelectedTableCells,
  canSplitSelectedTableCell,
  cancelTableOverflowCoachmarkHide,
  editor,
  handleToolbarButtonMouseDown,
  hideTableOverflowCoachmark,
  normalizeTableColorInputValue,
  runTableMenuEditorAction,
  scheduleTableOverflowCoachmarkHide,
  shouldShowCellMergeSection,
  stabilizeTableSelectionSurface,
  tableMenuKind,
  tableMenuState,
  tableOverflowCoachmarkState,
  updateActiveTableCellAttrs,
  updateActiveTableOverflowMode,
}: BlockEditorTableOverlayLayerProps) => (
  <>
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
          <TableAxisMenu
            active={activeTableStructureState.hasHeaderRow}
            axisLabel="행"
            deleteLabel="행 삭제"
            hint="행 핸들을 드래그해 순서를 바꿀 수 있습니다."
            insertAfterLabel="아래에 행 추가"
            insertBeforeLabel="위에 행 추가"
            titleLabel="제목 행"
            onDelete={() => runTableMenuEditorAction((activeEditor) => activeEditor.chain().focus().deleteRow().run())}
            onInsertAfter={() =>
              runTableMenuEditorAction((activeEditor) => activeEditor.chain().focus().addRowAfter().run())
            }
            onInsertBefore={() =>
              runTableMenuEditorAction((activeEditor) => activeEditor.chain().focus().addRowBefore().run())
            }
            onToggleHeader={() =>
              runTableMenuEditorAction((activeEditor) => activeEditor.chain().focus().toggleHeaderRow().run())
            }
          />
        ) : tableMenuKind === "column" ? (
          <TableAxisMenu
            active={activeTableStructureState.hasHeaderColumn}
            axisLabel="열"
            deleteLabel="열 삭제"
            hint="열 핸들을 드래그해 순서를 바꿀 수 있습니다."
            insertAfterLabel="오른쪽 열 추가"
            insertBeforeLabel="왼쪽 열 추가"
            titleLabel="제목 열"
            onDelete={() => runTableMenuEditorAction((activeEditor) => activeEditor.chain().focus().deleteColumn().run())}
            onInsertAfter={() =>
              runTableMenuEditorAction((activeEditor) => activeEditor.chain().focus().addColumnAfter().run())
            }
            onInsertBefore={() =>
              runTableMenuEditorAction((activeEditor) => activeEditor.chain().focus().addColumnBefore().run())
            }
            onToggleHeader={() =>
              runTableMenuEditorAction((activeEditor) => activeEditor.chain().focus().toggleHeaderColumn().run())
            }
          />
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

const TableAxisMenu = ({
  active,
  axisLabel,
  deleteLabel,
  hint,
  insertAfterLabel,
  insertBeforeLabel,
  titleLabel,
  onDelete,
  onInsertAfter,
  onInsertBefore,
  onToggleHeader,
}: {
  active: boolean
  axisLabel: string
  deleteLabel: string
  hint: string
  insertAfterLabel: string
  insertBeforeLabel: string
  titleLabel: string
  onDelete: () => void
  onInsertAfter: () => void
  onInsertBefore: () => void
  onToggleHeader: () => void
}) => (
  <>
    <TableMenuCompactSection>
      <TableMenuSectionTitle>{axisLabel} 액션</TableMenuSectionTitle>
      <TableMenuCompactList>
        <TableMenuCompactAction type="button" data-active={active} onClick={onToggleHeader}>
          {titleLabel}
        </TableMenuCompactAction>
        <TableMenuCompactAction type="button" onClick={onInsertBefore}>
          {insertBeforeLabel}
        </TableMenuCompactAction>
        <TableMenuCompactAction type="button" onClick={onInsertAfter}>
          {insertAfterLabel}
        </TableMenuCompactAction>
      </TableMenuCompactList>
    </TableMenuCompactSection>
    <TableMenuHint>{hint}</TableMenuHint>
    <FloatingBlockMenuDivider />
    <TableMenuCompactList>
      <TableMenuCompactAction type="button" data-variant="danger" onClick={onDelete}>
        {deleteLabel}
      </TableMenuCompactAction>
    </TableMenuCompactList>
  </>
)
