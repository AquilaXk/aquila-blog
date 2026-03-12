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
  gap: 0.18rem;
  font-size: 0.875rem;
  line-height: 1.25rem;
  flex: 0 0 auto;
  min-width: 0;
  max-width: 100%;
  padding: 0.18rem;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};

  @media (max-width: 900px) {
    width: auto;
  }

  @media (max-width: 640px) {
    width: 100%;
  }

  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 96px;
    max-width: 100%;
    min-height: 36px;
    padding: 0 0.82rem;
    border-radius: 999px;
    border: 0;
    background: transparent;
    cursor: pointer;
    color: ${({ theme }) => theme.colors.gray10};
    transition:
      background-color 0.18s ease,
      border-color 0.18s ease,
      color 0.18s ease;

    &[data-active="true"] {
      font-weight: 700;
      color: ${({ theme }) => theme.colors.gray12};
      background: ${({ theme }) => theme.colors.blue3};
      box-shadow: inset 0 0 0 1px ${({ theme }) => theme.colors.blue8};
    }

    @media (max-width: 900px) {
      min-width: 0;
    }

    @media (max-width: 640px) {
      width: 100%;
      min-width: 0;
    }
  }
`
