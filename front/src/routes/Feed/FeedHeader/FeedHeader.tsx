import React from "react"
import styled from "@emotion/styled"
import OrderButtons from "./OrderButtons"

type Props = {}

const FeedHeader: React.FC<Props> = () => {
  return (
    <StyledWrapper>
      <FilterRow>
        <OrderSlot>
          <OrderButtons />
        </OrderSlot>
      </FilterRow>
    </StyledWrapper>
  )
}

export default FeedHeader

const StyledWrapper = styled.div`
  display: grid;
  min-width: 0;
  padding-top: 1rem;
  border-top: 1px solid ${({ theme }) => theme.colors.gray6};
  container-type: inline-size;
  container-name: feed-filters;
`

const FilterRow = styled.div`
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 0.8rem;
  width: 100%;
  padding-top: 1rem;
  min-width: 0;

  @container feed-filters (max-width: 28rem) {
    justify-content: stretch;
  }
`

const OrderSlot = styled.div`
  width: min(100%, 18rem);
  min-width: 0;

  @container feed-filters (max-width: 28rem) {
    justify-self: stretch;
    width: 100%;
    max-width: 100%;
  }
`
