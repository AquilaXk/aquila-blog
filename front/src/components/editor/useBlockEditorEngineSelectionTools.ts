import type { Editor as TiptapEditor } from "@tiptap/core"
import { useCallback, useEffect } from "react"
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from "react"
import type { BlockEditorDoc } from "./serialization"
import {
  BLOCK_OUTER_SELECT_LEFT_GUTTER_PX,
  type BlockSelectionPointerEventLike,
  getEditableTextPositionForTopLevelBlock,
  getTopLevelBlockIndexFromSelection,
  isTabBlockSelectionEligible,
  resolveOuterBlockSelectionGesture,
  resolveOuterListItemSelectionGesture,
  selectTopLevelBlockNode,
} from "./blockSelectionModel"
import {
  type NestedListItemContext,
  getActiveListItemName,
  getListItemNameFromContext,
  isSameNestedListItemContext,
  resolveNestedListItemContextByClientPosition,
  resolveNestedListItemContextByIndices as resolveNestedListItemContextFromBlockElement,
  resolveNestedListItemContextFromTarget,
  resolveNestedListItemDropIndicator,
  resolveNodeSelectedNestedListItemContext,
  resolveSelectionAnchorNestedListItemContext,
} from "./nestedListItemModel"
import { blockHasVisibleContent, focusElementWithoutScroll } from "./useBlockEditorEngineDocumentOps"

type SetState<T> = Dispatch<SetStateAction<T>>

type UseBlockEditorEngineSelectionToolsArgs = {
  clearSelectedBlockNodeIndex: SetState<number | null>
  editorRef: RefObject<TiptapEditor | null>
  getContentRoot: () => HTMLElement | null
  getTopLevelBlockElementByIndex: (blockIndex: number) => HTMLElement | null
  getTopLevelBlockElements: () => HTMLElement[]
  keyboardBlockSelectionStickyRef: MutableRefObject<boolean>
  selectedBlockNodeIndexRef: MutableRefObject<number | null>
  selectedListItemContext: NestedListItemContext | null
  selectedListItemContextRef: MutableRefObject<NestedListItemContext | null>
  setClickedBlockIndex: SetState<number | null>
  setSelectedBlockIndex: SetState<number | null>
  setSelectedListItemContext: SetState<NestedListItemContext | null>
  setSelectionTick: SetState<number>
  setTextSelectionBlockIndex: SetState<number | null>
  syncSelectedBlockNodeSurface: (blockIndex: number | null) => void
  viewportRef: RefObject<HTMLDivElement | null>
}

