import styled from "@emotion/styled"
import { useRouter } from "next/router"
import React from "react"
import { Emoji } from "src/components/Emoji"
import { useTagsQuery } from "src/hooks/useTagsQuery"

type Props = {}

const TagList: React.FC<Props> = () => {
  const router = useRouter()
  const currentTag =
    typeof router.query.tag === "string" ? router.query.tag : undefined
  const data = useTagsQuery()

  const handleClickTag = (value: string) => {
    // delete
    if (currentTag === value) {
      router.push({
        query: {
          ...router.query,
          tag: undefined,
        },
      }, undefined, { shallow: true, scroll: false })
    }
    // add
    else {
      router.push({
        query: {
          ...router.query,
          tag: value,
        },
      }, undefined, { shallow: true, scroll: false })
    }
  }

  return (
    <StyledWrapper>
      <div className="top">
        <Emoji>🏷️</Emoji> Tags
      </div>
      <div className="list">
        {Object.keys(data).map((key) => (
          <button
            type="button"
            key={key}
            data-active={key === currentTag}
            aria-pressed={key === currentTag}
            aria-label={`Filter by tag: ${key}`}
            onClick={() => handleClickTag(key)}
          >
            {key}
          </button>
        ))}
      </div>
    </StyledWrapper>
  )
}

export default TagList

const StyledWrapper = styled.div`
  .top {
    display: none;
    padding: 0.25rem;
    margin-bottom: 0.75rem;

    @media (min-width: 1024px) {
      display: block;
    }
  }

  .list {
    display: flex;
    margin-bottom: 1.5rem;
    gap: 0.25rem;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: thin;
    padding-bottom: 0.25rem;

    @media (min-width: 1024px) {
      display: block;
      overflow: visible;
      padding-bottom: 0;
    }

    button {
      display: block;
      text-align: left;
      white-space: nowrap;
      padding: 0.25rem;
      padding-left: 1rem;
      padding-right: 1rem;
      margin-top: 0.25rem;
      margin-bottom: 0.25rem;
      border-radius: 0.75rem;
      font-size: 0.875rem;
      line-height: 1.25rem;
      color: ${({ theme }) => theme.colors.gray10};
      flex-shrink: 0;
      cursor: pointer;

      :hover {
        background-color: ${({ theme }) => theme.colors.gray4};
      }
      &[data-active="true"] {
        color: ${({ theme }) => theme.colors.gray12};
        background-color: ${({ theme }) => theme.colors.gray4};

        :hover {
          background-color: ${({ theme }) => theme.colors.gray4};
        }
      }
    }
  }
`
