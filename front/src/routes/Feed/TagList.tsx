import styled from "@emotion/styled"
import { useRouter } from "next/router"
import React, { memo, startTransition, useCallback, useMemo, useState } from "react"
import { usePostsTotalCountQuery } from "src/hooks/usePostsTotalCountQuery"
import { useTagsQuery } from "src/hooks/useTagsQuery"
import { replaceShallowRoutePreservingScroll } from "src/libs/router"
import {
  FEED_CHIP_GAP_PX,
  FEED_TAG_RAIL_CHIP_MAX_PX,
  FEED_TAG_RAIL_DESKTOP_MIN_PX,
  FEED_TAG_REPRESENTATIVE_CHIP_LIMIT,
  FEED_TAG_REPRESENTATIVE_DESKTOP_LIMIT,
} from "./feedUiTokens"

type TagEntry = [string, number]

const toRepresentativeTagEntries = (
  tagEntries: TagEntry[],
  currentTag: string | undefined,
  limit: number,
  expanded: boolean
) => {
  if (expanded || tagEntries.length <= limit) return tagEntries
  if (limit <= 0) return []

  const leadingEntries = tagEntries.slice(0, limit)
  if (!currentTag) return leadingEntries

  const currentEntry = tagEntries.find(([tag]) => tag === currentTag)
  if (!currentEntry) return leadingEntries
  if (leadingEntries.some(([tag]) => tag === currentTag)) return leadingEntries
  if (limit === 1) return [currentEntry]

  return [...leadingEntries.slice(0, limit - 1), currentEntry]
}

const TagList: React.FC = () => {
  const router = useRouter()
  const currentTag =
    typeof router.query.tag === "string" ? router.query.tag : undefined
  const [desktopExpanded, setDesktopExpanded] = useState(false)
  const [chipExpanded, setChipExpanded] = useState(false)
  const totalPostCount = usePostsTotalCountQuery()
  const { tagEntries } = useTagsQuery()
  const allCount = totalPostCount

  const navigateWithTag = useCallback((value?: string) => {
    const { category: _deprecatedCategory, ...restQuery } = router.query
    startTransition(() => {
      void replaceShallowRoutePreservingScroll(router, {
        pathname: "/",
        query: {
          ...restQuery,
          tag: value,
        },
      })
    })
  }, [router])

  const handleClickAll = useCallback(() => {
    if (!currentTag) return
    navigateWithTag(undefined)
  }, [currentTag, navigateWithTag])

  const handleClickTag = useCallback((value: string) => {
    if (currentTag === value) {
      navigateWithTag(undefined)
      return
    }
    navigateWithTag(value)
  }, [currentTag, navigateWithTag])

  const handleClickTagButton = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      const value = event.currentTarget.dataset.tag
      if (!value) return
      handleClickTag(value)
    },
    [handleClickTag]
  )

  const desktopTagEntries = useMemo(
    () =>
      toRepresentativeTagEntries(
        tagEntries,
        currentTag,
        FEED_TAG_REPRESENTATIVE_DESKTOP_LIMIT,
        desktopExpanded
      ),
    [currentTag, desktopExpanded, tagEntries]
  )
  const chipTagEntries = useMemo(
    () =>
      toRepresentativeTagEntries(
        tagEntries,
        currentTag,
        FEED_TAG_REPRESENTATIVE_CHIP_LIMIT,
        chipExpanded
      ),
    [chipExpanded, currentTag, tagEntries]
  )
  const hiddenDesktopTagCount = Math.max(tagEntries.length - desktopTagEntries.length, 0)
  const hiddenChipTagCount = Math.max(tagEntries.length - chipTagEntries.length, 0)

  return (
    <StyledWrapper>
      <section
        className="desktopPanel"
        aria-label="태그 목록"
      >
        <h2 className="panelTitle">
          <span className="panelEmoji" aria-hidden="true">🏷️</span>
          <span>태그 목록</span>
        </h2>
        <ul className="desktopList">
          <li>
            <button
              type="button"
              data-active={!currentTag}
              aria-pressed={!currentTag}
              aria-label="전체보기"
              onClick={handleClickAll}
            >
              <span className="name">전체보기</span>
              {typeof allCount === "number" && <span className="count">({allCount})</span>}
            </button>
          </li>
          {desktopTagEntries.map(([key, count]) => (
            <li key={key}>
              <button
                type="button"
                data-tag={key}
                data-active={key === currentTag}
                aria-pressed={key === currentTag}
                aria-label={`Filter by tag: ${key}`}
                onClick={handleClickTagButton}
              >
                <span className="name">{key}</span>
                <span className="count">({count})</span>
              </button>
            </li>
          ))}
        </ul>
        {hiddenDesktopTagCount > 0 && (
          <button
            type="button"
            className="toggleButton"
            aria-expanded={desktopExpanded}
            onClick={() => setDesktopExpanded((prev) => !prev)}
          >
            {desktopExpanded ? "접기" : `더보기 (+${hiddenDesktopTagCount})`}
          </button>
        )}
      </section>

      <div
        className="chipRail"
        role="group"
        aria-label="태그 선택"
      >
        <button
          type="button"
          data-active={!currentTag}
          aria-pressed={!currentTag}
          aria-label="전체보기"
          onClick={handleClickAll}
        >
          <span className="name">전체</span>
          {typeof allCount === "number" && <span className="count">({allCount})</span>}
        </button>
        {chipTagEntries.map(([key, count]) => (
          <button
            type="button"
            key={key}
            data-tag={key}
            data-active={key === currentTag}
            aria-pressed={key === currentTag}
            aria-label={`Filter by tag: ${key}`}
            onClick={handleClickTagButton}
          >
            <span className="name">{key}</span>
            <span className="count">({count})</span>
          </button>
        ))}
        {hiddenChipTagCount > 0 && (
          <button
            type="button"
            className="chipToggle"
            aria-expanded={chipExpanded}
            onClick={() => setChipExpanded((prev) => !prev)}
          >
            <span className="name">{chipExpanded ? "접기" : "더보기"}</span>
            {!chipExpanded && <span className="count">(+{hiddenChipTagCount})</span>}
          </button>
        )}
      </div>
    </StyledWrapper>
  )
}

