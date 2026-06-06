import type { Editor as TiptapEditor } from "@tiptap/core"
import { useEffect, useLayoutEffect } from "react"
import type {
  Dispatch,
  MutableRefObject,
  RefObject,
  SetStateAction,
} from "react"
import type { BlockEditorDoc } from "./serialization"
import {
  getTopLevelBlockIndexFromSelection,
  isStableBlockHandleState,
  isStableBlockSelectionOverlayState,
  type BlockSelectionOverlayState,
  type TopLevelBlockHandleState,
} from "./blockSelectionModel"
import {
  resolveBlockHandleAnchorTop,
  resolveBlockChromeTop,
  resolveBlockHandleRailLayoutForSurface,
  resolveBlockSelectionOverlayLayout,
  resolveThinBlockHandleAnchorTop,
  shouldCenterBlockHandleForNode,
  shouldUseThinBlockHandleAnchor,
} from "./blockHandleLayoutModel"
import {
  LIST_ITEM_SELECTOR,
  type NestedListItemContext,
  isSameNestedListItemContext,
} from "./nestedListItemModel"
import type { DraggedBlockState, DropIndicatorState } from "./blockDragModel"
import { hasNativeEditorTextSelection } from "./useFloatingBubbleState"

type SetState<T> = Dispatch<SetStateAction<T>>

type UseBlockEditorEngineBlockSelectionLayoutArgs = {
  blockHandleRailMetricsRef: MutableRefObject<{ width: number; height: number }>
  blockSelectionLayoutRectCacheRef: MutableRefObject<
    Map<number, { element: HTMLElement; rect: DOMRect }>
  >
  clickedBlockIndex: number | null
  draggedBlockState: DraggedBlockState
  dropIndicatorState: DropIndicatorState
  editor: TiptapEditor | null
  getContentRoot: () => HTMLElement | null
  getTopLevelBlockElementByIndex: (blockIndex: number) => HTMLElement | null
  getTopLevelBlockElements: () => HTMLElement[]
  hoveredBlockIndex: number | null
  hoveredListItemContext: NestedListItemContext | null
  isCoarsePointer: boolean
  isTableAffordanceVisible: boolean
  isTableStructuralSelection: boolean
  isTopLevelBlockHandleEligible: (blockIndex: number) => boolean
  keyboardBlockSelectionStickyRef: MutableRefObject<boolean>
  resolveEffectiveSelectedListItemContext: (
    editor?: TiptapEditor | null
  ) => NestedListItemContext | null
  selectedBlockIndex: number | null
  selectedBlockNodeIndex: number | null
  selectionTick: number
  setBlockHandleState: SetState<TopLevelBlockHandleState>
  setBlockSelectionOverlayState: SetState<BlockSelectionOverlayState>
  tableMenuState: unknown
  textSelectionBlockIndex: number | null
  viewportRef: RefObject<HTMLDivElement | null>
}

const useBlockSelectionLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect

const resolveNestedListItemSelectionRect = (
  listItemElement: HTMLElement
): Pick<DOMRect, "height" | "left" | "top" | "width"> => {
  const itemRect = listItemElement.getBoundingClientRect()
  const listRect = listItemElement.closest("ul, ol")?.getBoundingClientRect()
  if (!listRect) return itemRect

  const left = Math.min(itemRect.left, listRect.left)
  const right = Math.max(itemRect.right, listRect.right)
  return {
    height: itemRect.height,
    left,
    top: itemRect.top,
    width: Math.max(0, right - left),
  }
}

