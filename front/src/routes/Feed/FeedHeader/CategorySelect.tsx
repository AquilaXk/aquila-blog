import useDropdown from "src/hooks/useDropdown"
import { useRouter } from "next/router"
import React from "react"
import { MdExpandMore } from "react-icons/md"
import { DEFAULT_CATEGORY } from "src/constants"
import styled from "@emotion/styled"
import { useCategoriesQuery } from "src/hooks/useCategoriesQuery"
import { splitCategoryDisplay } from "src/libs/utils"

type Props = {}

const CategorySelect: React.FC<Props> = () => {
  const router = useRouter()
  const data = useCategoriesQuery()
  const [dropdownRef, opened, handleOpen] = useDropdown()

  const currentCategory =
    typeof router.query.category === "string"
      ? router.query.category
      : DEFAULT_CATEGORY
  const currentCategoryDisplay = splitCategoryDisplay(currentCategory)

  const handleOptionClick = (category: string) => {
    router.push(
      {
        pathname: "/",
        query: {
          ...router.query,
          category,
        },
      },
      undefined,
      { shallow: true, scroll: false }
    )
  }
  return (
    <StyledWrapper>
      <div ref={dropdownRef}>
        <button
          type="button"
          className="wrapper"
          onClick={handleOpen}
          aria-expanded={opened}
          aria-haspopup="listbox"
          aria-label="Filter posts by category"
        >
          <span className="currentLabel">
            {currentCategoryDisplay.emoji && <span className="emoji">{currentCategoryDisplay.emoji}</span>}
            <span>{currentCategoryDisplay.label || currentCategory}</span>
          </span>
          <MdExpandMore />
        </button>
      </div>
      {opened && (
        <div className="content" role="listbox">
          {Object.keys(data).map((key) => {
            const parsed = splitCategoryDisplay(key)

            return (
              <button
                type="button"
                className="item"
                key={key}
                role="option"
                aria-selected={key === currentCategory}
                onClick={() => handleOptionClick(key)}
              >
                {`${parsed.value || key} (${data[key]})`}
              </button>
            )
          })}
        </div>
      )}
    </StyledWrapper>
  )
}

export default CategorySelect

const StyledWrapper = styled.div`
  position: relative;
  > .wrapper {
    display: flex;
    gap: 0.25rem;
    align-items: center;
    justify-content: space-between;
    min-height: 42px;
    padding: 0 0.9rem;
    border-radius: 999px;
    border: 1px solid ${({ theme }) => theme.colors.gray7};
    background: ${({ theme }) => theme.colors.gray2};
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.95rem;
    line-height: 1.35;
    font-weight: 700;
    cursor: pointer;

    .currentLabel {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      min-width: 0;
    }

    .emoji {
      flex: 0 0 auto;
    }
  }
  > .content {
    position: absolute;
    z-index: 40;
    min-width: 14rem;
    max-height: min(18rem, calc(100vh - 9rem));
    overflow-y: auto;
    padding: 0.25rem;
    border-radius: 0.75rem;
    background-color: ${({ theme }) => theme.colors.gray2};
    color: ${({ theme }) => theme.colors.gray10};
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1),
      0 2px 4px -1px rgba(0, 0, 0, 0.06);
    > .item {
      display: block;
      width: 100%;
      text-align: left;
      padding: 0.25rem;
      padding-left: 0.5rem;
      padding-right: 0.5rem;
      border-radius: 0.75rem;
      font-size: 0.875rem;
      line-height: 1.25rem;
      white-space: nowrap;
      cursor: pointer;

      :hover {
        background-color: ${({ theme }) => theme.colors.gray4};
      }
    }
  }
`
