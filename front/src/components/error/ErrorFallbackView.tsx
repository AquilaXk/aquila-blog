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
    status: "ERROR · 500",
    title: "문제가 발생했습니다",
    description:
      "예상하지 못한 오류로 화면을 표시하지 못했습니다. 오류 ID를 남겨두고 다시 시도하거나 홈으로 이동하세요.",
  },
  surface: {
    status: "RENDER ERROR",
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

// 패밀리룩(1223): 중앙 정렬 제네릭 + 필 버튼 → 좌측 정렬 에디토리얼(모노 라벨 +
// 대형 헤드라인 + 헤어라인 + 사각/잉크 컨트롤). 색은 전부 공용 토큰.
const monoLabel = `"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace`

const StyledWrapper = styled.section`
  display: block;
  min-height: min(72vh, 42rem);
  padding: clamp(2.5rem, 8vw, 5rem) clamp(1rem, 5vw, 2rem);
  color: ${({ theme }) => theme.colors.gray12};

  .shell {
    width: min(100%, 46rem);
    margin: 0 auto;
    display: grid;
    gap: 1.1rem;
  }

  .status {
    font-family: ${monoLabel};
    font-size: 11px;
    font-weight: 760;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.gray10};
  }

  .copy {
    display: grid;
    gap: 0.85rem;
    padding-bottom: 1.5rem;
    border-bottom: 1px solid ${({ theme }) => theme.publicDesign.border};
  }

  h1 {
    margin: 0;
    font-size: clamp(1.9rem, 5vw, 2.8rem);
    line-height: 1.15;
    font-weight: 800;
    letter-spacing: -0.02em;
  }

  p {
    margin: 0;
    max-width: 40rem;
    color: ${({ theme }) => theme.colors.gray11};
    line-height: 1.7;
  }

  span {
    font-family: ${monoLabel};
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.82rem;
    font-weight: 700;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    margin-top: 0.4rem;
  }

  button,
  a {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    padding: 0 1.1rem;
    border: 1px solid ${({ theme }) => theme.publicDesign.borderStrong};
    border-radius: 6px;
    background: transparent;
    color: ${({ theme }) => theme.colors.gray12};
    font: inherit;
    font-size: 0.92rem;
    font-weight: 800;
    text-decoration: none;
    cursor: pointer;
  }

  a {
    border-color: ${({ theme }) => theme.colors.gray12};
    background: ${({ theme }) => theme.colors.gray12};
    color: ${({ theme }) => theme.publicDesign.pageBackgroundColor};
  }

  button:hover {
    border-color: ${({ theme }) => theme.colors.gray12};
  }

  a:hover {
    opacity: 0.88;
  }
`
