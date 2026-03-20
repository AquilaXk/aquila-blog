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
    gap: 0.5rem;
    min-width: 0;
    min-height: 36px;
    padding: 0 0.625rem;
    border-radius: 8px;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.colors.gray1};
    transition: all 0.125s ease-in;

    .searchIcon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 auto;
      color: ${({ theme }) => theme.colors.gray10};
      width: 16px;
      height: 16px;
      transition: all 0.125s ease-in;

      svg {
        width: 16px;
        height: 16px;
      }
    }

    .shortcut {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 auto;
      min-width: 60px;
      height: 28px;
      padding: 0 0.65rem;
      border-radius: 999px;
      border: 1px solid ${({ theme }) => theme.colors.gray6};
      background: ${({ theme }) => theme.colors.gray2};
      color: ${({ theme }) => theme.colors.gray11};
      font-size: 0.8rem;
      font-weight: 700;
      letter-spacing: 0;
      line-height: 1;
      cursor: pointer;
      transition: all 0.125s ease-in;

      &:hover {
        color: ${({ theme }) => theme.colors.gray12};
        border-color: ${({ theme }) => theme.colors.gray8};
        background: ${({ theme }) => theme.colors.gray3};
      }

      @media (max-width: 1200px) {
        display: none;
      }
    }
  }

  > .field > .mid {
    width: 100%;
    min-width: 0;
    min-height: 16px;
    font-size: 0.875rem;
    line-height: 16px;
    color: ${({ theme }) => theme.colors.gray12};
    border: 0;
    outline: none;
    box-shadow: none;
    background: transparent;
    transition: all 0.125s ease-in;

    &::-webkit-search-decoration,
    &::-webkit-search-cancel-button,
    &::-webkit-search-results-button,
    &::-webkit-search-results-decoration {
      -webkit-appearance: none;
    }
  }

  > .field:focus-within {
    border-color: ${({ theme }) => theme.colors.gray8};
    background: ${({ theme }) => theme.colors.gray2};

    .searchIcon {
      color: ${({ theme }) => theme.colors.gray12};
    }
  }

  @media (max-width: 768px) {
    > .field {
      min-height: 34px;
      padding: 0 0.5rem;
      border-radius: 7px;
    }

    > .field > .mid {
      font-size: 0.75rem;
    }
  }
`
