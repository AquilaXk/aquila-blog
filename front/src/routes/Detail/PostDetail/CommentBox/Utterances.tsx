import { CONFIG } from "site.config"
import { useEffect, useRef, useState } from "react" // useState 추가
import styled from "@emotion/styled"
import { Emoji } from "src/components/Emoji"
import useScheme from "src/hooks/useScheme"

type Props = {
  issueTerm: string
}

const Utterances: React.FC<Props> = ({ issueTerm }) => {
  const [scheme] = useScheme()
  const containerRef = useRef<HTMLDivElement>(null)

  // 1. 로딩 상태를 관리할 state 추가 (기본값: true)
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    const parent = containerRef.current
    if (!parent) return

    // 테마 변경이나 재진입 시 초기화
    parent.innerHTML = ""
    setIsLoaded(false) // 다시 로딩 상태로 변경

    const script = document.createElement("script")

    script.setAttribute("src", "https://utteranc.es/client.js")
    script.setAttribute("crossorigin", "anonymous")
    script.setAttribute("async", "true")
    script.setAttribute("issue-term", issueTerm)

    const theme = scheme === "dark" ? "github-dark" : "github-light"
    script.setAttribute("theme", theme)

    const config: Record<string, string> = CONFIG.utterances.config
    Object.keys(config).forEach((key) => {
      if (key !== "issue-term" && key !== "theme") {
        script.setAttribute(key, config[key])
      }
    })

    // 2. 스크립트 로드 완료 시 이벤트 핸들러 추가
    // 댓글 스크립트가 로드되면 isLoaded를 true로 바꿔 텍스트를 숨김
    script.onload = () => {
      setIsLoaded(true)
    }

    parent.appendChild(script)
  }, [scheme, issueTerm])

  return (
    <StyledWrapper>
      {/* 3. isLoaded가 false일 때만(로딩 중일 때만) 텍스트 표시 */}
      {!isLoaded && (
        <div className="loading-text">
          <Emoji>💬</Emoji> 댓글을 불러오고 있습니다...
        </div>
      )}

      <div className="utterances-frame" ref={containerRef} />
    </StyledWrapper>
  )
}

export default Utterances

const StyledWrapper = styled.div`
  position: relative;
  margin-top: 2rem;

  .loading-text {
    text-align: center;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.875rem;
    padding: 2rem 0;
    position: absolute;
    width: 100%;
    top: 0;
    z-index: 0;
  }

  .utterances-frame {
    position: relative;
    z-index: 1;
    min-height: 200px;
  }
`
