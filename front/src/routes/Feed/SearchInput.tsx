import styled from "@emotion/styled"
import React, { InputHTMLAttributes, Ref } from "react"
import AppIcon from "src/components/icons/AppIcon"
import {
  FEED_SEARCH_FIELD_MIN_HEIGHT_PX,
  FEED_TAG_RAIL_CHIP_MAX_PX,
  MOBILE_TOUCH_TARGET_MIN_PX,
} from "./feedUiTokens"

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
    gap: 0.42rem;
    min-width: 0;
    min-height: ${FEED_SEARCH_FIELD_MIN_HEIGHT_PX}px;
    padding: 0 0.56rem;
    border-radius: ${({ theme }) => `${theme.variables.ui.button.radius}px`};
    border: 1px solid ${({ theme }) => theme.colors.gray5};
    background: ${({ theme }) => theme.colors.gray1};
    box-shadow: ${({ theme }) =>
      theme.scheme === "light" ? "0 1px 0 rgba(15, 23, 42, 0.02)" : "none"};
    transition: border-color 0.125s ease-in, background-color 0.125s ease-in, box-shadow 0.125s ease-in;

    .searchIcon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 auto;
      color: ${({ theme }) => theme.colors.gray10};
      width: 15px;
      height: 15px;
      transition: color 0.125s ease-in;

      svg {
        width: 15px;
        height: 15px;
      }
    }

    .shortcut {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 auto;
      min-width: 56px;
      height: 26px;
      padding: 0 0.52rem;
      border-radius: ${({ theme }) => `${theme.variables.ui.button.radiusPill}px`};
      border: 1px solid ${({ theme }) => theme.colors.gray5};
      background: transparent;
      color: ${({ theme }) => theme.colors.gray10};
      font-size: 0.74rem;
      font-weight: 700;
      letter-spacing: 0;
      line-height: 1;
      cursor: pointer;
      transition: all 0.125s ease-in;

      &:hover {
        color: ${({ theme }) => theme.colors.gray12};
        border-color: ${({ theme }) => theme.colors.gray6};
        background: ${({ theme }) => theme.colors.gray3};
      }

      @media (max-width: ${FEED_TAG_RAIL_CHIP_MAX_PX}px) {
        display: none;
      }
    }
  }

  > .field > .mid {
    width: 100%;
    min-width: 0;
    min-height: 36px;
    padding: 0.32rem 0;
    font-size: 0.84rem;
    font-weight: 560;
    line-height: 1.4;
    color: ${({ theme }) => theme.colors.gray12};
    caret-color: ${({ theme }) => theme.colors.gray12};
    border: 0;
    outline: none;
    box-shadow: none;
    background: transparent;
    appearance: none;
    -webkit-appearance: none;
    transition: all 0.125s ease-in;

    &::placeholder {
      color: ${({ theme }) => theme.colors.gray10};
      opacity: 1;
      transition: opacity 0.12s ease-in;
    }

    &:focus::placeholder {
      opacity: 0;
    }

    &::-webkit-search-decoration,
    &::-webkit-search-cancel-button,
    &::-webkit-search-results-button,
    &::-webkit-search-results-decoration {
      -webkit-appearance: none;
    }
  }

  > .field:focus-within {
    border-color: ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.colors.gray1};
    box-shadow: ${({ theme }) =>
      theme.scheme === "light" ? "0 0 0 1px rgba(148, 163, 184, 0.16)" : "none"};

    .searchIcon {
      color: ${({ theme }) => theme.colors.gray11};
    }
  }

  @media (max-width: 768px) {
    > .field {
      min-height: ${MOBILE_TOUCH_TARGET_MIN_PX}px;
      padding: 0 0.5rem;
      border-radius: ${({ theme }) => `${Math.max(theme.variables.ui.button.radius - 1, 6)}px`};
    }

    > .field > .mid {
      min-height: 34px;
      padding: 0.34rem 0;
      font-size: 0.82rem;
      line-height: 1.45;
    }
  }
`
