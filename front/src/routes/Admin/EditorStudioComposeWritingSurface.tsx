import styled from "@emotion/styled"
import type {
  ChangeEventHandler,
  KeyboardEvent as ReactKeyboardEvent,
  KeyboardEventHandler,
  ReactNode,
  Ref,
} from "react"
import { articleTypographyScale } from "src/libs/markdown/contentTypography"

type EditorStudioComposeWritingSurfaceProps = {
  editorModeLabel: string
  composePageTitle: string
  composeSurfaceSubtitle: string
  composeStatusText: string
  composeStatusTone: string
  currentVisibilityText: string
  postSummary: string
  postSummaryMaxLength: number
  onPostSummaryChange: (value: string) => void
  isFillSummaryFromBodyDisabled: boolean
  onFillSummaryFromBody: () => void
  postTags: string[]
  tagDraft: string
  onTagDraftChange: (value: string) => void
  onAddTags: (values: string[]) => void
  onAddTag: (value: string) => void
  onRemoveTag: (value: string) => void
  titleInputRef: (node: HTMLTextAreaElement | null) => void
  postTitle: string
  onPostTitleChange: ChangeEventHandler<HTMLTextAreaElement>
  onPostTitleKeyDown: KeyboardEventHandler<HTMLTextAreaElement>
  thumbnailImageFileInputRef: Ref<HTMLInputElement>
  onThumbnailImageFileChange: ChangeEventHandler<HTMLInputElement>
  contentLength: number
  lineCount: number
  imageCount: number
  editorCanvas: ReactNode
  tagSummaryText: string
  isSaveDraftDisabled: boolean
  onSaveDraft: () => void
  primaryActionDisabled: boolean
  primaryActionLabel: string
  onPrimaryAction: () => void
}

const isComposingKeyboardEvent = (event: ReactKeyboardEvent<HTMLElement>) => {
  const nativeEvent = event.nativeEvent as globalThis.KeyboardEvent & {
    isComposing?: boolean
    keyCode?: number
  }
  return nativeEvent.isComposing === true || nativeEvent.keyCode === 229
}

