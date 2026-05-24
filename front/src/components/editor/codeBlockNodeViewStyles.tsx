import styled from "@emotion/styled"
import { NodeViewWrapper } from "@tiptap/react"

export const CodeBlockEditorWrapper = styled(NodeViewWrapper)`
  --aq-code-block-radius: 14px;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  align-self: stretch;
  overflow: visible;
  margin: 1rem 0;
  border: 1px solid ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray6 : "rgba(255, 255, 255, 0.08)")};
  border-radius: var(--aq-code-block-radius);
  background: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray1 : "#2b2d3a")};
  position: relative;
  z-index: 0;
  background-clip: padding-box;

  &[data-selected="true"] {
    border-color: ${({ theme }) => (theme.scheme === "light" ? theme.colors.blue7 : "rgba(148, 163, 184, 0.28)")};
    box-shadow: ${({ theme }) =>
      theme.scheme === "light" ? "0 0 0 1px rgba(59, 130, 246, 0.18)" : "0 0 0 1px rgba(226, 232, 240, 0.12)"};
  }
`

export const CodeBlockEditorHeader = styled.div`
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 0.75rem;
  padding: 0.84rem 0.96rem 0.76rem;
  border-bottom: 1px solid ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray6 : "rgba(255, 255, 255, 0.06)")};
  background: ${({ theme }) =>
    theme.scheme === "light" ? `linear-gradient(180deg, ${theme.colors.gray2}, ${theme.colors.gray3})` : "linear-gradient(180deg, #3a3f59, #363b54)"};
  border-top-left-radius: var(--aq-code-block-radius);
  border-top-right-radius: var(--aq-code-block-radius);
  overflow: visible;
`

export const CodeWindowDots = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.7rem;

  span {
    width: 0.92rem;
    height: 0.92rem;
    border-radius: 999px;
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.12);
  }

  span[data-tone="red"] {
    background: #ff5f56;
  }

  span[data-tone="yellow"] {
    background: #ffbd2e;
  }

  span[data-tone="green"] {
    background: #27c93f;
  }
`

export const CodeLanguagePicker = styled.div`
  position: relative;
  justify-self: end;
  min-width: 0;
`

export const CodeLanguageButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  min-height: 2.1rem;
  border-radius: 0.8rem;
  border: 1px solid ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray6 : "rgba(255, 255, 255, 0.12)")};
  background: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray1 : "rgba(255, 255, 255, 0.04)")};
  color: #ff9d62;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  padding: 0 0.8rem;
  text-transform: uppercase;
  -webkit-text-fill-color: currentColor;
  -webkit-text-security: none;

  svg {
    width: 0.95rem;
    height: 0.95rem;
    color: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray10 : "rgba(255, 255, 255, 0.62)")};
  }
`

export const CodeLanguagePopover = styled.div`
  position: absolute;
  top: calc(100% + 0.55rem);
  right: 0;
  z-index: 40;
  width: min(20rem, calc(100vw - 2rem));
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 0.75rem;
  border: 1px solid ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray6 : "rgba(255, 255, 255, 0.08)")};
  border-radius: 1rem;
  background: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray1 : "rgba(30, 31, 36, 0.98)")};
  box-shadow: ${({ theme }) =>
    theme.scheme === "light" ? "0 14px 28px rgba(15, 23, 42, 0.12)" : "0 18px 36px rgba(0, 0, 0, 0.3)"};
  -webkit-text-fill-color: currentColor;
  -webkit-text-security: none;
`

export const CodeLanguageSearchInput = styled.input`
  min-height: 2.6rem;
  width: 100%;
  border-radius: 0.85rem;
  border: 1px solid ${({ theme }) => (theme.scheme === "light" ? theme.colors.blue7 : "rgba(59, 130, 246, 0.6)")};
  background: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray1 : "rgba(17, 24, 39, 0.88)")};
  color: var(--color-gray12);
  font-size: 0.96rem;
  padding: 0 0.95rem;
  -webkit-text-fill-color: currentColor;
  -webkit-text-security: none;
`

export const CodeLanguageOptionList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  max-height: 18rem;
  overflow-y: auto;
`

export const CodeLanguageOptionButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  min-height: 2.6rem;
  border-radius: 0.75rem;
  border: 0;
  background: transparent;
  color: var(--color-gray12);
  font-size: 0.96rem;
  font-weight: 600;
  padding: 0 0.7rem;
  text-align: left;
  -webkit-text-fill-color: currentColor;
  -webkit-text-security: none;

  small {
    color: var(--color-gray10);
    font-size: 0.76rem;
    font-weight: 700;
    -webkit-text-fill-color: currentColor;
    -webkit-text-security: none;
  }

  span {
    -webkit-text-fill-color: currentColor;
    -webkit-text-security: none;
  }

  svg {
    width: 1rem;
    height: 1rem;
    color: #e5e7eb;
  }

  &[data-active="true"],
  &:hover {
    background: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray3 : "rgba(255, 255, 255, 0.08)")};
  }
`

