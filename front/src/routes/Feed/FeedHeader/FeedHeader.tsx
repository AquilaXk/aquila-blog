import React from "react"
import styled from "@emotion/styled"
import dynamic from "next/dynamic"

const CategorySelectIsland = dynamic(() => import("./CategorySelect"), {
  ssr: false,
  loading: () => <ControlPlaceholder aria-hidden="true" />,
})

const OrderButtonsIsland = dynamic(() => import("./OrderButtons"), {
  ssr: false,
  loading: () => <SegmentPlaceholder aria-hidden="true" />,
})

type Props = {}

const FeedHeader: React.FC<Props> = () => {
  return (
    <StyledWrapper>
      <FilterRow>
        <CategorySlot>
          <CategorySelectIsland />
        </CategorySlot>
        <OrderSlot>
          <OrderButtonsIsland />
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
  grid-template-columns: minmax(0, 17rem) auto;
  align-items: flex-start;
  gap: 1rem;
  padding-top: 1rem;
  min-width: 0;

  @container feed-filters (max-width: 44rem) {
    grid-template-columns: 1fr;
    gap: 0.8rem;
  }
`

const CategorySlot = styled.div`
  width: 100%;
  max-width: 17rem;
  min-width: 0;

  @container feed-filters (max-width: 44rem) {
    max-width: none;
  }
`

const OrderSlot = styled.div`
  justify-self: end;
  min-width: 0;

  @container feed-filters (max-width: 44rem) {
    justify-self: stretch;
  }
`

const ControlPlaceholder = styled.div`
  min-height: 48px;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background:
    linear-gradient(90deg, ${({ theme }) => theme.colors.gray2}, ${({ theme }) => theme.colors.gray3}, ${({ theme }) => theme.colors.gray2});
  background-size: 200% 100%;
  animation: shimmer 1.2s linear infinite;

  @keyframes shimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }
`

const SegmentPlaceholder = styled(ControlPlaceholder)`
  min-width: 248px;

  @container feed-filters (max-width: 44rem) {
    min-width: 0;
    width: 100%;
  }
`
