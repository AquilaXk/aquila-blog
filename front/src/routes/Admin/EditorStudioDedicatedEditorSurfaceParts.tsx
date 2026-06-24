import styled from "@emotion/styled";
import { articleTypographyScale } from "src/libs/markdown/contentTypography";
export const EditorStudioRoot = styled.main `
  box-sizing: border-box;
  width: 100vw;
  margin-left: calc(50% - 50vw);
  margin-right: calc(50% - 50vw);
  min-height: 100vh;
  padding: 0;
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 0;
  overflow-x: clip;
  background: ${({ theme }) => theme.publicDesign.operationSurface};
  color: ${({ theme }) => theme.colors.gray12};

  @media (max-width: 1024px) {
    padding: 0;
  }

  @media (max-width: 768px) {
    padding: 0;
  }
`;
export const EditorStudioLoadingState = styled.div `
  min-height: calc(100vh - 10rem);
  display: grid;
  place-content: center;
  gap: 0.4rem;
  text-align: center;

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 1.1rem;
  }

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.9rem;
  }
`;
export const EditorStudioDedicatedTopBar = styled.div `
  width: 100%;
  min-height: 58px;
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr) auto;
  align-items: center;
  gap: 1rem;
  padding: 0 1rem;
  border-bottom: 1px solid ${({ theme }) => theme.publicDesign.border};
  background: ${({ theme }) => theme.publicDesign.readableSurface};

  @media (max-width: 1200px) {
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 0.8rem;
  }

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
    align-items: stretch;
    gap: 0.7rem;
    padding: 0.72rem;
  }
`;
export const EditorExitAction = styled.button `
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  width: min(100%, 240px);
  padding: 0 0.72rem;
  margin: 0;
  border: 1px solid ${({ theme }) => theme.publicDesign.borderStrong};
  border-radius: 0;
  background: ${({ theme }) => theme.publicDesign.surfaceElevated};
  color: ${({ theme }) => theme.colors.gray12};
  font-size: 0.9rem;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  transition:
    background-color 0.18s ease,
    color 0.18s ease;

  &:hover {
    background: ${({ theme }) => (theme.colors.gray3)};
  }

  &:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px ${({ theme }) => (theme.colors.blue4)};
  }

  @media (max-width: 1200px) {
    justify-content: flex-start;
  }
`;
export const EditorStudioTopBarActions = styled.div `
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: nowrap;
  justify-content: flex-end;

  @media (max-width: 1200px) {
    width: auto;
    margin-left: auto;
    justify-content: flex-end;
    flex-wrap: nowrap;
  }

  @media (max-width: 760px) {
    width: 100%;
    margin-left: 0;
    justify-content: flex-end;
    flex-wrap: wrap;
  }
`;
export const EditorStudioSaveState = styled.span `
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.84rem;
  font-weight: 600;
  white-space: nowrap;
  text-align: center;

  &[data-tone="success"] {
    color: ${({ theme }) => theme.colors.green10};
  }

  &[data-tone="loading"] {
    color: ${({ theme }) => theme.colors.blue9};
  }

  &[data-tone="error"] {
    color: ${({ theme }) => theme.colors.red10};
  }

  @media (max-width: 680px) {
    width: 100%;
  }
`;
const Button = styled.button `
  border: 1px solid ${({ theme }) => (theme.colors.gray6)};
  border-radius: 6px;
  padding: 0.62rem 0.92rem;
  min-height: 44px;
  background: ${({ theme }) => ("transparent")};
  color: ${({ theme }) => theme.colors.gray10};
  cursor: pointer;
  font-size: 0.84rem;
  font-weight: 600;
  transition:
    border-color 0.18s ease,
    background-color 0.18s ease,
    color 0.18s ease,
    box-shadow 0.18s ease;

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => (theme.colors.gray8)};
    background: ${({ theme }) => (theme.colors.gray3)};
    color: ${({ theme }) => theme.colors.gray12};
  }

  &:focus-visible {
    outline: none;
    border-color: ${({ theme }) => (theme.colors.blue8)};
    box-shadow: 0 0 0 3px ${({ theme }) => (theme.colors.blue4)};
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
`;
export const PrimaryButton = styled(Button) `
  border-radius: 6px;
  padding: 0.6rem 0.88rem;
  border-color: ${({ theme }) => (theme.scheme === "dark" ? "#0a58ca" : "#0969da")};
  background: ${({ theme }) => (theme.scheme === "dark" ? "#0a58ca" : "#0969da")};
  color: ${({ theme }) => theme.colors.accentControlText};
  font-weight: 700;

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => (theme.scheme === "dark" ? "#084298" : "#075bb5")};
    background: ${({ theme }) => (theme.scheme === "dark" ? "#084298" : "#075bb5")};
    color: ${({ theme }) => theme.colors.accentControlText};
  }
`;
export const SecondaryButton = styled(Button) `
  border-radius: 6px;
  border-color: ${({ theme }) => theme.publicDesign.border};
  background: ${({ theme }) => theme.publicDesign.readableSurface};
  color: ${({ theme }) => theme.colors.gray12};
  font-weight: 700;

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.publicDesign.borderStrong};
    background: ${({ theme }) => theme.colors.gray2};
  }
`;
export const EditorStudioFrame = styled.div `
  width: 100%;
  min-height: calc(100vh - 58px);
  margin: 0;
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr) 300px;
  gap: 0;
  align-items: stretch;
  overflow-x: clip;

  @media (max-width: 1180px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;
export const EditorStudioWritingColumn = styled.section<{
    $compact?: boolean;
}> `
  display: grid;
  min-width: 0;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 0;
  overflow-x: clip;
