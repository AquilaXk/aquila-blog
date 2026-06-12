
import styled from "@emotion/styled"
import { Node, mergeAttributes } from "@tiptap/core"
import { NodeViewContent, type NodeViewProps, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react"
import { KeyboardEvent as ReactKeyboardEvent, useCallback, useEffect, useId, useRef, useState } from "react"
import AppIcon from "src/components/icons/AppIcon"
import { articleTypographyScale } from "src/libs/markdown/contentTypography"
import type { CalloutKind } from "src/libs/markdown/rendering"
import {
  isPrimarySelectAllShortcut,
  selectDomTextContents,
  useDebouncedAttributeCommit,
} from "./editorNodeViewShared"

const CALLOUT_KIND_OPTIONS: Array<{ value: CalloutKind; label: string; emoji: string }> = [
  { value: "tip", label: "팁", emoji: "💡" },
  { value: "info", label: "안내", emoji: "ℹ️" },
  { value: "warning", label: "주의", emoji: "⚠️" },
  { value: "outline", label: "정리", emoji: "📋" },
  { value: "example", label: "예시", emoji: "✅" },
  { value: "summary", label: "요약", emoji: "📚" },
]

export const CalloutBlockView = ({ node, updateAttributes, selected, editor }: NodeViewProps) => {
  const [draftKind, setDraftKind] = useState<CalloutKind>((node.attrs?.kind as CalloutKind) || "tip")
  const [draftTitle, setDraftTitle] = useState(String(node.attrs?.title || ""))
  const pickerRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const pickerId = useId()
  const [isKindMenuOpen, setIsKindMenuOpen] = useState(false)
  const { schedule: scheduleCommit, flush: flushCommit } = useDebouncedAttributeCommit(
    updateAttributes,
    undefined,
    editor.view.dom
  )

  useEffect(() => {
    setDraftKind((node.attrs?.kind as CalloutKind) || "tip")
    setDraftTitle(String(node.attrs?.title || ""))
  }, [node.attrs?.kind, node.attrs?.title])

  useEffect(() => {
    if (!isKindMenuOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Element && pickerRef.current?.contains(target)) return
      setIsKindMenuOpen(false)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      setIsKindMenuOpen(false)
    }

    window.addEventListener("pointerdown", handlePointerDown)
    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown)
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [isKindMenuOpen])

  const commit = (next: Partial<{ kind: CalloutKind; title: string }>) => {
    const nextAttrs = {
      kind: next.kind ?? draftKind,
      title: next.title ?? draftTitle,
    }
    scheduleCommit(nextAttrs)
  }

  const handleBodyKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!isPrimarySelectAllShortcut(event)) return

    event.preventDefault()
    event.stopPropagation()
    selectDomTextContents(bodyRef.current?.querySelector<HTMLElement>(".aq-callout-body-content__content") || null)
  }, [])

  const activeKindOption =
    CALLOUT_KIND_OPTIONS.find((option) => option.value === draftKind) ?? CALLOUT_KIND_OPTIONS[0]

  return (
    <CalloutEditorWrapper data-selected={selected} data-kind={draftKind}>
      <CalloutEditorCard data-kind={draftKind}>
        <CalloutEditorHeader data-kind={draftKind}>
          <CalloutEmojiPicker ref={pickerRef}>
            <CalloutEmojiTrigger
              type="button"
              aria-haspopup="dialog"
              aria-expanded={isKindMenuOpen}
              aria-controls={`${pickerId}-callout-kind-menu`}
              title={activeKindOption.label}
              onClick={() => setIsKindMenuOpen((prev) => !prev)}
            >
              <span aria-hidden="true">{activeKindOption.emoji}</span>
              <AppIcon name="chevron-down" aria-hidden="true" />
            </CalloutEmojiTrigger>
            {isKindMenuOpen ? (
              <CalloutEmojiPopover
                id={`${pickerId}-callout-kind-menu`}
                role="dialog"
                aria-label="콜아웃 종류 선택"
              >
                <CalloutEmojiOptionList role="listbox" aria-label="콜아웃 종류">
                  {CALLOUT_KIND_OPTIONS.map((option) => (
                    <CalloutEmojiOptionButton
                      key={option.value}
                      type="button"
                      data-active={draftKind === option.value}
                      onClick={() => {
                        setDraftKind(option.value)
                        commit({ kind: option.value })
                        setIsKindMenuOpen(false)
                      }}
                    >
                      <span className="emoji" aria-hidden="true">
                        {option.emoji}
                      </span>
                      <span className="label">{option.label}</span>
                      {draftKind === option.value ? <AppIcon name="check-circle" aria-hidden="true" /> : null}
                    </CalloutEmojiOptionButton>
                  ))}
                </CalloutEmojiOptionList>
              </CalloutEmojiPopover>
            ) : null}
          </CalloutEmojiPicker>
          <CalloutTitleInput
            value={draftTitle}
            placeholder="제목"
            onBlur={flushCommit}
            onChange={(event) => {
              const nextTitle = event.target.value
              setDraftTitle(nextTitle)
              commit({ title: nextTitle })
            }}
          />
        </CalloutEditorHeader>
        <CalloutEditorBody>
          <CalloutBodyContent
            ref={bodyRef}
            data-callout-body-content="true"
            onBlur={flushCommit}
            onKeyDownCapture={handleBodyKeyDown}
          >
            <NodeViewContent className="aq-callout-body-content__content" />
          </CalloutBodyContent>
        </CalloutEditorBody>
      </CalloutEditorCard>
    </CalloutEditorWrapper>
  )
}

