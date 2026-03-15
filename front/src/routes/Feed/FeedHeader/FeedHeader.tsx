import React from "react"
import styled from "@emotion/styled"
import CategorySelect from "./CategorySelect"
import OrderButtons from "./OrderButtons"

type Props = {}

const FeedHeader: React.FC<Props> = () => {
  return (
    <StyledWrapper>
      <FilterRow>
        <CategorySlot>
          <CategorySelect />
        </CategorySlot>
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
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(12.8rem, 18rem);
  justify-content: stretch;
  align-items: flex-start;
  gap: 1rem;
  width: 100%;
  padding-top: 1rem;
  min-width: 0;

  @container feed-filters (max-width: 32rem) {
    grid-template-columns: 1fr;
    justify-items: stretch;
    gap: 0.8rem;
  }

  @container feed-filters (max-width: 28rem) {
    justify-items: stretch;
  }
`

const CategorySlot = styled.div`
  width: 100%;
  max-width: 100%;
  min-width: 0;
  justify-self: stretch;

  @container feed-filters (max-width: 32rem) {
    width: 100%;
    max-width: 100%;
  }

  @container feed-filters (max-width: 28rem) {
    max-width: 100%;
  }
`

const OrderSlot = styled.div`
  justify-self: end;
  width: 100%;
  max-width: 18rem;
  min-width: 0;

  @container feed-filters (max-width: 32rem) {
    justify-self: start;
    width: 100%;
    max-width: 18rem;
  }

  @container feed-filters (max-width: 28rem) {
    justify-self: stretch;
    width: 100%;
    max-width: 100%;
  }
`
