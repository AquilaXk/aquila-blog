import styled from "@emotion/styled"
import type { ReactNode } from "react"

type NoticeTone = "idle" | "loading" | "success" | "error"

type MetadataNotice = {
  tone: NoticeTone
  text: string
}

type EditorStudioMetadataAssistantPanelProps = {
  isTagPanelOpen: boolean
  onToggleTagPanel: () => void
  isUtilityPanelOpen: boolean
  onToggleUtilityPanel: () => void
  metaNotice: MetadataNotice
  knownTags: string[]
  selectedTags: string[]
  tagUsageMap: Record<string, number>
  onToggleTag: (tag: string) => void
  onDeleteTag: (tag: string) => void
  utilityActions: ReactNode
}

export const EditorStudioMetadataAssistantPanel = ({
  isTagPanelOpen,
  onToggleTagPanel,
  isUtilityPanelOpen,
  onToggleUtilityPanel,
  metaNotice,
  knownTags,
  selectedTags,
  tagUsageMap,
  onToggleTag,
  onDeleteTag,
  utilityActions,
}: EditorStudioMetadataAssistantPanelProps) => (
  <>
    <MetadataAssistantDisclosure open={isTagPanelOpen}>
      <summary
        onClick={(event) => {
          event.preventDefault()
          onToggleTagPanel()
        }}
      >
        <strong>태그 정리</strong>
        <span>{isTagPanelOpen ? "닫기" : "열기"}</span>
      </summary>
      <div className="body">
        <MetadataStatus data-tone={metaNotice.tone}>{metaNotice.text}</MetadataStatus>
        <MetadataPanel>
          <label>태그 선택</label>
          <TagCatalogList>
            {knownTags.map((tag) => {
              const usageCount = tagUsageMap[tag] || 0
              const isSelected = selectedTags.includes(tag)

              return (
                <TagCatalogChipGroup
                  key={tag}
                  data-active={isSelected}
                >
                  <TagCatalogToggle
                    type="button"
                    data-active={isSelected}
                    onClick={() => onToggleTag(tag)}
                  >
                    <span className="label">{tag}</span>
                    {usageCount > 0 ? <span className="count">{usageCount}</span> : null}
                  </TagCatalogToggle>
                  <TagCatalogDeleteButton
                    type="button"
                    data-active={isSelected}
                    disabled={usageCount > 0}
                    title={usageCount > 0 ? "사용 중인 태그는 삭제할 수 없습니다." : "태그 삭제"}
                    onClick={() => onDeleteTag(tag)}
                  >
                    ×
                  </TagCatalogDeleteButton>
                </TagCatalogChipGroup>
              )
            })}
            {knownTags.length === 0 ? <EmptyMetaText>아직 저장된 태그가 없습니다.</EmptyMetaText> : null}
          </TagCatalogList>
        </MetadataPanel>
      </div>
    </MetadataAssistantDisclosure>

    <MetadataAssistantDisclosure open={isUtilityPanelOpen}>
      <summary
        onClick={(event) => {
          event.preventDefault()
          onToggleUtilityPanel()
        }}
      >
        <strong>보조 작업</strong>
        <span>{isUtilityPanelOpen ? "닫기" : "열기"}</span>
      </summary>
      {isUtilityPanelOpen ? <div className="body">{utilityActions}</div> : null}
    </MetadataAssistantDisclosure>
  </>
)

const MetadataAssistantDisclosure = styled.details`
  margin-top: 0.68rem;
  border-top: 1px dashed ${({ theme }) => theme.colors.gray6};
  padding-top: 0.68rem;

  summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.72rem;
    list-style: none;
    cursor: pointer;
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.78rem;
    line-height: 1.45;

    &::-webkit-details-marker {
      display: none;
    }
  }

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.8rem;
    font-weight: 700;
  }

  summary > span:last-of-type {
    flex: 0 0 auto;
    color: ${({ theme }) => theme.colors.blue11};
    font-size: 0.76rem;
    font-weight: 700;
  }

  .body {
    display: grid;
    gap: 0.62rem;
    margin-top: 0.72rem;
  }
`

const MetadataStatus = styled.div`
  padding: 0.62rem 0.74rem;
  border-radius: 8px;
  font-size: 0.8rem;
  line-height: 1.5;

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
`

const MetadataPanel = styled.div`
  display: grid;
  gap: 0.65rem;
  min-width: 0;
  padding: 0.55rem 0;
  border-radius: 0;
  border: none;
  background: transparent;

  label {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.84rem;
    font-weight: 700;
  }
`

const TagCatalogList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  min-width: 0;
`

const TagCatalogChipGroup = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0;
  min-width: 0;
  max-width: 100%;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: transparent;
  overflow: hidden;
  transition:
    border-color 0.18s ease,
    transform 0.18s ease,
    background 0.18s ease;

  &[data-active="true"] {
    border-color: ${({ theme }) => theme.colors.gray7};
    background: ${({ theme }) => theme.colors.gray3};
  }

  &:hover {
    transform: none;
  }
`

const TagCatalogToggle = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.46rem;
  min-width: 0;
  border: 0;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray11};
  padding: 0.5rem 0.88rem;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
  transition:
    background 0.18s ease,
    color 0.18s ease;

  .label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.35rem;
    min-height: 1.35rem;
    border-radius: 999px;
    background: rgba(15, 23, 42, 0.16);
    color: currentColor;
    font-size: 0.7rem;
    line-height: 1;
  }

  &:hover {
    background: ${({ theme }) => theme.colors.gray2};
    color: ${({ theme }) => theme.colors.gray12};
  }

  &[data-active="true"] {
    color: ${({ theme }) => theme.colors.gray12};

    &:hover {
      background: transparent;
      color: ${({ theme }) => theme.colors.gray12};
    }

    .count {
      background: ${({ theme }) => theme.colors.gray4};
    }
  }
`

const TagCatalogDeleteButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  align-self: stretch;
  min-width: 2.05rem;
  padding: 0 0.58rem;
  border: 0;
  border-left: 1px solid ${({ theme }) => theme.colors.gray6};
  background: transparent;
  color: ${({ theme }) => theme.colors.gray11};
  cursor: pointer;
  flex: 0 0 auto;
  font-size: 0.98rem;
  line-height: 1;
  transition:
    background 0.18s ease,
    color 0.18s ease,
    transform 0.18s ease;

  &[data-active="true"] {
    border-left-color: ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.colors.gray2};
    color: ${({ theme }) => theme.colors.gray11};
  }

  &:hover:not(:disabled) {
    transform: none;
    background: ${({ theme }) => theme.colors.red3};
    color: ${({ theme }) => theme.colors.red11};
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
`

const EmptyMetaText = styled.span`
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.78rem;
  line-height: 1.5;
`
