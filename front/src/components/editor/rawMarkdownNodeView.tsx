
import styled from "@emotion/styled"
import { Node, mergeAttributes } from "@tiptap/core"
import { type NodeViewProps, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react"
import { useEffect, useState } from "react"

const RAW_BLOCK_REASON_LABELS: Record<string, string> = {
  "unsupported-mermaid": "Mermaid",
  "unsupported-callout": "콜아웃 원문 블록",
  "unsupported-toggle": "토글 원문 블록",
  "unsupported-table-alignment": "정렬 표 원문 블록",
  "manual-raw": "원문 블록",
}

export const RawMarkdownBlockView = ({ node, selected }: NodeViewProps) => {
  const [copied, setCopied] = useState(false)
  const markdown = String(node.attrs?.markdown || "")
  const reason = String(node.attrs?.reason || "manual-raw")
  const helperText =
    reason === "manual-raw"
      ? "이 블록은 원문 보존 전용입니다. 일반 작성은 다른 블록을 사용하세요."
      : reason === "unsupported-mermaid"
        ? "이전 원문 보존 카드입니다. 블록을 다시 열면 Mermaid 편집 블록으로 전환할 수 있습니다."
      : "현재 편집기에서 안전하게 구조화할 수 없어 원문을 보존했습니다."
  const preview = markdown.trim() || "(빈 원문 블록)"

  const copyMarkdown = async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return
    await navigator.clipboard.writeText(markdown)
    setCopied(true)
  }

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 1600)
    return () => window.clearTimeout(timer)
  }, [copied])

  return (
    <RawBlockWrapper data-selected={selected}>
      <RawBlockHeader>
        <RawBlockToolbarLeft aria-hidden="true">
          <RawBlockDot data-tone="red" />
          <RawBlockDot data-tone="yellow" />
          <RawBlockDot data-tone="green" />
        </RawBlockToolbarLeft>
        <strong>{RAW_BLOCK_REASON_LABELS[reason] || "원문 블록"}</strong>
      </RawBlockHeader>
      <RawBlockBody>
        <RawBlockSummary>
          <p>{helperText}</p>
          <RawBlockActionButton type="button" onClick={() => void copyMarkdown()} disabled={!markdown.trim()}>
            {copied ? "원문 복사됨" : "원문 복사"}
          </RawBlockActionButton>
        </RawBlockSummary>
        <RawBlockPreview role="note">{preview}</RawBlockPreview>
      </RawBlockBody>
    </RawBlockWrapper>
  )
}

export const RawMarkdownBlock = Node.create({
  name: "rawMarkdownBlock",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      markdown: {
        default: "",
      },
      reason: {
        default: "manual-raw",
      },
    }
  },

  parseHTML() {
    return [{ tag: "div[data-raw-markdown-block]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-raw-markdown-block": "true" })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(RawMarkdownBlockView)
  },
})

const RawBlockWrapper = styled(NodeViewWrapper)`
  display: flex;
  flex-direction: column;
  gap: 0;
  margin: 1.2rem 0;
  overflow: hidden;
  border: 1px solid ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray6 : "rgba(255, 255, 255, 0.08)")};
  border-radius: 14px;
  background: transparent;
  box-shadow: ${({ theme }) =>
    theme.scheme === "light" ? "0 12px 24px rgba(15, 23, 42, 0.1)" : "0 18px 38px rgba(2, 6, 23, 0.34)"};

  &[data-selected="true"] {
    border-color: rgba(59, 130, 246, 0.3);
    box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.08);
  }
`

const RawBlockHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.84rem 0.96rem 0.76rem;
  background: ${({ theme }) =>
    theme.scheme === "light" ? `linear-gradient(180deg, ${theme.colors.gray2}, ${theme.colors.gray3})` : "linear-gradient(180deg, #3a3f59, #363b54)"};
  border-bottom: 1px solid ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray6 : "rgba(255, 255, 255, 0.06)")};

  strong {
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #ff9d62;
  }
`

const RawBlockToolbarLeft = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.7rem;
`

const RawBlockDot = styled.span`
  width: 0.92rem;
  height: 0.92rem;
  border-radius: 999px;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.12);

  &[data-tone="red"] {
    background: #ff5f56;
  }

  &[data-tone="yellow"] {
    background: #ffbd2e;
  }

  &[data-tone="green"] {
    background: #27c93f;
  }
`

const RawBlockBody = styled.div`
  position: relative;
  display: grid;
  gap: 0.85rem;
  padding: 1rem 1.1rem 1.15rem;
  background: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray1 : "#2b2d3a")};
`

const RawBlockSummary = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;

  p {
    margin: 0;
    color: var(--color-gray10);
    font-size: 0.82rem;
    line-height: 1.55;
  }
`

const RawBlockActionButton = styled.button`
  min-height: 2.15rem;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => (theme.scheme === "light" ? "rgba(217, 119, 6, 0.35)" : "rgba(255, 157, 98, 0.26)")};
  background: ${({ theme }) => (theme.scheme === "light" ? "rgba(245, 158, 11, 0.12)" : "rgba(255, 157, 98, 0.12)")};
  color: ${({ theme }) => (theme.scheme === "light" ? "#b45309" : "#ffbd93")};
  font-size: 0.78rem;
  font-weight: 700;
  padding: 0 0.9rem;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
`

const RawBlockPreview = styled.pre`
  margin: 0;
  overflow: auto;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray6 : "rgba(255, 255, 255, 0.08)")};
  background: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray2 : "rgba(11, 14, 20, 0.42)")};
  color: var(--color-gray12);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
    "Courier New", monospace;
  font-size: 0.82rem;
  line-height: 1.6;
  padding: 0.95rem 1rem;
  white-space: pre-wrap;
  word-break: break-word;
`

export const RawMarkdownNodeViewStyles = {
  RawBlockWrapper,
  RawBlockHeader,
  RawBlockToolbarLeft,
  RawBlockDot,
  RawBlockBody,
  RawBlockSummary,
  RawBlockActionButton,
  RawBlockPreview,
}
