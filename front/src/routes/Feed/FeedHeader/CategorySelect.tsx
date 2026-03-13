import useDropdown from "src/hooks/useDropdown"
import { useRouter } from "next/router"
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import CategoryIcon from "src/components/CategoryIcon"
import { DEFAULT_CATEGORY } from "src/constants"
import styled from "@emotion/styled"
import { useCategoriesQuery } from "src/hooks/useCategoriesQuery"
import { compareCategoryValues, normalizeCategoryValue, splitCategoryDisplay } from "src/libs/utils"
import { replaceShallowRoutePreservingScroll } from "src/libs/router"
import AppIcon from "src/components/icons/AppIcon"
import { createPortal } from "react-dom"

type Props = {}

const CategorySelect: React.FC<Props> = () => {
  const router = useRouter()
  const data = useCategoriesQuery()
  const [dropdownRef, opened, handleOpen] = useDropdown()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties | null>(null)

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

  const updatePanelStyle = useCallback(() => {
    if (!triggerRef.current || typeof window === "undefined") return

    const rect = triggerRef.current.getBoundingClientRect()
    const viewportPadding = 16
    const gap = 8
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const maxWidth = Math.min(384, viewportWidth - viewportPadding * 2)
    const width = Math.min(Math.max(rect.width, 288), maxWidth)
    const availableBelow = viewportHeight - rect.bottom - gap - viewportPadding
    const availableAbove = rect.top - gap - viewportPadding
    const openAbove = availableBelow < 220 && availableAbove > availableBelow
    const maxHeight = Math.max(
      160,
      Math.min(320, openAbove ? availableAbove : availableBelow)
    )
    const left = Math.min(
      Math.max(viewportPadding, rect.left),
      viewportWidth - width - viewportPadding
    )

    setPanelStyle({
      position: "fixed",
      top: openAbove ? undefined : rect.bottom + gap,
      bottom: openAbove ? viewportHeight - rect.top + gap : undefined,
      left,
      width,
      maxHeight,
    })
  }, [])

  useEffect(() => {
    if (!opened) {
      setPanelStyle(null)
      return
    }

    updatePanelStyle()
    window.addEventListener("resize", updatePanelStyle)
    window.addEventListener("scroll", updatePanelStyle, true)

    return () => {
      window.removeEventListener("resize", updatePanelStyle)
      window.removeEventListener("scroll", updatePanelStyle, true)
    }
  }, [opened, updatePanelStyle])

  return (
    <StyledWrapper ref={dropdownRef}>
      <button
        type="button"
        ref={triggerRef}
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
        <AppIcon name="chevron-down" className="chevron" />
      </button>
      {opened &&
        panelStyle &&
        typeof document !== "undefined" &&
        createPortal(
          <DropdownPanel style={panelStyle} role="listbox">
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
          </DropdownPanel>,
          document.body
        )}
    </StyledWrapper>
  )
}

export default CategorySelect

const StyledWrapper = styled.div`
  position: relative;
  display: grid;
  gap: 0.45rem;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;

  > .wrapper {
    display: flex;
    gap: 0.4rem;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    max-width: 100%;
    min-height: 48px;
    padding: 0 1rem;
    box-sizing: border-box;
    border-radius: 999px;
    border: 1px solid ${({ theme }) => theme.colors.gray7};
    background: ${({ theme }) => theme.colors.gray2};
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.98rem;
    line-height: 1.35;
    font-weight: 700;
    cursor: pointer;
    outline: none;
    transition:
      border-color 0.18s ease,
      background-color 0.18s ease,
      color 0.18s ease;

    &:focus-visible {
      border-color: ${({ theme }) => theme.colors.blue8};
      box-shadow: inset 0 0 0 1px ${({ theme }) => theme.colors.blue8};
    }

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

  @media (max-width: 560px) {
    width: 100%;
    max-width: none;

    > .wrapper {
      min-height: 46px;
    }
  }
`

const DropdownPanel = styled.div`
  z-index: 40;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-gutter: stable;
  padding: 0.3rem;
  box-sizing: border-box;
  border-radius: 0.9rem;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background-color: ${({ theme }) => theme.colors.gray2};
  color: ${({ theme }) => theme.colors.gray10};
  box-shadow: 0 18px 38px rgba(0, 0, 0, 0.28);

  > .item {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    gap: 0.7rem;
    width: 100%;
    text-align: left;
    padding: 0.62rem 0.78rem;
    box-sizing: border-box;
    border-radius: 0.75rem;
    font-size: 0.9rem;
    line-height: 1.35rem;
    cursor: pointer;

    :hover,
    :focus-visible {
      background-color: ${({ theme }) => theme.colors.gray4};
      outline: none;
    }

    .itemLabel {
      display: inline-flex;
      align-items: flex-start;
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
      margin-top: 0.05rem;
    }

    .labelText {
      min-width: 0;
      white-space: normal;
      overflow-wrap: anywhere;
    }

    .count {
      flex: 0 0 auto;
      padding-left: 0.35rem;
      color: ${({ theme }) => theme.colors.gray10};
      text-align: right;
      white-space: nowrap;
      align-self: start;
    }
  }
`
