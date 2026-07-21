import Link from "next/link"
import { ErrorState } from "src/design-system/StatePresenters"

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
    <ErrorState
      data-error-boundary={variant}
      label={copy.status}
      title={copy.title}
      description={copy.description}
      meta={`오류 ID: ${errorId}`}
      actions={
        <>
          {onRetry ? (
            <button type="button" onClick={onRetry}>
              다시 시도
            </button>
          ) : null}
          <Link href="/" data-tone="primary">
            홈으로 이동
          </Link>
        </>
      }
    />
  )
}
