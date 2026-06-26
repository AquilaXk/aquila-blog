import styled from "@emotion/styled"
import { useRouter } from "next/router"
import React, { memo, startTransition, useCallback, useMemo, useState } from "react"
import { usePostsTotalCountQuery } from "src/hooks/usePostsTotalCountQuery"
import { useTagsQuery } from "src/hooks/useTagsQuery"
import { replaceShallowRoutePreservingScroll } from "src/libs/router"
import {
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
    <StyledWrapper id="topics">
      <section
        className="desktopPanel"
        aria-label="태그 목록"
      >
        <h2 className="panelTitle">
          <span>Topics</span>
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
              <span className="name">전체</span>
              {typeof allCount === "number" && <span className="count">{allCount}</span>}
            </button>
          </li>
          {desktopTagEntries.map(([key, count]) => (
            <li key={key}>
              <button
                type="button"
                data-tag={key}
                data-active={key === currentTag}
                aria-pressed={key === currentTag}
                onClick={handleClickTagButton}
              >
                <span className="name">{key}</span>
                <span className="count">{String(count).padStart(2, "0")}</span>
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
        data-ui="feed-tag-chip-rail"
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
  --feed-tag-border: var(--aq-border);
  --feed-tag-border-strong: var(--aq-accent);
  --feed-tag-hover-border: var(--aq-subtle);
  --feed-tag-surface: var(--aq-surface);
  --feed-tag-surface-elevated: var(--aq-surface-elevated);
  --feed-tag-accent: var(--aq-accent);
  --feed-tag-accent-text: var(--aq-accent);
  --feed-tag-accent-muted: var(--aq-accent-muted);

  .desktopPanel {
    display: none;
    min-width: 0;
    position: sticky;
    top: calc(var(--app-header-height, 56px) + 1.2rem);
    max-height: calc(100vh - var(--app-header-height, 56px) - 1.8rem);
    max-height: calc(100dvh - var(--app-header-height, 56px) - 1.8rem);
    overflow: hidden;
  }

  .panelTitle {
    margin: 0;
    color: var(--aq-text);
    font-size: 0.82rem;
    font-weight: 820;
    letter-spacing: 0;
    line-height: 1.5;
    padding: 0;
    display: inline-flex;
    align-items: center;
    gap: 0.44rem;
  }

  .panelEmoji {
    display: none;
  }

  .desktopList {
    list-style: none;
    margin: 18px 0 0;
    padding: 0;
    display: grid;
    gap: 0;
    border-top: 1px solid var(--aq-text);
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
    border-radius: 0;
    background: transparent;
    padding: 12px 0;
    border-bottom: 1px solid var(--feed-tag-border);
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: baseline;
    gap: 16px;
    text-align: left;
    color: var(--aq-subtle);
    cursor: pointer;
    transition: color 0.125s ease-in;

    &:hover {
      background: transparent;
      color: var(--aq-text);
    }

    &:focus-visible {
      outline: 2px solid var(--feed-tag-border-strong);
      outline-offset: 1px;
    }

    &[data-active="true"] {
      background: transparent;
      color: var(--aq-text);
    }
  }

  .toggleButton {
    margin-top: 0.72rem;
    min-height: 30px;
    border: 0;
    background: transparent;
    color: var(--aq-muted);
    font-size: 0.76rem;
    font-weight: 700;
    letter-spacing: -0.01em;
    transition: color 0.125s ease-in;

    &:hover {
      color: var(--aq-text);
    }

    &:focus-visible {
      outline: 2px solid var(--feed-tag-border-strong);
      outline-offset: 2px;
      border-radius: 999px;
    }
  }

  .desktopList button .name {
    min-width: 0;
    font-size: 0.8rem;
    font-weight: 610;
    color: inherit;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .desktopList button[data-active="true"] .name {
    color: inherit;
    font-weight: 800;
    text-decoration: none;
  }

  .desktopList button:hover .name {
    color: var(--aq-text);
    font-weight: 800;
  }

  .desktopList button .count {
    font-size: 0.72rem;
    color: var(--aq-subtle);
    font-variant-numeric: tabular-nums;
  }

  .desktopList button:hover .count,
  .desktopList button[data-active="true"] .count {
    color: var(--aq-text);
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

  }

  @media (min-width: ${FEED_TAG_RAIL_DESKTOP_MIN_PX}px) {
    .desktopPanel {
      display: block;
    }

    .chipRail {
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
    color: var(--aq-subtle);
    flex-shrink: 0;
    scroll-snap-align: start;
    cursor: pointer;
    transition: color 0.125s ease-in;

    &::after {
      content: "";
      position: absolute;
      inset: 5px 0;
      border-radius: 999px;
      border: 1px solid var(--feed-tag-border);
      background: var(--feed-tag-surface);
      transition: all 0.125s ease-in;
      z-index: 0;
      pointer-events: none;
    }

    &:hover {
      color: var(--aq-text);
      font-weight: 760;

      &::after {
        border-color: var(--feed-tag-hover-border);
        background: var(--feed-tag-surface-elevated);
      }
    }

    &[data-active="true"] {
      color: var(--feed-tag-accent-text);

      &::after {
        border-color: var(--feed-tag-border-strong);
        background: var(--feed-tag-accent-muted);
      }
    }

    &:focus-visible {
      outline: 2px solid var(--feed-tag-border-strong);
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
    color: var(--aq-muted);
  }

  .chipRail button[data-active="true"] .count {
    color: var(--feed-tag-accent-text);
  }

  .chipRail .chipToggle {
    flex: 0 0 auto;
  }

  @media (max-width: 768px) {
    .chipRail {
      flex-wrap: wrap;
      margin-bottom: 0;
      overflow-x: visible;
      overflow-y: visible;
      padding-bottom: 0;
      scroll-snap-type: none;
    }
  }

  @media (min-width: 769px) and (max-width: ${FEED_TAG_RAIL_CHIP_MAX_PX}px) {
    .chipRail {
      justify-content: center;
    }

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
