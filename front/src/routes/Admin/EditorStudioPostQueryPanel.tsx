import styled from "@emotion/styled"
import type { ChangeEvent } from "react"

type ManageStep = "query" | "list"
type PostListScope = "active" | "deleted"
type ListQuickPreset = "none" | "today" | "temp"

type ListSortOption = {
  value: string
  label: string
}

type Props = {
  activeMobileStep: ManageStep
  isCompactMobileLayout: boolean
  listScope: PostListScope
  listKeyword: string
  listQuickPreset: ListQuickPreset
  hasListFiltersApplied: boolean
  isAdvancedOpen: boolean
  listPage: string
  listPageSize: string
  listSort: string
  listSortOptions: readonly ListSortOption[]
  isRefreshDisabled: boolean
  isTempPostDisabled: boolean
  onListScopeChange: (scope: PostListScope) => void
  onListKeywordChange: (value: string) => void
  onRefreshList: () => void
  onLoadOrCreateTempPost: () => void
  onApplyQuickPreset: (preset: Exclude<ListQuickPreset, "none">) => void
  onResetFilters: () => void
  onToggleAdvanced: () => void
  onListPageChange: (event: ChangeEvent<HTMLInputElement>) => void
  onListPageSizeChange: (event: ChangeEvent<HTMLInputElement>) => void
  onListSortChange: (event: ChangeEvent<HTMLSelectElement>) => void
}

export const EditorStudioPostQueryPanel = ({
  activeMobileStep,
  isCompactMobileLayout,
  listScope,
  listKeyword,
  listQuickPreset,
  hasListFiltersApplied,
  isAdvancedOpen,
  listPage,
  listPageSize,
  listSort,
  listSortOptions,
  isRefreshDisabled,
  isTempPostDisabled,
  onListScopeChange,
  onListKeywordChange,
  onRefreshList,
  onLoadOrCreateTempPost,
  onApplyQuickPreset,
  onResetFilters,
  onToggleAdvanced,
  onListPageChange,
  onListPageSizeChange,
  onListSortChange,
}: Props) => (
    <QueryPanel data-mobile-visible={!isCompactMobileLayout || activeMobileStep === "query"}>
      <QueryHeader>
        <h3>글 목록 조회 조건</h3>
        <p>
          {listScope === "active"
            ? "최근 글을 빠르게 다시 열고 필요한 경우만 고급 조건을 펼쳐 조회합니다."
            : "삭제 글만 확인하고 복구 대상을 고릅니다."}
        </p>
        <ListScopeTabs>
          <ListScopeButton type="button" data-active={listScope === "active"} onClick={() => onListScopeChange("active")}>
            활성 글
          </ListScopeButton>
          <ListScopeButton type="button" data-active={listScope === "deleted"} onClick={() => onListScopeChange("deleted")}>
            삭제 글
          </ListScopeButton>
        </ListScopeTabs>
      </QueryHeader>

      <FieldBox>
        <FieldLabel htmlFor="list-kw">검색어</FieldLabel>
        <Input
          id="list-kw"
          placeholder={listScope === "active" ? "제목/본문 키워드" : "삭제된 글 제목/본문 키워드"}
          value={listKeyword}
          onChange={(event) => onListKeywordChange(event.target.value)}
        />
      </FieldBox>

      <QueryActions>
        <PrimaryButton type="button" disabled={isRefreshDisabled} onClick={onRefreshList}>
          {listScope === "active" ? "목록 새로고침" : "삭제 글 조회"}
        </PrimaryButton>
        {listScope === "active" ? (
          <Button type="button" disabled={isTempPostDisabled} onClick={onLoadOrCreateTempPost}>
            임시 저장 열기
          </Button>
        ) : null}
      </QueryActions>

      {listScope === "active" ? (
        <PresetRow role="group" aria-label="빠른 프리셋">
          <PresetButton
            type="button"
            data-active={listQuickPreset === "today"}
            onClick={() => onApplyQuickPreset("today")}
          >
            오늘 수정
          </PresetButton>
          <PresetButton
            type="button"
            data-active={listQuickPreset === "temp"}
            onClick={() => onApplyQuickPreset("temp")}
          >
            임시 저장
          </PresetButton>
          {hasListFiltersApplied ? (
            <PresetButton type="button" data-active={false} onClick={onResetFilters}>
              조건 초기화
            </PresetButton>
          ) : null}
        </PresetRow>
      ) : null}

      <InlineDisclosure open={isAdvancedOpen}>
        <summary
          onClick={(event) => {
            event.preventDefault()
            onToggleAdvanced()
          }}
        >
          <strong>고급 조회 옵션</strong>
          <span>{isAdvancedOpen ? "닫기" : "열기"}</span>
        </summary>
        {isAdvancedOpen ? (
          <div className="body">
            <QueryGrid>
              <FieldBox className="listPage">
                <FieldLabel htmlFor="list-page">페이지</FieldLabel>
                <Input
                  id="list-page"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  placeholder="예: 1"
                  value={listPage}
                  onChange={onListPageChange}
                />
              </FieldBox>
              <FieldBox className="listPageSize">
                <FieldLabel htmlFor="list-page-size">페이지 크기</FieldLabel>
                <Input
                  id="list-page-size"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={30}
                  placeholder="1~30"
                  value={listPageSize}
                  onChange={onListPageSizeChange}
                />
              </FieldBox>
              {listScope === "active" ? (
                <FieldBox className="listSort">
                  <FieldLabel htmlFor="list-sort">정렬 기준</FieldLabel>
                  <FieldSelect id="list-sort" value={listSort} onChange={onListSortChange}>
                    {listSortOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </FieldSelect>
                </FieldBox>
              ) : null}
            </QueryGrid>
          </div>
        ) : null}
      </InlineDisclosure>
    </QueryPanel>
)

const QueryPanel = styled.div`
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 10px;
  background: ${({ theme }) => theme.colors.gray2};
  padding: 0.72rem 0.72rem 0.82rem;
  margin: 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.gray6};

  @media (max-width: 420px) {
    padding: 0.62rem 0.62rem 0.72rem;
  }

  @media (max-width: 720px) {
    &[data-mobile-visible="false"] {
      display: none;
    }
  }
`

const QueryHeader = styled.div`
  margin-bottom: 0.72rem;

  h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 720;
    color: ${({ theme }) => theme.colors.gray12};
  }

  p {
    margin: 0.18rem 0 0;
    font-size: 0.78rem;
    line-height: 1.5;
    color: ${({ theme }) => theme.colors.gray10};
  }
`

const ListScopeTabs = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.38rem;
  margin-top: 0.55rem;
  padding: 0;
  border-radius: 999px;
  border: none;
  background: transparent;
`

const ListScopeButton = styled.button`
  border: 0;
  border-radius: 999px;
  min-height: 36px;
  padding: 0 0.82rem;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
  transition:
    background 0.18s ease,
    color 0.18s ease;

  &[data-active="true"] {
    background: transparent;
    color: ${({ theme }) => theme.colors.gray12};
    text-decoration: underline;
    text-underline-offset: 4px;
  }
`

const FieldBox = styled.div`
  display: grid;
  gap: 0.26rem;
`

const FieldLabel = styled.label`
  font-size: 0.8rem;
  font-weight: 650;
  color: ${({ theme }) => theme.colors.gray11};
`

const Input = styled.input`
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 8px;
  padding: 0.72rem 0.8rem;
  min-height: 44px;
  min-width: 0;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray12};

  &:focus-visible {
    outline: none;
    border-color: ${({ theme }) => theme.colors.blue8};
    box-shadow: 0 0 0 4px ${({ theme }) => theme.colors.blue4};
  }
