
import styled from "@emotion/styled"
import { InputRule, Node, mergeAttributes } from "@tiptap/core"
import { type NodeViewProps, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react"
import { useEffect, useRef, useState } from "react"
import FormulaRender from "src/libs/markdown/FormulaRender"
import {
  CompactBlockTextarea,
  useAutosizeTextarea,
  useDebouncedAttributeCommit,
} from "./editorNodeViewShared"

export const FormulaBlockView = ({ node, updateAttributes, selected, editor }: NodeViewProps) => {
  const [draftFormula, setDraftFormula] = useState(String(node.attrs?.formula || ""))
  const formulaRef = useRef<HTMLTextAreaElement>(null)
  const { schedule: scheduleCommit, flush: flushCommit } = useDebouncedAttributeCommit(
    updateAttributes,
    undefined,
    editor.view.dom
  )

  useAutosizeTextarea(formulaRef, draftFormula, selected)

  useEffect(() => {
    setDraftFormula(String(node.attrs?.formula || ""))
  }, [node.attrs?.formula])

  return (
    <FormulaEditorWrapper data-selected={selected}>
      <FormulaEditorHeader>
        <strong>수식</strong>
        <span>LaTeX 스타일 원문을 입력합니다.</span>
      </FormulaEditorHeader>
      <FormulaEditorTextarea
        ref={formulaRef}
        value={draftFormula}
        rows={3}
        spellCheck={false}
        placeholder={"\\int_0^1 x^2 \\, dx"}
        onBlur={flushCommit}
        onChange={(event) => {
          const nextFormula = event.target.value
          setDraftFormula(nextFormula)
          scheduleCommit({ formula: nextFormula })
        }}
      />
      <FormulaPreview aria-hidden="true">{draftFormula || "수식 미리보기"}</FormulaPreview>
      {draftFormula ? (
        <FormulaRenderedPreview aria-hidden="true">
          <FormulaRender formula={draftFormula} displayMode />
        </FormulaRenderedPreview>
      ) : null}
    </FormulaEditorWrapper>
  )
}

export const InlineFormulaView = ({ node, updateAttributes, selected }: NodeViewProps) => {
  const [draftFormula, setDraftFormula] = useState(String(node.attrs?.formula || ""))
  const [editing, setEditing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setDraftFormula(String(node.attrs?.formula || ""))
  }, [node.attrs?.formula])

  useEffect(() => {
    if (!editing) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [editing])

  const commit = () => {
    updateAttributes({ formula: draftFormula.trim() })
    setEditing(false)
  }

  return (
    <InlineFormulaWrapper as="span" data-selected={selected}>
      <InlineFormulaChip
        type="button"
        contentEditable={false}
        onMouseDown={(event) => {
          event.preventDefault()
          setEditing(true)
        }}
        aria-label="인라인 수식 편집"
      >
        <FormulaRender formula={draftFormula || "x^2"} displayMode={false} />
      </InlineFormulaChip>
      {(editing || selected) && (
        <InlineFormulaPopover contentEditable={false}>
          <strong>인라인 수식</strong>
          <InlineFormulaInput
            ref={inputRef}
            value={draftFormula}
            spellCheck={false}
            placeholder="x^2 + y^2"
            onChange={(event) => setDraftFormula(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                commit()
              }
              if (event.key === "Escape") {
                event.preventDefault()
                setDraftFormula(String(node.attrs?.formula || ""))
                setEditing(false)
              }
            }}
          />
        </InlineFormulaPopover>
      )}
    </InlineFormulaWrapper>
  )
}

export const FormulaBlock = Node.create({
  name: "formulaBlock",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,
  isolating: true,

  addAttributes() {
    return {
      formula: {
        default: "",
      },
    }
  },

  parseHTML() {
    return [{ tag: "div[data-formula-block]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-formula-block": "true" })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(FormulaBlockView)
  },
})

