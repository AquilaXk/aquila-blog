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
    router.push(
      {
        pathname: "/",
        query: {
          ...router.query,
          order: value,
        },
      },
      undefined,
      { shallow: true, scroll: false }
    )
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
  gap: 0.45rem;
  font-size: 0.875rem;
  line-height: 1.25rem;
  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 70px;
    min-height: 38px;
    padding: 0 0.72rem;
    border-radius: 999px;
    border: 1px solid ${({ theme }) => theme.colors.gray7};
    background: ${({ theme }) => theme.colors.gray2};
    cursor: pointer;
    color: ${({ theme }) => theme.colors.gray10};

    &[data-active="true"] {
      font-weight: 700;
      color: ${({ theme }) => theme.colors.gray12};
      border-color: ${({ theme }) => theme.colors.blue8};
      background: ${({ theme }) => theme.colors.blue3};
    }
  }
`
