import type {
  ChangeEventHandler,
  KeyboardEvent as ReactKeyboardEvent,
  KeyboardEventHandler,
  ReactNode,
  Ref,
} from "react"
import { useMemo, useState } from "react"
import ProfileImage from "src/components/ProfileImage"
import {
  EditorGuideBackdrop,
  EditorGuideGrid,
  EditorGuidePanel,
  EditorExitAction,
  EditorHeaderActionButton,
  EditorHeaderAuthor,
  EditorHeaderAuthorText,
  EditorHeaderAvatar,
  EditorHeaderMetaActions,
  EditorHeaderMetaPill,
  EditorHeaderMetaRow,
  EditorInspector,
  EditorInspectorPreview,
  EditorOutline,
  EditorOutlineItem,
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
  SecondaryButton,
  TitleInput,
} from "./EditorStudioDedicatedEditorSurfaceParts"
import type { PostVisibility } from "./editorStudioState"
import { PREVIEW_SUMMARY_MAX_LENGTH } from "./editorStudioMetaModel"
import { PUBLISH_VISIBILITY_OPTIONS } from "./EditorStudioWorkspaceControllerRootModel"

type NoticeTone = "idle" | "loading" | "success" | "error"

type EditorStudioDedicatedEditorSurfaceProps = {
  thumbnailImageFileInputRef: Ref<HTMLInputElement>
  onThumbnailImageFileChange: ChangeEventHandler<HTMLInputElement>
  onExit: () => void
  onLogout: () => void
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
  postContent: string
  postSummary: string
  onPostSummaryChange: (value: string) => void
  postVisibility: PostVisibility
  onPostVisibilityChange: (value: PostVisibility) => void
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

type OutlineItem = {
  id: string
  level: 1 | 2 | 3
  text: string
}

const extractEditorOutline = (title: string, markdown: string): OutlineItem[] => {
  const items: OutlineItem[] = []
  const normalizedTitle = title.trim()
  if (normalizedTitle) items.push({ id: "title", level: 1, text: normalizedTitle })

  markdown.split(/\r?\n/).forEach((line, index) => {
    const match = /^(#{2,3})\s+(.+)$/.exec(line.trim())
    if (!match) return
    items.push({
      id: `heading-${index}`,
      level: match[1].length as 2 | 3,
      text: match[2].trim(),
    })
  })

  return items.slice(0, 12)
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
  onLogout,
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
  postContent,
  postSummary,
  onPostSummaryChange,
  postVisibility,
  onPostVisibilityChange,
  canOpenCurrentPostDetail,
  onOpenPostDetail,
  onCopyPostDetailLink,
  editorCanvas,
  showPublishNotice,
  publishNoticeTone,
  publishNoticeText,
  resultPanel,
  publishModal,
}: EditorStudioDedicatedEditorSurfaceProps) => {
  const [isGuideOpen, setIsGuideOpen] = useState(false)
  const outlineItems = useMemo(() => extractEditorOutline(postTitle, postContent), [postContent, postTitle])
  const hasTitleAndBody = Boolean(postTitle.trim() && postContent.trim())
  const hasMarkdownBody = Boolean(postContent.trim())
  const hasSummaryPreview = Boolean(postSummary.trim() || postContent.trim())
  const primaryTag = postTags[0] || "태그 없음"
  const readTimeText = postContent.trim() ? `${Math.max(1, Math.ceil(postContent.trim().length / 500))}분` : "읽기 시간"

  return (
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
          ← 글 관리
        </EditorExitAction>
        {saveStateText ? <EditorStudioSaveState data-tone={saveStateTone}>{saveStateText}</EditorStudioSaveState> : <span />}
        <EditorStudioTopBarActions>
          <SecondaryButton type="button" onClick={() => setIsGuideOpen(true)}>
            Markdown 가이드
          </SecondaryButton>
          <SecondaryButton type="button" onClick={onLogout}>
            Logout
          </SecondaryButton>
          <PrimaryButton type="button" disabled={primaryActionDisabled} onClick={onPrimaryAction}>
            {primaryActionLabel}
          </PrimaryButton>
        </EditorStudioTopBarActions>
      </EditorStudioDedicatedTopBar>

      <EditorStudioFrame data-testid="editor-studio-frame">
        <EditorOutline aria-label="문서 목차">
          <h3>Document outline</h3>
          {outlineItems.length > 0 ? (
            outlineItems.map((item, index) => (
              <EditorOutlineItem key={item.id} data-level={item.level} data-active={index === 0 ? "true" : "false"}>
                <span>H{item.level}</span>
                <strong>{item.text}</strong>
              </EditorOutlineItem>
            ))
          ) : (
            <p>제목과 본문 heading을 입력하면 목차가 표시됩니다.</p>
          )}
        </EditorOutline>

        <EditorStudioWritingColumn data-testid="editor-writing-column" $compact={isCompactSplitPreview}>
          <EditorStudioDedicatedMetaSection $compact={isCompactSplitPreview}>
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

        <EditorInspector aria-label="발행 설정">
          <h3>Publish inspector</h3>
          <label>
            <span>Visibility</span>
            <select value={postVisibility} onChange={(event) => onPostVisibilityChange(event.target.value as PostVisibility)}>
              {PUBLISH_VISIBILITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Summary</span>
            <textarea
              value={postSummary}
              maxLength={PREVIEW_SUMMARY_MAX_LENGTH}
              onChange={(event) => onPostSummaryChange(event.target.value)}
            />
            <small>
              {postSummary.length}/{PREVIEW_SUMMARY_MAX_LENGTH}
            </small>
          </label>
          <section>
            <span>Tags</span>
            <EditorTagRow aria-label="발행 태그" $compact>
              {postTags.map((tag) => (
                <SelectedTagChip key={`inspector-${tag}`}>
                  <span className="label">{tag}</span>
                  <button type="button" onClick={() => onRemoveTag(tag)} aria-label={`${tag} 삭제`}>
                    ×
                  </button>
                </SelectedTagChip>
              ))}
            </EditorTagRow>
          </section>
          <EditorInspectorPreview>
            <div>ETAG<br />INVALIDATION</div>
            <strong>{postTitle.trim() || "제목을 입력하세요"}</strong>
            <span>{primaryTag} · {readTimeText}</span>
          </EditorInspectorPreview>
          <section>
            <span>Quality checks</span>
            <p>
              <strong>제목과 본문</strong>
              <b data-tone={hasTitleAndBody ? "pass" : "warn"}>{hasTitleAndBody ? "PASS" : "WARN"}</b>
            </p>
            <p>
              <strong>Markdown 렌더링</strong>
              <b data-tone={hasMarkdownBody ? "pass" : "warn"}>{hasMarkdownBody ? "PASS" : "WARN"}</b>
            </p>
            <p>
              <strong>요약</strong>
              <b data-tone={hasSummaryPreview ? "pass" : "warn"}>{hasSummaryPreview ? "PASS" : "WARN"}</b>
            </p>
          </section>
        </EditorInspector>
      </EditorStudioFrame>

      {isGuideOpen ? (
        <EditorGuideBackdrop onClick={() => setIsGuideOpen(false)}>
          <EditorGuidePanel role="dialog" aria-modal="true" aria-label="Markdown 작성 가이드" onClick={(event) => event.stopPropagation()}>
            <header>
              <div>
                <span>Authoring help</span>
                <h2>Markdown 작성 가이드</h2>
              </div>
              <button type="button" aria-label="가이드 닫기" onClick={() => setIsGuideOpen(false)}>×</button>
            </header>
            <p>글 제목은 별도 필드가 H1 역할을 합니다. 본문은 Markdown 원문을 저장하고 같은 renderer로 미리보기와 공개 글을 표시합니다.</p>
            <EditorGuideGrid>
              {[
                ["제목과 강조", "# 제목 1\n## 제목 2\n**굵게** · _기울임_"],
                ["목록과 인용", "- 목록\n- [x] 완료\n> 인용문"],
                ["콜아웃", "> [!TIP]\n> **제목**\n> 내용"],
                ["토글", ":::toggle 자세히 보기\n내용\n:::"],
                ["표와 코드", "| 항목 | 설명 |\n| --- | --- |\n\n```kotlin\ncode\n```"],
                ["Mermaid", "```mermaid\nflowchart LR\n A --> B\n```"],
                ["수식과 색상", "$$\nE = mc^2\n$$\n{{color:#155eef|강조}}"],
                ["미디어와 링크 카드", "![설명](URL)\n:::bookmark URL\n제목\n설명\n:::"],
              ].map(([title, code]) => (
                <section key={title}>
                  <h3>{title}</h3>
                  <pre>{code}</pre>
                </section>
              ))}
            </EditorGuideGrid>
          </EditorGuidePanel>
        </EditorGuideBackdrop>
      ) : null}

      {resultPanel}
      {publishModal}
    </EditorStudioRoot>
  )
}
