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
        <OrderButtonsIsland />
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

  @media (max-width: 640px) {
    min-width: 0;
  }
`
