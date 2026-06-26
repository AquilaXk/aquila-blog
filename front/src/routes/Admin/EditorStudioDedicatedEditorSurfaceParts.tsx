import styled from "@emotion/styled";
export const EditorStudioRoot = styled.main `
  box-sizing: border-box;
  width: 100vw;
  margin-left: calc(50% - 50vw);
  margin-right: calc(50% - 50vw);
  height: 100vh;
  min-height: 100vh;
  padding: 0;
  display: grid;
  grid-template-rows: 58px minmax(0, 1fr);
  gap: 0;
  overflow: hidden;
  overflow-x: clip;
  background: ${({ theme }) => theme.publicDesign.readableSurface};
  color: ${({ theme }) => theme.colors.gray12};

  @media (max-width: 1024px) {
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
  height: 58px;
  min-height: 58px;
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr) auto;
  align-items: center;
  gap: 20px;
  padding: 0 16px;
  border-bottom: 1px solid ${({ theme }) => theme.publicDesign.border};
  background: ${({ theme }) => theme.publicDesign.readableSurface};

  @media (max-width: 820px) {
    grid-template-columns: auto minmax(0, 1fr);
    gap: 8px;
    padding: 0 10px;
  }
`;
export const EditorExitAction = styled.button `
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: 9px;
  min-width: 0;
  min-height: 34px;
  width: max-content;
  padding: 0;
  margin: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray12};
  font-size: 0.9rem;
  font-weight: 750;
  line-height: 1;
  cursor: pointer;
  transition:
    background-color 0.18s ease,
    color 0.18s ease;

  &:hover {
    background: transparent;
    color: ${({ theme }) => theme.colors.blue10};
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
  gap: 8px;
  flex-wrap: nowrap;
  justify-content: flex-end;

  button {
    height: 38px;
    min-height: 38px;
    padding: 0 14px;
  }

  @media (max-width: 1200px) {
    width: auto;
    margin-left: auto;
    justify-content: flex-end;
    flex-wrap: nowrap;
  }

  @media (max-width: 820px) {
    width: auto;
    justify-self: end;
    margin-left: 0;
    justify-content: flex-end;
    flex-wrap: nowrap;

    button {
      height: 34px;
      min-height: 34px;
      padding: 0 10px;
    }
  }
`;
export const EditorStudioSaveState = styled.span `
  color: ${({ theme }) => theme.colors.gray10};
  font: 600 11px/1 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
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

  @media (max-width: 820px) {
    display: none;
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
  border-color: ${({ theme }) => theme.publicDesign.accent};
  background: ${({ theme }) => theme.publicDesign.accent};
  color: ${({ theme }) => theme.colors.accentControlText};
  font-weight: 750;

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.publicDesign.accentHover};
    background: ${({ theme }) => theme.publicDesign.accentHover};
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
  min-height: 0;
  margin: 0;
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr) 300px;
  gap: 0;
  align-items: stretch;
  overflow-x: clip;

  @media (max-width: 1100px) {
    grid-template-columns: 190px minmax(0, 1fr);
  }

  @media (max-width: 820px) {
    width: 100vw;
    max-width: 100vw;
    display: block;
    overflow: hidden;
  }
`;
export const EditorStudioWritingColumn = styled.section<{
    $compact?: boolean;
}> `
  position: relative;
  display: grid;
  min-width: 0;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 0;
  overflow: hidden;
`;
export const EditorStudioDedicatedMetaSection = styled.section<{
    $compact?: boolean;
}> `
  width: 100%;
  max-width: 100%;
  min-width: 0;
  margin-inline: auto;
  display: grid;
  gap: 0;
  border: 0;
  border-bottom: 1px solid ${({ theme }) => theme.publicDesign.border};
  border-radius: ${({ theme }) => ("0")};
  background: ${({ theme }) => theme.publicDesign.readableSurface};
  padding: 22px 28px 17px;

  @media (max-width: 820px) {
    width: 100vw;
    max-width: 100vw;
    box-sizing: border-box;
  }
`;
export const EditorTagRow = styled.div<{
    $compact?: boolean;
}> `
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px;
  min-height: 26px;
`;
export const SelectedTagChip = styled.span `
  display: inline-flex;
  align-items: stretch;
  gap: 0;
  min-width: 0;
  max-width: 100%;
  min-height: 26px;
  border-radius: 0;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: transparent;
  overflow: hidden;
  transition:
    border-color 0.18s ease,
    background 0.18s ease;

  .label {
    display: inline-flex;
    align-items: center;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding: 0 8px;
    color: ${({ theme }) => theme.colors.gray10};
    font: 650 11px/1 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  }

  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    align-self: stretch;
    min-width: 26px;
    padding: 0 6px;
    border: 0;
    border-left: 1px solid ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.publicDesign.readableSurface};
    color: ${({ theme }) => theme.colors.gray10};
    cursor: pointer;
    flex: 0 0 auto;
    font-size: 0.98rem;
    line-height: 1;
    transition:
      background 0.18s ease,
      color 0.18s ease;

    &:hover {
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

export const EditorInspectorTagInputRow = styled.div`
  display: flex;
  gap: 6px;

  input {
    min-width: 0;
    flex: 1 1 auto;
    width: 100%;
    border: 1px solid ${({ theme }) => theme.publicDesign.border};
    border-radius: 6px;
    background: ${({ theme }) => theme.publicDesign.readableSurface};
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.88rem;
    padding: 10px;
  }

  button {
    width: 38px;
    border: 1px solid ${({ theme }) => theme.publicDesign.border};
    border-radius: 6px;
    background: ${({ theme }) => theme.publicDesign.readableSurface};
    color: ${({ theme }) => theme.colors.gray12};
    cursor: pointer;
  }
