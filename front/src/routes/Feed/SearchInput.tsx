import styled from "@emotion/styled"
import React, { InputHTMLAttributes } from "react"
import { FiSearch } from "react-icons/fi"

interface Props extends InputHTMLAttributes<HTMLInputElement> {}

const SearchInput: React.FC<Props> = ({ ...props }) => {
  return (
    <StyledWrapper>
      <label className="top" htmlFor="feed-search-input">
        <FiSearch aria-hidden="true" /> Search
      </label>
      <div className="field">
        <span className="icon">⌘K</span>
        <input
          id="feed-search-input"
          className="mid"
          type="search"
          placeholder="제목, 요약, 태그로 검색"
          aria-label="Search posts by keyword"
          {...props}
        />
      </div>
    </StyledWrapper>
  )
}

export default SearchInput

const StyledWrapper = styled.div`
  margin-bottom: 1rem;
  min-width: 0;

  @media (min-width: 768px) {
    margin-bottom: 1.1rem;
  }
  > .top {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.1rem 0.1rem 0;
    margin-bottom: 0.6rem;
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.82rem;
    font-weight: 700;
  }

  > .field {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    min-width: 0;
    padding: 0.8rem 0.95rem;
    border-radius: 18px;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.colors.gray2};

    .icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 44px;
      height: 36px;
      border-radius: 12px;
      border: 1px solid ${({ theme }) => theme.colors.gray6};
      background: ${({ theme }) => theme.colors.gray1};
      color: ${({ theme }) => theme.colors.gray10};
      font-size: 0.76rem;
      font-weight: 700;
      letter-spacing: 0.04em;
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
    box-shadow: 0 0 0 4px ${({ theme }) => theme.colors.blue4};
  }
`
