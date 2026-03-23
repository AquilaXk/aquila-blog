import styled from "@emotion/styled"
import { FEED_CHIP_GAP_PX } from "@shared/ui-tokens"
import { useRouter } from "next/router"
import React, { memo, startTransition, useCallback } from "react"
import { usePostsTotalCountQuery } from "src/hooks/usePostsTotalCountQuery"
import { useTagsQuery } from "src/hooks/useTagsQuery"
import { replaceShallowRoutePreservingScroll } from "src/libs/router"

type Props = {}

const TagList: React.FC<Props> = () => {
  const router = useRouter()
  const currentTag =
    typeof router.query.tag === "string" ? router.query.tag : undefined
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

  return (
    <StyledWrapper>
      <section className="desktopPanel" aria-label="태그 목록">
        <h2 className="panelTitle">태그 목록</h2>
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
          {tagEntries.map(([key, count]) => (
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
      </section>

      <div className="chipRail" role="group" aria-label="태그 선택">
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
        {tagEntries.map(([key, count]) => (
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

    @media (min-width: 1520px) {
      display: block;
    }
  }

  .panelTitle {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 1rem;
    font-weight: 700;
    letter-spacing: -0.01em;
    line-height: 1.5;
    padding: 0 0 0.5rem;
    border-bottom: 1px solid ${({ theme }) => theme.colors.gray5};
  }

  .desktopList {
    list-style: none;
    margin: 1rem 0 0;
    padding: 0;
    display: grid;
    gap: 0.25rem;
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
    padding: 0.125rem 0.25rem;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: ${FEED_CHIP_GAP_PX}px;
    text-align: left;
    color: ${({ theme }) => theme.colors.gray11};
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
      outline: 2px solid ${({ theme }) => theme.colors.blue8};
      outline-offset: 1px;
    }

    &[data-active="true"] {
      background: transparent;
    }
  }

  .desktopList button .name {
    font-size: 0.875rem;
    font-weight: 620;
    color: ${({ theme }) => theme.colors.gray12};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .desktopList button[data-active="true"] .name {
    color: ${({ theme }) => theme.colors.blue11};
    font-weight: 700;
    text-decoration: none;
  }

  .desktopList button .count {
    font-size: 0.75rem;
    color: ${({ theme }) => theme.colors.gray10};
    font-variant-numeric: tabular-nums;
  }

  .desktopList button[data-active="true"] .count {
    color: ${({ theme }) => theme.colors.blue10};
  }

  .chipRail {
    display: flex;
    flex-wrap: nowrap;
    justify-content: flex-start;
    align-items: center;
    align-content: flex-start;
    margin-bottom: 0;
    gap: 0.35rem;
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

    @media (min-width: 1520px) {
      display: none;
    }
  }

  .chipRail button {
    display: inline-flex;
    align-items: center;
    gap: 0.28rem;
    text-align: left;
    white-space: nowrap;
    min-height: 34px;
    border-radius: 999px;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.colors.gray1};
    padding: 0.4rem 0.84rem;
    color: ${({ theme }) => theme.colors.gray11};
    flex-shrink: 0;
    scroll-snap-align: start;
    cursor: pointer;
    transition: all 0.125s ease-in;

    &:hover {
      border-color: ${({ theme }) => theme.colors.gray7};
      background: ${({ theme }) => theme.colors.gray2};
    }

    &[data-active="true"] {
      border-color: ${({ theme }) => theme.colors.blue8};
      background: ${({ theme }) => theme.colors.gray2};
      color: ${({ theme }) => theme.colors.blue11};
    }

    &:focus-visible {
      outline: 2px solid ${({ theme }) => theme.colors.blue8};
      outline-offset: 1px;
    }
  }

  .chipRail button .name {
    font-size: 0.75rem;
    font-weight: 650;
  }

  .chipRail button .count {
    font-size: 0.75rem;
    color: ${({ theme }) => theme.colors.gray10};
  }

  .chipRail button[data-active="true"] .count {
    color: ${({ theme }) => theme.colors.blue10};
  }

  @media (max-width: 768px) {
    .chipRail {
      margin-bottom: 0;
    }
  }

  @media (min-width: 769px) and (max-width: 1200px) {
    .chipRail button {
      min-height: 34px;
      padding: 0.32rem 0.82rem;
      border-radius: 999px;
    }
  }
`