export const useBlockEditorEngineBlockSelectionLayout = ({
  blockHandleRailMetricsRef,
  blockSelectionLayoutRectCacheRef,
  clickedBlockIndex,
  draggedBlockState,
  dropIndicatorState,
  editor,
  getContentRoot,
  getTopLevelBlockElementByIndex,
  getTopLevelBlockElements,
  hoveredBlockIndex,
  hoveredListItemContext,
  isCoarsePointer,
  isTableAffordanceVisible,
  isTableStructuralSelection,
  isTopLevelBlockHandleEligible,
  keyboardBlockSelectionStickyRef,
  resolveEffectiveSelectedListItemContext,
  selectedBlockIndex,
  selectedBlockNodeIndex,
  selectionTick,
  setBlockHandleState,
  setBlockSelectionOverlayState,
  tableMenuState,
  textSelectionBlockIndex,
  viewportRef,
}: UseBlockEditorEngineBlockSelectionLayoutArgs) => {
  useBlockSelectionLayoutEffect(() => {
    if (!editor) return
    const viewportRect = viewportRef.current?.getBoundingClientRect() ?? null
    const handlePositionMode = isCoarsePointer ? "viewport" : "editor-local"
    const rectCache = blockSelectionLayoutRectCacheRef.current
    rectCache.clear()
    const selectedNestedListItemContext =
      resolveEffectiveSelectedListItemContext(editor)
    const resolveCachedBlockRect = (index: number) => {
      const cached = rectCache.get(index)
      if (cached) return cached
      const element = getTopLevelBlockElementByIndex(index)
      if (!element) return null
      const next = { element, rect: element.getBoundingClientRect() }
      rectCache.set(index, next)
      return next
    }
    if (selectedNestedListItemContext?.listItemElement?.isConnected) {
      const rect = resolveNestedListItemSelectionRect(
        selectedNestedListItemContext.listItemElement
      )
      const nextOverlayState: BlockSelectionOverlayState =
        resolveBlockSelectionOverlayLayout(rect, viewportRect)
      setBlockSelectionOverlayState((prev) =>
        isStableBlockSelectionOverlayState(prev, nextOverlayState)
          ? prev
          : nextOverlayState
      )
    } else {
      const overlayIndex =
        selectedBlockNodeIndex !== null
          ? selectedBlockNodeIndex
          : clickedBlockIndex
      if (overlayIndex === null) {
        setBlockSelectionOverlayState((prev) =>
          prev.visible ? { ...prev, visible: false } : prev
        )
      } else {
        const overlayTarget = resolveCachedBlockRect(overlayIndex)
        if (!overlayTarget) {
          setBlockSelectionOverlayState((prev) =>
            prev.visible ? { ...prev, visible: false } : prev
          )
        } else {
          const { rect } = overlayTarget
          const nextOverlayState: BlockSelectionOverlayState =
            resolveBlockSelectionOverlayLayout(rect, viewportRect)
          setBlockSelectionOverlayState((prev) =>
            isStableBlockSelectionOverlayState(prev, nextOverlayState)
              ? prev
              : nextOverlayState
          )
        }
      }
    }

    const stickySelectionActive =
      !isCoarsePointer &&
      selectedBlockNodeIndex !== null &&
      keyboardBlockSelectionStickyRef.current
    const structuralSelectionBlockIndex = isTableStructuralSelection
      ? selectedBlockIndex ?? getTopLevelBlockIndexFromSelection(editor)
      : null
    const effectiveSelectedListItemContext =
      resolveEffectiveSelectedListItemContext(editor)
    const activeListItemContext = hoveredListItemContext?.listItemElement
      ?.isConnected
      ? hoveredListItemContext
      : effectiveSelectedListItemContext?.listItemElement?.isConnected
      ? effectiveSelectedListItemContext
      : null
    const blockIndex = activeListItemContext
      ? activeListItemContext.listBlockIndex
      : isCoarsePointer
      ? selectedBlockIndex
      : stickySelectionActive
      ? selectedBlockNodeIndex
      : textSelectionBlockIndex ??
        hoveredBlockIndex ??
        structuralSelectionBlockIndex
    const hideBlockHandle = () =>
      setBlockHandleState((prev) =>
        prev.visible ? { ...prev, visible: false } : prev
      )
    const hasOuterBlockSelectionIntent = blockIndex !== null
    if (
      (isTableStructuralSelection && !hasOuterBlockSelectionIntent) ||
      (isTableAffordanceVisible && !hasOuterBlockSelectionIntent) ||
      tableMenuState
    ) {
      hideBlockHandle()
      return
    }
    if (blockIndex === null) {
      hideBlockHandle()
      return
    }
    const contentRoot =
      !isCoarsePointer && textSelectionBlockIndex !== null
        ? getContentRoot()
        : null
    const nativeTextSelectionActive = Boolean(
      contentRoot && hasNativeEditorTextSelection(contentRoot)
    )
    if (nativeTextSelectionActive && !stickySelectionActive) {
      hideBlockHandle()
      return
    }
    const { width: railWidth, height: railHeight } =
      blockHandleRailMetricsRef.current
    if (activeListItemContext?.listItemElement?.isConnected) {
      const rect = activeListItemContext.listItemElement.getBoundingClientRect()
      const railLayout = resolveBlockHandleRailLayoutForSurface(
        rect,
        railWidth,
        railHeight,
        resolveBlockHandleAnchorTop(
          activeListItemContext.listItemElement,
          railHeight
        ),
        viewportRect,
        handlePositionMode,
        activeListItemContext.listItemElement
      )
      const nextState: TopLevelBlockHandleState = {
        visible: true,
        kind: "list-item",
        blockIndex: activeListItemContext.listBlockIndex,
        listPath: [...activeListItemContext.listPath],
        itemIndex: activeListItemContext.itemIndex,
        left: railLayout.left,
        top: railLayout.top,
        bottom: resolveBlockChromeTop(
          rect.bottom + 12,
          viewportRect,
          handlePositionMode
        ),
        width: rect.width,
      }
      setBlockHandleState((prev) =>
        isStableBlockHandleState(prev, nextState) ? prev : nextState
      )
      rectCache.clear()
      return
    }

    const blockTarget = resolveCachedBlockRect(blockIndex)
    const blockElement = blockTarget?.element ?? null
    const canShowHandle = isTopLevelBlockHandleEligible(blockIndex)
    const shouldShow = Boolean(
      blockElement &&
        canShowHandle &&
        (isCoarsePointer ||
          stickySelectionActive ||
          textSelectionBlockIndex !== null ||
          hoveredBlockIndex !== null)
    )

    if (!shouldShow || !blockElement) {
      hideBlockHandle()
      return
    }

    const rect = blockTarget?.rect ?? blockElement.getBoundingClientRect()
    const blocks = ((editor.getJSON() as BlockEditorDoc).content ??
      []) as BlockEditorDoc[]
    const blockNode = blocks[blockIndex]
    const anchoredTop = shouldUseThinBlockHandleAnchor(blockNode)
      ? resolveThinBlockHandleAnchorTop(blockElement, railHeight)
      : shouldCenterBlockHandleForNode(blockNode)
      ? resolveBlockHandleAnchorTop(blockElement, railHeight)
      : rect.top + 6
    const railLayout = resolveBlockHandleRailLayoutForSurface(
      rect,
      railWidth,
      railHeight,
      anchoredTop,
      viewportRect,
      handlePositionMode,
      blockElement
    )
    const nextState: TopLevelBlockHandleState = {
      visible: true,
      kind: "top-level",
      blockIndex,
      listPath: [],
      itemIndex: null,
      left: railLayout.left,
      top: railLayout.top,
      bottom: resolveBlockChromeTop(
        rect.bottom + 12,
        viewportRect,
        handlePositionMode
      ),
      width: rect.width,
    }

    setBlockHandleState((prev) =>
      isStableBlockHandleState(prev, nextState) ? prev : nextState
    )
    rectCache.clear()
  }, [
    blockHandleRailMetricsRef,
    blockSelectionLayoutRectCacheRef,
    clickedBlockIndex,
    editor,
    getContentRoot,
    getTopLevelBlockElementByIndex,
    hoveredBlockIndex,
    hoveredListItemContext,
    isCoarsePointer,
    isTableAffordanceVisible,
    isTableStructuralSelection,
    isTopLevelBlockHandleEligible,
    keyboardBlockSelectionStickyRef,
    resolveEffectiveSelectedListItemContext,
    selectedBlockIndex,
    selectedBlockNodeIndex,
    selectionTick,
    setBlockHandleState,
    setBlockSelectionOverlayState,
    tableMenuState,
    textSelectionBlockIndex,
    viewportRef,
  ])

  useEffect(() => {
    const elements = getTopLevelBlockElements()
    const root = getContentRoot()
    const listItems = root
      ? Array.from(root.querySelectorAll<HTMLElement>(LIST_ITEM_SELECTOR))
      : []

    elements.forEach((element, index) => {
      if (hoveredListItemContext) {
        element.removeAttribute("data-block-hovered")
      } else if (index === hoveredBlockIndex && !draggedBlockState) {
        element.setAttribute("data-block-hovered", "true")
      } else {
        element.removeAttribute("data-block-hovered")
      }

      if (draggedBlockState && index === draggedBlockState.sourceIndex) {
        element.setAttribute("data-block-dragging", "true")
      } else {
        element.removeAttribute("data-block-dragging")
      }

      element.removeAttribute("data-block-drop-target")
    })

    listItems.forEach((element) => {
      if (
        hoveredListItemContext &&
        !draggedBlockState &&
        isSameNestedListItemContext(hoveredListItemContext, {
          ...hoveredListItemContext,
          listItemElement: element,
          listElement: hoveredListItemContext.listElement,
          listItems: hoveredListItemContext.listItems,
        }) &&
        element === hoveredListItemContext.listItemElement
      ) {
        element.setAttribute("data-block-hovered", "true")
      } else {
        element.removeAttribute("data-block-hovered")
      }

      element.removeAttribute("data-block-dragging")
      element.removeAttribute("data-block-drop-target")
    })

    return () => {
      elements.forEach((element) => {
        element.removeAttribute("data-block-hovered")
        element.removeAttribute("data-block-dragging")
        element.removeAttribute("data-block-drop-target")
      })
      listItems.forEach((element) => {
        element.removeAttribute("data-block-hovered")
        element.removeAttribute("data-block-dragging")
        element.removeAttribute("data-block-drop-target")
      })
    }
  }, [
    draggedBlockState,
    dropIndicatorState.insertionIndex,
    getContentRoot,
    getTopLevelBlockElements,
    hoveredBlockIndex,
    hoveredListItemContext,
  ])
}
