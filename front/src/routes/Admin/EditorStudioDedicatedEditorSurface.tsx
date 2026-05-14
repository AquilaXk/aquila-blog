import styled from "@emotion/styled"
import type {
  ChangeEventHandler,
  KeyboardEvent as ReactKeyboardEvent,
  KeyboardEventHandler,
  ReactNode,
  Ref,
} from "react"
import ProfileImage from "src/components/ProfileImage"
import { articleTypographyScale } from "src/libs/markdown/contentTypography"

type NoticeTone = "idle" | "loading" | "success" | "error"

type EditorStudioDedicatedEditorSurfaceProps = {
  thumbnailImageFileInputRef: Ref<HTMLInputElement>
  onThumbnailImageFileChange: ChangeEventHandler<HTMLInputElement>
  onExit: () => void
  saveStateText: string
  saveStateTone: string
  primaryActionDisabled: boolean
  primaryActionLabel: string
  onPrimaryAction: () => void
  isCompactSplitPreview: boolean
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
  authorName: string
  authorInitial: string
  authorAvatarSrc: string
  previewDateText: string
  currentVisibilityText: string
  canOpenCurrentPostDetail: boolean
  onOpenPostDetail: () => void
  onCopyPostDetailLink: () => void
  editorCanvas: ReactNode
  showPublishNotice: boolean
  publishNoticeTone: NoticeTone
  publishNoticeText: string
  resultPanel: ReactNode
  publishModal: ReactNode
}

const isComposingKeyboardEvent = (event: ReactKeyboardEvent<HTMLElement>) => {
  const nativeEvent = event.nativeEvent as globalThis.KeyboardEvent & {
    isComposing?: boolean
    keyCode?: number
  }
  return nativeEvent.isComposing === true || nativeEvent.keyCode === 229
}

export const EditorStudioDedicatedEditorLoadingState = () => (
  <EditorStudioRoot>
    <EditorStudioLoadingState>
      <strong>편집 화면을 준비하고 있습니다.</strong>
      <span>잠시만 기다려 주세요.</span>
    </EditorStudioLoadingState>
  </EditorStudioRoot>
)

export const EditorStudioDedicatedEditorSurface = ({
  thumbnailImageFileInputRef,
  onThumbnailImageFileChange,
  onExit,
  saveStateText,
  saveStateTone,
  primaryActionDisabled,
  primaryActionLabel,
  onPrimaryAction,
  isCompactSplitPreview,
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
  authorName,
  authorInitial,
  authorAvatarSrc,
  previewDateText,
  currentVisibilityText,
  canOpenCurrentPostDetail,
  onOpenPostDetail,
  onCopyPostDetailLink,
  editorCanvas,
  showPublishNotice,
  publishNoticeTone,
  publishNoticeText,
  resultPanel,
  publishModal,
}: EditorStudioDedicatedEditorSurfaceProps) => (
  <EditorStudioRoot>
    <input
      ref={thumbnailImageFileInputRef}
      type="file"
      accept="image/*"
      onChange={onThumbnailImageFileChange}
      style={{ display: "none" }}
    />

    <EditorStudioTopBar>
      <EditorExitAction type="button" onClick={onExit}>
        ← 나가기
      </EditorExitAction>
      <EditorStudioTopBarActions>
        {saveStateText ? (
          <EditorStudioSaveState data-tone={saveStateTone}>{saveStateText}</EditorStudioSaveState>
        ) : null}
        <PrimaryButton type="button" disabled={primaryActionDisabled} onClick={onPrimaryAction}>
          {primaryActionLabel}
        </PrimaryButton>
      </EditorStudioTopBarActions>
    </EditorStudioTopBar>

    <EditorStudioFrame data-testid="editor-studio-frame">
      <EditorStudioWritingColumn data-testid="editor-writing-column" $compact={isCompactSplitPreview}>
        <EditorStudioMetaSection $compact={isCompactSplitPreview}>
          <EditorTagRow aria-label="태그 입력" $compact={isCompactSplitPreview}>
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
          </EditorTagRow>
          <TitleInput
            $compact={isCompactSplitPreview}
            ref={titleInputRef}
            id="post-title"
            placeholder="제목을 입력하세요"
            rows={1}
            value={postTitle}
            onChange={onPostTitleChange}
            onKeyDown={onPostTitleKeyDown}
          />
          <EditorHeaderMetaRow>
            <EditorHeaderAuthor>
              <EditorHeaderAvatar $compact={isCompactSplitPreview}>
                {authorAvatarSrc ? (
                  <ProfileImage src={authorAvatarSrc} alt={`${authorName} 프로필 이미지`} fillContainer />
                ) : (
                  <span className="initial">{authorInitial}</span>
                )}
              </EditorHeaderAvatar>
              <EditorHeaderAuthorText $compact={isCompactSplitPreview}>
                <strong>{authorName}</strong>
                <span>{previewDateText}</span>
              </EditorHeaderAuthorText>
            </EditorHeaderAuthor>
            <EditorHeaderMetaActions>
              <EditorHeaderMetaPill $compact={isCompactSplitPreview}>{currentVisibilityText}</EditorHeaderMetaPill>
              {canOpenCurrentPostDetail ? (
                <>
                  <EditorHeaderActionButton type="button" onClick={onOpenPostDetail}>
                    상세 열기
                  </EditorHeaderActionButton>
                  <EditorHeaderActionButton type="button" onClick={onCopyPostDetailLink}>
                    링크 복사
                  </EditorHeaderActionButton>
                </>
              ) : null}
            </EditorHeaderMetaActions>
          </EditorHeaderMetaRow>
        </EditorStudioMetaSection>

        <EditorStudioCanvas>{editorCanvas}</EditorStudioCanvas>

        {showPublishNotice ? <PublishNotice data-tone={publishNoticeTone}>{publishNoticeText}</PublishNotice> : null}
      </EditorStudioWritingColumn>
    </EditorStudioFrame>

    {resultPanel}
    {publishModal}
  </EditorStudioRoot>
)