`;
export const EditorStudioDedicatedMetaSection = styled.section<{
    $compact?: boolean;
}> `
  width: 100%;
  max-width: 100%;
  min-width: 0;
  margin-inline: auto;
  display: grid;
  gap: ${({ $compact }) => ($compact ? "0.72rem" : "0.9rem")};
  border: 1px solid ${({ theme }) => ("transparent")};
  border-radius: ${({ theme }) => ("0")};
  background: ${({ theme }) => ("transparent")};
  padding: 1.55rem 1.8rem 1.05rem;

`;
export const EditorTagRow = styled.div<{
    $compact?: boolean;
}> `
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${({ $compact }) => ($compact ? "0.44rem" : "0.55rem")};
  min-height: 32px;
`;
export const SelectedTagChip = styled.span `
  display: inline-flex;
  align-items: stretch;
  gap: 0;
  min-width: 0;
  max-width: 100%;
  min-height: 32px;
  border-radius: 0;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.publicDesign.surfaceElevated};
  overflow: hidden;
  transition:
    border-color 0.18s ease,
    transform 0.18s ease,
    background 0.18s ease;

  &:hover {
    transform: none;
  }

  .label {
    display: inline-flex;
    align-items: center;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding: 0.38rem 0.78rem;
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.86rem;
    font-weight: 600;
    line-height: 1;
  }

  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    align-self: stretch;
    min-width: 1.92rem;
    padding: 0 0.52rem;
    border: 0;
    border-left: 1px solid ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.publicDesign.readableSurface};
    color: ${({ theme }) => theme.colors.gray10};
    cursor: pointer;
    flex: 0 0 auto;
    font-size: 0.98rem;
    line-height: 1;
    transition:
      transform 0.18s ease,
      background 0.18s ease,
      color 0.18s ease;

    &:hover {
      transform: none;
      background: ${({ theme }) => theme.colors.gray4};
      color: ${({ theme }) => theme.colors.gray12};
    }
  }
`;
export const InlineMetaInput = styled.input `
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  flex: 1 1 12rem;
  min-width: 11rem;
  border: 0;
  border-bottom: 1px dashed ${({ theme }) => theme.colors.gray6};
  outline: none;
  min-height: 32px;
  padding: 0 0.12rem;
  border-radius: 0;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray12};
  font-size: 0.86rem;
  font-weight: 500;

  &::placeholder {
    color: ${({ theme }) => theme.colors.gray10};
  }

  &:focus-visible {
    outline: none;
    border-color: ${({ theme }) => theme.colors.blue8};
    box-shadow: 0 0 0 4px ${({ theme }) => theme.colors.blue4};
  }
`;
export const TitleInput = styled.textarea<{
    $compact?: boolean;
}> `
  width: 100%;
  max-width: 52rem;
  min-width: 0;
  border: 0;
  border-radius: 0;
  padding: 0;
  min-height: 44px;
  background: transparent;
  box-shadow: none;
  font-family: inherit;
  font-size: ${articleTypographyScale.postTitleFontSize};
  font-weight: 700;
  line-height: ${articleTypographyScale.postTitleLineHeight};
  letter-spacing: 0;
  resize: none;
  overflow: hidden;
  white-space: pre-wrap;
  overflow-wrap: anywhere;

  &::placeholder {
    color: ${({ theme }) => theme.colors.gray9};
  }

  &:focus {
    box-shadow: none;
    border-color: transparent;
  }

  @media (max-width: 720px) {
    font-size: ${articleTypographyScale.postTitleFontSizeMobile};
    line-height: ${articleTypographyScale.postTitleLineHeightMobile};
  }
`;
export const EditorHeaderMetaRow = styled.div `
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.85rem;
  min-width: 0;
`;
export const EditorHeaderMetaActions = styled.div `
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 0.45rem;
  min-width: 0;
