import React from "react"
import CategorySelect from "./CategorySelect"
import OrderButtons from "./OrderButtons"
import styled from "@emotion/styled"

type Props = {}

const FeedHeader: React.FC<Props> = () => {
  return (
    <StyledWrapper>
      <FilterRow>
        <CategorySlot>
          <CategorySelect />
        </CategorySlot>
        <OrderButtons />
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
`

const FilterRow = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding-top: 1rem;
  min-width: 0;

  @media (max-width: 640px) {
    flex-direction: column;
    align-items: stretch;
    gap: 0.8rem;
  }
`

const CategorySlot = styled.div`
  flex: 0 1 clamp(12rem, 28vw, 17rem);
  max-width: clamp(12rem, 28vw, 17rem);
  min-width: 0;

  @media (max-width: 640px) {
    flex-basis: auto;
    max-width: none;
  }
`