`

const FieldSelect = styled.select`
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 8px;
  padding: 0.72rem 0.8rem;
  min-height: 44px;
  min-width: 0;
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray12};
  font-size: 0.95rem;

  &:focus-visible {
    outline: none;
    border-color: ${({ theme }) => theme.colors.blue8};
    box-shadow: 0 0 0 4px ${({ theme }) => theme.colors.blue4};
  }
`

const QueryActions = styled.div`
  margin-top: 0.72rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;

  > button {
    min-width: 9.5rem;
  }

  @media (max-width: 720px) {
    display: grid;
    grid-template-columns: 1fr;

    > button {
      width: 100%;
    }
  }
`

const PresetRow = styled.div`
  margin-top: 0.6rem;
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;

  @media (max-width: 420px) {
    flex-wrap: nowrap;
    overflow-x: auto;
    padding-bottom: 0.18rem;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;

    &::-webkit-scrollbar {
      display: none;
    }
  }
`

const PresetButton = styled.button`
  min-height: 36px;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: transparent;
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.78rem;
  font-weight: 700;
  padding: 0 0.72rem;
  cursor: pointer;

  &[data-active="true"] {
    color: ${({ theme }) => theme.colors.gray12};
    border-color: ${({ theme }) => theme.colors.gray7};
    text-decoration: underline;
    text-underline-offset: 4px;
  }
`

const InlineDisclosure = styled.details`
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

const QueryGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem;

  @media (min-width: 1280px) {
    grid-template-columns: 110px 140px minmax(260px, 1fr) 180px;
    align-items: end;

    .listKw {
      min-width: 0;
    }
  }

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
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
