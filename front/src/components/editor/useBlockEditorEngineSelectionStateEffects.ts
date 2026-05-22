import type { Editor as TiptapEditor } from "@tiptap/core"
import { NodeSelection, TextSelection } from "@tiptap/pm/state"
import { useEffect } from "react"
import type { Dispatch, MutableRefObject, SetStateAction } from "react"
import {
  getEditableTextPositionForTopLevelBlock,
  getTopLevelBlockIndexFromSelection,
} from "./blockSelectionModel"
import {
  type NestedListItemContext,
  isSameNestedListItemContext,
} from "./nestedListItemModel"
import { isTableSelectionActive } from "./tableStructureModel"

type SetState<T> = Dispatch<SetStateAction<T>>

type UseBlockEditorEngineSelectionStateEffectsArgs = {
  editor: TiptapEditor | null
  getNodeSelectedNestedListItemContext: (editor: TiptapEditor) => NestedListItemContext | null
  getSelectionAnchorNestedListItemContext: (editor: TiptapEditor) => NestedListItemContext | null
  keyboardBlockSelectionStickyRef: MutableRefObject<boolean>
  resolveEffectiveSelectedListItemContext: (editor?: TiptapEditor | null) => NestedListItemContext | null
  selectionUiSignatureRef: MutableRefObject<string>
  setClickedBlockIndex: SetState<number | null>
  setSelectedBlockIndex: SetState<number | null>
  setSelectedBlockNodeIndex: SetState<number | null>
  setSelectedListItemContext: SetState<NestedListItemContext | null>
  setSelectionTick: SetState<number>
  setTextSelectionBlockIndex: SetState<number | null>
}

