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
        <div className="divider" />
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

      <div className="mobileRail" role="group" aria-label="태그 선택">
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
    padding: 0.05rem 0 0;
    container-type: inline-size;

    @media (min-width: 1024px) {
      display: block;
    }
  }

  .panelTitle {
    margin: 0;
    padding: 0.2rem 0 0.56rem;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: clamp(1.25rem, 0.58vw + 1.02rem, 1.48rem);
    font-weight: 750;
    letter-spacing: -0.02em;
    line-height: 1.2;
  }

  .divider {
    height: 1px;
    margin: 0 0 0.48rem;
    background: ${({ theme }) => theme.colors.gray6};
  }

  .desktopList {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.18rem;
    max-height: clamp(360px, calc(100vh - 190px), 76vh);
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-gutter: stable both-edges;
    scrollbar-width: thin;

    &::-webkit-scrollbar {
      width: 6px;
    }

    &::-webkit-scrollbar-track {
      background: transparent;
    }

    &::-webkit-scrollbar-thumb {
      border-radius: 999px;
      background: ${({ theme }) => theme.colors.gray6};
    }

    li {
      min-width: 0;
    }
  }

  .desktopList button {
    width: 100%;
    min-height: 34px;
    min-width: 0;
    border: 0;
    background: transparent;
    border-radius: 8px;
    padding: 0.18rem 0.42rem;
    cursor: pointer;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.4rem;
    align-items: center;
    text-align: left;
    color: ${({ theme }) => theme.colors.gray11};
    transition: color 120ms ease, opacity 120ms ease;

    &:hover {
      color: ${({ theme }) => theme.colors.gray12};
      opacity: 1;
      background: ${({ theme }) => theme.colors.gray2};
    }

    &:focus-visible {
      outline: 2px solid ${({ theme }) => theme.colors.blue8};
      outline-offset: 1px;
    }
  }

  .desktopList button[data-active="true"] {
    font-weight: 760;
    background: ${({ theme }) => theme.colors.gray2};
  }

  .desktopList button .name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 1.02rem;
    line-height: 1.33;
    font-weight: 610;
    color: ${({ theme }) => theme.colors.gray12};
  }

  .desktopList button[data-active="true"] .name {
    color: ${({ theme }) => theme.colors.blue11};
  }

  .desktopList button .count {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.92rem;
    line-height: 1.2;
    font-variant-numeric: tabular-nums;
  }

  .desktopList button[data-active="true"] .count {
    color: ${({ theme }) => theme.colors.blue10};
  }

  @container (max-width: 235px) {
    .panelTitle {
      padding: 0.15rem 0 0.46rem;
      font-size: 1.06rem;
      letter-spacing: -0.015em;
    }

    .divider {
      margin: 0 0 0.36rem;
    }

    .desktopList button {
      padding: 0.08rem 0;
      gap: 0.32rem;
    }

    .desktopList button .name {
      font-size: 0.93rem;
    }

    .desktopList button .count {
      font-size: 0.84rem;
    }
  }

  .mobileRail {
    display: flex;
    margin-bottom: 1rem;
    gap: 0.35rem;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: thin;
    min-height: 2.2rem;
    padding-bottom: 0.3rem;
    min-width: 0;

    @media (min-width: 1024px) {
      display: none;
    }
  }

  .mobileRail button {
    display: inline-flex;
    align-items: center;
    gap: 0.28rem;
    text-align: left;
    white-space: nowrap;
    min-height: 34px;
    border-radius: 999px;
    border: none;
    background: ${({ theme }) => theme.colors.gray1};
    padding: 0.42rem 0.84rem;
    color: ${({ theme }) => theme.colors.gray11};
    flex-shrink: 0;
    cursor: pointer;

    &:hover {
      background: ${({ theme }) => theme.colors.gray3};
    }

    &[data-active="true"] {
      border-color: ${({ theme }) => theme.colors.gray8};
      background: ${({ theme }) => theme.colors.gray3};
      color: ${({ theme }) => theme.colors.gray12};
    }
  }

  .mobileRail button .name {
    font-size: 0.84rem;
    font-weight: 650;
  }

  .mobileRail button .count {
    font-size: 0.78rem;
    color: ${({ theme }) => theme.colors.gray10};
  }

  .mobileRail button[data-active="true"] .count {
    color: ${({ theme }) => theme.colors.gray10};
  }

  @media (max-width: 768px) {
    .mobileRail {
      margin-bottom: 0.8rem;
    }
  }
`
