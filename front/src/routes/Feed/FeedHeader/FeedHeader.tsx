import React from "react"
import CategorySelect from "./CategorySelect"
import OrderButtons from "./OrderButtons"
import styled from "@emotion/styled"

type Props = {}

const FeedHeader: React.FC<Props> = () => {
  return (
    <StyledWrapper>
      <CategorySelect />
      <OrderRow>
        <OrderButtons />
      </OrderRow>
    </StyledWrapper>
  )
}

export default FeedHeader

const StyledWrapper = styled.div`
  display: grid;
  min-width: 0;
  padding-top: 0.95rem;
  gap: 0.85rem;
  border-top: 1px solid ${({ theme }) => theme.colors.gray6};
`

const OrderRow = styled.div`
  display: flex;
  justify-content: flex-end;
  padding-bottom: 0.05rem;

  @media (max-width: 640px) {
    justify-content: stretch;
  }
`