`;
export const EditorHeaderAuthor = styled.div `
  display: inline-flex;
  align-items: center;
  gap: 0.85rem;
  min-width: 0;
`;
export const EditorHeaderAvatar = styled.div<{
    $compact?: boolean;
}> `
  position: relative;
  width: ${({ $compact }) => ($compact ? "40px" : "48px")};
  height: ${({ $compact }) => ($compact ? "40px" : "48px")};
  flex-shrink: 0;
  border-radius: 0;
  border: 1px solid ${({ theme }) => theme.publicDesign.borderStrong};
  overflow: hidden;
  background: ${({ theme }) => theme.colors.gray3};

  .initial {
    display: inline-flex;
    width: 100%;
    height: 100%;
    align-items: center;
    justify-content: center;
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.84rem;
    font-weight: 800;
    letter-spacing: 0.04em;
  }
`;
export const EditorHeaderAuthorText = styled.div<{
    $compact?: boolean;
}> `
  display: grid;
  gap: ${({ $compact }) => ($compact ? "0.12rem" : "0.18rem")};
  min-width: 0;

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: ${({ $compact }) => ($compact ? "0.94rem" : "1rem")};
    font-weight: 700;
    overflow-wrap: anywhere;
  }

  span {
    color: ${({ theme }) => theme.colors.gray11};
    font-size: ${({ $compact }) => ($compact ? "0.82rem" : "0.9rem")};
    font-weight: 500;
  }
`;
export const EditorHeaderMetaPill = styled.span<{
    $compact?: boolean;
}> `
  display: inline-flex;
  align-items: center;
  min-height: ${({ $compact }) => ($compact ? "30px" : "34px")};
  padding: ${({ $compact }) => ($compact ? "0 0.72rem" : "0 0.82rem")};
  border-radius: 0;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.publicDesign.surfaceElevated};
  color: ${({ theme }) => theme.colors.gray11};
  font-size: ${({ $compact }) => ($compact ? "0.74rem" : "0.82rem")};
  font-weight: 650;
  line-height: 1;
`;
export const EditorHeaderActionButton = styled(Button) `
  min-height: 34px;
  padding: 0.45rem 0.7rem;
  border-radius: 6px;
  font-size: 0.78rem;
`;
export const EditorStudioDedicatedCanvasSection = styled.section `
  --compose-pane-readable-width: var(--article-readable-width, 48rem);
  width: 100%;
  max-width: 100%;
  min-width: 0;
  margin-inline: auto;
  min-height: clamp(28rem, 70vh, 56rem);
  display: grid;
  gap: 0.72rem;
  overflow-x: visible;
  border: 1px solid ${({ theme }) => ("transparent")};
  border-radius: ${({ theme }) => ("0")};
  background: ${({ theme }) => ("transparent")};
  padding: 0 1.8rem 1.8rem;
  box-shadow: ${({ theme }) => ("none")};

  @media (max-width: 720px) {
    padding: 0 0.82rem 1rem;
  }
`;
export const PublishNotice = styled.div `
  margin: 0;
  padding: 0.55rem 0.7rem;
  border-radius: 10px;
  font-size: 0.83rem;
  line-height: 1.4;
  width: 100%;
  box-sizing: border-box;

  &[data-tone="idle"] {
    color: ${({ theme }) => theme.colors.gray11};
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: transparent;
  }

  &[data-tone="loading"] {
    color: ${({ theme }) => theme.colors.blue11};
    border: 1px solid ${({ theme }) => theme.colors.blue7};
    background: ${({ theme }) => theme.colors.blue3};
  }

  &[data-tone="success"] {
    color: ${({ theme }) => theme.colors.green11};
    border: 1px solid ${({ theme }) => theme.colors.green7};
    background: ${({ theme }) => theme.colors.green3};
  }

  &[data-tone="error"] {
    color: ${({ theme }) => theme.colors.red11};
    border: 1px solid ${({ theme }) => theme.colors.red7};
    background: ${({ theme }) => theme.colors.red3};
  }

  @media (max-width: 720px) {
    width: 100%;
  }
`;

export const EditorOutline = styled.aside`
  min-width: 0;
  padding: 1.2rem 0.88rem;
  border-right: 1px solid ${({ theme }) => theme.publicDesign.border};
  background: ${({ theme }) => theme.publicDesign.surfaceElevated};

  h3 {
    margin: 0 0 1.1rem;
    color: ${({ theme }) => theme.colors.gray10};
    font: 750 0.68rem/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.82rem;
    line-height: 1.6;
  }

  @media (max-width: 1180px) {
    display: none;
  }
