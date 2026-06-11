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

export type NestedListItemBlockIndexResolver = (blockElement: HTMLElement) => number | null

export type NestedListItemClientPositionOptions = {
  leftGutterPx?: number
  rightPaddingPx?: number
}

export type NestedListItemDropIndicatorGeometry = {
  insertionIndex: number
  top: number
  left: number
  width: number
}

export const LIST_ITEM_SELECTOR =
  ":is(li[data-type='taskItem'], li[data-task-item='true'], li[data-list-item='true'], li[data-type='listItem'], li)"

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

const getTargetElement = (target: EventTarget | null) => {
  if (typeof Element !== "undefined" && target instanceof Element) return target
  if (typeof Node !== "undefined" && target instanceof Node) return target.parentElement
  return null
}

const getDirectListItemElements = (listElement: HTMLElement) =>
  Array.from(listElement.querySelectorAll(`:scope > ${LIST_ITEM_SELECTOR}`)) as HTMLElement[]

const resolveListBlockFromElement = (
  listElement: HTMLElement,
  resolveListBlockIndex: NestedListItemBlockIndexResolver
) => {
  let blockElement: HTMLElement | null = listElement
  while (blockElement) {
    const listBlockIndex = resolveListBlockIndex(blockElement)
    if (listBlockIndex !== null && listBlockIndex >= 0) {
      return {
        blockElement,
        listBlockIndex,
      }
    }
    blockElement = blockElement.parentElement
  }
  return null
}

export const resolveNestedListItemContextFromTarget = (
  target: EventTarget | null,
  resolveListBlockIndex: NestedListItemBlockIndexResolver
): NestedListItemContext | null => {
  if (typeof HTMLElement === "undefined") return null

  const targetElement = getTargetElement(target)
  const listItemElement = targetElement?.closest(LIST_ITEM_SELECTOR)
  if (!(listItemElement instanceof HTMLElement)) return null
  const listElement = listItemElement.closest(LIST_CONTAINER_SELECTOR)
  if (!(listElement instanceof HTMLElement)) return null

  const listBlock = resolveListBlockFromElement(listElement, resolveListBlockIndex)
  if (!listBlock) return null

  const listItems = getDirectListItemElements(listElement)
  const itemIndex = listItems.indexOf(listItemElement)
  if (itemIndex < 0) return null

  const listPath: number[] = []
  let currentListElement: HTMLElement | null = listElement
  while (currentListElement && currentListElement !== listBlock.blockElement) {
    const parentListItem: HTMLElement | null =
      currentListElement.parentElement?.closest(LIST_ITEM_SELECTOR) ?? null
    if (!(parentListItem instanceof HTMLElement)) break
    const parentList: HTMLElement | null =
      parentListItem.parentElement?.closest(LIST_CONTAINER_SELECTOR) ?? null
    if (!(parentList instanceof HTMLElement)) break

    const siblingItems = getDirectListItemElements(parentList)
    const parentItemIndex = siblingItems.indexOf(parentListItem)
    if (parentItemIndex < 0) break

    listPath.unshift(parentItemIndex)
    currentListElement = parentList
  }

  return {
    listBlockIndex: listBlock.listBlockIndex,
    listPath,
    itemIndex,
    listItemElement,
    listElement,
    listItems,
  }
}

export const resolveNestedListItemContextByClientPosition = (
  root: HTMLElement | null,
  clientX: number,
  clientY: number,
  resolveListBlockIndex: NestedListItemBlockIndexResolver,
  options: NestedListItemClientPositionOptions = {}
) => {
  if (!root) return null

  const leftGutterPx = options.leftGutterPx ?? 0
  const rightPaddingPx = options.rightPaddingPx ?? 0
  const candidates = Array.from(root.querySelectorAll<HTMLElement>(LIST_ITEM_SELECTOR))
    .map((element) => {
      const rect = element.getBoundingClientRect()
      return { element, rect, area: rect.width * rect.height }
    })
    .filter(({ rect }) => {
      if (rect.width <= 0 || rect.height <= 0) return false
      return (
        clientY >= rect.top &&
        clientY <= rect.bottom &&
        clientX >= rect.left - leftGutterPx &&
        clientX <= rect.right + rightPaddingPx
      )
    })
    .sort((left, right) => left.area - right.area)

  return candidates[0]
    ? resolveNestedListItemContextFromTarget(candidates[0].element, resolveListBlockIndex)
    : null
}

export const resolveNodeSelectedNestedListItemContext = (
  editor: TiptapEditor,
  resolveListBlockIndex: NestedListItemBlockIndexResolver
) => {
  const selection = editor.state.selection as typeof editor.state.selection & {
    node?: ProseMirrorNode
  }
  if (!(selection instanceof NodeSelection) || !isListItemNodeName(selection.node?.type?.name)) {
    return null
  }

  const domNode = editor.view.nodeDOM(selection.from)
  return resolveNestedListItemContextFromTarget(domNode, resolveListBlockIndex)
}

