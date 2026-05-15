import styled from "@emotion/styled"
import { AdminInlineActionRow, AdminTextActionButton } from "./AdminSurfacePrimitives"
import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  DEFAULT_SORT,
  formatDateTime,
  sanitizeNumberInput,
  type ListSort,
  type ListState,
  type PostListScope,
} from "./AdminPostsWorkspaceModel"

type AdminPostsWorkspaceFilterToolbarProps = {
  listScope: PostListScope
  listKw: string
  listPage: string
  listPageSize: string
  listSort: ListSort
  listState: ListState
  isAdvancedOpen: boolean
  isStickyToolbarCompact: boolean
  hasListFilters: boolean
  listSummaryParts: string[]
  onScopeChange: (scope: PostListScope) => void
  onKeywordChange: (value: string) => void
  onPageChange: (value: string) => void
  onPageSizeChange: (value: string) => void
  onSortChange: (sort: ListSort) => void
  onAdvancedToggle: () => void
  onCompactToggle: () => void
  onResetFilters: () => void
}

export const AdminPostsWorkspaceFilterToolbar: React.FC<AdminPostsWorkspaceFilterToolbarProps> = ({
  listScope,
  listKw,
  listPage,
  listPageSize,
  listSort,
  listState,
  isAdvancedOpen,
  isStickyToolbarCompact,
  hasListFilters,
  listSummaryParts,
  onScopeChange,
  onKeywordChange,
  onPageChange,
  onPageSizeChange,
  onSortChange,
  onAdvancedToggle,
  onCompactToggle,
  onResetFilters,
}) => (
  <StickyFilterToolbar data-compact={isStickyToolbarCompact}>
    <FilterRail>
      <ScopeTabs role="tablist" aria-label="글 범위 선택">
        <ScopeTabButton type="button" data-active={listScope === "active"} onClick={() => onScopeChange("active")}>
          활성 글
        </ScopeTabButton>
        <ScopeTabButton type="button" data-active={listScope === "deleted"} onClick={() => onScopeChange("deleted")}>
          삭제 글
        </ScopeTabButton>
      </ScopeTabs>
      <SearchField>
        <label htmlFor="workspace-post-search">검색어</label>
        <input
          id="workspace-post-search"
          placeholder={listScope === "active" ? "제목이나 본문 검색" : "삭제된 글 검색"}
          value={listKw}
          onChange={(event) => onKeywordChange(event.target.value)}
        />
      </SearchField>
    </FilterRail>

    {!isStickyToolbarCompact ? (
      <AdvancedDisclosure open={isAdvancedOpen}>
        <summary
          onClick={(event) => {
            event.preventDefault()
            onAdvancedToggle()
          }}
        >
          <strong>고급 검색</strong>
          <span>{isAdvancedOpen ? "닫기" : "열기"}</span>
        </summary>
        {isAdvancedOpen && (
          <div className="body">
            <AdvancedGrid>
              <FieldBox>
                <label htmlFor="workspace-page">페이지</label>
                <input
                  id="workspace-page"
                  type="number"
                  min={1}
                  value={listPage}
                  onChange={(event) => onPageChange(sanitizeNumberInput(event.target.value, DEFAULT_PAGE))}
                />
              </FieldBox>
              <FieldBox>
                <label htmlFor="workspace-page-size">페이지 크기</label>
                <input
                  id="workspace-page-size"
                  type="number"
                  min={1}
                  max={30}
                  value={listPageSize}
                  onChange={(event) => onPageSizeChange(sanitizeNumberInput(event.target.value, DEFAULT_PAGE_SIZE))}
                />
              </FieldBox>
              {listScope === "active" && (
                <FieldBox>
                  <label htmlFor="workspace-sort">정렬</label>
                  <select
                    id="workspace-sort"
                    value={listSort}
                    onChange={(event) => onSortChange(event.target.value as ListSort)}
                  >
                    <option value={DEFAULT_SORT}>최신순</option>
                    <option value="CREATED_AT_ASC">오래된순</option>
                  </select>
                </FieldBox>
              )}
            </AdvancedGrid>
          </div>
        )}
      </AdvancedDisclosure>
    ) : null}

    <FilterSummaryBar>
      <div className="summaryCopy">
        <strong>현재 조건</strong>
        <SummaryPillRow>
          {listSummaryParts.map((part) => (
            <SummaryPill key={part}>{part}</SummaryPill>
          ))}
          <SummaryPill data-tone="neutral">
            총 {listState.total}건{listState.loadedAt ? ` · ${formatDateTime(listState.loadedAt)} 기준` : ""}
          </SummaryPill>
        </SummaryPillRow>
      </div>
      <ToolbarUtilityRow>
        <GhostButton type="button" onClick={onCompactToggle}>
          {isStickyToolbarCompact ? "전체 보기" : "요약만 보기"}
        </GhostButton>
        {hasListFilters ? (
          <GhostButton type="button" onClick={onResetFilters}>
            조건 초기화
          </GhostButton>
        ) : null}
      </ToolbarUtilityRow>
    </FilterSummaryBar>
  </StickyFilterToolbar>
)

