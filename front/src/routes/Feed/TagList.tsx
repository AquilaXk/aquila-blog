import styled from "@emotion/styled"
import { useRouter } from "next/router"
import React, { useMemo } from "react"
import { usePostsTotalCountQuery } from "src/hooks/usePostsTotalCountQuery"
import { useTagsQuery } from "src/hooks/useTagsQuery"
import { replaceShallowRoutePreservingScroll } from "src/libs/router"

type Props = {}

const TagList: React.FC<Props> = () => {
  const router = useRouter()
  const currentTag =
    typeof router.query.tag === "string" ? router.query.tag : undefined
  const totalPostCount = usePostsTotalCountQuery()
  const data = useTagsQuery()
  const tagEntries = useMemo(
    () =>
      Object.entries(data).sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1]
        return a[0].localeCompare(b[0], "ko")
      }),
    [data]
  )
  const totalCount = useMemo(
    () => tagEntries.reduce((sum, [, count]) => sum + count, 0),
    [tagEntries]
  )
  const allCount = totalPostCount ?? totalCount

  const navigateWithTag = (value?: string) => {
    const { category: _deprecatedCategory, ...restQuery } = router.query
    replaceShallowRoutePreservingScroll(router, {
      pathname: "/",
      query: {
        ...restQuery,
        tag: value,
      },
    })
  }

  const handleClickAll = () => {
    if (!currentTag) return
    navigateWithTag(undefined)
  }

  const handleClickTag = (value: string) => {
    if (currentTag === value) {
      navigateWithTag(undefined)
      return
    }
    navigateWithTag(value)
  }

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
              <span className="count">({allCount})</span>
            </button>
          </li>
          {tagEntries.map(([key, count]) => (
            <li key={key}>
              <button
                type="button"
                data-active={key === currentTag}
                aria-pressed={key === currentTag}
                aria-label={`Filter by tag: ${key}`}
                onClick={() => handleClickTag(key)}
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
          <span className="count">({allCount})</span>
        </button>
        {tagEntries.map(([key, count]) => (
          <button
            type="button"
            key={key}
            data-active={key === currentTag}
            aria-pressed={key === currentTag}
            aria-label={`Filter by tag: ${key}`}
            onClick={() => handleClickTag(key)}
          >
            <span className="name">{key}</span>
            <span className="count">({count})</span>
          </button>
        ))}
      </div>
    </StyledWrapper>
  )
}

export default TagList

const StyledWrapper = styled.div`
  min-width: 0;

  .desktopPanel {
    display: none;
    min-width: 0;
    position: sticky;
    top: 5.2rem;
    max-height: calc(100vh - 6rem);
    max-height: calc(100dvh - 6rem);
    overflow: hidden;

    @media (min-width: 1201px) {
      display: block;
    }
  }

  .panelTitle {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 1.22rem;
    font-weight: 760;
    letter-spacing: -0.02em;
    line-height: 1.2;
    padding: 0.02rem 0 0.66rem;
    border-bottom: 1px solid ${({ theme }) => theme.colors.gray6};
  }

  .desktopList {
    list-style: none;
    margin: 0.56rem 0 0;
    padding: 0;
    display: grid;
    gap: 0.16rem;
    max-height: calc(100vh - 10.5rem);
    max-height: calc(100dvh - 10.5rem);
    overflow-y: auto;
    scrollbar-width: thin;

    &::-webkit-scrollbar {
      width: 6px;
    }

    &::-webkit-scrollbar-thumb {
      border-radius: 999px;
      background: ${({ theme }) => theme.colors.gray6};
    }
  }

  .desktopList li {
    min-width: 0;
  }

  .desktopList button {
    width: 100%;
    min-height: 34px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    padding: 0.2rem 0.36rem;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.35rem;
    text-align: left;
    color: ${({ theme }) => theme.colors.gray11};
    cursor: pointer;
    transition: background-color 0.14s ease, color 0.14s ease;

    &:hover {
      background: ${({ theme }) => theme.colors.gray2};
      color: ${({ theme }) => theme.colors.gray12};
    }

    &:focus-visible {
      outline: 2px solid ${({ theme }) => theme.colors.blue8};
      outline-offset: 1px;
    }

    &[data-active="true"] {
      background: ${({ theme }) => theme.colors.gray2};
    }
  }

  .desktopList button .name {
    font-size: 0.96rem;
    font-weight: 640;
    color: ${({ theme }) => theme.colors.gray12};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .desktopList button[data-active="true"] .name {
    color: ${({ theme }) => theme.colors.blue11};
    font-weight: 760;
  }

  .desktopList button .count {
    font-size: 0.86rem;
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
    scrollbar-width: thin;
    min-height: 0;
    min-width: 0;

    padding-bottom: 0.28rem;

    @media (min-width: 1201px) {
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
    cursor: pointer;
    transition: border-color 0.16s ease, background-color 0.16s ease, color 0.16s ease;

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
    font-size: 0.82rem;
    font-weight: 650;
  }

  .chipRail button .count {
    font-size: 0.78rem;
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
`
