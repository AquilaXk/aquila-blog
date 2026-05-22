
import { Mark, mergeAttributes } from "@tiptap/core"
import ListKeymap from "@tiptap/extension-list-keymap"
import ListItem from "@tiptap/extension-list-item"
import { Table } from "@tiptap/extension-table"
import TableCell from "@tiptap/extension-table-cell"
import TableHeader from "@tiptap/extension-table-header"
import TableRow from "@tiptap/extension-table-row"
import TaskItem from "@tiptap/extension-task-item"
import TaskList from "@tiptap/extension-task-list"
import { normalizeInlineColorToken } from "src/libs/markdown/inlineColor"
import { TABLE_MIN_ROW_HEIGHT_PX } from "src/libs/markdown/tableMetadata"

export { CalloutBlock } from "./calloutNodeView"
export { EditorCodeBlock, getPreferredCodeLanguage, normalizeCodeLanguage } from "./codeBlockNodeView"
export { FormulaBlock, InlineFormula } from "./formulaNodeViews"
export { BookmarkBlock, EmbedBlock, FileBlock } from "./linkCardNodeViews"
export { MermaidBlock } from "./mermaidNodeView"
export { RawMarkdownBlock } from "./rawMarkdownNodeView"
export { ResizableImage } from "./resizableImageNodeView"
export { ToggleBlock } from "./toggleNodeView"

export const InlineColorMark = Mark.create({
  name: "inlineColor",
  excludes: "inlineColor code",

  addAttributes() {
    return {
      color: {
        default: null,
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: "span[data-inline-color]",
        getAttrs: (element) => {
          const color = normalizeInlineColorToken(
            (element as HTMLElement).getAttribute("data-inline-color") || ""
          )
          return color ? { color } : false
        },
      },
      {
        tag: "span[style]",
        getAttrs: (element) => {
          const color = normalizeInlineColorToken((element as HTMLElement).style.color || "")
          return color ? { color } : false
        },
      },
      {
        tag: "font[color]",
        getAttrs: (element) => {
          const color = normalizeInlineColorToken((element as HTMLElement).getAttribute("color") || "")
          return color ? { color } : false
        },
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    const color = normalizeInlineColorToken(String(HTMLAttributes.color || ""))
    if (!color) return ["span", 0]

    const { color: _ignoredColor, style, ...rest } = HTMLAttributes
    const nextStyle = [style, `--aq-inline-color:${color}`, `color:${color}`].filter(Boolean).join("; ")

    return [
      "span",
      mergeAttributes(rest, {
        "data-inline-color": color,
        style: nextStyle,
      }),
      0,
    ]
  },
})

export const EditorTableRow = TableRow.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      rowHeightPx: {
        default: null,
        parseHTML: (element) => {
          const attrValue = element.getAttribute("data-row-height")
          const styleValue = element instanceof HTMLElement ? element.style.height : ""
          const parsedValue =
            Number.parseInt(attrValue || "", 10) || Number.parseInt(styleValue.replace(/px$/, ""), 10)

          return Number.isFinite(parsedValue) && parsedValue > 0
            ? Math.max(TABLE_MIN_ROW_HEIGHT_PX, parsedValue)
            : null
        },
        renderHTML: (attributes) => {
          const rowHeightPx = Number.parseInt(String(attributes.rowHeightPx || ""), 10)
          if (!Number.isFinite(rowHeightPx) || rowHeightPx <= 0) return {}

          return {
            "data-row-height": Math.max(TABLE_MIN_ROW_HEIGHT_PX, rowHeightPx),
            style: `height: ${Math.max(TABLE_MIN_ROW_HEIGHT_PX, rowHeightPx)}px;`,
          }
        },
      },
    }
  },
})

const TABLE_CELL_BACKGROUND_PATTERN = /^.+$/

const buildStyledTableCellAttributes = () => ({
  textAlign: {
    default: null,
    parseHTML: (element: HTMLElement) => {
      const value = element.style.textAlign || element.getAttribute("data-text-align") || ""
      return value === "left" || value === "center" || value === "right" ? value : null
    },
    renderHTML: (attributes: Record<string, unknown>) => {
      const textAlign = String(attributes.textAlign || "")
      if (textAlign !== "left" && textAlign !== "center" && textAlign !== "right") return {}
      return {
        "data-text-align": textAlign,
        style: `text-align: ${textAlign};`,
      }
    },
  },
  backgroundColor: {
    default: null,
    parseHTML: (element: HTMLElement) => {
      const value =
        element.style.backgroundColor || element.getAttribute("data-background-color") || ""
      return TABLE_CELL_BACKGROUND_PATTERN.test(value.trim()) ? value.trim() || null : null
    },
    renderHTML: (attributes: Record<string, unknown>) => {
      const backgroundColor = String(attributes.backgroundColor || "").trim()
      if (!backgroundColor) return {}
      return {
        "data-background-color": backgroundColor,
        style: `background-color: ${backgroundColor};`,
      }
    },
  },
})

export const EditorTableCell = TableCell.extend({
  content: "paragraph+",
  addAttributes() {
    return {
      ...this.parent?.(),
      ...buildStyledTableCellAttributes(),
    }
  },
})

export const EditorTableHeader = TableHeader.extend({
  content: "paragraph+",
  addAttributes() {
    return {
      ...this.parent?.(),
      ...buildStyledTableCellAttributes(),
    }
  },
})

export const EditorTable = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      overflowMode: {
        default: "normal",
        parseHTML: (element: HTMLElement) => {
          const value = element.getAttribute("data-overflow-mode") || ""
          return value === "wide" ? "wide" : "normal"
        },
        renderHTML: (attributes: Record<string, unknown>) => {
          const overflowMode = String(attributes.overflowMode || "normal")
          if (overflowMode !== "wide") return {}
          return {
            "data-overflow-mode": "wide",
          }
        },
      },
    }
  },
  addExtensions() {
    return [EditorTableRow, EditorTableHeader, EditorTableCell]
  },
})

export const EditorTaskList = TaskList.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      "data-task-list": {
        default: "true",
      },
    }
  },
}).configure({
  HTMLAttributes: {
    "data-task-list": "true",
  },
})

export const EditorTaskItem = TaskItem.extend({
  draggable: true,
}).configure({
  nested: true,
  HTMLAttributes: {
    draggable: "true",
    "data-task-item": "true",
  },
})

export const EditorListItem = ListItem.extend({
  draggable: true,
}).configure({
  HTMLAttributes: {
    draggable: "true",
    "data-list-item": "true",
  },
})

export const EditorListKeymap = ListKeymap
