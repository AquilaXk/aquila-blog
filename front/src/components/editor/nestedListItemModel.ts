import type { Editor as TiptapEditor } from "@tiptap/core"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import { NodeSelection, TextSelection } from "@tiptap/pm/state"

export type NestedListItemContext = {
  listBlockIndex: number
  listPath: number[]
  itemIndex: number
  listItemElement: HTMLElement
  listElement: HTMLElement
  listItems: HTMLElement[]
}

export const LIST_ITEM_SELECTOR =
  "li[data-type='taskItem'], li[data-task-item='true'], li[data-list-item='true'], li[data-type='listItem']"

export const LIST_CONTAINER_SELECTOR =
  "ul[data-type='taskList'], ul[data-task-list='true'], ul[data-type='bulletList'], ol[data-type='orderedList'], ul, ol"

export const isListContainerNodeName = (nodeName: string | undefined | null) =>
  nodeName === "bulletList" || nodeName === "orderedList" || nodeName === "taskList"

export const isListItemNodeName = (nodeName: string | undefined | null) =>
  nodeName === "listItem" || nodeName === "taskItem"

export const getActiveListItemName = (editor: TiptapEditor): "listItem" | "taskItem" | null => {
  const selection = editor.state.selection as typeof editor.state.selection & {
    node?: ProseMirrorNode
  }
  if (selection instanceof NodeSelection) {
    const nodeName = selection.node?.type?.name
    if (nodeName === "taskItem") return "taskItem"
    if (nodeName === "listItem") return "listItem"
  }

  const { $from } = selection
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const nodeName = $from.node(depth)?.type?.name
    if (nodeName === "taskItem") return "taskItem"
    if (nodeName === "listItem") return "listItem"
  }
  return null
}

export const sameListPath = (left: number[], right: number[]) =>
  left.length === right.length && left.every((value, index) => value === right[index])

export const getListItemNameFromContext = (
  context: NestedListItemContext | null | undefined
): "listItem" | "taskItem" | null => {
  if (!context?.listItemElement) return null
  if (context.listItemElement.matches("li[data-type='taskItem'], li[data-task-item='true']")) {
    return "taskItem"
  }
  return "listItem"
}

export const isSameNestedListItemContext = (
  left: NestedListItemContext | null | undefined,
  right: NestedListItemContext | null | undefined
) =>
  Boolean(
    left &&
      right &&
      left.listBlockIndex === right.listBlockIndex &&
      left.itemIndex === right.itemIndex &&
      sameListPath(left.listPath, right.listPath)
  )

const getTopLevelBlockPosition = (editor: TiptapEditor, blockIndex: number) => {
  const { doc } = editor.state
  if (doc.childCount === 0) return 1
  const clampedIndex = Math.max(0, Math.min(blockIndex, doc.childCount - 1))
  let position = 1
  for (let index = 0; index < clampedIndex; index += 1) {
    position += doc.child(index).nodeSize
  }
  return position
}

const getChildNodePosition = (parentNode: ProseMirrorNode, parentPos: number, childIndex: number) => {
  let position = parentPos + 1
  for (let index = 0; index < childIndex; index += 1) {
    position += parentNode.child(index).nodeSize
  }
  return position
}

const findNestedListChildIndexInNode = (node: ProseMirrorNode | null | undefined) => {
  if (!node) return -1
  for (let index = 0; index < node.childCount; index += 1) {
    if (isListContainerNodeName(node.child(index)?.type?.name)) {
      return index
    }
  }
  return -1
}