const EditorStudioRoot = styled.main`
  width: min(100%, 1600px);
  margin: 0 auto;
  padding: 1.4rem 1.6rem 2rem;
  display: grid;
  gap: 1.2rem;
  overflow-x: clip;
  background: ${({ theme }) =>
    theme.blogDesign === "grid"
      ? `linear-gradient(180deg, color-mix(in srgb, ${theme.publicDesign.surfaceElevated} 44%, transparent), transparent 18rem)`
      : "transparent"};

  @media (max-width: 1024px) {
    padding: 1rem 1rem 1.4rem;
  }

  @media (max-width: 768px) {
    padding-top: 0.92rem;
    padding-bottom: 1.2rem;
    padding-left: max(0.82rem, env(safe-area-inset-left, 0px));
    padding-right: max(0.82rem, env(safe-area-inset-right, 0px));
  }
`

const EditorStudioLoadingState = styled.div`
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
`

const EditorStudioTopBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  min-height: 48px;

  @media (max-width: 1200px) {
    align-items: center;
    flex-direction: row;
    flex-wrap: nowrap;
    justify-content: space-between;
    gap: 0.8rem;
  }

  @media (max-width: 760px) {
    align-items: stretch;
    flex-direction: column;
    gap: 0.7rem;
  }
`

const EditorExitAction = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 42px;
  padding: 0.2rem 0.32rem;
  margin: -0.2rem -0.32rem;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray12};
  font-size: 0.98rem;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  transition:
    background-color 0.18s ease,
    color 0.18s ease;

  &:hover {
    background: ${({ theme }) => (theme.blogDesign === "grid" ? theme.publicDesign.accentMuted : theme.colors.gray3)};
  }

  &:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px ${({ theme }) => (theme.blogDesign === "grid" ? theme.publicDesign.accentMuted : theme.colors.blue4)};
  }

  @media (max-width: 1200px) {
    justify-content: flex-start;
  }
`

const EditorStudioTopBarActions = styled.div`
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
`

const EditorStudioSaveState = styled.span`
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.84rem;
  font-weight: 600;
  white-space: nowrap;
  text-align: right;

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
`

const Button = styled.button`
  border: 1px solid ${({ theme }) => (theme.blogDesign === "grid" ? theme.publicDesign.border : theme.colors.gray6)};
  border-radius: 8px;
  padding: 0.62rem 0.92rem;
  min-height: 44px;
  background: ${({ theme }) => (theme.blogDesign === "grid" ? theme.publicDesign.operationSurface : "transparent")};
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
    border-color: ${({ theme }) => (theme.blogDesign === "grid" ? theme.publicDesign.borderStrong : theme.colors.gray8)};
    background: ${({ theme }) => (theme.blogDesign === "grid" ? theme.publicDesign.accentMuted : theme.colors.gray3)};
    color: ${({ theme }) => theme.colors.gray12};
  }

  &:focus-visible {
    outline: none;
    border-color: ${({ theme }) => (theme.blogDesign === "grid" ? theme.publicDesign.accent : theme.colors.blue8)};
    box-shadow: 0 0 0 3px ${({ theme }) => (theme.blogDesign === "grid" ? theme.publicDesign.accentMuted : theme.colors.blue4)};
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
`

