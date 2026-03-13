import styled from "@emotion/styled"
import React from "react"
import AppIcon from "src/components/icons/AppIcon"

type Props = {}

const CustomError: React.FC<Props> = () => {
  return (
    <StyledWrapper>
      <div className="wrapper">
        <div className="top">
          <div>4</div>
          <AppIcon name="question" className="questionIcon" />
          <div>4</div>
        </div>
        <div className="text">Post not found</div>
      </div>
    </StyledWrapper>
  )
}

export default CustomError

const StyledWrapper = styled.div`
  margin: 0 auto;
  padding-left: 1.5rem;
  padding-right: 1.5rem;
  padding-top: 3rem;
  padding-bottom: 3rem;
  border-radius: 1.5rem;
  max-width: 56rem;
  .wrapper {
    display: flex;
    padding-top: 5rem;
    padding-bottom: 5rem;
    flex-direction: column;
    gap: 2.5rem;
    align-items: center;
    > .top {
      display: flex;
      align-items: center;
      gap: 0.3rem;
      font-size: 3.75rem;
      line-height: 1;

      .questionIcon {
        font-size: 3.1rem;
        flex: 0 0 auto;
      }
    }
    > .text {
      font-size: 1.875rem;
      line-height: 2.25rem;
      color: ${({ theme }) => theme.colors.gray11};
    }
  }
`
