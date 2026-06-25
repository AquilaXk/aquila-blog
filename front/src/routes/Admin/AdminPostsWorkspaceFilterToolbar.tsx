import styled from "@emotion/styled"
import {
  DEFAULT_SORT,
  type ListSort,
  type PostListScope,
  type PostStatusFilter,
} from "./AdminPostsWorkspaceModel"

type AdminPostsWorkspaceFilterToolbarProps = {
  listScope: PostListScope
  listStatus: PostStatusFilter
  listKw: string
  listSort: ListSort
  onStatusChange: (status: PostStatusFilter) => void
  onKeywordChange: (value: string) => void
  onSortChange: (sort: ListSort) => void
}

export const AdminPostsWorkspaceFilterToolbar: React.FC<AdminPostsWorkspaceFilterToolbarProps> = ({
  listScope,
  listStatus,
  listKw,
  listSort,
  onStatusChange,
  onKeywordChange,
  onSortChange,
}) => (
  <StickyFilterToolbar>
    <FilterRail>
      <ScopeTabs role="group" aria-label="글 범위 선택">
        {[
          ["all", "전체"],
          ["draft", "초안"],
          ["published", "발행"],
          ["private", "비공개"],
          ["deleted", "삭제됨"],
        ].map(([value, label]) => (
          <ScopeTabButton
            key={value}
            type="button"
            aria-pressed={listStatus === value}
            data-active={listStatus === value}
            onClick={() => onStatusChange(value as PostStatusFilter)}
          >
            {label}
          </ScopeTabButton>
        ))}
      </ScopeTabs>
      <SearchField>
        <input
          id="workspace-post-search"
          placeholder="글 검색"
          value={listKw}
          onChange={(event) => onKeywordChange(event.target.value)}
        />
      </SearchField>
      <SortField>
        <select
          aria-label="글 정렬"
          value={listSort}
          disabled={listScope === "deleted"}
          onChange={(event) => onSortChange(event.target.value as ListSort)}
        >
          <option value={DEFAULT_SORT}>최신 수정순</option>
          <option value="CREATED_AT_ASC">오래된순</option>
        </select>
      </SortField>
    </FilterRail>
  </StickyFilterToolbar>
)

const baseButton = ({ theme }: { theme: any }) => `
  min-height: 48px;
  border-radius: 2px;
  border: 1px solid ${theme.colors.gray5};
  font-size: 0.95rem;
  font-weight: 800;
  cursor: pointer;
`

const StickyFilterToolbar = styled.div`
  display: grid;
  gap: 0.78rem;
  min-width: 0;
  max-width: 100%;
  padding: 0;
  border-radius: 0;
  border: 0;
  background: transparent;
  box-shadow: none;

  @media (max-width: 767px) {
    gap: 0.52rem;
    padding: 0.58rem 0.62rem;
    border-radius: 12px;
  }

`

const FilterRail = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(13rem, 0.36fr) 10.5rem;
  min-width: 0;
  gap: 0.75rem;
  align-items: end;

  > * {
    min-width: 0;
  }

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }

  @media (max-width: 767px) {
    grid-template-columns: 1fr;
    gap: 0.5rem;
    align-items: end;
  }
`

const ScopeTabs = styled.div`
  display: inline-flex;
  min-width: 0;
  gap: 0.38rem;
  flex-wrap: wrap;

  @media (max-width: 767px) {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.28rem;
  }
`

const ScopeTabButton = styled.button<{ "data-active"?: boolean }>`
  ${({ theme }) => baseButton({ theme })};
  min-height: 42px;
  padding: 0 0.82rem;
  background: ${({ theme, "data-active": active }) => (active ? theme.colors.gray1 : theme.colors.gray2)};
  color: ${({ theme }) => theme.colors.gray12};
  border-color: ${({ theme, "data-active": active }) => (active ? theme.colors.gray6 : theme.colors.gray5)};

  @media (max-width: 767px) {
    min-height: 38px;
    padding: 0 0.46rem;
    border-radius: 2px;
    font-size: 0.78rem;
  }
`

const SearchField = styled.div`
  display: grid;
  min-width: 0;

  input {
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    min-height: 46px;
    border-radius: 2px;
    border: 1px solid ${({ theme }) => theme.colors.gray5};
    background: ${({ theme }) => theme.colors.gray1};
    color: ${({ theme }) => theme.colors.gray12};
    padding: 0 0.95rem;
    font-size: 0.95rem;
  }

  @media (max-width: 767px) {
    input {
      min-height: 38px;
      border-radius: 2px;
      padding: 0 0.7rem;
      font-size: 0.86rem;
    }
  }
`

const SortField = styled.div`
  display: grid;
  min-width: 0;

  select {
    box-sizing: border-box;
    width: 100%;
    min-height: 46px;
    border-radius: 2px;
    border: 1px solid ${({ theme }) => theme.colors.gray5};
    background: ${({ theme }) => theme.colors.gray1};
    color: ${({ theme }) => theme.colors.gray12};
    padding: 0 0.8rem;
    font-size: 0.9rem;
    font-weight: 760;
  }
`
