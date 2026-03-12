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
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  margin-bottom: 1rem;
  padding-top: 0.9rem;
  align-items: center;
  gap: 0.75rem;
  border-top: 1px solid ${({ theme }) => theme.colors.gray6};

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
    align-items: stretch;
  }
`
