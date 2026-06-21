import styled from "@emotion/styled"
import Link from "next/link"

type ErrorFallbackVariant = "global" | "surface"

type ErrorFallbackViewProps = {
  variant: ErrorFallbackVariant
  errorId: string
  onRetry?: () => void
}

const copyByVariant = {
  global: {
    status: "500",
    title: "문제가 발생했습니다",
    description:
      "예상하지 못한 오류로 화면을 표시하지 못했습니다. 오류 ID를 남겨두고 다시 시도하거나 홈으로 이동하세요.",
  },
  surface: {
    status: "!",
    title: "콘텐츠를 표시하지 못했습니다",
    description:
      "이 영역을 렌더링하는 중 오류가 발생했습니다. 작성 중인 내용은 브라우저에 남아 있으며 다시 시도할 수 있습니다.",
  },
}

export const ErrorFallbackView = ({ variant, errorId, onRetry }: ErrorFallbackViewProps) => {
  const copy = copyByVariant[variant]

  return (
    <StyledWrapper data-error-boundary={variant}>
      <div className="shell">
        <div className="status" aria-hidden="true">
          {copy.status}
        </div>
        <div className="copy">
          <h1>{copy.title}</h1>
          <p>{copy.description}</p>
          <span>{`오류 ID: ${errorId}`}</span>
        </div>
        <div className="actions">
          {onRetry ? (
            <button type="button" onClick={onRetry}>
              다시 시도
            </button>
          ) : null}
          <Link href="/">홈으로 이동</Link>
        </div>
      </div>
    </StyledWrapper>
  )
}

const StyledWrapper = styled.section`
  display: grid;
  place-items: center;
  min-height: min(72vh, 42rem);
  padding: clamp(2rem, 6vw, 4.5rem) 1rem;
  color: #111827;

  .shell {
    display: grid;
    gap: 1.25rem;
    justify-items: center;
    width: min(100%, 38rem);
    text-align: center;
  }

  .status {
    display: grid;
    place-items: center;
    width: 4.25rem;
    height: 4.25rem;
    border: 1px solid #d1d5db;
    border-radius: 50%;
    background: #f9fafb;
    color: #374151;
    font-size: 1.35rem;
    font-weight: 800;
  }

  .copy {
    display: grid;
    gap: 0.7rem;
  }

  h1 {
    margin: 0;
    font-size: clamp(1.55rem, 4vw, 2.2rem);
    line-height: 1.2;
    letter-spacing: 0;
  }

  p {
    margin: 0;
    color: #4b5563;
    line-height: 1.7;
  }

  span {
    color: #6b7280;
    font-size: 0.88rem;
    font-weight: 700;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.7rem;
  }

  button,
  a {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    padding: 0 1rem;
    border: 1px solid #d1d5db;
    border-radius: 999px;
    background: #ffffff;
    color: #111827;
    font: inherit;
    font-size: 0.92rem;
    font-weight: 800;
    text-decoration: none;
    cursor: pointer;
  }

  button:hover,
  a:hover {
    border-color: #9ca3af;
    background: #f3f4f6;
  }
`