export const CodeBlockEditorSurface = styled.div`
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
  border-radius: 0 0 var(--aq-code-block-radius) var(--aq-code-block-radius);

  .aq-code-shell {
    position: relative;
    display: grid;
    align-items: start;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    overflow-x: auto;
    overflow-y: hidden;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-x: contain;
    touch-action: pan-x pan-y;
  }

  .aq-code-highlight-layer,
  .aq-code-editor-content {
    width: max-content;
    min-width: 100%;
    max-width: none;
    grid-area: 1 / 1;
    margin: 0;
    overflow: visible;
    padding: 1.05rem 1.18rem 1.6rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
      "Courier New", monospace;
    font-size: 0.85rem;
    line-height: 1.5;
    white-space: pre;
  }

  .aq-code-highlight-layer {
    pointer-events: none;
    user-select: none;
    -webkit-user-select: none;
    background: transparent;
    color: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray11 : "#a9b7c6")};

    .line {
      display: block;
      min-height: 1.5em;
    }

    .token.comment,
    .token.prolog,
    .token.doctype,
    .token.cdata {
      color: ${({ theme }) => (theme.scheme === "dark" ? "#808b99" : "#6a7280")};
      font-style: italic;
    }

    .token.punctuation {
      color: ${({ theme }) => (theme.scheme === "dark" ? "#a9b7c6" : "#495367")};
    }

    .token.property,
    .token.tag,
    .token.constant,
    .token.symbol,
    .token.deleted {
      color: ${({ theme }) => (theme.scheme === "dark" ? "#cc7832" : "#b45309")};
    }

    .token.boolean,
    .token.number {
      color: ${({ theme }) => (theme.scheme === "dark" ? "#6897bb" : "#1d4ed8")};
    }

    .token.selector,
    .token.attr-name,
    .token.string,
    .token.char,
    .token.builtin,
    .token.inserted {
      color: ${({ theme }) => (theme.scheme === "dark" ? "#6aab73" : "#047857")};
    }

    .token.operator,
    .token.entity,
    .token.url,
    .token.variable {
      color: ${({ theme }) => (theme.scheme === "dark" ? "#9876aa" : "#7c3aed")};
    }

    .token.atrule,
    .token.attr-value,
    .token.keyword,
    .token.annotation,
    .token.decorator {
      color: ${({ theme }) => (theme.scheme === "dark" ? "#cc7832" : "#1d4ed8")};
      font-weight: 600;
    }

    .token.function,
    .token.class-name {
      color: ${({ theme }) => (theme.scheme === "dark" ? "#ffc66d" : "#be185d")};
    }

    .token.regex,
    .token.important {
      color: ${({ theme }) => (theme.scheme === "dark" ? "#bbb529" : "#92400e")};
    }
  }

  .aq-code-shell .aq-code-highlight-layer,
  .aq-code-shell .aq-code-highlight-layer code {
    font-size: 0.85rem;
    line-height: 1.5;
  }

  .aq-code-editor-content {
    position: relative;
    z-index: 1;
    background: transparent;
    color: transparent !important;
    cursor: text;
    caret-color: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray12 : "#f8fafc")};
    text-shadow: none;
    user-select: text;
    -webkit-user-select: text;
    -webkit-text-fill-color: transparent !important;
  }

  .aq-code-editor-content > div {
    display: block;
    min-height: 5rem;
    outline: none;
    white-space: pre;
    overflow-wrap: normal;
    word-break: normal;
  }

  .aq-code-editor-content,
  .aq-code-editor-content * {
    white-space: pre;
    overflow-wrap: normal;
    word-break: normal;
    color: transparent !important;
    user-select: text;
    -webkit-user-select: text;
    -webkit-text-fill-color: transparent !important;
  }

  .aq-code-editor-content::selection,
  .aq-code-editor-content *::selection {
    background: rgba(59, 130, 246, 0.28);
    color: transparent !important;
    -webkit-text-fill-color: transparent !important;
  }

  .aq-code-editor-content::-moz-selection,
  .aq-code-editor-content *::-moz-selection {
    background: rgba(59, 130, 246, 0.28);
    color: transparent !important;
  }

  @media (max-width: 768px) {
    .aq-code-highlight-layer,
    .aq-code-editor-content {
      font-size: 0.86rem;
      line-height: 1.54;
      padding: 0.86rem 0.74rem 1.1rem;
    }

    .aq-code-shell .aq-code-highlight-layer,
    .aq-code-shell .aq-code-highlight-layer code {
      font-size: 0.86rem;
      line-height: 1.54;
    }

    .aq-code-shell .aq-code-highlight-layer .line {
      min-height: 1.54em;
    }
  }
`

export const CodeBlockEditorStyles = {
  CodeBlockEditorHeader,
  CodeBlockEditorSurface,
  CodeBlockEditorWrapper,
  CodeLanguageButton,
  CodeLanguageOptionButton,
  CodeLanguageOptionList,
  CodeLanguagePicker,
  CodeLanguagePopover,
  CodeLanguageSearchInput,
  CodeWindowDots,
}
