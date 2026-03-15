import React from "react"
import styled from "@emotion/styled"
import OrderButtons from "./OrderButtons"

type Props = {}

const FeedHeader: React.FC<Props> = () => {
  return (
    <StyledWrapper>
      <OrderSlot>
        <OrderButtons />
      </OrderSlot>
    </StyledWrapper>
  )
}

export default FeedHeader

const StyledWrapper = styled.div`
  display: flex;
  justify-content: flex-end;
  width: 100%;
  min-width: 0;
  @media (max-width: 768px) {
    justify-content: flex-start;
  }
`

const OrderSlot = styled.div`
  display: flex;
  min-width: 0;
`
