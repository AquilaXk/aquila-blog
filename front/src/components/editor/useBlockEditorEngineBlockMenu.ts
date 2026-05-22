import type { Editor as TiptapEditor } from "@tiptap/core"
import { useCallback, useEffect } from "react"
import type { Dispatch, RefObject, SetStateAction } from "react"
import {
  deleteTopLevelBlockAt,
  duplicateTopLevelBlockAt,
  moveTopLevelBlockToInsertionIndex,
} from "./blockDocumentOps"
import type { BlockEditorDoc } from "./serialization"
import type { BlockEditorBlockMenuState } from "./BlockEditorEngine.layers"

type UseBlockEditorEngineBlockMenuArgs = {
  blockMenuState: BlockEditorBlockMenuState
  editorRef: RefObject<TiptapEditor | null>
  isTableStructuralSelection: boolean
  mutateTopLevelBlocks: (mutator: (doc: BlockEditorDoc) => BlockEditorDoc, focusIndex?: number | null) => void
  setBlockMenuState: Dispatch<SetStateAction<BlockEditorBlockMenuState>>
}

export const useBlockEditorEngineBlockMenu = ({
  blockMenuState,
  editorRef,
  isTableStructuralSelection,
  mutateTopLevelBlocks,
  setBlockMenuState,
}: UseBlockEditorEngineBlockMenuArgs) => {
  const closeBlockMenus = useCallback(() => setBlockMenuState(null), [setBlockMenuState])

  const openBlockMenu = useCallback((blockIndex: number, anchorRect: DOMRect) => {
    if (isTableStructuralSelection) return
    setBlockMenuState((prev) =>
      prev && prev.blockIndex === blockIndex
        ? null
        : {
            blockIndex,
            left: Math.round(anchorRect.left),
            top: Math.round(anchorRect.bottom + 8),
          }
    )
  }, [isTableStructuralSelection, setBlockMenuState])

  const moveBlockByStep = useCallback(
    (blockIndex: number, delta: -1 | 1) => {
      const currentEditor = editorRef.current
      if (!currentEditor) return
      const contentLength = (currentEditor.getJSON() as BlockEditorDoc).content?.length ?? 0
      const nextIndex = Math.max(0, Math.min(blockIndex + delta, Math.max(contentLength - 1, 0)))
      if (nextIndex === blockIndex) return
      mutateTopLevelBlocks(
        (doc) => moveTopLevelBlockToInsertionIndex(doc, blockIndex, delta > 0 ? nextIndex + 1 : nextIndex),
        nextIndex
      )
      closeBlockMenus()
    },
    [closeBlockMenus, editorRef, mutateTopLevelBlocks]
  )

  const duplicateBlock = useCallback(
    (blockIndex: number) => {
      mutateTopLevelBlocks((doc) => duplicateTopLevelBlockAt(doc, blockIndex), blockIndex + 1)
      closeBlockMenus()
    },
    [closeBlockMenus, mutateTopLevelBlocks]
  )

  const deleteBlock = useCallback(
    (blockIndex: number) => {
      const currentEditor = editorRef.current
      if (!currentEditor) return
      const contentLength = (currentEditor.getJSON() as BlockEditorDoc).content?.length ?? 0
      const nextFocusIndex = Math.max(0, Math.min(blockIndex, Math.max(contentLength - 2, 0)))
      mutateTopLevelBlocks((doc) => deleteTopLevelBlockAt(doc, blockIndex), nextFocusIndex)
      closeBlockMenus()
    },
    [closeBlockMenus, editorRef, mutateTopLevelBlocks]
  )

  useEffect(() => {
    if (typeof window === "undefined" || !blockMenuState) return
    const close = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof PointerEvent) {
        const target = event.target
        if (target instanceof Element && target.closest("[data-block-menu-root='true']")) {
          return
        }
      }
      if (event instanceof KeyboardEvent && event.key !== "Escape") return
      setBlockMenuState(null)
    }
    window.addEventListener("pointerdown", close)
    window.addEventListener("keydown", close)
    return () => {
      window.removeEventListener("pointerdown", close)
      window.removeEventListener("keydown", close)
    }
  }, [blockMenuState, setBlockMenuState])

  return {
    closeBlockMenus,
    deleteBlock,
    duplicateBlock,
    moveBlockByStep,
    openBlockMenu,
  }
}