export const CalloutBlock = Node.create({
  name: "calloutBlock",
  group: "block",
  content: "block+",
  selectable: true,
  draggable: true,
  isolating: true,

  addAttributes() {
    return {
      kind: {
        default: "tip",
      },
      label: {
        default: null,
      },
      title: {
        default: "",
      },
    }
  },

  parseHTML() {
    return [{ tag: "div[data-callout-block]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-callout-block": "true" }), 0]
  },

  addNodeView() {
    return ReactNodeViewRenderer(CalloutBlockView)
  },
})

const CalloutEditorWrapper = styled(NodeViewWrapper)`
  --ad-accent: ${({ theme }) => (theme.scheme === "dark" ? "#f6ad55" : "#c46a10")};
  --ad-header-bg: ${({ theme }) => (theme.scheme === "dark" ? "rgba(246, 173, 85, 0.2)" : "#fff1d8")};
  --ad-body-bg: ${({ theme }) => (theme.scheme === "dark" ? "rgba(246, 173, 85, 0.12)" : "#fff8e8")};
  --ad-border: ${({ theme }) => (theme.scheme === "dark" ? "rgba(246, 173, 85, 0.36)" : "#e9c27d")};
  --ad-text: ${({ theme }) => (theme.scheme === "dark" ? "#e6edf6" : "#1f2937")};
  display: flex;
  flex-direction: column;
  gap: 0.48rem;
  margin: 0.75rem 0;

  &[data-selected="true"] {
    filter: brightness(1.03);
  }

  &[data-kind="tip"] {
    --ad-accent: ${({ theme }) => (theme.scheme === "dark" ? "#f6ad55" : "#c46a10")};
    --ad-header-bg: ${({ theme }) => (theme.scheme === "dark" ? "rgba(246, 173, 85, 0.2)" : "#fff1d8")};
    --ad-body-bg: ${({ theme }) => (theme.scheme === "dark" ? "rgba(246, 173, 85, 0.12)" : "#fff8e8")};
    --ad-border: ${({ theme }) => (theme.scheme === "dark" ? "rgba(246, 173, 85, 0.36)" : "#e9c27d")};
  }

  &[data-kind="info"] {
    --ad-accent: ${({ theme }) => (theme.scheme === "dark" ? "#4cc9f0" : "#0b63a8")};
    --ad-header-bg: ${({ theme }) => (theme.scheme === "dark" ? "rgba(76, 201, 240, 0.2)" : "#e9f4ff")};
    --ad-body-bg: ${({ theme }) => (theme.scheme === "dark" ? "rgba(76, 201, 240, 0.12)" : "#f4f9ff")};
    --ad-border: ${({ theme }) => (theme.scheme === "dark" ? "rgba(76, 201, 240, 0.38)" : "#9cc4e8")};
  }

  &[data-kind="warning"] {
    --ad-accent: ${({ theme }) => (theme.scheme === "dark" ? "#fb7185" : "#b42344")};
    --ad-header-bg: ${({ theme }) => (theme.scheme === "dark" ? "rgba(251, 113, 133, 0.2)" : "#fdecef")};
    --ad-body-bg: ${({ theme }) => (theme.scheme === "dark" ? "rgba(251, 113, 133, 0.12)" : "#fff6f8")};
    --ad-border: ${({ theme }) => (theme.scheme === "dark" ? "rgba(251, 113, 133, 0.38)" : "#e8a8b8")};
  }

  &[data-kind="outline"] {
    --ad-accent: ${({ theme }) => (theme.scheme === "dark" ? "#94a3b8" : "#475569")};
    --ad-header-bg: ${({ theme }) => (theme.scheme === "dark" ? "rgba(148, 163, 184, 0.2)" : "#eef2f6")};
    --ad-body-bg: ${({ theme }) => (theme.scheme === "dark" ? "rgba(148, 163, 184, 0.12)" : "#f8fafc")};
    --ad-border: ${({ theme }) => (theme.scheme === "dark" ? "rgba(148, 163, 184, 0.34)" : "#c7d1dd")};
  }

  &[data-kind="example"] {
    --ad-accent: ${({ theme }) => (theme.scheme === "dark" ? "#4ade80" : "#166534")};
    --ad-header-bg: ${({ theme }) => (theme.scheme === "dark" ? "rgba(74, 222, 128, 0.2)" : "#e8f7ef")};
    --ad-body-bg: ${({ theme }) => (theme.scheme === "dark" ? "rgba(74, 222, 128, 0.12)" : "#f4fcf7")};
    --ad-border: ${({ theme }) => (theme.scheme === "dark" ? "rgba(74, 222, 128, 0.36)" : "#9fd9b4")};
  }

  &[data-kind="summary"] {
    --ad-accent: ${({ theme }) => (theme.scheme === "dark" ? "#a78bfa" : "#5b4ab8")};
    --ad-header-bg: ${({ theme }) => (theme.scheme === "dark" ? "rgba(167, 139, 250, 0.2)" : "#efecff")};
    --ad-body-bg: ${({ theme }) => (theme.scheme === "dark" ? "rgba(167, 139, 250, 0.12)" : "#f7f5ff")};
    --ad-border: ${({ theme }) => (theme.scheme === "dark" ? "rgba(167, 139, 250, 0.38)" : "#bfb3eb")};
  }
`

