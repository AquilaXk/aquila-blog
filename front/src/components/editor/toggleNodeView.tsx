
import styled from "@emotion/styled"
import { Node, mergeAttributes } from "@tiptap/core"
import { type NodeViewProps, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react"
import { useEffect, useRef, useState } from "react"
import {
  CompactBlockTextarea,
  useAutosizeTextarea,
  useDebouncedAttributeCommit,
} from "./editorNodeViewShared"

export const ToggleBlockView = ({ node, updateAttributes, selected }: NodeViewProps) => {
  const [draftTitle, setDraftTitle] = useState(String(node.attrs?.title || ""))
  const [draftBody, setDraftBody] = useState(String(node.attrs?.body || ""))
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const { schedule: scheduleCommit, flush: flushCommit } = useDebouncedAttributeCommit(updateAttributes)

  useAutosizeTextarea(bodyRef, draftBody, `${selected}-${isPreviewOpen}`)

  useEffect(() => {
    setDraftTitle(String(node.attrs?.title || ""))
    setDraftBody(String(node.attrs?.body || ""))
  }, [node.attrs?.title, node.attrs?.body])

  const commit = (next: Partial<{ title: string; body: string }>) => {
    scheduleCommit({
      title: next.title ?? draftTitle,
      body: next.body ?? draftBody,
    })
  }

  return (
    <ToggleEditorWrapper data-selected={selected}>
      <ToggleEditorCard open={isPreviewOpen} data-selected={selected}>
        <summary
          data-testid="toggle-block-summary"
          onClick={(event) => {
            event.preventDefault()
            setIsPreviewOpen((prev) => !prev)
          }}
        >
          <ToggleSummaryInner>
            <ToggleChevron data-testid="toggle-block-chevron" data-open={isPreviewOpen} aria-hidden="true" />
            <ToggleTitleInput
              value={draftTitle}
              placeholder="제목"
              onClick={(event) => event.stopPropagation()}
              onBlur={flushCommit}
              onChange={(event) => {
                const nextTitle = event.target.value
                setDraftTitle(nextTitle)
                commit({ title: nextTitle })
              }}
            />
          </ToggleSummaryInner>
        </summary>
        <ToggleEditorBody data-open={isPreviewOpen}>
          {isPreviewOpen ? (
            <ToggleBodyTextarea
              ref={bodyRef}
              value={draftBody}
              placeholder="본문"
              spellCheck={false}
              rows={3}
              onBlur={flushCommit}
              onChange={(event) => {
                const nextBody = event.target.value
                setDraftBody(nextBody)
                commit({ body: nextBody })
              }}
            />
          ) : null}
        </ToggleEditorBody>
      </ToggleEditorCard>
    </ToggleEditorWrapper>
  )
}

export const ToggleBlock = Node.create({
  name: "toggleBlock",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,
  isolating: true,

  addAttributes() {
    return {
      title: {
        default: "",
      },
      body: {
        default: "",
      },
    }
  },

  parseHTML() {
    return [{ tag: "div[data-toggle-block]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-toggle-block": "true" })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(ToggleBlockView)
  },
})

const ToggleEditorWrapper = styled(NodeViewWrapper)`
  margin: 1rem 0;
`

const ToggleEditorCard = styled.details`
  --toggle-caret-size: 0.94rem;
  --toggle-caret-hit: 1.38rem;
  --toggle-gap: 0.62rem;
  --toggle-summary-padding-x: 0.16rem;
  --toggle-indent: calc(var(--toggle-summary-padding-x) + var(--toggle-caret-hit) + var(--toggle-gap));
  margin: 0;

  &[data-selected="true"] {
    filter: brightness(1.03);
  }

  summary {
    cursor: pointer;
    list-style: none;
    padding: 0.24rem var(--toggle-summary-padding-x);
    border-radius: 0.62rem;
    transition: background-color 140ms ease;
    user-select: none;
    -webkit-user-select: none;

    &::-webkit-details-marker {
      display: none;
    }

    &:hover {
      background: ${({ theme }) =>
        theme.scheme === "dark" ? "rgba(148, 163, 184, 0.08)" : "rgba(148, 163, 184, 0.12)"};
    }
  }
`

const ToggleSummaryInner = styled.div`
  display: flex;
  align-items: center;
  gap: var(--toggle-gap);
  min-height: 2.8rem;
`

const ToggleChevron = styled.span`
  width: var(--toggle-caret-hit);
  height: var(--toggle-caret-hit);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--color-gray10);
  line-height: 1;
  flex-shrink: 0;
  transition: color 140ms ease;

  &::before {
    content: "";
    width: var(--toggle-caret-size);
    height: var(--toggle-caret-size);
    background: currentColor;
    clip-path: polygon(26% 18%, 82% 50%, 26% 82%);
    transform-origin: center;
    transition: transform 140ms ease;
  }

  &[data-open="true"]::before {
    transform: rotate(90deg);
  }
`

const ToggleTitleInput = styled.input`
  width: 100%;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--color-gray12);
  font-size: 1.12rem;
  font-weight: 650;
  line-height: 1.5;
  letter-spacing: -0.01em;
  padding: 0.16rem 0;

  &::placeholder {
    color: var(--color-gray10);
  }
`

const ToggleEditorBody = styled.div`
  margin-top: 0.22rem;
  padding-left: var(--toggle-indent);
`

const ToggleBodyTextarea = styled(CompactBlockTextarea)`
  min-height: 5rem;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--color-gray11);
  font-family: inherit;
  font-size: 0.97rem;
  line-height: 1.7;
  padding: 0.06rem 0 0.08rem;
  resize: none;

  &::placeholder {
    color: var(--color-gray10);
  }
`

export const ToggleNodeViewStyles = {
  ToggleEditorWrapper,
  ToggleEditorCard,
  ToggleSummaryInner,
  ToggleChevron,
  ToggleTitleInput,
  ToggleEditorBody,
  ToggleBodyTextarea,
}
