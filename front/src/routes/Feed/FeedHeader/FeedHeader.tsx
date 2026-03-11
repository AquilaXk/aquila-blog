import { TCategories } from "src/types"
import React from "react"
import CategorySelect from "./CategorySelect"
import OrderButtons from "./OrderButtons"
import styled from "@emotion/styled"

type Props = {}

const FeedHeader: React.FC<Props> = () => {
  return (
    <StyledWrapper>
      <CategorySelect />
      <OrderButtons />
    </StyledWrapper>
  )
}

export default FeedHeader

const StyledWrapper = styled.div`
  display: flex;
  margin-bottom: 1rem;
  padding-top: 0.9rem;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  border-top: 1px solid ${({ theme }) => theme.colors.gray6};

  @media (max-width: 640px) {
    flex-direction: column;
    align-items: stretch;
  }
`