export const EditorStudioComposeWritingSurface = ({
  editorModeLabel,
  composePageTitle,
  composeSurfaceSubtitle,
  composeStatusText,
  composeStatusTone,
  currentVisibilityText,
  postSummary,
  postSummaryMaxLength,
  onPostSummaryChange,
  isFillSummaryFromBodyDisabled,
  onFillSummaryFromBody,
  postTags,
  tagDraft,
  onTagDraftChange,
  onAddTags,
  onAddTag,
  onRemoveTag,
  titleInputRef,
  postTitle,
  onPostTitleChange,
  onPostTitleKeyDown,
  thumbnailImageFileInputRef,
  onThumbnailImageFileChange,
  contentLength,
  lineCount,
  imageCount,
  editorCanvas,
  tagSummaryText,
  isSaveDraftDisabled,
  onSaveDraft,
  primaryActionDisabled,
  primaryActionLabel,
  onPrimaryAction,
}: EditorStudioComposeWritingSurfaceProps) => {
  const trimmedSummary = postSummary.trim()

  return (
    <ComposeMainColumn>
      <ComposeStudioHeader>
        <ComposeStudioHeaderCopy>
          <ComposeStudioKicker>{editorModeLabel}</ComposeStudioKicker>
          <h2>{composePageTitle}</h2>
          <p>{composeSurfaceSubtitle}</p>
        </ComposeStudioHeaderCopy>
        <ComposeStudioContextBar aria-label="원고 상태">
          {composeStatusText ? (
            <ComposeStudioContextItem data-tone={composeStatusTone}>
              <span>상태</span>
              <strong>{composeStatusText}</strong>
            </ComposeStudioContextItem>
          ) : null}
          <ComposeStudioContextItem>
            <span>공개 범위</span>
            <strong>{currentVisibilityText}</strong>
          </ComposeStudioContextItem>
          <ComposeStudioContextItem>
            <span>카드 요약</span>
            <strong>{trimmedSummary ? `${trimmedSummary.length}자` : "자동 생성"}</strong>
          </ComposeStudioContextItem>
        </ComposeStudioContextBar>
      </ComposeStudioHeader>

      <ComposeReadableIntro>
        <WriterHeader>
          <div className="titleField">
            <TitleInput
              ref={titleInputRef}
              id="post-title"
              placeholder="제목을 입력하세요"
              rows={1}
              value={postTitle}
              onChange={onPostTitleChange}
              onKeyDown={onPostTitleKeyDown}
            />
            <WriterAccent />
          </div>
        </WriterHeader>
        <ComposeSummaryField>
          <FieldLabel htmlFor="post-summary-inline">요약</FieldLabel>
          <ComposeSummaryInput
            id="post-summary-inline"
            placeholder="이 글의 핵심을 짧게 정리하세요"
            value={postSummary}
            maxLength={postSummaryMaxLength}
            onChange={(event) => onPostSummaryChange(event.target.value)}
          />
          <ComposeSummaryMeta>
            <SummaryCounter>
              {postSummary.length}/{postSummaryMaxLength}
            </SummaryCounter>
            <Button type="button" disabled={isFillSummaryFromBodyDisabled} onClick={onFillSummaryFromBody}>
              본문 기준으로 채우기
            </Button>
          </ComposeSummaryMeta>
        </ComposeSummaryField>
        <InlineTagComposer>
          <div className="headerRow">
            <span className="label">태그</span>
          </div>
          <InlineTagList>
            {postTags.map((tag) => (
              <SelectedTagChip key={tag}>
                <span className="label">{tag}</span>
                <button type="button" onClick={() => onRemoveTag(tag)} aria-label={`${tag} 삭제`}>
                  ×
                </button>
              </SelectedTagChip>
            ))}
            <InlineMetaInput
              placeholder="태그 입력 후 Enter"
              value={tagDraft}
              onChange={(event) => {
                const nextValue = event.target.value
                const commaSeparated = /[,，]/
                if (!commaSeparated.test(nextValue)) {
                  onTagDraftChange(nextValue)
                  return
                }

                const fragments = nextValue.split(commaSeparated)
                const tailDraft = fragments.pop() ?? ""
                const tagsToAdd = fragments.map((fragment) => fragment.trim()).filter(Boolean)
                if (tagsToAdd.length > 0) onAddTags(tagsToAdd)
                onTagDraftChange(tailDraft)
              }}
              onKeyDown={(event) => {
                if (isComposingKeyboardEvent(event)) return
                if (event.key === "Enter" || event.key === ",") {
                  event.preventDefault()
                  onAddTag(event.currentTarget.value)
                }
              }}
            />
          </InlineTagList>
        </InlineTagComposer>
      </ComposeReadableIntro>

      <input
        ref={thumbnailImageFileInputRef}
        type="file"
        accept="image/*"
        onChange={onThumbnailImageFileChange}
        style={{ display: "none" }}
      />

      <ComposeBodySection>
        <ComposeBodyHeader>
          <ComposeBodyTitleGroup>
            <h3>본문</h3>
          </ComposeBodyTitleGroup>
          <ComposeBodyMetrics>
            <span>{contentLength.toLocaleString()}자</span>
            <span>{lineCount}줄</span>
            <span>{imageCount}개 이미지</span>
          </ComposeBodyMetrics>
        </ComposeBodyHeader>
        {editorCanvas}
      </ComposeBodySection>

      <WriterFooterBar>
        <WriterFooterSummary>
          <span>{tagSummaryText}</span>
          <span>{contentLength}자 · {lineCount}줄</span>
        </WriterFooterSummary>
        <WriterFooterControls>
          <WriterFooterActions>
            <Button type="button" disabled={isSaveDraftDisabled} onClick={onSaveDraft}>
              임시 저장
            </Button>
            <PrimaryButton type="button" disabled={primaryActionDisabled} onClick={onPrimaryAction}>
              {primaryActionLabel}
            </PrimaryButton>
          </WriterFooterActions>
        </WriterFooterControls>
      </WriterFooterBar>
    </ComposeMainColumn>
  )
}

const ComposeMainColumn = styled.div`
  display: grid;
  gap: 1.1rem;
  min-width: 0;
`

const ComposeStudioHeader = styled.div`
  display: grid;
  gap: 0.9rem;

  @media (min-width: 960px) {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
  }
`

const ComposeStudioHeaderCopy = styled.div`
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
`

const ComposeStudioKicker = styled.span`
  display: inline-flex;
  align-items: center;
  width: fit-content;
  color: ${({ theme }) => (theme.blogDesign === "grid" ? theme.publicDesign.accent : theme.colors.gray10)};
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
`

const ComposeStudioContextBar = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  justify-content: flex-start;

  @media (min-width: 960px) {
    justify-content: flex-end;
  }
`

const ComposeStudioContextItem = styled.div`
  display: grid;
  gap: 0.08rem;
  min-width: 7rem;
  padding: 0.5rem 0.68rem;
  border: 1px solid ${({ theme }) => (theme.blogDesign === "grid" ? theme.publicDesign.border : theme.colors.gray5)};
  border-radius: ${({ theme }) => (theme.blogDesign === "grid" ? "4px" : "12px")};
  background: ${({ theme }) => (theme.blogDesign === "grid" ? theme.publicDesign.operationSurfaceElevated : theme.colors.gray2)};

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
`

const WriterHeader = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
  margin-bottom: 0.55rem;

  .titleField {
    display: grid;
    gap: 1rem;
    min-width: 0;
  }
`

const WriterAccent = styled.div`
  width: 5rem;
  height: 0.42rem;
  border-radius: 999px;
  background: ${({ theme }) => (theme.blogDesign === "grid" ? theme.publicDesign.accent : theme.colors.gray8)};
`