export const resolveSelectionAnchorNestedListItemContext = (
  editor: TiptapEditor,
  resolveListBlockIndex: NestedListItemBlockIndexResolver
) => {
  const { $from } = editor.state.selection

  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if (!isListItemNodeName($from.node(depth)?.type?.name)) continue

    try {
      const domNode = editor.view.nodeDOM($from.before(depth))
      return resolveNestedListItemContextFromTarget(domNode, resolveListBlockIndex)
    } catch {
      return null
    }
  }

  return null
}

export const resolveNestedListItemContextByIndices = (
  blockElement: HTMLElement | null,
  listBlockIndex: number,
  listPath: number[],
  itemIndex: number
): NestedListItemContext | null => {
  if (!(blockElement instanceof HTMLElement)) return null

  let currentListElement: HTMLElement | null = blockElement.matches(LIST_CONTAINER_SELECTOR) ? blockElement : null
  if (!currentListElement) return null

  for (const parentItemIndex of listPath) {
    const parentItems = getDirectListItemElements(currentListElement)
    const parentItem = parentItems[parentItemIndex]
    if (!(parentItem instanceof HTMLElement)) return null
    const nestedListElement =
      Array.from(parentItem.children).find(
        (child): child is HTMLElement =>
          child instanceof HTMLElement && child.matches(LIST_CONTAINER_SELECTOR)
      ) ?? null
    if (!(nestedListElement instanceof HTMLElement)) return null
    currentListElement = nestedListElement
  }

  const listItems = getDirectListItemElements(currentListElement)
  const listItemElement = listItems[itemIndex]
  if (!(listItemElement instanceof HTMLElement)) return null

  return {
    listBlockIndex,
    listPath,
    itemIndex,
    listItemElement,
    listElement: currentListElement,
    listItems,
  }
}

export const resolveNestedListItemDropIndicator = (
  listElement: HTMLElement,
  clientY: number
): NestedListItemDropIndicatorGeometry => {
  const listItems = getDirectListItemElements(listElement)
  if (!listItems.length) {
    const rect = listElement.getBoundingClientRect()
    return {
      insertionIndex: 0,
      top: Math.round(rect.top),
      left: Math.round(rect.left),
      width: Math.round(rect.width),
    }
  }

  let insertionIndex = listItems.length
  let top = listItems[listItems.length - 1].getBoundingClientRect().bottom

  for (let index = 0; index < listItems.length; index += 1) {
    const rect = listItems[index].getBoundingClientRect()
    const midpoint = rect.top + rect.height / 2
    if (clientY < midpoint) {
      insertionIndex = index
      top = rect.top
      break
    }
  }

  const rootRect = listElement.getBoundingClientRect()
  return {
    insertionIndex,
    top: Math.round(top),
    left: Math.round(rootRect.left + 12),
    width: Math.max(48, Math.round(rootRect.width - 24)),
  }
}

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