export default memo(TagList)

const StyledWrapper = styled.div`
  min-width: 0;

  .desktopPanel {
    display: none;
    min-width: 0;
    position: sticky;
    top: calc(var(--app-header-height, 56px) + 1.2rem);
    max-height: calc(100vh - var(--app-header-height, 56px) - 1.8rem);
    max-height: calc(100dvh - var(--app-header-height, 56px) - 1.8rem);
    overflow: hidden;

    @media (min-width: ${FEED_TAG_RAIL_DESKTOP_MIN_PX}px) {
      display: block;
    }
  }

  .panelTitle {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.9rem;
    font-weight: 740;
    letter-spacing: -0.01em;
    line-height: 1.5;
    padding: 0 0 0.42rem;
    border-bottom: 1px solid ${({ theme }) => theme.colors.gray5};
    display: inline-flex;
    align-items: center;
    gap: 0.44rem;
  }

  .panelEmoji {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 1.02rem;
    line-height: 1;
    transform: rotate(-28deg) translateY(-0.02rem);
    transform-origin: 48% 56%;
  }

  .desktopList {
    list-style: none;
    margin: 0.88rem 0 0;
    padding: 0;
    display: grid;
    gap: 0.18rem;
    max-height: calc(100vh - var(--app-header-height, 56px) - 6.35rem);
    max-height: calc(100dvh - var(--app-header-height, 56px) - 6.35rem);
    overflow-y: auto;
    scrollbar-width: none;
    -ms-overflow-style: none;

    &::-webkit-scrollbar {
      display: none;
      width: 0;
      height: 0;
    }
  }

  .desktopList li {
    min-width: 0;
  }

  .desktopList button {
    width: 100%;
    min-height: 0;
    border: 0;
    border-radius: 4px;
    background: transparent;
    padding: 0.12rem 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: ${FEED_CHIP_GAP_PX}px;
    text-align: left;
    color: ${({ theme }) => theme.colors.gray10};
    cursor: pointer;
    transition: all 0.125s ease-in;

    &:hover {
      background: transparent;
      color: ${({ theme }) => theme.colors.gray12};

      .name {
        text-decoration: underline;
        text-underline-offset: 2px;
      }
    }

    &:focus-visible {
      outline: 2px solid ${({ theme }) => theme.colors.accentBorder};
      outline-offset: 1px;
    }

    &[data-active="true"] {
      background: transparent;
    }
  }

  .toggleButton {
    margin-top: 0.72rem;
    min-height: 30px;
    border: 0;
    background: transparent;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.76rem;
    font-weight: 700;
    letter-spacing: -0.01em;
    transition: color 0.125s ease-in;

    &:hover {
      color: ${({ theme }) => theme.colors.gray12};
    }

    &:focus-visible {
      outline: 2px solid ${({ theme }) => theme.colors.accentBorder};
      outline-offset: 2px;
      border-radius: 999px;
    }
  }

  .desktopList button .name {
    font-size: 0.84rem;
    font-weight: 610;
    color: ${({ theme }) => theme.colors.gray10};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .desktopList button[data-active="true"] .name {
    color: ${({ theme }) => theme.colors.accentLink};
    font-weight: 700;
    text-decoration: none;
  }

  .desktopList button .count {
    font-size: 0.72rem;
    color: ${({ theme }) => theme.colors.gray8};
    font-variant-numeric: tabular-nums;
  }

  .desktopList button[data-active="true"] .count {
    color: ${({ theme }) => theme.colors.accentLink};
  }

  .chipRail {
    display: flex;
    width: 100%;
    max-width: 100%;
    flex-wrap: nowrap;
    justify-content: flex-start;
    align-items: center;
    align-content: flex-start;
    margin-bottom: 0;
    gap: 0.3rem;
    overflow-x: auto;
    overflow-y: hidden;
    scroll-snap-type: x proximity;
    scroll-padding-inline: 0.25rem;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
    -ms-overflow-style: none;
    min-height: 0;
    min-width: 0;

    padding-bottom: 0.28rem;

    &::-webkit-scrollbar {
      display: none;
      width: 0;
      height: 0;
    }

    @media (min-width: ${FEED_TAG_RAIL_DESKTOP_MIN_PX}px) {
      display: none;
    }
  }

  .chipRail button {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 0.24rem;
    text-align: left;
    white-space: nowrap;
    min-height: 34px;
    border-radius: 999px;
    border: 0;
    background: transparent;
    padding: 0.34rem 0.82rem;
    color: ${({ theme }) => theme.colors.gray11};
    flex-shrink: 0;
    scroll-snap-align: start;
    cursor: pointer;
    transition: color 0.125s ease-in;

    &::after {
      content: "";
      position: absolute;
      inset: 5px 0;
      border-radius: 999px;
      border: 1px solid ${({ theme }) => theme.colors.gray5};
      background: ${({ theme }) => theme.colors.gray1};
      transition: all 0.125s ease-in;
      z-index: 0;
      pointer-events: none;
    }

    &:hover {
      &::after {
        border-color: ${({ theme }) => theme.colors.gray7};
        background: ${({ theme }) => theme.colors.gray2};
      }
    }

    &[data-active="true"] {
      color: ${({ theme }) => theme.colors.accentLink};

      &::after {
        border-color: ${({ theme }) => theme.colors.accentBorder};
        background: ${({ theme }) => theme.colors.gray2};
      }
    }

    &:focus-visible {
      outline: 2px solid ${({ theme }) => theme.colors.accentBorder};
      outline-offset: 1px;
    }

    > * {
      position: relative;
      z-index: 1;
    }
  }

  .chipRail button .name {
    font-size: 0.73rem;
    font-weight: 650;
  }

  .chipRail button .count {
    font-size: 0.72rem;
    color: ${({ theme }) => theme.colors.gray8};
  }

  .chipRail button[data-active="true"] .count {
    color: ${({ theme }) => theme.colors.accentLink};
  }

  .chipRail .chipToggle {
    flex: 0 0 auto;
  }

  @media (max-width: 768px) {
    .chipRail {
      margin-bottom: 0;
    }
  }

  @media (min-width: 769px) and (max-width: ${FEED_TAG_RAIL_CHIP_MAX_PX}px) {
    .chipRail button {
      min-height: 34px;
      padding: 0.28rem 0.82rem;
      border-radius: 999px;

      &::after {
        inset: 6px 0;
      }
    }
  }
`