`;

export const EditorInspectorFullWidthAction = styled(SecondaryButton)`
  width: 100%;
  margin-top: 8px;
`;

export const TitleInput = styled.textarea<{
    $compact?: boolean;
}> `
  width: 100%;
  max-width: 100%;
  min-width: 0;
  border: 0;
  border-radius: 0;
  padding: 0;
  min-height: 44px;
  background: transparent;
  box-shadow: none;
  font-family: inherit;
  font-size: 30px;
  font-weight: 850;
  line-height: 1.2;
  letter-spacing: -0.045em;
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

  @media (max-width: 820px) {
    font-size: 25px;
  }
`;
export const EditorHeaderMetaRow = styled.div `
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 9px;
  min-width: 0;
  margin-top: 10px;
`;
export const EditorHeaderMetaPill = styled.span<{
    $compact?: boolean;
}> `
  display: inline-flex;
  align-items: center;
  min-height: 26px;
  padding: 0;
  color: ${({ theme }) => theme.colors.gray10};
  font-size: ${({ $compact }) => ($compact ? "0.72rem" : "0.78rem")};
  font-weight: 600;
  line-height: 1;
`;
export const EditorStudioDedicatedCanvasSection = styled.section `
  --compose-pane-readable-width: var(--article-readable-width, 48rem);
  width: 100%;
  max-width: 100%;
  min-width: 0;
  margin-inline: auto;
  min-height: 0;
  display: grid;
  gap: 0;
  overflow: hidden;
  border: 0;
  border-radius: ${({ theme }) => ("0")};
  background: ${({ theme }) => ("transparent")};
  padding: 0;
  box-shadow: ${({ theme }) => ("none")};

  @media (max-width: 820px) {
    width: 100vw;
    max-width: 100vw;
    box-sizing: border-box;
    padding: 0;
  }
`;
export const PublishNotice = styled.div `
  position: absolute;
  left: 28px;
  right: 28px;
  bottom: 18px;
  z-index: 10;
  margin: 0;
  padding: 0.55rem 0.7rem;
  border-radius: 6px;
  font-size: 0.83rem;
  line-height: 1.4;
  width: auto;
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

  @media (max-width: 820px) {
    left: 16px;
    right: 16px;
    bottom: 16px;
  }
`;

export const EditorOutline = styled.aside`
  min-width: 0;
  padding: 20px 14px;
  border-right: 1px solid ${({ theme }) => theme.publicDesign.border};
  background: ${({ theme }) => theme.publicDesign.surfaceElevated};
  overflow: auto;

  h3 {
    margin: 0 0 16px;
    color: ${({ theme }) => theme.colors.gray10};
    font: 750 11px/1 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.82rem;
    line-height: 1.6;
  }

  @media (max-width: 820px) {
    display: none;
  }
`;

export const EditorOutlineItem = styled.div`
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 6px;
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 12px;

  &[data-level="2"] {
    padding-left: 20px;
  }

  &[data-level="3"] {
    padding-left: 34px;
  }

  &[data-active="true"] {
    color: ${({ theme }) => theme.publicDesign.accent};
    font-weight: 750;
  }

  span {
    font: 700 12px/1.3 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  }

  strong {
    min-width: 0;
    font-weight: 650;
    line-height: 1.4;
    overflow-wrap: anywhere;
  }
