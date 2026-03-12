import styled from "@emotion/styled"
import React, { InputHTMLAttributes } from "react"
import { FiSearch } from "react-icons/fi"

interface Props extends InputHTMLAttributes<HTMLInputElement> {}

const SearchInput: React.FC<Props> = ({ ...props }) => {
  return (
    <StyledWrapper>
      <div className="field">
        <span className="searchIcon" aria-hidden="true">
          <FiSearch />
        </span>
        <input
          id="feed-search-input"
          className="mid"
          type="search"
          placeholder="제목, 요약, 태그로 검색"
          aria-label="Search posts by keyword"
          {...props}
        />
        <span className="shortcut" aria-hidden="true">
          ⌘K
        </span>
      </div>
    </StyledWrapper>
  )
}

export default SearchInput

const StyledWrapper = styled.div`
  min-width: 0;

  > .field {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    min-width: 0;
    min-height: 52px;
    padding: 0 0.95rem;
    border-radius: 18px;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.colors.gray2};

    .searchIcon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 auto;
      color: ${({ theme }) => theme.colors.gray10};
      font-size: 1rem;
    }

    .shortcut {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 auto;
      min-width: 38px;
      height: 28px;
      padding: 0 0.5rem;
      border-radius: 9px;
      border: 1px solid ${({ theme }) => theme.colors.gray6};
      background: ${({ theme }) => theme.colors.gray1};
      color: ${({ theme }) => theme.colors.gray10};
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.04em;

      @media (max-width: 640px) {
        display: none;
      }
    }
  }

  > .field > .mid {
    width: 100%;
    min-width: 0;
    font-size: 0.95rem;
    line-height: 1.5;
    color: ${({ theme }) => theme.colors.gray12};
    border: 0;
    outline: none;
    box-shadow: none;
    background: transparent;

    &::-webkit-search-decoration,
    &::-webkit-search-cancel-button,
    &::-webkit-search-results-button,
    &::-webkit-search-results-decoration {
      -webkit-appearance: none;
    }
  }

  > .field:focus-within {
    border-color: ${({ theme }) => theme.colors.blue8};
    box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.blue4};
  }
`
