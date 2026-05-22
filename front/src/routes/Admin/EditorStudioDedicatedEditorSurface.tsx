import type {
  ChangeEventHandler,
  KeyboardEvent as ReactKeyboardEvent,
  KeyboardEventHandler,
  ReactNode,
  Ref,
} from "react"
import ProfileImage from "src/components/ProfileImage"
import {
  EditorExitAction,
  EditorHeaderActionButton,
  EditorHeaderAuthor,
  EditorHeaderAuthorText,
  EditorHeaderAvatar,
  EditorHeaderMetaActions,
  EditorHeaderMetaPill,
  EditorHeaderMetaRow,
  EditorStudioDedicatedCanvasSection,
  EditorStudioDedicatedMetaSection,
  EditorStudioDedicatedTopBar,
  EditorStudioFrame,
  EditorStudioLoadingState,
  EditorStudioRoot,
  EditorStudioSaveState,
  EditorStudioTopBarActions,
  EditorStudioWritingColumn,
  EditorTagRow,
  InlineMetaInput,
  PrimaryButton,
  PublishNotice,
  SelectedTagChip,
  TitleInput,
} from "./EditorStudioDedicatedEditorSurfaceParts"

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

    <EditorStudioDedicatedTopBar>
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
    </EditorStudioDedicatedTopBar>

    <EditorStudioFrame data-testid="editor-studio-frame">
      <EditorStudioWritingColumn data-testid="editor-writing-column" $compact={isCompactSplitPreview}>
        <EditorStudioDedicatedMetaSection $compact={isCompactSplitPreview}>
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
        </EditorStudioDedicatedMetaSection>

        <EditorStudioDedicatedCanvasSection>{editorCanvas}</EditorStudioDedicatedCanvasSection>

        {showPublishNotice ? <PublishNotice data-tone={publishNoticeTone}>{publishNoticeText}</PublishNotice> : null}
      </EditorStudioWritingColumn>
    </EditorStudioFrame>

    {resultPanel}
    {publishModal}
  </EditorStudioRoot>
)
