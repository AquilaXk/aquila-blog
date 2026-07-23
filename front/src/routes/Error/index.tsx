import styled from "@emotion/styled"
import Link from "next/link"

// 패밀리룩(1223): "4?4" 제네릭 중앙 정렬 + 필 버튼 → 좌측 정렬 에디토리얼(모노 라벨 +
// 대형 헤드라인 + 헤어라인 + 사각/잉크 컨트롤). 404/500이 동일 오류 UI 문법을 공유한다.
const CustomError = () => {
  return (
    <StyledWrapper>
      <div className="shell">
        <div className="status">ERROR · 404</div>
        <div className="copy">
          <h1>찾을 수 없는 페이지입니다.</h1>
          <p>
            주소가 바뀌었거나 삭제된 글일 수 있습니다. 홈으로 돌아가 최신 글이나 블로그 소개부터 다시
            확인하세요.
          </p>
        </div>
        <div className="actions">
          <Link href="/" className="primary">
            홈으로 이동
          </Link>
          <Link href="/about">블로그 소개</Link>
        </div>
      </div>
    </StyledWrapper>
  )
}

export default CustomError

const monoLabel = `"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace`

const StyledWrapper = styled.div`
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

  .copy h1 {
    margin: 0;
    font-size: clamp(1.9rem, 5vw, 2.8rem);
    line-height: 1.15;
    font-weight: 800;
    letter-spacing: -0.02em;
  }

  .copy p {
    margin: 0;
    max-width: 40rem;
    color: ${({ theme }) => theme.colors.gray11};
    line-height: 1.7;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    margin-top: 0.4rem;
  }

  .actions a {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    padding: 0 1.1rem;
    border: 1px solid ${({ theme }) => theme.publicDesign.borderStrong};
    border-radius: 6px;
    background: transparent;
    color: ${({ theme }) => theme.colors.gray12};
    text-decoration: none;
    font-size: 0.92rem;
    font-weight: 800;
    transition: border-color 0.16s ease, opacity 0.16s ease;
  }

  .actions a.primary {
    border-color: ${({ theme }) => theme.colors.gray12};
    background: ${({ theme }) => theme.colors.gray12};
    color: ${({ theme }) => theme.publicDesign.pageBackgroundColor};
  }

  .actions a:hover {
    border-color: ${({ theme }) => theme.colors.gray12};
  }

  .actions a.primary:hover {
    opacity: 0.88;
  }
`
