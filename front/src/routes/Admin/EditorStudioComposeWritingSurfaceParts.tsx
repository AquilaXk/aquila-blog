import styled from "@emotion/styled";
import { articleTypographyScale } from "src/libs/markdown/contentTypography";
export const EditorStudioComposeMainColumn = styled.div `
  display: grid;
  gap: 1.1rem;
  min-width: 0;
`;
export const EditorStudioComposeHeaderSection = styled.div `
  display: grid;
  gap: 0.9rem;

  @media (min-width: 960px) {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
  }
`;
export const ComposeStudioHeaderCopy = styled.div `
  display: grid;
  gap: 0.28rem;
  min-width: 0;

  h2 {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: clamp(1.45rem, 2.3vw, 2rem);
    line-height: 1.15;
    font-weight: 760;
    letter-spacing: 0;
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.92rem;
    line-height: 1.58;
    max-width: 34rem;
  }
`;
export const ComposeStudioKicker = styled.span `
  display: inline-flex;
  align-items: center;
  width: fit-content;
  color: ${({ theme }) => (theme.colors.gray10)};
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
`;
export const ComposeStudioContextBar = styled.div `
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  justify-content: flex-start;

  @media (min-width: 960px) {
    justify-content: flex-end;
  }
`;
export const ComposeStudioContextItem = styled.div `
  display: grid;
  gap: 0.08rem;
  min-width: 7rem;
  padding: 0.5rem 0.68rem;
  border: 1px solid ${({ theme }) => (theme.colors.gray5)};
  border-radius: 6px;
  background: ${({ theme }) => theme.publicDesign.surfaceElevated};

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.68rem;
    font-weight: 700;
  }

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.82rem;
    font-weight: 720;
    line-height: 1.35;
  }

  &[data-tone="loading"] strong {
    color: ${({ theme }) => theme.colors.blue11};
  }

  &[data-tone="success"] strong {
    color: ${({ theme }) => theme.colors.green11};
  }

  &[data-tone="error"] strong {
    color: ${({ theme }) => theme.colors.red11};
  }
`;
export const WriterHeader = styled.div `
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
  margin-bottom: 0.55rem;

  .titleField {
    display: grid;
    gap: 1rem;
    min-width: 0;
  }
`;
export const WriterAccent = styled.div `
  width: 5rem;
  height: 2px;
  border-radius: 0;
  background: ${({ theme }) => theme.publicDesign.accent};
`;
export const TitleInput = styled.textarea `
  width: 100%;
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
export const EditorStudioComposeMetadataSection = styled.div `
  width: 100%;
  max-width: var(--article-readable-width, 48rem);
  min-width: 0;
  margin-inline: auto;
  display: grid;
  gap: 1rem;
  border: 1px solid ${({ theme }) => ("transparent")};
  border-radius: ${({ theme }) => ("0")};
  background: ${({ theme }) => ("transparent")};
  padding: ${({ theme }) => ("0")};
`;
export const ComposeSummaryField = styled.div `
  display: grid;
  gap: 0.45rem;
`;
export const FieldLabel = styled.label `
  font-size: 0.8rem;
  font-weight: 650;
  color: ${({ theme }) => theme.colors.gray11};
`;
export const ComposeSummaryInput = styled.textarea `
  width: 100%;
  min-height: 5.6rem;
  border: 1px solid ${({ theme }) => (theme.colors.gray5)};
  border-radius: 6px;
  padding: 0.95rem 1rem;
  background: ${({ theme }) => theme.publicDesign.readableSurface};
  color: ${({ theme }) => theme.colors.gray12};
  font-size: 1rem;
  line-height: 1.7;
  resize: vertical;

  &::placeholder {
    color: ${({ theme }) => theme.colors.gray10};
  }

  &:focus-visible {
    outline: none;
    border-color: ${({ theme }) => (theme.colors.gray7)};
    box-shadow: 0 0 0 3px ${({ theme }) => (theme.colors.blue4)};
  }
`;
export const ComposeSummaryMeta = styled.div `
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.7rem;
  flex-wrap: wrap;
`;
export const SummaryCounter = styled.span `
  justify-self: end;
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.74rem;
  line-height: 1;
`;
export const InlineTagComposer = styled.div `
  display: grid;
  gap: 0.55rem;
  min-width: 0;

  .label {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.88rem;
    font-weight: 700;
  }

  .headerRow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
    flex-wrap: wrap;
  }

  .status {
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.78rem;
    font-weight: 600;
  }
`;
export const InlineTagList = styled.div `
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  min-height: auto;
  align-items: center;
  border-radius: 0;
  border: none;
  background: transparent;
  padding: 0;
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
export const SelectedTagChip = styled.span `
  display: inline-flex;
  align-items: stretch;
  gap: 0;
  min-width: 0;
  max-width: 100%;
  min-height: 32px;
  border-radius: 0;
  border: 1px solid ${({ theme }) => (theme.colors.gray6)};
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
    border-left: 1px solid ${({ theme }) => (theme.colors.gray6)};
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
export const EditorStudioComposeBodySection = styled.section `
  display: grid;
  gap: 0.82rem;
`;
export const ComposeBodyHeader = styled.div `
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 0.75rem;
  width: 100%;
  max-width: var(--article-readable-width, 48rem);
  min-width: 0;
  margin-inline: auto;
  padding-top: 0.2rem;

  @media (max-width: 720px) {
    flex-direction: column;
    align-items: flex-start;
  }
`;
export const ComposeBodyTitleGroup = styled.div `
  display: grid;
  gap: 0.14rem;

  h3 {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.98rem;
    font-weight: 760;
    line-height: 1.3;
  }
`;
export const ComposeBodyMetrics = styled.div `
  display: flex;
  align-items: center;
  gap: 0.55rem;
  flex-wrap: wrap;
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.76rem;
  line-height: 1.4;
`;
export const EditorStudioComposeFooterBar = styled.div `
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.8rem;
  flex-wrap: wrap;
  margin-top: 0.84rem;
  padding-top: 0.72rem;
  border-top: 1px solid ${({ theme }) => theme.colors.gray6};
`;
export const WriterFooterSummary = styled.div `
  display: flex;
  flex-wrap: wrap;
  gap: 0.52rem 0.72rem;
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.76rem;
  line-height: 1.45;
`;
export const WriterFooterControls = styled.div `
  display: grid;
  gap: 0.52rem;
  justify-items: stretch;
  flex: 1 1 34rem;
  width: min(100%, 48rem);
  min-width: min(100%, 34rem);
  max-width: 100%;
  margin-left: auto;

  @media (max-width: 720px) {
    width: 100%;
    min-width: 100%;
  }
`;
export const WriterFooterActions = styled.div `
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  justify-content: flex-end;
  align-items: center;

  @media (max-width: 720px) {
    display: none;
  }
`;
export const Button = styled.button `
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 6px;
  padding: 0.62rem 0.92rem;
  min-height: 44px;
  background: transparent;
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
    border-color: ${({ theme }) => theme.colors.gray8};
    background: ${({ theme }) => theme.colors.gray3};
    color: ${({ theme }) => theme.colors.gray12};
  }

  &:focus-visible {
    outline: none;
    border-color: ${({ theme }) => theme.colors.blue8};
    box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.blue4};
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