export const selectNestedListItemTextAtPoint = (
  editor: TiptapEditor,
  context: NestedListItemContext,
  clientX: number,
  clientY: number
) => {
  if (
    typeof HTMLElement === "undefined" ||
    !(context.listItemElement instanceof HTMLElement)
  ) {
    return false
  }

  const createDomCaretPosition = (textNode: Text, offset: number) => {
    if (!context.listItemElement.contains(textNode)) return null
    try {
      return {
        offset,
        pos: editor.view.posAtDOM(textNode, offset),
        textNode,
      }
    } catch {
      return null
    }
  }
  const resolveNearestTextCaretPosition = () => {
    if (typeof document === "undefined") return null
    const walker = document.createTreeWalker(
      context.listItemElement,
      NodeFilter.SHOW_TEXT
    )
    type TextCaretCandidate = { distance: number; offset: number; textNode: Text }
    let best: TextCaretCandidate | null = null
    while (walker.nextNode()) {
      const textNode = walker.currentNode
      if (!(textNode instanceof Text) || !textNode.data.trim()) continue
      for (let index = 0; index < textNode.data.length; index += 1) {
        const range = document.createRange()
        range.setStart(textNode, index)
        range.setEnd(textNode, index + 1)
        for (const rect of Array.from(range.getClientRects())) {
          if (rect.width <= 0 || rect.height <= 0) continue
          const offset = clientX <= rect.left + rect.width / 2 ? index : index + 1
          const dx =
            clientX < rect.left
              ? rect.left - clientX
              : clientX > rect.right
                ? clientX - rect.right
                : 0
          const dy =
            clientY < rect.top
              ? rect.top - clientY
              : clientY > rect.bottom
                ? clientY - rect.bottom
                : 0
          const distance = dx * dx + dy * dy
          if (!best || distance < best.distance) {
            best = { distance, offset, textNode }
          }
        }
      }
    }
    const candidate = best
    return candidate
      ? createDomCaretPosition(candidate.textNode, candidate.offset)
      : null
  }
  const resolveDomCaretPosition = () => {
    if (typeof document === "undefined") return null
    const caretDocument = document as Document & {
      caretPositionFromPoint?: (
        x: number,
        y: number
      ) => { offsetNode: Node; offset: number } | null
      caretRangeFromPoint?: (x: number, y: number) => Range | null
    }
    const caretPosition = caretDocument.caretPositionFromPoint?.(clientX, clientY)
    const caretRange = caretPosition
      ? null
      : caretDocument.caretRangeFromPoint?.(clientX, clientY)
    const offsetNode = caretPosition?.offsetNode ?? caretRange?.startContainer
    const offset = caretPosition?.offset ?? caretRange?.startOffset
    if (!(offsetNode instanceof Text) || typeof offset !== "number") return null
    return createDomCaretPosition(offsetNode, offset)
  }
  const domCaretPosition =
    resolveDomCaretPosition() ?? resolveNearestTextCaretPosition()
  type DomCaretPosition = NonNullable<ReturnType<typeof createDomCaretPosition>>
  const restoreDomCaretSelection = (caretPosition: DomCaretPosition | null) => {
    if (!caretPosition || typeof window === "undefined") return
    if (!context.listItemElement.contains(caretPosition.textNode)) return
    const selection = window.getSelection()
    if (!selection) return
    const range = document.createRange()
    const offset = Math.max(
      0,
      Math.min(caretPosition.offset, caretPosition.textNode.data.length)
    )
    range.setStart(caretPosition.textNode, offset)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)
  }
  const selectFallbackTextCaret = () => {
    const fallbackCaret = domCaretPosition ?? resolveNearestTextCaretPosition()
    const fallbackPos =
      fallbackCaret?.pos ??
      editor.view.posAtCoords({ left: clientX, top: clientY })?.pos ??
      null
    if (fallbackPos === null) {
      restoreDomCaretSelection(fallbackCaret)
      return Boolean(fallbackCaret)
    }
    try {
      const selection = TextSelection.create(editor.state.doc, fallbackPos)
      editor.view.dispatch(editor.state.tr.setSelection(selection))
      focusEditorViewWithoutScroll(editor)
      restoreDomCaretSelection(fallbackCaret)
      return true
    } catch {
      try {
        const selection = TextSelection.near(
          editor.state.doc.resolve(fallbackPos),
          1
        )
        if (!(selection instanceof TextSelection)) {
          restoreDomCaretSelection(fallbackCaret)
          return Boolean(fallbackCaret)
        }
        editor.view.dispatch(editor.state.tr.setSelection(selection))
        focusEditorViewWithoutScroll(editor)
        restoreDomCaretSelection(fallbackCaret)
        return true
      } catch {
        restoreDomCaretSelection(fallbackCaret)
        return Boolean(fallbackCaret)
      }
    }
  }
  const pointPosition =
    domCaretPosition !== null
      ? { pos: domCaretPosition.pos }
      : editor.view.posAtCoords({ left: clientX, top: clientY })
  const listItemPos = resolveListItemNodeSelectionPos(editor, context)
  const listItemNode =
    listItemPos !== null ? editor.state.doc.nodeAt(listItemPos) : null
  if (
    !pointPosition ||
    listItemPos === null ||
    !listItemNode ||
    !isListItemNodeName(listItemNode.type.name)
  ) {
    return selectFallbackTextCaret()
  }

  const minPos = listItemPos + 1
  const maxPos = Math.max(minPos, listItemPos + listItemNode.nodeSize - 1)
  const selectionPos = Math.max(minPos, Math.min(pointPosition.pos, maxPos))

  try {
    const selection = TextSelection.create(editor.state.doc, selectionPos)
    editor.view.dispatch(editor.state.tr.setSelection(selection))
    focusEditorViewWithoutScroll(editor)
    restoreDomCaretSelection(domCaretPosition)
    return true
  } catch {
    try {
      const selection = TextSelection.near(
        editor.state.doc.resolve(selectionPos),
        1
      )
      if (!(selection instanceof TextSelection)) {
        return selectFallbackTextCaret()
      }
      editor.view.dispatch(editor.state.tr.setSelection(selection))
      focusEditorViewWithoutScroll(editor)
      restoreDomCaretSelection(domCaretPosition)
      return true
    } catch {
      return selectFallbackTextCaret()
    }
  }
}
