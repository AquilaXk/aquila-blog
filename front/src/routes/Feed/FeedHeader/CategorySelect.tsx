import useDropdown from "src/hooks/useDropdown"
import { useRouter } from "next/router"
import React from "react"
import { MdExpandMore } from "react-icons/md"
import { DEFAULT_CATEGORY } from "src/constants"
import styled from "@emotion/styled"
import { useCategoriesQuery } from "src/hooks/useCategoriesQuery"

type Props = {}

const CategorySelect: React.FC<Props> = () => {
  const router = useRouter()
  const data = useCategoriesQuery()
  const [dropdownRef, opened, handleOpen] = useDropdown()

  const currentCategory =
    typeof router.query.category === "string"
      ? router.query.category
      : DEFAULT_CATEGORY

  const handleOptionClick = (category: string) => {
    router.push({
      query: {
        ...router.query,
        category,
      },
    }, undefined, { shallow: true, scroll: false })
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
          {currentCategory} Posts <MdExpandMore />
        </button>
      </div>
      {opened && (
        <div className="content" role="listbox">
          {Object.keys(data).map((key) => (
            <button
              type="button"
              className="item"
              key={key}
              role="option"
              aria-selected={key === currentCategory}
              onClick={() => handleOptionClick(key)}
            >
              {`${key} (${data[key]})`}
            </button>
          ))}
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
    margin-top: 0.5rem;
    margin-bottom: 0.5rem;
    gap: 0.25rem;
    align-items: center;
    font-size: 1.25rem;
    line-height: 1.75rem;
    font-weight: 700;
    cursor: pointer;
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