`;

export const EditorOutlineItem = styled.div`
  display: grid;
  grid-template-columns: 1.6rem minmax(0, 1fr);
  gap: 0.45rem;
  padding: 0.45rem 0;
  color: ${({ theme }) => theme.colors.gray10};

  &[data-level="2"] {
    padding-left: 0.9rem;
  }

  &[data-level="3"] {
    padding-left: 1.8rem;
  }

  &[data-active="true"] {
    color: ${({ theme }) => theme.publicDesign.accent};
  }

  span {
    font: 700 0.72rem/1.3 ui-monospace, SFMono-Regular, Menlo, monospace;
  }

  strong {
    min-width: 0;
    font-size: 0.82rem;
    font-weight: 650;
    line-height: 1.5;
    overflow-wrap: anywhere;
  }
`;

export const EditorInspector = styled.aside`
  min-width: 0;
  display: grid;
  align-content: start;
  gap: 1.2rem;
  padding: 1.2rem;
  border-left: 1px solid ${({ theme }) => theme.publicDesign.border};
  background: ${({ theme }) => theme.publicDesign.surfaceElevated};

  h3,
  label > span,
  section > span {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray10};
    font: 750 0.68rem/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  label,
  section {
    display: grid;
    gap: 0.65rem;
    padding-bottom: 1.15rem;
    border-bottom: 1px solid ${({ theme }) => theme.publicDesign.border};
  }

  small {
    justify-self: end;
    color: ${({ theme }) => theme.colors.gray10};
    font: 700 0.72rem/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  }

  select,
  textarea {
    width: 100%;
    border: 1px solid ${({ theme }) => theme.publicDesign.border};
    border-radius: 6px;
    background: ${({ theme }) => theme.publicDesign.readableSurface};
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.88rem;
  }

  select {
    min-height: 42px;
    padding: 0 0.65rem;
  }

  textarea {
    min-height: 5.6rem;
    padding: 0.8rem;
    resize: vertical;
    line-height: 1.65;
  }

  p {
    display: flex;
    justify-content: space-between;
    gap: 0.8rem;
    margin: 0;
    font-size: 0.84rem;
  }

  b {
    border: 1px solid ${({ theme }) => theme.colors.green7};
    padding: 0.12rem 0.34rem;
    color: ${({ theme }) => theme.colors.green11};
    font: 750 0.68rem/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  }

  b[data-tone="warn"] {
    border-color: ${({ theme }) => theme.colors.orange7};
    color: ${({ theme }) => theme.colors.orange10};
  }

  @media (max-width: 1180px) {
    display: none;
  }
`;

export const EditorInspectorPreview = styled.div`
  display: grid;
  border: 1px solid ${({ theme }) => theme.publicDesign.border};
  background: ${({ theme }) => theme.publicDesign.readableSurface};

  div {
    min-height: 6.8rem;
    padding: 1.05rem;
    background: #0f1728;
    color: #a9c5ff;
    font: 800 0.86rem/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;
  }

  strong {
    padding: 0.85rem 0.85rem 0.2rem;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.92rem;
    line-height: 1.35;
  }

  span {
    padding: 0 0.85rem 0.9rem;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.78rem;
  }
`;

export const EditorGuideBackdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  justify-content: flex-end;
  background: rgba(17, 18, 22, 0.52);
`;

export const EditorGuidePanel = styled.aside`
  width: min(100%, 590px);
  min-height: 100vh;
  overflow-y: auto;
  padding: 1rem 1.35rem 1.4rem;
  border-left: 1px solid ${({ theme }) => theme.publicDesign.border};
  background: ${({ theme }) => theme.publicDesign.readableSurface};

  header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1.5rem;
  }

  header span {
    color: ${({ theme }) => theme.publicDesign.accent};
    font: 750 0.68rem/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  h2 {
    margin: 0.25rem 0 0;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 1.15rem;
    line-height: 1.25;
  }

  header button {
    border: 0;
    background: transparent;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 1.2rem;
    cursor: pointer;
  }

  > p {
    margin: 0 0 1.35rem;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.92rem;
    line-height: 1.7;
  }
`;

export const EditorGuideGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  border: 1px solid ${({ theme }) => theme.publicDesign.border};

  section {
    min-width: 0;
    padding: 1rem;
    border-right: 1px solid ${({ theme }) => theme.publicDesign.border};
    border-bottom: 1px solid ${({ theme }) => theme.publicDesign.border};
  }

  section:nth-of-type(2n) {
    border-right: 0;
  }

  h3 {
    margin: 0 0 0.7rem;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.9rem;
  }

  pre {
    margin: 0;
    min-height: 5.6rem;
    padding: 0.8rem;
    overflow: auto;
    background: #0f1728;
    color: #dbe7ff;
    font: 650 0.74rem/1.55 ui-monospace, SFMono-Regular, Menlo, monospace;
  }

  @media (max-width: 560px) {
    grid-template-columns: 1fr;

    section {
      border-right: 0;
    }
  }
`;
