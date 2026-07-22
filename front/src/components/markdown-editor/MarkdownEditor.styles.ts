import styled from "@emotion/styled"

export const EditorRoot = styled.section`
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 0;
  overflow: hidden;
  background: ${({ theme }) => theme.publicDesign.readableSurface};
  color: ${({ theme }) => theme.colors.gray12};
`

export const EditorToolbar = styled.div`
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 7px 12px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.publicDesign.readableSurface};

  @media (max-width: 820px) {
    align-items: flex-start;
    flex-direction: column;
  }
`

export const ToolbarGroup = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 4px;
  min-width: 0;
  max-width: 100%;
  overflow-x: auto;
  scrollbar-width: thin;

  @media (max-width: 820px) {
    width: 100%;
  }
`

export const ToolbarButton = styled.button`
  border: 1px solid transparent;
  border-radius: 4px;
  height: 31px;
  min-width: 31px;
  padding: 0 8px;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray10};
  font: 700 11px/1 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  cursor: pointer;

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.publicDesign.surfaceElevated};
    color: ${({ theme }) => theme.colors.gray12};
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
`

export const ToolbarUploadButton = styled.label`
  border: 1px solid transparent;
  border-radius: 4px;
  height: 31px;
  min-width: 31px;
  display: inline-flex;
  align-items: center;
  padding: 0 8px;
  color: ${({ theme }) => theme.colors.gray10};
  font: 700 11px/1 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  cursor: pointer;

  &:hover:not([aria-disabled="true"]) {
    border-color: ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.publicDesign.surfaceElevated};
    color: ${({ theme }) => theme.colors.gray12};
  }

  &[aria-disabled="true"] {
    opacity: 0.45;
    cursor: not-allowed;
  }

  input {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    opacity: 0;
    pointer-events: none;
  }
`

export const ToolbarError = styled.div`
  padding: 0.55rem 0.85rem;
  border-bottom: 1px solid rgba(248, 81, 73, 0.35);
  background: rgba(248, 81, 73, 0.1);
  color: #ffb4ad;
  font-size: 0.86rem;
  font-weight: 600;
`

export const EditorBody = styled.div`
  flex: 1 1 auto;
  min-width: 0;
  max-width: 100%;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  background: ${({ theme }) => theme.publicDesign.readableSurface};

  &[data-mode="write"],
  &[data-mode="preview"] {
    grid-template-columns: minmax(0, 1fr);
  }

  &[data-mode="preview"] [data-testid="markdown-editor-preview-scroll"] {
    max-width: 820px;
  }

  @media (max-width: 1100px) {
    grid-template-columns: minmax(0, 1fr);

    &[data-mode="split"] [data-pane="write"] {
      height: 46vh;
      border-right: 0;
      border-bottom: 1px solid ${({ theme }) => theme.colors.gray6};
    }

    &[data-mode="split"] [data-pane="preview"] {
      height: auto;
    }
  }
`

export const WritePane = styled.div`
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: auto;
  border-right: 1px solid ${({ theme }) => theme.colors.gray6};
  background: #0f1728;
`

export const WriteEditorFrame = styled.div`
  min-height: 100%;
  background: #0f1728;
  color: #dbe7ff;
`

export const MarkdownTextarea = styled.textarea`
  width: 100%;
  height: 100%;
  min-height: 640px;
  max-width: none;
  padding: 30px 32px;
  border: 0;
  outline: none;
  resize: none;
  background: #0f1728;
  color: #d9e4f7;
  caret-color: #dbe7ff;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.78;
  tab-size: 2;
  white-space: pre-wrap;
  overflow-wrap: anywhere;

  &::selection {
    background: ${({ theme }) => (theme.scheme === "dark" ? "rgba(56, 139, 253, 0.45)" : "rgba(9, 105, 218, 0.24)")};
  }

  &:focus,
  &:focus-visible {
    outline: 0;
    box-shadow: none;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.7;
  }

  @media (max-width: 820px) {
    padding: 22px 18px;
  }
`

export const PreviewPane = styled.div`
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow-y: auto;
  overscroll-behavior: contain;
  background: ${({ theme }) => theme.publicDesign.readableSurface};
`

export const PreviewArticle = styled.article`
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
  padding: 48px 44px 110px;
  background: ${({ theme }) => theme.publicDesign.readableSurface};

  .aq-markdown {
    width: min(100%, 760px);
    max-width: 760px;
    margin-top: 0;
    margin-inline: auto;
    color: ${({ theme }) => theme.colors.gray12};
  }

  .aq-markdown > :first-child {
    margin-top: 0;
  }

  @media (max-width: 820px) {
    padding: 34px 20px 90px;
  }
`

export const PreviewHeader = styled.header`
  width: min(100%, 760px);
  max-width: 760px;
  margin: 0 auto 34px;

  span {
    display: block;
    margin-bottom: 14px;
    color: ${({ theme }) => theme.publicDesign.accent};
    font: 750 11px/1 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  h1 {
    margin: 12px 0 18px;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 43px;
    font-weight: 850;
    line-height: 1.13;
    letter-spacing: -0.055em;
  }

  p {
    margin: 0;
    padding: 4px 0 4px 20px;
    border-left: 3px solid ${({ theme }) => theme.publicDesign.accent};
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 18px;
    line-height: 1.75;
  }
`
