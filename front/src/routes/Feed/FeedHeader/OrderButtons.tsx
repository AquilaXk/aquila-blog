import styled from "@emotion/styled"
import { useRouter } from "next/router"
import React from "react"

type TOrder = "asc" | "desc"

type Props = {}

const OrderButtons: React.FC<Props> = () => {
  const router = useRouter()

  const currentOrder: TOrder =
    router.query.order === "asc" ? "asc" : "desc"

  const handleClickOrderBy = (value: TOrder) => {
    router.push({
      query: {
        ...router.query,
        order: value,
      },
    }, undefined, { shallow: true, scroll: false })
  }
  return (
    <StyledWrapper>
      <button
        type="button"
        data-active={currentOrder === "desc"}
        aria-pressed={currentOrder === "desc"}
        onClick={() => handleClickOrderBy("desc")}
      >
        Desc
      </button>
      <button
        type="button"
        data-active={currentOrder === "asc"}
        aria-pressed={currentOrder === "asc"}
        onClick={() => handleClickOrderBy("asc")}
      >
        Asc
      </button>
    </StyledWrapper>
  )
}

export default OrderButtons

const StyledWrapper = styled.div`
  display: flex;
  gap: 0.5rem;
  font-size: 0.875rem;
  line-height: 1.25rem;
  button {
    cursor: pointer;
    color: ${({ theme }) => theme.colors.gray10};

    &[data-active="true"] {
      font-weight: 700;

      color: ${({ theme }) => theme.colors.gray12};
    }
  }
`