const TitleInput = styled.textarea`
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
`

const ComposeReadableIntro = styled.div`
  width: 100%;
  max-width: var(--article-readable-width, 48rem);
  min-width: 0;
  margin-inline: auto;
  display: grid;
  gap: 1rem;
  border: 1px solid ${({ theme }) => (theme.blogDesign === "grid" ? theme.publicDesign.border : "transparent")};
  border-radius: ${({ theme }) => (theme.blogDesign === "grid" ? "8px" : "0")};
  background: ${({ theme }) => (theme.blogDesign === "grid" ? theme.publicDesign.readableSurface : "transparent")};
  padding: ${({ theme }) => (theme.blogDesign === "grid" ? "1rem" : "0")};
`

const ComposeSummaryField = styled.div`
  display: grid;
  gap: 0.45rem;
`

const FieldLabel = styled.label`
  font-size: 0.8rem;
  font-weight: 650;
  color: ${({ theme }) => theme.colors.gray11};
`

const ComposeSummaryInput = styled.textarea`
  width: 100%;
  min-height: 5.6rem;
  border: 1px solid ${({ theme }) => (theme.blogDesign === "grid" ? theme.publicDesign.border : theme.colors.gray5)};
  border-radius: ${({ theme }) => (theme.blogDesign === "grid" ? "4px" : "16px")};
  padding: 0.95rem 1rem;
  background: ${({ theme }) => (theme.blogDesign === "grid" ? theme.publicDesign.operationSurface : theme.colors.gray2)};
  color: ${({ theme }) => theme.colors.gray12};
  font-size: 1rem;
  line-height: 1.7;
  resize: vertical;

  &::placeholder {
    color: ${({ theme }) => theme.colors.gray10};
  }

  &:focus-visible {
    outline: none;
    border-color: ${({ theme }) => (theme.blogDesign === "grid" ? theme.publicDesign.accent : theme.colors.gray7)};
    box-shadow: 0 0 0 3px ${({ theme }) => (theme.blogDesign === "grid" ? theme.publicDesign.accentMuted : theme.colors.blue4)};
  }
`

const ComposeSummaryMeta = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.7rem;
  flex-wrap: wrap;
`

const SummaryCounter = styled.span`
  justify-self: end;
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.74rem;
  line-height: 1;
`

const InlineTagComposer = styled.div`
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
`

const InlineTagList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  min-height: auto;
  align-items: center;
  border-radius: 0;
  border: none;
  background: transparent;
  padding: 0;
`

const InlineMetaInput = styled.input`
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
`

const SelectedTagChip = styled.span`
  display: inline-flex;
  align-items: stretch;
  gap: 0;
  min-width: 0;
  max-width: 100%;
  min-height: 32px;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => (theme.blogDesign === "grid" ? theme.publicDesign.border : theme.colors.gray6)};
  background: ${({ theme }) => (theme.blogDesign === "grid" ? theme.publicDesign.accentMuted : theme.colors.gray3)};
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
    border-left: 1px solid ${({ theme }) => (theme.blogDesign === "grid" ? theme.publicDesign.border : theme.colors.gray6)};
    background: ${({ theme }) => (theme.blogDesign === "grid" ? theme.publicDesign.operationSurface : theme.colors.gray2)};
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
`

const ComposeBodySection = styled.section`
  display: grid;
  gap: 0.82rem;
`

const ComposeBodyHeader = styled.div`
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
`

const ComposeBodyTitleGroup = styled.div`
  display: grid;
  gap: 0.14rem;

  h3 {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.98rem;
    font-weight: 760;
    line-height: 1.3;
  }
`

const ComposeBodyMetrics = styled.div`
  display: flex;
  align-items: center;
  gap: 0.55rem;
  flex-wrap: wrap;
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.76rem;
  line-height: 1.4;
`

const WriterFooterBar = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.8rem;
  flex-wrap: wrap;
  margin-top: 0.84rem;
  padding-top: 0.72rem;
  border-top: 1px solid ${({ theme }) => theme.colors.gray6};
`

const WriterFooterSummary = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.52rem 0.72rem;
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.76rem;
  line-height: 1.45;
`

const WriterFooterControls = styled.div`
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
`

const WriterFooterActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  justify-content: flex-end;
  align-items: center;

  @media (max-width: 720px) {
    display: none;
  }
`

const Button = styled.button`
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 8px;
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
`

const PrimaryButton = styled(Button)`
  border-radius: 8px;
  padding: 0.6rem 0.88rem;
  border-color: ${({ theme }) => theme.colors.blue9};
  background: ${({ theme }) => theme.colors.blue9};
  color: ${({ theme }) => theme.colors.gray1};
  font-weight: 700;

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.blue10};
    background: ${({ theme }) => theme.colors.blue10};
    color: ${({ theme }) => theme.colors.gray1};
  }
`