const CalloutEditorCard = styled.div`
  overflow: visible;
  border: 1px solid var(--ad-border);
  border-left: 8px solid var(--ad-accent);
  border-radius: 0.95rem;
  background: var(--ad-body-bg);
`

const CalloutEditorHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 0.7rem;
  min-height: 3.3rem;
  padding: 0.7rem 1rem;
  background: var(--ad-header-bg);
  border-bottom: 1px solid var(--ad-border);
`

const CalloutEmojiPicker = styled.div`
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
`

const CalloutEmojiTrigger = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.32rem;
  min-width: 2.3rem;
  height: 2.3rem;
  border: 1px solid
    ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray6 : "rgba(255, 255, 255, 0.12)")};
  border-radius: 999px;
  padding: 0 0.68rem;
  background: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray1 : "rgba(255, 255, 255, 0.08)")};
  color: var(--ad-accent);
  font-size: 1rem;
  transition: background-color 140ms ease, border-color 140ms ease, color 140ms ease;

  svg {
    width: 0.92rem;
    height: 0.92rem;
    color: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray10 : "rgba(255, 255, 255, 0.68)")};
  }

  &:hover {
    background: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray2 : "rgba(255, 255, 255, 0.12)")};
    border-color: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray7 : "rgba(255, 255, 255, 0.18)")};
  }
`