const baseButton = ({ theme }: { theme: any }) => `
  min-height: 48px;
  border-radius: 12px;
  border: 1px solid ${theme.colors.gray5};
  font-size: 0.95rem;
  font-weight: 800;
  cursor: pointer;
`

const GhostButton = styled(AdminTextActionButton)`
  font-size: 0.88rem;
  font-weight: 700;
`

const StickyFilterToolbar = styled.div`
  display: grid;
  gap: 0.72rem;
  padding: 0.88rem 0.92rem;
  border-radius: 16px;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  background: color-mix(in srgb, ${({ theme }) => theme.colors.gray1} 88%, transparent);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.1);

  @media (max-width: 767px) {
    padding: 0.8rem 0.82rem;
  }

  &[data-compact="true"] {
    gap: 0.56rem;
    padding-top: 0.72rem;
    padding-bottom: 0.72rem;
  }
`

const FilterRail = styled.div`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.75rem;
  align-items: end;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`

const ScopeTabs = styled.div`
  display: inline-flex;
  gap: 0.4rem;
  flex-wrap: wrap;
`

const ScopeTabButton = styled.button<{ "data-active"?: boolean }>`
  ${({ theme }) => baseButton({ theme })};
  min-height: 42px;
  padding: 0 0.85rem;
  background: ${({ theme, "data-active": active }) => (active ? theme.colors.gray1 : theme.colors.gray2)};
  color: ${({ theme }) => theme.colors.gray12};
  border-color: ${({ theme, "data-active": active }) => (active ? theme.colors.gray6 : theme.colors.gray5)};
`

const SearchField = styled.div`
  display: grid;
  gap: 0.3rem;

  label {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.78rem;
    font-weight: 700;
  }

  input {
    min-height: 46px;
    border-radius: 12px;
    border: 1px solid ${({ theme }) => theme.colors.gray5};
    background: ${({ theme }) => theme.colors.gray1};
    color: ${({ theme }) => theme.colors.gray12};
    padding: 0 0.95rem;
    font-size: 0.95rem;
  }
`

const AdvancedDisclosure = styled.details`
  display: grid;
  gap: 0.6rem;
  padding: 0.9rem 1rem;
  border-radius: 14px;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  background: ${({ theme }) => theme.colors.gray2};

  summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
    list-style: none;
  }

  summary::-webkit-details-marker {
    display: none;
  }

  strong {
    font-size: 0.92rem;
  }

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.84rem;
  }

  .body {
    display: grid;
    gap: 0.75rem;
  }
`

const AdvancedGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`

const FieldBox = styled.div`
  display: grid;
  gap: 0.3rem;

  label {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.78rem;
    font-weight: 700;
  }

  input,
  select {
    min-height: 44px;
    border-radius: 12px;
    border: 1px solid ${({ theme }) => theme.colors.gray5};
    background: ${({ theme }) => theme.colors.gray1};
    color: ${({ theme }) => theme.colors.gray12};
    padding: 0 0.85rem;
  }
`

const FilterSummaryBar = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.8rem;
  padding: 0.9rem 1rem;
  border-radius: 14px;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  background: ${({ theme }) => theme.colors.gray2};

  .summaryCopy {
    display: grid;
    gap: 0.45rem;
  }

  .summaryCopy > strong {
    font-size: 0.9rem;
    letter-spacing: -0.01em;
  }

  @media (max-width: 767px) {
    flex-direction: column;
    align-items: stretch;
  }
`

const ToolbarUtilityRow = styled(AdminInlineActionRow)`
  justify-content: flex-end;

  @media (max-width: 767px) {
    justify-content: flex-start;
  }
`

const SummaryPillRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
`

const SummaryPill = styled.span<{ "data-tone"?: "neutral" }>`
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  padding: 0 0.72rem;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme, "data-tone": tone }) => (tone === "neutral" ? theme.colors.gray1 : theme.colors.gray3)};
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.78rem;
  font-weight: 700;
`