export const useBlockEditorEngineSelectionStateEffects = ({
  editor,
  getNodeSelectedNestedListItemContext,
  getSelectionAnchorNestedListItemContext,
  keyboardBlockSelectionStickyRef,
  resolveEffectiveSelectedListItemContext,
  selectionUiSignatureRef,
  setClickedBlockIndex,
  setSelectedBlockIndex,
  setSelectedBlockNodeIndex,
  setSelectedListItemContext,
  setSelectionTick,
  setTextSelectionBlockIndex,
}: UseBlockEditorEngineSelectionStateEffectsArgs) => {
  useEffect(() => {
    if (!editor) return
    let disposed = false

    const notifySelection = () => {
      const selection = editor.state.selection as typeof editor.state.selection & {
        node?: { isBlock?: boolean }
      }
      const hasTextRangeSelection = selection instanceof TextSelection && !selection.empty
      const liveSelectedNestedListItemContext = getNodeSelectedNestedListItemContext(editor)
      const selectionAnchorNestedListItemContext = getSelectionAnchorNestedListItemContext(editor)
      const effectiveSelectedNestedListItemContext = resolveEffectiveSelectedListItemContext(editor)
      const shouldPreserveSelectedListItemContextForAnchorSelection = Boolean(
        hasTextRangeSelection &&
          selectionAnchorNestedListItemContext &&
          effectiveSelectedNestedListItemContext &&
          isSameNestedListItemContext(
            selectionAnchorNestedListItemContext,
            effectiveSelectedNestedListItemContext
          )
      )
      const selectedNestedListItemContext =
        liveSelectedNestedListItemContext?.listItemElement?.isConnected
          ? liveSelectedNestedListItemContext
          : shouldPreserveSelectedListItemContextForAnchorSelection
            ? selectionAnchorNestedListItemContext
            : effectiveSelectedNestedListItemContext
      if (liveSelectedNestedListItemContext?.listItemElement?.isConnected) {
        setSelectedListItemContext(liveSelectedNestedListItemContext)
      } else if (shouldPreserveSelectedListItemContextForAnchorSelection && selectionAnchorNestedListItemContext) {
        setSelectedListItemContext(selectionAnchorNestedListItemContext)
      }
      if (hasTextRangeSelection && keyboardBlockSelectionStickyRef.current) {
        keyboardBlockSelectionStickyRef.current = false
      }
      const nextBlockIndex = getTopLevelBlockIndexFromSelection(editor)
      const isTopLevelBlockNodeSelection = Boolean(
        selection instanceof NodeSelection && selection.$from.depth === 0 && selection.node?.isBlock
      )
      const isNestedListItemNodeSelection = Boolean(selectedNestedListItemContext)
      const inTableContext = isTableSelectionActive(editor) ? 1 : 0
      const selectedNestedListItemSignature = selectedNestedListItemContext
        ? `${selectedNestedListItemContext.listBlockIndex}:${selectedNestedListItemContext.listPath.join(".")}:${selectedNestedListItemContext.itemIndex}`
        : "none"
      const nextSignature = `${nextBlockIndex ?? "none"}:${hasTextRangeSelection ? 1 : 0}:${isTopLevelBlockNodeSelection ? 1 : 0}:${isNestedListItemNodeSelection ? 1 : 0}:${keyboardBlockSelectionStickyRef.current ? 1 : 0}:${inTableContext}:${selectedNestedListItemSignature}`
      if (nextSignature === selectionUiSignatureRef.current) {
        return
      }
      selectionUiSignatureRef.current = nextSignature
      setSelectionTick((prev) => prev + 1)
      setSelectedBlockIndex(nextBlockIndex)
      if (hasTextRangeSelection && !selectedNestedListItemContext) {
        setClickedBlockIndex(null)
        setSelectedBlockNodeIndex(null)
        setTextSelectionBlockIndex(nextBlockIndex)
        setSelectedListItemContext(null)
        return
      }
      setTextSelectionBlockIndex(null)
      if (isNestedListItemNodeSelection) {
        setClickedBlockIndex(null)
        setSelectedBlockNodeIndex(null)
        if (selectedNestedListItemContext?.listItemElement?.isConnected) {
          setSelectedListItemContext(selectedNestedListItemContext)
        }
        return
      }
      if (isTopLevelBlockNodeSelection) {
        setSelectedListItemContext(null)
        if (keyboardBlockSelectionStickyRef.current) {
          setClickedBlockIndex(null)
          setSelectedBlockNodeIndex(nextBlockIndex)
          return
        }

        const editablePos = getEditableTextPositionForTopLevelBlock(editor, nextBlockIndex)
        if (editablePos !== null) {
          const nextTextSelection = TextSelection.create(editor.state.doc, editablePos)
          editor.view.dispatch(editor.state.tr.setSelection(nextTextSelection))
        }
        setSelectedBlockNodeIndex(null)
        return
      }
      if (!keyboardBlockSelectionStickyRef.current) {
        setSelectedBlockNodeIndex(null)
      }
    }

    const notifyBlur = () => {
      selectionUiSignatureRef.current = ""
      setSelectionTick((prev) => prev + 1)
      const finalizeBlur = () => {
        if (disposed || editor.isFocused) return
        setClickedBlockIndex(null)
        setSelectedBlockIndex(null)
        setTextSelectionBlockIndex(null)
        if (!keyboardBlockSelectionStickyRef.current) {
          setSelectedBlockNodeIndex(null)
        }
      }
      if (typeof window !== "undefined") {
        window.requestAnimationFrame(finalizeBlur)
        return
      }
      finalizeBlur()
    }

    notifySelection()
    editor.on("selectionUpdate", notifySelection)
    editor.on("focus", notifySelection)
    editor.on("blur", notifyBlur)
    return () => {
      disposed = true
      editor.off("selectionUpdate", notifySelection)
      editor.off("focus", notifySelection)
      editor.off("blur", notifyBlur)
      selectionUiSignatureRef.current = ""
    }
  }, [
    editor,
    getNodeSelectedNestedListItemContext,
    getSelectionAnchorNestedListItemContext,
    keyboardBlockSelectionStickyRef,
    resolveEffectiveSelectedListItemContext,
    selectionUiSignatureRef,
    setClickedBlockIndex,
    setSelectedBlockIndex,
    setSelectedBlockNodeIndex,
    setSelectedListItemContext,
    setSelectionTick,
    setTextSelectionBlockIndex,
  ])
}
