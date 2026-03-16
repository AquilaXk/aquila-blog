import styled from "@emotion/styled"
import React, { InputHTMLAttributes, Ref } from "react"
import AppIcon from "src/components/icons/AppIcon"

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  inputRef?: Ref<HTMLInputElement>
}

const SearchInput: React.FC<Props> = ({ inputRef, ...props }) => {
  const inputId = props.id || "feed-search-input"

  const focusInput = () => {
    if (typeof inputRef !== "function" && inputRef?.current) {
      inputRef.current.focus()
      return
    }

    if (typeof document === "undefined") return
    const input = document.getElementById(inputId)
    if (input instanceof HTMLInputElement) input.focus()
  }

  return (
    <StyledWrapper>
      <div className="field">
        <span className="searchIcon" aria-hidden="true">
          <AppIcon name="search" />
        </span>
        <input
          id={inputId}
          ref={inputRef}
          className="mid"
          type="search"
          placeholder="제목, 요약, 태그로 검색"
          aria-label="Search posts by keyword"
          {...props}
        />
        <button type="button" className="shortcut" onClick={focusInput} aria-label="검색창으로 이동">
          검색
        </button>
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
    min-height: 50px;
    padding: 0 0.9rem;
    border-radius: 14px;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.colors.gray1};

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
      min-width: 42px;
      height: 24px;
      padding: 0 0.42rem;
      border-radius: 999px;
      border: 1px solid ${({ theme }) => theme.colors.gray5};
      background: ${({ theme }) => theme.colors.gray2};
      color: ${({ theme }) => theme.colors.gray10};
      font-size: 0.68rem;
      font-weight: 650;
      letter-spacing: 0;
      line-height: 1;
      cursor: pointer;

      &:hover {
        color: ${({ theme }) => theme.colors.gray12};
        border-color: ${({ theme }) => theme.colors.gray6};
        background: ${({ theme }) => theme.colors.gray3};
      }

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
    box-shadow: 0 0 0 2px ${({ theme }) => theme.colors.blue4};
  }
`
