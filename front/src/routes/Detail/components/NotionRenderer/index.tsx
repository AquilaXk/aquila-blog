import styled from "@emotion/styled"
import { FC } from "react"

type Props = {
  content?: string
  recordMap?: unknown
}

const NotionRenderer: FC<Props> = ({ content }) => {
  if (!content?.trim()) {
    return <StyledWrapper>본문이 없습니다.</StyledWrapper>
  }

  return <StyledWrapper>{content}</StyledWrapper>
}

export default NotionRenderer

const StyledWrapper = styled.div`
  margin-top: 1.5rem;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.8;
  color: ${({ theme }) => theme.colors.gray12};

  p,
  div {
    margin: 0;
  }
`