export const InlineFormula = Node.create({
  name: "inlineFormula",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      formula: {
        default: "",
      },
    }
  },

  parseHTML() {
    return [{ tag: "span[data-inline-formula]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-inline-formula": "true" })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(InlineFormulaView)
  },

  addInputRules() {
    return [
      new InputRule({
        find: /(^|[\s([{])\$([^$\n]+)\$$/,
        handler: ({ chain, match, range }) => {
          const prefix = String(match[1] || "")
          const formula = String(match[2] || "").trim()
          if (!formula) return null

          const inlineContent = [
            ...(prefix ? [{ type: "text" as const, text: prefix }] : []),
            { type: "inlineFormula" as const, attrs: { formula } },
          ]

          chain().deleteRange(range).insertContentAt(range.from, inlineContent).run()
        },
      }),
    ]
  },
})

const FormulaEditorWrapper = styled(NodeViewWrapper)`
  display: flex;
  flex-direction: column;
  gap: 0.72rem;
  margin: 0.9rem 0;
  padding: 1rem 1.05rem;
  border: 1px solid ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray6 : "rgba(255, 255, 255, 0.08)")};
  border-radius: 1rem;
  background: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray1 : "rgba(17, 19, 24, 0.94)")};

  &[data-selected="true"] {
    border-color: ${({ theme }) => (theme.scheme === "light" ? theme.colors.blue7 : "rgba(96, 165, 250, 0.32)")};
    box-shadow: ${({ theme }) =>
      theme.scheme === "light" ? "0 0 0 1px rgba(37, 99, 235, 0.16)" : "0 0 0 1px rgba(96, 165, 250, 0.12)"};
  }
`

const FormulaEditorHeader = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.8rem;

  strong {
    color: var(--color-gray12);
    font-size: 0.92rem;
    font-weight: 700;
  }

  span {
    color: var(--color-gray10);
    font-size: 0.76rem;
  }
`

const FormulaEditorTextarea = styled(CompactBlockTextarea)`
  min-height: 5rem;
  border-radius: 0.88rem;
  background: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray1 : "rgba(255, 255, 255, 0.03)")};
`

const FormulaPreview = styled.div`
  padding: 0.9rem 1rem;
  border-radius: 0.88rem;
  background: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray2 : "rgba(255, 255, 255, 0.03)")};
  color: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray11 : "#e5e7eb")};
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
    "Courier New", monospace;
  font-size: 0.84rem;
  line-height: 1.65;
  white-space: pre-wrap;
`

const FormulaRenderedPreview = styled.div`
  padding: 1rem 1.05rem;
  border-radius: 0.88rem;
  border: 1px solid ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray6 : "rgba(255, 255, 255, 0.08)")};
  background: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray2 : "rgba(10, 12, 16, 0.78)")};
  overflow-x: auto;

  .katex-display {
    margin: 0;
  }

  .aq-formula-fallback {
    color: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray11 : "#e5e7eb")};
  }
`

const InlineFormulaWrapper = styled(NodeViewWrapper)`
  position: relative;
  display: inline-flex;
  align-items: center;
  vertical-align: middle;
`

const InlineFormulaChip = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.28rem;
  min-height: 1.9rem;
  padding: 0.18rem 0.56rem;
  border: 1px solid ${({ theme }) => (theme.scheme === "light" ? theme.colors.blue7 : "rgba(96, 165, 250, 0.28)")};
  border-radius: 999px;
  background: ${({ theme }) => (theme.scheme === "light" ? "rgba(37, 99, 235, 0.08)" : "rgba(59, 130, 246, 0.12)")};
  color: var(--color-gray12);
  cursor: pointer;

  .katex {
    font-size: 0.98rem;
  }
`

const InlineFormulaPopover = styled.span`
  position: absolute;
  left: 0;
  top: calc(100% + 0.45rem);
  z-index: 18;
  display: grid;
  gap: 0.42rem;
  min-width: 15rem;
  padding: 0.74rem;
  border-radius: 0.82rem;
  border: 1px solid ${({ theme }) => (theme.scheme === "light" ? theme.colors.blue7 : "rgba(96, 165, 250, 0.22)")};
  background: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray1 : "rgba(10, 12, 16, 0.98)")};
  box-shadow: ${({ theme }) =>
    theme.scheme === "light" ? "0 12px 24px rgba(15, 23, 42, 0.12)" : "0 18px 34px rgba(2, 6, 23, 0.28)"};

  strong {
    color: var(--color-gray11);
    font-size: 0.72rem;
    font-weight: 700;
  }
`

const InlineFormulaInput = styled.input`
  min-height: 2.3rem;
  width: 100%;
  border-radius: 0.72rem;
  border: 1px solid ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray6 : "rgba(255, 255, 255, 0.08)")};
  background: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray1 : "rgba(255, 255, 255, 0.04)")};
  color: var(--color-gray12);
  font-size: 0.9rem;
  padding: 0 0.78rem;
`

export const FormulaNodeViewStyles = {
  FormulaEditorWrapper,
  FormulaEditorHeader,
  FormulaEditorTextarea,
  FormulaPreview,
  FormulaRenderedPreview,
  InlineFormulaWrapper,
  InlineFormulaChip,
  InlineFormulaPopover,
  InlineFormulaInput,
}
