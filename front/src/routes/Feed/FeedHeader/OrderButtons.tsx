import styled from "@emotion/styled"
import { useRouter } from "next/router"
import React from "react"
import { replaceShallowRoutePreservingScroll } from "src/libs/router"

type TOrder = "asc" | "desc"

type Props = {}

const OrderButtons: React.FC<Props> = () => {
  const router = useRouter()

  const currentOrder: TOrder =
    router.query.order === "asc" ? "asc" : "desc"

  const handleClickOrderBy = (value: TOrder) => {
    if (currentOrder === value) return

    const { category: _deprecatedCategory, ...restQuery } = router.query
    replaceShallowRoutePreservingScroll(router, {
      pathname: "/",
      query: {
        ...restQuery,
        order: value,
      },
    })
  }
  return (
    <StyledWrapper>
      <span className="label">정렬</span>
      <div className="segment" role="group" aria-label="게시글 정렬">
        <button
          type="button"
          data-active={currentOrder === "desc"}
          aria-pressed={currentOrder === "desc"}
          onClick={() => handleClickOrderBy("desc")}
        >
          최신순
        </button>
        <button
          type="button"
          data-active={currentOrder === "asc"}
          aria-pressed={currentOrder === "asc"}
          onClick={() => handleClickOrderBy("asc")}
        >
          오래된순
        </button>
      </div>
    </StyledWrapper>
  )
}

export default OrderButtons

const StyledWrapper = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  line-height: 1.25rem;
  min-width: 0;
  width: auto;
  max-width: 100%;
  padding: 0.26rem 0.3rem;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 999px;
  background: ${({ theme }) => theme.colors.gray2};
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);

  @media (max-width: 460px) {
    width: 100%;
    justify-content: space-between;
  }

  .label {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.78rem;
    font-weight: 640;
    letter-spacing: -0.01em;
    padding-left: 0.32rem;
    white-space: nowrap;
  }

  .segment {
    display: inline-flex;
    align-items: center;
    gap: 0.24rem;
    min-width: 0;
  }

  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 5.8rem;
    min-height: 34px;
    padding: 0 0.66rem;
    border-radius: 999px;
    border: 1px solid transparent;
    background: transparent;
    cursor: pointer;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.82rem;
    font-weight: 610;
    white-space: nowrap;
    transition:
      background-color 0.18s ease,
      border-color 0.18s ease,
      color 0.18s ease;

    &:hover {
      background: ${({ theme }) => theme.colors.gray3};
      color: ${({ theme }) => theme.colors.gray12};
    }

    &[data-active="true"] {
      font-weight: 700;
      color: ${({ theme }) => theme.colors.blue11};
      border-color: ${({ theme }) => theme.colors.gray6};
      background: ${({ theme }) => theme.colors.gray1};
      box-shadow: inset 0 -1px 0 rgba(59, 130, 246, 0.25);
    }
  }
`