`;

export const EditorInspector = styled.aside`
  min-width: 0;
  display: grid;
  align-content: start;
  padding: 20px;
  border-left: 1px solid ${({ theme }) => theme.publicDesign.border};
  background: ${({ theme }) => theme.publicDesign.operationSurface};
  overflow: auto;

  h3 {
    margin: 0 0 16px;
    color: ${({ theme }) => theme.colors.gray10};
    font: 750 11px/1 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  label > span,
  section > span {
    margin: 0 0 8px;
    color: ${({ theme }) => theme.colors.gray10};
    font: 700 10px/1 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    text-transform: uppercase;
  }

  label,
  section {
    display: grid;
    gap: 0;
    padding: 0 0 22px;
    margin-bottom: 22px;
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
    padding: 10px;
  }

  select {
    min-height: 42px;
  }

  textarea {
    min-height: 90px;
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

  @media (max-width: 1100px) {
    display: none;
  }
`;

export const EditorInspectorPreview = styled.div`
  display: grid;
  border: 1px solid ${({ theme }) => theme.publicDesign.border};
  background: ${({ theme }) => theme.publicDesign.readableSurface};

  div {
    height: 112px;
    padding: 14px;
    background: #0f1728;
    color: #88a9e8;
    font: 700 13px/1.4 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    white-space: pre-line;
    overflow-wrap: anywhere;
  }

  strong {
    display: block;
    padding: 12px 12px 0;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.92rem;
    line-height: 1.4;
  }

  span {
    padding: 6px 12px 12px;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 11px;
  }
`;

export const EditorGuideBackdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  justify-content: flex-end;
  background: rgba(10, 12, 16, 0.42);
`;

export const EditorGuidePanel = styled.aside`
  width: min(100%, 590px);
  height: 100%;
  display: grid;
  grid-template-rows: auto 1fr;
  border-left: 1px solid ${({ theme }) => theme.publicDesign.borderStrong};
  background: ${({ theme }) => theme.publicDesign.readableSurface};
  box-shadow: -24px 0 70px rgba(0, 0, 0, 0.18);

  header {
    height: 64px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0 20px;
    border-bottom: 1px solid ${({ theme }) => theme.publicDesign.border};
  }

  header span {
    color: ${({ theme }) => theme.publicDesign.accent};
    font: 750 11px/1 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  h2 {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 17px;
    line-height: 1.25;
  }

  header button {
    border: 0;
    background: transparent;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 1.2rem;
    cursor: pointer;
  }
`;

export const EditorGuideBody = styled.div`
  overflow: auto;
  padding: 24px 22px 50px;

  > p {
    margin: 0 0 22px;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.92rem;
    line-height: 1.7;
  }
`;

export const EditorGuideGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  border-top: 1px solid ${({ theme }) => theme.publicDesign.border};
  border-left: 1px solid ${({ theme }) => theme.publicDesign.border};

  section {
    min-width: 0;
    padding: 17px;
    border-right: 1px solid ${({ theme }) => theme.publicDesign.border};
    border-bottom: 1px solid ${({ theme }) => theme.publicDesign.border};
  }

  section:nth-of-type(2n) {
    border-right: 0;
  }

  h3 {
    margin: 0 0 8px;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 13px;
  }

  p {
    margin: 0 0 9px;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 12px;
    line-height: 1.45;
  }

  pre {
    margin: 0;
    min-height: 5.6rem;
    padding: 11px;
    overflow: auto;
    background: #0f1728;
    color: #dbe7ff;
    font: 650 11px/1.55 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  @media (max-width: 560px) {
    grid-template-columns: 1fr;

    section {
      border-right: 0;
    }
  }
`;

export const EditorGuideRepo = styled.div`
  margin-top: 22px;
  padding: 17px;
  border: 1px solid ${({ theme }) => theme.publicDesign.border};
  background: ${({ theme }) => theme.publicDesign.surfaceElevated};

  strong {
    display: block;
    margin-bottom: 5px;
    color: ${({ theme }) => theme.colors.gray12};
  }

  a {
    color: ${({ theme }) => theme.publicDesign.accent};
    font-size: 12px;
    overflow-wrap: anywhere;
  }
`;
