import styled from "@emotion/styled"
import { useRouter } from "next/router"
import React, { useMemo } from "react"
import { useTagsQuery } from "src/hooks/useTagsQuery"
import { replaceShallowRoutePreservingScroll } from "src/libs/router"

type Props = {}

const TagList: React.FC<Props> = () => {
  const router = useRouter()
  const currentTag =
    typeof router.query.tag === "string" ? router.query.tag : undefined
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
  const isDenseTagList = tagEntries.length >= 30

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
      <section className="desktopPanel" aria-label="태그 목록" data-dense={isDenseTagList}>
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
              <span className="count">({totalCount})</span>
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
          <span className="count">({totalCount})</span>
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
    padding: 0.42rem 0.35rem 0.62rem;
    border-radius: 18px;
    border: 1px solid ${({ theme }) => theme.colors.gray5};
    background: ${({ theme }) => theme.colors.gray1};
    container-type: inline-size;

    @media (min-width: 1024px) {
      display: block;
    }
  }

  .panelTitle {
    margin: 0;
    padding: 0.42rem 0.5rem 0.36rem;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: clamp(1rem, 0.6vw + 0.8rem, 1.12rem);
    font-weight: 800;
    letter-spacing: -0.02em;
    line-height: 1.2;
  }

  .divider {
    height: 1px;
    margin: 0 0.5rem 0.34rem;
    background: ${({ theme }) => theme.colors.gray6};
  }

  .desktopList {
    list-style: none;
    margin: 0;
    padding: 0 0.08rem 0 0;
    display: grid;
    gap: 0.08rem;
    max-height: clamp(360px, calc(100vh - 190px), 76vh);
    overflow-y: auto;
    overflow-x: hidden;
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
    min-width: 0;
    border: 0;
    background: transparent;
    border-radius: 9px;
    padding: 0.36rem 0.5rem;
    cursor: pointer;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.44rem;
    align-items: center;
    text-align: left;
    color: ${({ theme }) => theme.colors.gray11};
    transition: color 120ms ease;

    &:hover {
      color: ${({ theme }) => theme.colors.gray12};
    }

    &:focus-visible {
      outline: 2px solid ${({ theme }) => theme.colors.blue8};
      outline-offset: 1px;
    }
  }

  .desktopList button[data-active="true"] {
    font-weight: 700;
  }

  .desktopList button .name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 0.97rem;
    line-height: 1.33;
    font-weight: 620;
    color: ${({ theme }) => theme.colors.gray12};
  }

  .desktopList button[data-active="true"] .name {
    color: ${({ theme }) => theme.colors.green11};
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 0.18em;
  }

  .desktopList button .count {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.92rem;
    line-height: 1.2;
    font-variant-numeric: tabular-nums;
  }

  .desktopList button[data-active="true"] .count {
    color: ${({ theme }) => theme.colors.green10};
  }

  @container (max-width: 235px) {
    .panelTitle {
      padding: 0.36rem 0.42rem 0.32rem;
      font-size: 0.98rem;
      letter-spacing: -0.015em;
    }

    .divider {
      margin: 0 0.42rem 0.3rem;
    }

    .desktopList button {
      padding: 0.32rem 0.4rem;
      gap: 0.38rem;
    }

    .desktopList button .name {
      font-size: 0.92rem;
    }

    .desktopList button .count {
      font-size: 0.84rem;
    }
  }

  .desktopPanel[data-dense="true"] .panelTitle {
    font-size: clamp(0.96rem, 0.45vw + 0.78rem, 1.05rem);
    padding: 0.34rem 0.46rem 0.28rem;
  }

  .desktopPanel[data-dense="true"] .divider {
    margin: 0 0.46rem 0.26rem;
  }

  .desktopPanel[data-dense="true"] .desktopList {
    gap: 0.04rem;
    max-height: clamp(440px, calc(100vh - 160px), 80vh);
  }

  .desktopPanel[data-dense="true"] .desktopList button {
    border-radius: 8px;
    padding: 0.28rem 0.44rem;
    gap: 0.34rem;
  }

  .desktopPanel[data-dense="true"] .desktopList button .name {
    font-size: 0.9rem;
    line-height: 1.26;
    font-weight: 600;
  }

  .desktopPanel[data-dense="true"] .desktopList button .count {
    font-size: 0.82rem;
    line-height: 1.15;
  }

  .mobileRail {
    display: flex;
    margin-bottom: 1rem;
    gap: 0.35rem;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: thin;
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
    border-radius: 999px;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.colors.gray2};
    padding: 0.33rem 0.8rem;
    color: ${({ theme }) => theme.colors.gray11};
    flex-shrink: 0;
    cursor: pointer;

    &:hover {
      background: ${({ theme }) => theme.colors.gray4};
    }

    &[data-active="true"] {
      border-color: ${({ theme }) => theme.colors.green8};
      background: ${({ theme }) => theme.colors.gray3};
      color: ${({ theme }) => theme.colors.green11};
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
    color: ${({ theme }) => theme.colors.green10};
  }

  @media (max-width: 768px) {
    .mobileRail {
      margin-bottom: 0.8rem;
    }
  }
`
