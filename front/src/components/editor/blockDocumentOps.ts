import type { BlockEditorDoc } from "./serialization"

const cloneNode = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const normalizeDocContent = (content: BlockEditorDoc["content"]) =>
  content && content.length > 0 ? content : [{ type: "paragraph" }]

const createDocument = (content: BlockEditorDoc["content"]): BlockEditorDoc => ({
  type: "doc",
  content: normalizeDocContent(content),
})

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
  sourceItemIndex: number,
  insertionIndex: number
): BlockEditorDoc => {
  const content = [...normalizeDocContent(cloneNode(doc.content))]
  const taskList = content[taskListBlockIndex]
  const taskItems = Array.isArray(taskList?.content) ? [...taskList.content] : null
  if (!taskList || taskList.type !== "taskList" || !taskItems) return createDocument(content)
  if (sourceItemIndex < 0 || sourceItemIndex >= taskItems.length) return createDocument(content)

  const [moved] = taskItems.splice(sourceItemIndex, 1)
  if (!moved) return createDocument(content)

  const normalizedInsertionIndex = Math.max(0, Math.min(insertionIndex, taskItems.length + 1))
  const nextIndex = normalizedInsertionIndex > sourceItemIndex ? normalizedInsertionIndex - 1 : normalizedInsertionIndex
  taskItems.splice(nextIndex, 0, moved)

  content[taskListBlockIndex] = {
    ...taskList,
    content: taskItems,
  }

  return createDocument(content)
}
