import type {
  ChangeEventHandler,
  KeyboardEvent as ReactKeyboardEvent,
  KeyboardEventHandler,
  ReactNode,
  Ref,
} from "react"
import {
  ComposeBodyHeader,
  ComposeBodyMetrics,
  ComposeBodyTitleGroup,
  ComposeStudioContextBar,
  ComposeStudioContextItem,
  ComposeStudioHeaderCopy,
  ComposeStudioKicker,
  ComposeSummaryField,
  ComposeSummaryInput,
  ComposeSummaryMeta,
  EditorStudioComposeBodySection,
  EditorStudioComposeFooterBar,
  EditorStudioComposeHeaderSection,
  EditorStudioComposeMainColumn,
  EditorStudioComposeMetadataSection,
  FieldLabel,
  InlineMetaInput,
  InlineTagComposer,
  InlineTagList,
  PrimaryButton,
  SelectedTagChip,
  SummaryCounter,
  TitleInput,
  WriterAccent,
  WriterFooterActions,
  WriterFooterControls,
  WriterFooterSummary,
  WriterHeader,
  Button,
} from "./EditorStudioComposeWritingSurfaceParts"

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
    <EditorStudioComposeMainColumn>
      <EditorStudioComposeHeaderSection>
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
      </EditorStudioComposeHeaderSection>

      <EditorStudioComposeMetadataSection>
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
      </EditorStudioComposeMetadataSection>

      <input
        ref={thumbnailImageFileInputRef}
        type="file"
        accept="image/*"
        onChange={onThumbnailImageFileChange}
        style={{ display: "none" }}
      />

      <EditorStudioComposeBodySection>
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
      </EditorStudioComposeBodySection>

      <EditorStudioComposeFooterBar>
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
      </EditorStudioComposeFooterBar>
    </EditorStudioComposeMainColumn>
  )
}