const resolveListItemNodeSelectionPos = (editor: TiptapEditor, context: NestedListItemContext) => {
  const { doc } = editor.state
  if (context.listBlockIndex < 0 || context.listBlockIndex >= doc.childCount) return null

  let currentListNode = doc.child(context.listBlockIndex)
  if (!isListContainerNodeName(currentListNode.type.name)) return null

  let currentListPos = getTopLevelBlockPosition(editor, context.listBlockIndex)
  for (const pathIndex of context.listPath) {
    if (pathIndex < 0 || pathIndex >= currentListNode.childCount) return null
    const parentItemPos = getChildNodePosition(currentListNode, currentListPos, pathIndex)
    const parentItemNode = currentListNode.child(pathIndex)
    const nestedListChildIndex = findNestedListChildIndexInNode(parentItemNode)
    if (nestedListChildIndex < 0) return null
    currentListPos = getChildNodePosition(parentItemNode, parentItemPos, nestedListChildIndex)
    currentListNode = parentItemNode.child(nestedListChildIndex)
    if (!isListContainerNodeName(currentListNode.type.name)) return null
  }

  if (context.itemIndex < 0 || context.itemIndex >= currentListNode.childCount) return null
  return getChildNodePosition(currentListNode, currentListPos, context.itemIndex)
}

const focusEditorViewWithoutScroll = (editor: TiptapEditor) => {
  if (typeof window === "undefined") {
    editor.view.focus()
    return
  }

  const previousScrollX = window.scrollX
  const previousScrollY = window.scrollY
  editor.view.focus()
  if (window.scrollX !== previousScrollX || window.scrollY !== previousScrollY) {
    window.scrollTo(previousScrollX, previousScrollY)
  }
}

export const selectNestedListItemNode = (editor: TiptapEditor, context: NestedListItemContext) => {
  const resolveDomMappedSelectionPos = () => {
    if (typeof HTMLElement === "undefined" || !(context.listItemElement instanceof HTMLElement)) return null

    try {
      const domPos = editor.view.posAtDOM(context.listItemElement, 0)
      const candidatePositions = [domPos, domPos - 1, domPos + 1]

      for (const candidatePos of candidatePositions) {
        if (!Number.isFinite(candidatePos)) continue
        if (candidatePos < 0 || candidatePos > editor.state.doc.content.size) continue

        try {
          const resolvedPos = editor.state.doc.resolve(candidatePos)
          if (isListItemNodeName(resolvedPos.nodeAfter?.type?.name)) {
            return resolvedPos.pos
          }
          if (isListItemNodeName(resolvedPos.nodeBefore?.type?.name)) {
            return resolvedPos.pos - resolvedPos.nodeBefore.nodeSize
          }
        } catch {
          continue
        }
      }
    } catch {
      return null
    }

    return null
  }

  const position = resolveDomMappedSelectionPos() ?? resolveListItemNodeSelectionPos(editor, context)
  if (position === null) return false
  const selection = NodeSelection.create(editor.state.doc, position)
  editor.view.dispatch(editor.state.tr.setSelection(selection))
  focusEditorViewWithoutScroll(editor)
  return true
}

export const selectNestedListItemTextAnchor = (editor: TiptapEditor, context: NestedListItemContext) => {
  if (
    typeof document === "undefined" ||
    typeof HTMLElement === "undefined" ||
    !(context.listItemElement instanceof HTMLElement)
  ) {
    return false
  }

  const walker = document.createTreeWalker(context.listItemElement, NodeFilter.SHOW_TEXT)
  let anchorTextNode: Text | null = null

  while (walker.nextNode()) {
    const currentNode = walker.currentNode
    if (!(currentNode instanceof Text)) continue
    if (!currentNode.data.trim()) continue
    anchorTextNode = currentNode
    break
  }

  if (!anchorTextNode) {
    return selectNestedListItemNode(editor, context)
  }

  try {
    const anchorOffset = Math.min(anchorTextNode.data.length, 1)
    const anchorPos = editor.view.posAtDOM(anchorTextNode, anchorOffset)
    const selection = TextSelection.create(editor.state.doc, anchorPos)
    editor.view.dispatch(editor.state.tr.setSelection(selection))
    focusEditorViewWithoutScroll(editor)
    return true
  } catch {
    return selectNestedListItemNode(editor, context)
  }
}
