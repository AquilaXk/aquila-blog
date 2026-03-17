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
  display: inline-flex;
  align-items: center;
  gap: 0.72rem;
  font-size: 0.875rem;
  line-height: 1.25rem;
  min-width: 0;
  width: auto;
  max-width: 100%;
  padding: 0;

  @media (max-width: 460px) {
    width: 100%;
    justify-content: flex-start;
  }

  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 5.9rem;
    min-height: 36px;
    padding: 0 0.44rem;
    border-radius: 0;
    border: 0;
    background: transparent;
    cursor: pointer;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.84rem;
    white-space: nowrap;
    transition:
      background-color 0.18s ease,
      border-color 0.18s ease,
      color 0.18s ease;

    &[data-active="true"] {
      font-weight: 680;
      color: ${({ theme }) => theme.colors.blue11};
      text-decoration: underline;
      text-underline-offset: 4px;
      text-decoration-thickness: 1.5px;
    }
  }
`