export const useBlockEditorEngineSelectionTools = ({
  clearSelectedBlockNodeIndex,
  editorRef,
  getContentRoot,
  getTopLevelBlockElementByIndex,
  getTopLevelBlockElements,
  keyboardBlockSelectionStickyRef,
  selectedBlockNodeIndexRef,
  selectedListItemContext,
  selectedListItemContextRef,
  setClickedBlockIndex,
  setSelectedBlockIndex,
  setSelectedListItemContext,
  setSelectionTick,
  setTextSelectionBlockIndex,
  syncSelectedBlockNodeSurface,
  viewportRef,
}: UseBlockEditorEngineSelectionToolsArgs) => {
  const clearStickyTopLevelBlockSelection = useCallback(() => {
    keyboardBlockSelectionStickyRef.current = false
    selectedBlockNodeIndexRef.current = null
    setClickedBlockIndex(null)
    clearSelectedBlockNodeIndex(null)
    setTextSelectionBlockIndex(null)
    syncSelectedBlockNodeSurface(null)
  }, [
    clearSelectedBlockNodeIndex,
    keyboardBlockSelectionStickyRef,
    selectedBlockNodeIndexRef,
    setClickedBlockIndex,
    setTextSelectionBlockIndex,
    syncSelectedBlockNodeSurface,
  ])

  const clearNativeTextSelection = useCallback(() => {
    if (typeof window === "undefined") return
    const clearRanges = () => {
      const domSelection = window.getSelection()
      if (domSelection?.rangeCount) {
        domSelection.removeAllRanges()
      }
    }

    clearRanges()
    window.requestAnimationFrame(() => {
      clearRanges()
      focusElementWithoutScroll(viewportRef.current)
      window.requestAnimationFrame(() => {
        clearRanges()
      })
    })
  }, [viewportRef])

  const promoteTopLevelBlockSelection = useCallback(
    (blockIndex: number) => {
      const currentEditor = editorRef.current
      if (!currentEditor) return false
      keyboardBlockSelectionStickyRef.current = true
      selectTopLevelBlockNode(currentEditor, blockIndex)
      setClickedBlockIndex(null)
      setSelectedBlockIndex(blockIndex)
      clearSelectedBlockNodeIndex(blockIndex)
      setTextSelectionBlockIndex(null)
      syncSelectedBlockNodeSurface(blockIndex)
      setSelectionTick((prev) => prev + 1)
      clearNativeTextSelection()
      if (typeof window !== "undefined") {
        window.requestAnimationFrame(() => {
          clearSelectedBlockNodeIndex(blockIndex)
          syncSelectedBlockNodeSurface(blockIndex)
          setSelectionTick((prev) => prev + 1)
        })
      }
      return true
    },
    [
      clearNativeTextSelection,
      clearSelectedBlockNodeIndex,
      editorRef,
      keyboardBlockSelectionStickyRef,
      setClickedBlockIndex,
      setSelectedBlockIndex,
      setSelectionTick,
      setTextSelectionBlockIndex,
      syncSelectedBlockNodeSurface,
    ]
  )

  const isTopLevelBlockHandleEligible = useCallback((blockIndex: number) => {
    const currentEditor = editorRef.current
    if (!currentEditor) return false
    const blocks = ((currentEditor.getJSON() as BlockEditorDoc).content ?? []) as BlockEditorDoc[]
    const block = blocks[blockIndex]
    if (!block) return false
    if (blocks.length > 1) return true
    return blockHasVisibleContent(block)
  }, [editorRef])

  const findTopLevelBlockIndexFromTarget = useCallback(
    (target: EventTarget | null) => {
      const root = getContentRoot()
      if (!root) return null

      const normalizedTarget =
        target instanceof Element
          ? target
          : target instanceof Node
            ? target.parentElement
            : null
      if (!(normalizedTarget instanceof Element)) return null

      let element: Element | null = normalizedTarget
      while (element && element.parentElement !== root) {
        element = element.parentElement
      }

      if (!element || element.parentElement !== root) return null
      return getTopLevelBlockElements().indexOf(element as HTMLElement)
    },
    [getContentRoot, getTopLevelBlockElements]
  )

  const findTopLevelBlockIndexByClientPosition = useCallback(
    (clientX: number, clientY: number) => {
      const elements = getTopLevelBlockElements()
      if (!elements.length) return null

      let bestIndex: number | null = null
      let bestDistance = Number.POSITIVE_INFINITY

      for (let index = 0; index < elements.length; index += 1) {
        const rect = elements[index].getBoundingClientRect()
        const expandedTop = rect.top - 10
        const expandedBottom = rect.bottom + 10
        const expandedLeft = rect.left - 28
        const expandedRight = rect.right + 16
        const inside =
          clientY >= expandedTop &&
          clientY <= expandedBottom &&
          clientX >= expandedLeft &&
          clientX <= expandedRight

        if (inside) {
          return index
        }

        const centerY = rect.top + rect.height / 2
        const distance = Math.abs(clientY - centerY)
        if (distance < bestDistance) {
          bestDistance = distance
          bestIndex = index
        }
      }

      return bestIndex
    },
    [getTopLevelBlockElements]
  )

  const isOuterBlockSelectionGesture = useCallback(
    (event: BlockSelectionPointerEventLike, targetBlockIndex: number | null) => {
      const blockElement = targetBlockIndex !== null ? getTopLevelBlockElementByIndex(targetBlockIndex) : null
      return resolveOuterBlockSelectionGesture(event, blockElement)
    },
    [getTopLevelBlockElementByIndex]
  )

  const isOuterListItemSelectionGesture = useCallback(
    (event: BlockSelectionPointerEventLike, targetListItem: NestedListItemContext | null) => {
      return resolveOuterListItemSelectionGesture(event, targetListItem?.listItemElement ?? null)
    },
    []
  )

  const resolveNestedListBlockIndex = useCallback(
    (blockElement: HTMLElement) => {
      const root = getContentRoot()
      if (!root || blockElement.parentElement !== root) return null
      const index = getTopLevelBlockElements().indexOf(blockElement)
      return index >= 0 ? index : null
    },
    [getContentRoot, getTopLevelBlockElements]
  )

  const findNestedListItemContextFromTarget = useCallback(
    (target: EventTarget | null) => resolveNestedListItemContextFromTarget(target, resolveNestedListBlockIndex),
    [resolveNestedListBlockIndex]
  )

  const findNestedListItemContextByClientPosition = useCallback(
    (clientX: number, clientY: number) => {
      return resolveNestedListItemContextByClientPosition(
        getContentRoot(),
        clientX,
        clientY,
        resolveNestedListBlockIndex,
        {
          leftGutterPx: BLOCK_OUTER_SELECT_LEFT_GUTTER_PX,
          rightPaddingPx: 8,
        }
      )
    },
    [getContentRoot, resolveNestedListBlockIndex]
  )

  const getNodeSelectedNestedListItemContext = useCallback(
    (currentEditor: TiptapEditor) => {
      return resolveNodeSelectedNestedListItemContext(currentEditor, resolveNestedListBlockIndex)
    },
    [resolveNestedListBlockIndex]
  )

  const getSelectionAnchorNestedListItemContext = useCallback(
    (currentEditor: TiptapEditor) => {
      return resolveSelectionAnchorNestedListItemContext(currentEditor, resolveNestedListBlockIndex)
    },
    [resolveNestedListBlockIndex]
  )

  const resolveNestedListItemContextByIndices = useCallback(
    (listBlockIndex: number, listPath: number[], itemIndex: number) => {
      const blockElement = getTopLevelBlockElementByIndex(listBlockIndex)
      return resolveNestedListItemContextFromBlockElement(blockElement, listBlockIndex, listPath, itemIndex)
    },
    [getTopLevelBlockElementByIndex]
  )

  const resolveEffectiveSelectedListItemContext = useCallback(
    (activeEditor?: TiptapEditor | null) => {
      const liveSelectedListItemContext = activeEditor ? getNodeSelectedNestedListItemContext(activeEditor) : null
      if (liveSelectedListItemContext?.listItemElement?.isConnected) {
        return liveSelectedListItemContext
      }
      if (selectedListItemContextRef.current?.listItemElement?.isConnected) {
        return selectedListItemContextRef.current
      }
      if (selectedListItemContext?.listItemElement?.isConnected) {
        return selectedListItemContext
      }
      const persistedSelectedListItemContext =
        selectedListItemContextRef.current ?? selectedListItemContext
      if (!persistedSelectedListItemContext) {
        return null
      }
      return resolveNestedListItemContextByIndices(
        persistedSelectedListItemContext.listBlockIndex,
        persistedSelectedListItemContext.listPath,
        persistedSelectedListItemContext.itemIndex
      )
    },
    [getNodeSelectedNestedListItemContext, resolveNestedListItemContextByIndices, selectedListItemContext, selectedListItemContextRef]
  )

  const resolveActiveListItemInteraction = useCallback(
    (activeEditor: TiptapEditor) => {
      const activeListItemContext = resolveEffectiveSelectedListItemContext(activeEditor)
      const liveSelectionListItemContext =
        getNodeSelectedNestedListItemContext(activeEditor) ??
        getSelectionAnchorNestedListItemContext(activeEditor)
      const shouldRestoreSelectedListItemContext = Boolean(
        activeListItemContext &&
          (!liveSelectionListItemContext ||
            !isSameNestedListItemContext(liveSelectionListItemContext, activeListItemContext))
      )
      const activeListItemName = shouldRestoreSelectedListItemContext ? null : getActiveListItemName(activeEditor)
      const fallbackListItemName = getListItemNameFromContext(activeListItemContext)
      const listItemName = activeListItemName ?? fallbackListItemName
      return {
        listItemName,
        context: activeListItemContext,
        shouldRestoreNodeSelection: Boolean(
          shouldRestoreSelectedListItemContext && activeListItemContext && listItemName
        ),
      }
    },
    [
      getNodeSelectedNestedListItemContext,
      getSelectionAnchorNestedListItemContext,
      resolveEffectiveSelectedListItemContext,
    ]
  )

  useEffect(() => {
    selectedListItemContextRef.current = selectedListItemContext
  }, [selectedListItemContext, selectedListItemContextRef])

  const resolveNestedListItemDropIndicatorByClientY = useCallback(
    (listElement: HTMLElement, clientY: number) => resolveNestedListItemDropIndicator(listElement, clientY),
    []
  )

  return {
    clearNativeTextSelection,
    clearStickyTopLevelBlockSelection,
    findNestedListItemContextByClientPosition,
    findNestedListItemContextFromTarget,
    findTopLevelBlockIndexByClientPosition,
    findTopLevelBlockIndexFromTarget,
    getNodeSelectedNestedListItemContext,
    getSelectionAnchorNestedListItemContext,
    isOuterBlockSelectionGesture,
    isOuterListItemSelectionGesture,
    isTopLevelBlockHandleEligible,
    promoteTopLevelBlockSelection,
    resolveActiveListItemInteraction,
    resolveEffectiveSelectedListItemContext,
    resolveNestedListItemContextByIndices,
    resolveNestedListItemDropIndicatorByClientY,
  }
}