const PrimaryButton = styled(Button)`
  border-radius: 8px;
  padding: 0.6rem 0.88rem;
  border-color: ${({ theme }) => (theme.blogDesign === "grid" ? theme.publicDesign.accent : theme.colors.blue9)};
  background: ${({ theme }) => (theme.blogDesign === "grid" ? theme.publicDesign.accent : theme.colors.blue9)};
  color: ${({ theme }) => (theme.blogDesign === "grid" ? theme.publicDesign.pageBackgroundColor : theme.colors.gray1)};
  font-weight: 700;

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => (theme.blogDesign === "grid" ? theme.publicDesign.borderStrong : theme.colors.blue10)};
    background: ${({ theme }) => (theme.blogDesign === "grid" ? theme.publicDesign.borderStrong : theme.colors.blue10)};
    color: ${({ theme }) => (theme.blogDesign === "grid" ? theme.publicDesign.pageBackgroundColor : theme.colors.gray1)};
  }
`

const EditorStudioFrame = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 1.4rem;
  align-items: start;
  justify-content: center;
  overflow-x: visible;

  @media (min-width: 1024px) {
    grid-template-columns: minmax(0, 1fr);
    gap: 1.4rem;
  }
`

const EditorStudioWritingColumn = styled.section<{ $compact?: boolean }>`
  display: grid;
  min-width: 0;
  gap: ${({ $compact }) => ($compact ? "0.88rem" : "1rem")};
  overflow-x: visible;
`

const EditorStudioMetaSection = styled.section<{ $compact?: boolean }>`
  width: 100%;
  max-width: var(--article-readable-width, 48rem);
  min-width: 0;
  margin-inline: auto;
  display: grid;
  gap: ${({ $compact }) => ($compact ? "0.72rem" : "0.9rem")};
  border: 1px solid ${({ theme }) => (theme.blogDesign === "grid" ? theme.publicDesign.border : "transparent")};
  border-radius: ${({ theme }) => (theme.blogDesign === "grid" ? "8px" : "0")};
  background: ${({ theme }) => (theme.blogDesign === "grid" ? theme.publicDesign.readableSurface : "transparent")};
  padding: ${({ theme, $compact }) => (theme.blogDesign === "grid" ? ($compact ? "0.8rem" : "1rem") : "0")};
`

const EditorTagRow = styled.div<{ $compact?: boolean }>`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${({ $compact }) => ($compact ? "0.44rem" : "0.55rem")};
  min-height: 32px;
`

const SelectedTagChip = styled.span`
  display: inline-flex;
  align-items: stretch;
  gap: 0;
  min-width: 0;
  max-width: 100%;
  min-height: 32px;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray3};
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
    background: ${({ theme }) => theme.colors.gray2};
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

const TitleInput = styled.textarea<{ $compact?: boolean }>`
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

const EditorHeaderMetaRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.85rem;
  min-width: 0;
`

const EditorHeaderMetaActions = styled.div`
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 0.45rem;
  min-width: 0;
`

const EditorHeaderAuthor = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.85rem;
  min-width: 0;
`

const EditorHeaderAvatar = styled.div<{ $compact?: boolean }>`
  position: relative;
  width: ${({ $compact }) => ($compact ? "40px" : "48px")};
  height: ${({ $compact }) => ($compact ? "40px" : "48px")};
  flex-shrink: 0;
  border-radius: 999px;
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
`

const EditorHeaderAuthorText = styled.div<{ $compact?: boolean }>`
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
`

const EditorHeaderMetaPill = styled.span<{ $compact?: boolean }>`
  display: inline-flex;
  align-items: center;
  min-height: ${({ $compact }) => ($compact ? "30px" : "34px")};
  padding: ${({ $compact }) => ($compact ? "0 0.72rem" : "0 0.82rem")};
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
  color: ${({ theme }) => theme.colors.gray11};
  font-size: ${({ $compact }) => ($compact ? "0.74rem" : "0.82rem")};
  font-weight: 650;
  line-height: 1;
`

const EditorHeaderActionButton = styled(Button)`
  min-height: 34px;
  padding: 0.45rem 0.7rem;
  border-radius: 999px;
  font-size: 0.78rem;
`

const EditorStudioCanvas = styled.section`
  --compose-pane-readable-width: var(--article-readable-width, 48rem);
  width: 100%;
  max-width: var(--article-readable-width, 48rem);
  min-width: 0;
  margin-inline: auto;
  min-height: clamp(28rem, 70vh, 56rem);
  display: grid;
  gap: 0.72rem;
  overflow-x: visible;
  border: 1px solid ${({ theme }) => (theme.blogDesign === "grid" ? theme.publicDesign.border : "transparent")};
  border-radius: ${({ theme }) => (theme.blogDesign === "grid" ? "8px" : "0")};
  background: ${({ theme }) => (theme.blogDesign === "grid" ? theme.publicDesign.readableSurface : "transparent")};
  padding: ${({ theme }) => (theme.blogDesign === "grid" ? "1rem" : "0")};
  box-shadow: ${({ theme }) => (theme.blogDesign === "grid" ? theme.publicDesign.shadow : "none")};
`

const PublishNotice = styled.div`
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
`
