import useDropdown from "src/hooks/useDropdown"
import { useRouter } from "next/router"
import React, { useMemo } from "react"
import { MdExpandMore } from "react-icons/md"
import CategoryIcon from "src/components/CategoryIcon"
import { DEFAULT_CATEGORY } from "src/constants"
import styled from "@emotion/styled"
import { useCategoriesQuery } from "src/hooks/useCategoriesQuery"
import { compareCategoryValues, normalizeCategoryValue, splitCategoryDisplay } from "src/libs/utils"
import { replaceShallowRoutePreservingScroll } from "src/libs/router"

type Props = {}

const CategorySelect: React.FC<Props> = () => {
  const router = useRouter()
  const data = useCategoriesQuery()
  const [dropdownRef, opened, handleOpen] = useDropdown()

  const currentCategory =
    typeof router.query.category === "string"
      ? normalizeCategoryValue(router.query.category)
      : DEFAULT_CATEGORY
  const currentCategoryDisplay = splitCategoryDisplay(currentCategory)
  const categoryEntries = useMemo(
    () =>
      Object.entries(data).sort(([left], [right]) => {
        if (left === DEFAULT_CATEGORY) return -1
        if (right === DEFAULT_CATEGORY) return 1
        return compareCategoryValues(left, right)
      }),
    [data]
  )

  const handleOptionClick = (category: string) => {
    const normalizedCategory = normalizeCategoryValue(category)

    replaceShallowRoutePreservingScroll(router, {
      pathname: "/",
      query: {
        ...router.query,
        category: normalizedCategory === DEFAULT_CATEGORY ? undefined : normalizedCategory,
      },
    })
  }

  return (
    <StyledWrapper ref={dropdownRef}>
      <button
        type="button"
        className="wrapper"
        onClick={handleOpen}
        aria-expanded={opened}
        aria-haspopup="listbox"
        aria-label="Filter posts by category"
      >
        <span className="currentLabel">
          <CategoryIcon iconId={currentCategoryDisplay.iconId} className="categoryIcon" />
          <span className="labelText">
            {currentCategoryDisplay.label || currentCategory}
          </span>
        </span>
        <MdExpandMore className="chevron" />
      </button>
      {opened && (
        <div className="content" role="listbox">
          {categoryEntries.map(([key, count]) => {
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
                <span className="itemLabel">
                  <CategoryIcon iconId={parsed.iconId} className="categoryIcon" />
                  <span className="labelText">{parsed.label || key}</span>
                </span>
                <span className="count">({count})</span>
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
  width: 100%;
  min-width: 0;

  > .wrapper {
    display: flex;
    gap: 0.4rem;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    max-width: 100%;
    min-height: 48px;
    padding: 0 1rem;
    border-radius: 999px;
    border: 1px solid ${({ theme }) => theme.colors.gray7};
    background: ${({ theme }) => theme.colors.gray2};
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.98rem;
    line-height: 1.35;
    font-weight: 700;
    cursor: pointer;
    transition:
      border-color 0.18s ease,
      background-color 0.18s ease,
      color 0.18s ease;

    .currentLabel {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      min-width: 0;
      overflow: hidden;
    }

    .categoryIcon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 auto;
      margin-right: 0.04rem;
      font-size: 0.95rem;
      color: ${({ theme }) => theme.colors.gray11};
    }

    .labelText {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .chevron {
      flex: 0 0 auto;
      font-size: 1.1rem;
    }
  }
  > .content {
    position: absolute;
    top: calc(100% + 0.35rem);
    left: 0;
    z-index: 40;
    width: max-content;
    min-width: 100%;
    max-width: min(20rem, calc(100vw - 2rem));
    max-height: min(18rem, calc(100vh - 9rem));
    overflow-y: auto;
    scrollbar-gutter: stable both-edges;
    padding: 0.25rem;
    border-radius: 0.75rem;
    background-color: ${({ theme }) => theme.colors.gray2};
    color: ${({ theme }) => theme.colors.gray10};
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1),
      0 2px 4px -1px rgba(0, 0, 0, 0.06);
    > .item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.6rem;
      width: 100%;
      text-align: left;
      padding: 0.45rem 0.55rem;
      border-radius: 0.75rem;
      font-size: 0.875rem;
      line-height: 1.25rem;
      white-space: nowrap;
      cursor: pointer;

      :hover {
        background-color: ${({ theme }) => theme.colors.gray4};
      }

      .itemLabel {
        display: inline-flex;
        align-items: center;
        gap: 0.45rem;
        min-width: 0;
      }

      .categoryIcon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
        font-size: 0.95rem;
        color: ${({ theme }) => theme.colors.gray11};
      }

      .labelText {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .count {
        margin-left: auto;
        flex: 0 0 auto;
        color: ${({ theme }) => theme.colors.gray10};
      }
    }
  }

  @media (max-width: 560px) {
    width: 100%;
    max-width: none;

    > .wrapper {
      min-height: 46px;
    }

    > .content {
      width: 100%;
      min-width: 0;
      max-width: 100%;
    }
  }
`
