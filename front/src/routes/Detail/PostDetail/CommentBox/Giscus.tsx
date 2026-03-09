import { CONFIG } from "site.config"
import { useEffect, useRef } from "react"
import styled from "@emotion/styled"
import useScheme from "src/hooks/useScheme"

const Giscus: React.FC = () => {
  const [scheme] = useScheme()
  const containerRef = useRef<HTMLDivElement>(null)
  const currentTheme = scheme === "dark" ? "transparent_dark" : "light"

  useEffect(() => {
    if (!containerRef.current) return

    const parent = containerRef.current
    if (parent.childNodes.length > 0) return

    const script = document.createElement("script")
    const { config } = CONFIG.giscus

    script.src = "https://giscus.app/client.js"
    script.async = true
    script.crossOrigin = "anonymous"

    script.setAttribute("data-repo", config.repo)
    script.setAttribute("data-repo-id", config.repositoryId)
    script.setAttribute("data-category", config.category)
    script.setAttribute("data-category-id", config.categoryId)
    script.setAttribute("data-mapping", "pathname")
    script.setAttribute("data-strict", "0")
    script.setAttribute("data-reactions-enabled", "1")
    script.setAttribute("data-emit-metadata", "0")
    script.setAttribute("data-input-position", "top")
    script.setAttribute("data-lang", config.lang || "ko")

    script.setAttribute("data-theme", currentTheme)

    parent.appendChild(script)
  }, [currentTheme])

  useEffect(() => {
    const iframe = containerRef.current?.querySelector<HTMLIFrameElement>(
      "iframe.giscus-frame"
    )
    if (!iframe?.contentWindow) return

    iframe.contentWindow.postMessage(
      {
        giscus: {
          setConfig: {
            theme: currentTheme,
          },
        },
      },
      "https://giscus.app"
    )
  }, [currentTheme])

  return <StyledWrapper ref={containerRef} />
}

export default Giscus

const StyledWrapper = styled.div`
  margin-top: 3rem;
  margin-bottom: 5rem;

  /* 포인트: 본문 텍스트 너비와 댓글창의 정렬을 맞춥니다. */
  max-width: 100%;

  @media (min-width: 768px) {
    /* Morethanmin의 본문 컨테이너 여백에 따라 0 또는 미세한 마이너스 값을 줍니다. */
    /* 현재 이미지상으로는 왼쪽 여백이 너무 넓어 보이니 0으로 초기화해보세요. */
    margin-left: 0;
  }

  /* Giscus 내부 테두리를 더 흐리게 하거나 강조를 줄이는 스타일 (선택사항) */
  iframe {
    color-scheme: dark;
  }
`
