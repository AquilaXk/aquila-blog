import { FC, ReactNode, useEffect, useState } from "react"
import { toLanguageLabel } from "src/libs/markdown/rendering"

type PrettyCodeBlockProps = {
  language: string
  title?: string
  rawCode: string
  preElement: ReactNode
}

const PrettyCodeBlock: FC<PrettyCodeBlockProps> = ({ language, title, rawCode, preElement }) => {
  const [copied, setCopied] = useState(false)
  const label = title?.trim() || toLanguageLabel(language)

  useEffect(() => {
    if (!copied) return
    const timeout = window.setTimeout(() => setCopied(false), 1400)
    return () => window.clearTimeout(timeout)
  }, [copied])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(rawCode)
      setCopied(true)
    } catch (error) {
      console.warn("[code-block] copy failed", error)
    }
  }

  return (
    <div className="aq-code-block">
      <div className="aq-code-toolbar">
        <span className="aq-code-title">{label}</span>
        <button
          type="button"
          className={`aq-code-copy${copied ? " is-copied" : ""}`}
          onClick={handleCopy}
          aria-label={copied ? "코드가 복사되었습니다" : "코드 복사"}
          title={copied ? "복사됨" : "복사"}
        >
          {copied ? "COPIED" : "COPY"}
        </button>
      </div>
      <div className="aq-code-body">
        <div className="aq-code-shell">{preElement}</div>
      </div>
    </div>
  )
}

export default PrettyCodeBlock
