import type { BlockEditorDoc } from "./serialization"

const cloneNode = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const normalizeDocContent = (content: BlockEditorDoc["content"]) =>
  content && content.length > 0 ? content : [{ type: "paragraph" }]

const createDocument = (content: BlockEditorDoc["content"]): BlockEditorDoc => ({
  type: "doc",
  content: normalizeDocContent(content),
})

const isListNode = (node: BlockEditorDoc | undefined | null) =>
  node?.type === "bulletList" || node?.type === "orderedList" || node?.type === "taskList"

const findNestedListChildIndex = (node: BlockEditorDoc | undefined | null) =>
  node?.content?.findIndex((child) => isListNode(child as BlockEditorDoc)) ?? -1

export const insertTopLevelBlockAt = (
  doc: BlockEditorDoc,
  insertionIndex: number,
  blocks: NonNullable<BlockEditorDoc["content"]>
): BlockEditorDoc => {
  const content = [...normalizeDocContent(cloneNode(doc.content))]
  const nextBlocks = cloneNode(blocks)
  const clampedIndex = Math.max(0, Math.min(insertionIndex, content.length))
  content.splice(clampedIndex, 0, ...nextBlocks)
  return createDocument(content)
}

export const duplicateTopLevelBlockAt = (doc: BlockEditorDoc, blockIndex: number): BlockEditorDoc => {
  const content = [...normalizeDocContent(cloneNode(doc.content))]
  const target = content[blockIndex]
  if (!target) return createDocument(content)
  content.splice(blockIndex + 1, 0, cloneNode(target))
  return createDocument(content)
}

export const deleteTopLevelBlockAt = (doc: BlockEditorDoc, blockIndex: number): BlockEditorDoc => {
  const content = [...normalizeDocContent(cloneNode(doc.content))]
  if (blockIndex < 0 || blockIndex >= content.length) return createDocument(content)
  content.splice(blockIndex, 1)
  return createDocument(content)
}

export const moveTopLevelBlockToInsertionIndex = (
  doc: BlockEditorDoc,
  sourceIndex: number,
  insertionIndex: number
): BlockEditorDoc => {
  const content = [...normalizeDocContent(cloneNode(doc.content))]
  if (sourceIndex < 0 || sourceIndex >= content.length) return createDocument(content)

  const [moved] = content.splice(sourceIndex, 1)
  if (!moved) return createDocument(content)

  const normalizedInsertionIndex = Math.max(0, Math.min(insertionIndex, content.length + 1))
  const nextIndex = normalizedInsertionIndex > sourceIndex ? normalizedInsertionIndex - 1 : normalizedInsertionIndex
  content.splice(nextIndex, 0, moved)
  return createDocument(content)
}

export const moveTaskItemToInsertionIndex = (
  doc: BlockEditorDoc,
  taskListBlockIndex: number,
  taskListPath: number[],
  sourceItemIndex: number,
  insertionIndex: number
): BlockEditorDoc => {
  const content = [...normalizeDocContent(cloneNode(doc.content))]
  const taskList = content[taskListBlockIndex]
  if (!taskList || taskList.type !== "taskList") return createDocument(content)

  return moveNestedListItemToInsertionIndex(doc, taskListBlockIndex, taskListPath, sourceItemIndex, insertionIndex)
}

export const moveNestedListItemToInsertionIndex = (
  doc: BlockEditorDoc,
  listBlockIndex: number,
  listPath: number[],
  sourceItemIndex: number,
  insertionIndex: number
): BlockEditorDoc => {
  const content = [...normalizeDocContent(cloneNode(doc.content))]
  const rootList = content[listBlockIndex]
  if (!isListNode(rootList as BlockEditorDoc)) return createDocument(content)

  const readListAtPath = (node: BlockEditorDoc, path: number[]): BlockEditorDoc | null => {
    let current: BlockEditorDoc | null = node

    for (const itemIndex of path) {
      const listItem = current?.content?.[itemIndex] as BlockEditorDoc | undefined
      const nestedListIndex = findNestedListChildIndex(listItem)
      if (nestedListIndex < 0 || !listItem?.content?.[nestedListIndex]) return null
      current = listItem.content[nestedListIndex] as BlockEditorDoc
    }

    return current
  }

  const writeListAtPath = (
    node: BlockEditorDoc,
    path: number[],
    updater: (target: BlockEditorDoc) => BlockEditorDoc
  ): BlockEditorDoc => {
    if (path.length === 0) {
      return updater(node)
    }

    const [itemIndex, ...restPath] = path
    const items = Array.isArray(node.content) ? [...node.content] : []
    const taskItem = items[itemIndex]
    if (!taskItem) return node

    const nestedTaskListIndex = findNestedListChildIndex(taskItem as BlockEditorDoc)
    if (nestedTaskListIndex < 0 || !taskItem.content?.[nestedTaskListIndex]) return node

    const nestedTaskList = writeListAtPath(
      taskItem.content[nestedTaskListIndex] as BlockEditorDoc,
      restPath,
      updater
    )

    const nextTaskItemContent = [...(taskItem.content || [])]
    nextTaskItemContent[nestedTaskListIndex] = nestedTaskList
    items[itemIndex] = {
      ...taskItem,
      content: nextTaskItemContent,
    }

    return {
      ...node,
      content: items,
    }
  }

  const targetTaskList = readListAtPath(rootList as BlockEditorDoc, listPath)
  const taskItems = Array.isArray(targetTaskList?.content) ? [...targetTaskList.content] : null
  if (!taskItems) return createDocument(content)
  if (sourceItemIndex < 0 || sourceItemIndex >= taskItems.length) return createDocument(content)

  const [moved] = taskItems.splice(sourceItemIndex, 1)
  if (!moved) return createDocument(content)

  const normalizedInsertionIndex = Math.max(0, Math.min(insertionIndex, taskItems.length + 1))
  const nextIndex = normalizedInsertionIndex > sourceItemIndex ? normalizedInsertionIndex - 1 : normalizedInsertionIndex
  taskItems.splice(nextIndex, 0, moved)

  content[listBlockIndex] = {
    ...writeListAtPath(rootList as BlockEditorDoc, listPath, (currentTaskList) => ({
      ...currentTaskList,
      content: taskItems,
    })),
  }

  return createDocument(content)
}