const CalloutEmojiPopover = styled.div`
  position: absolute;
  top: calc(100% + 0.55rem);
  left: 0;
  z-index: 40;
  min-width: 10.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  padding: 0.55rem;
  border: 1px solid
    ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray6 : "rgba(255, 255, 255, 0.08)")};
  border-radius: 1rem;
  background: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray1 : "rgba(30, 31, 36, 0.98)")};
  box-shadow: ${({ theme }) =>
    theme.scheme === "light" ? "0 14px 28px rgba(15, 23, 42, 0.12)" : "0 18px 36px rgba(0, 0, 0, 0.3)"};
`

const CalloutEmojiOptionList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.22rem;
`

const CalloutEmojiOptionButton = styled.button`
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 0.7rem;
  min-height: 2.5rem;
  padding: 0 0.72rem;
  border: 0;
  border-radius: 0.75rem;
  background: transparent;
  color: var(--color-gray12);
  text-align: left;

  .emoji {
    font-size: 1rem;
    line-height: 1;
  }

  .label {
    font-size: 0.9rem;
    font-weight: 650;
  }

  svg {
    width: 0.98rem;
    height: 0.98rem;
    color: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray10 : "#e5e7eb")};
  }

  &[data-active="true"],
  &:hover {
    background: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray3 : "rgba(255, 255, 255, 0.08)")};
  }
`

const CalloutTitleInput = styled.input`
  min-width: 0;
  width: 100%;
  border: 0;
  background: transparent;
  color: var(--ad-accent);
  font-size: ${articleTypographyScale.calloutTitleFontSize};
  font-weight: 700;
  line-height: ${articleTypographyScale.calloutTitleLineHeight};
  letter-spacing: -0.01em;

  &::placeholder {
    color: color-mix(in srgb, var(--ad-accent) 70%, transparent);
  }
`

const CalloutEditorBody = styled.div`
  padding: 1rem 1.15rem 1.05rem;
`

const CalloutBodyContent = styled.div`
  min-height: 5rem;
  color: var(--ad-text);
  cursor: text;

  .aq-callout-body-content__content {
    display: flex;
    flex-direction: column;
    gap: 0.62rem;
    min-height: 5rem;
    outline: none;
    color: inherit;
    font-size: ${articleTypographyScale.bodyFontSize};
    line-height: ${articleTypographyScale.bodyLineHeight};
  }

  .aq-callout-body-content__content > * {
    margin: 0;
  }

  .aq-callout-body-content__content p {
    font-size: inherit;
    line-height: inherit;
    color: inherit;
  }

  .aq-callout-body-content__content p:empty::before {
    content: "본문";
    color: var(--color-gray10);
  }

  .aq-callout-body-content__content ul,
  .aq-callout-body-content__content ol {
    margin: 0;
    padding-left: 1.1rem;
  }

  .aq-callout-body-content__content li,
  .aq-callout-body-content__content a,
  .aq-callout-body-content__content strong,
  .aq-callout-body-content__content em,
  .aq-callout-body-content__content code {
    color: inherit;
  }

  .aq-callout-body-content__content code {
    font-size: ${articleTypographyScale.codeFontSize};
    line-height: ${articleTypographyScale.codeLineHeight};
  }

  @media (max-width: 768px) {
    .aq-callout-body-content__content {
      font-size: ${articleTypographyScale.bodyFontSizeMobile};
      line-height: ${articleTypographyScale.bodyLineHeightMobile};
    }

    .aq-callout-body-content__content code {
      font-size: ${articleTypographyScale.codeFontSizeMobile};
      line-height: ${articleTypographyScale.codeLineHeightMobile};
    }
  }
`

export const CalloutNodeViewStyles = {
  CalloutEditorWrapper,
  CalloutEditorCard,
  CalloutEditorHeader,
  CalloutEmojiPicker,
  CalloutEmojiTrigger,
  CalloutEmojiPopover,
  CalloutEmojiOptionList,
  CalloutEmojiOptionButton,
  CalloutTitleInput,
  CalloutEditorBody,
  CalloutBodyContent,
}
