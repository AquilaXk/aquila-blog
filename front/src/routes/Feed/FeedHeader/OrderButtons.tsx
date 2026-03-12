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
    replaceShallowRoutePreservingScroll(router, {
      pathname: "/",
      query: {
        ...router.query,
        order: value,
      },
    })
  }
  return (
    <StyledWrapper>
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
    </StyledWrapper>
  )
}

export default OrderButtons

const StyledWrapper = styled.div`
  display: flex;
  gap: 0.45rem;
  font-size: 0.875rem;
  line-height: 1.25rem;
  flex: 0 0 auto;

  @media (max-width: 900px) {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    width: 100%;
  }

  @container (max-width: 760px) {
    display: grid;
    grid-template-columns: 1fr;
    width: 100%;
  }

  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 92px;
    min-height: 38px;
    padding: 0 0.72rem;
    border-radius: 999px;
    border: 1px solid ${({ theme }) => theme.colors.gray7};
    background: ${({ theme }) => theme.colors.gray2};
    cursor: pointer;
    color: ${({ theme }) => theme.colors.gray10};
    transition:
      background-color 0.18s ease,
      border-color 0.18s ease,
      color 0.18s ease;

    &[data-active="true"] {
      font-weight: 700;
      color: ${({ theme }) => theme.colors.gray12};
      border-color: ${({ theme }) => theme.colors.blue8};
      background: ${({ theme }) => theme.colors.blue3};
    }

    @media (max-width: 900px) {
      width: 100%;
      min-width: 0;
    }

    @container (max-width: 760px) {
      width: 100%;
      min-width: 0;
    }
  }
`
