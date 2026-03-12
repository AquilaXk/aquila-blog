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
  min-width: 0;
  margin-bottom: 0.15rem;
  padding-top: 0.75rem;
  align-items: center;
  gap: 0.65rem;
  border-top: 1px solid ${({ theme }) => theme.colors.gray6};
  container-type: inline-size;

  @media (max-width: 900px) {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: stretch;
  }

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }

  @container (max-width: 600px) {
    align-items: stretch;
    grid-template-columns: 1fr;
  }
`
