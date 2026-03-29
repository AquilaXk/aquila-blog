import styled from "@emotion/styled"
import Link from "next/link"
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
        <div className="copy">
          <strong>찾을 수 없는 페이지입니다.</strong>
          <p>주소가 바뀌었거나 삭제된 글일 수 있습니다. 홈으로 돌아가 최신 글이나 블로그 소개부터 다시 확인하세요.</p>
        </div>
        <div className="actions">
          <Link href="/">홈으로 이동</Link>
          <Link href="/about">블로그 소개</Link>
        </div>
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
    > .copy {
      display: grid;
      gap: 0.72rem;
      max-width: 34rem;
      text-align: center;
    }

    > .copy strong {
      font-size: 1.875rem;
      line-height: 2.25rem;
      color: ${({ theme }) => theme.colors.gray12};
    }

    > .copy p {
      margin: 0;
      color: ${({ theme }) => theme.colors.gray10};
      line-height: 1.7;
    }

    > .actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: center;
      gap: 0.72rem;
    }

    > .actions a {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 44px;
      padding: 0 1rem;
      border-radius: 999px;
      border: 1px solid ${({ theme }) => theme.colors.gray6};
      background: ${({ theme }) => theme.colors.gray1};
      color: ${({ theme }) => theme.colors.gray12};
      text-decoration: none;
      font-size: 0.92rem;
      font-weight: 700;
      transition:
        transform 0.16s ease,
        border-color 0.16s ease,
        background-color 0.16s ease;
    }

    > .actions a:hover {
      transform: translateY(-1px);
      border-color: ${({ theme }) => theme.colors.gray8};
      background: ${({ theme }) => theme.colors.gray2};
    }
  }
`
