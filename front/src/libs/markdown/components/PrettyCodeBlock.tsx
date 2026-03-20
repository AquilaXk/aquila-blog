import { FC, ReactNode, useEffect, useState } from "react"
import AppIcon from "src/components/icons/AppIcon"
import { toLanguageLabel } from "src/libs/markdown/rendering"

type PrettyCodeBlockProps = {
  language: string
  rawCode: string
  preElement: ReactNode
}

const PrettyCodeBlock: FC<PrettyCodeBlockProps> = ({ language, rawCode, preElement }) => {
  const [copied, setCopied] = useState(false)

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
        <div className="aq-code-toolbar-left" aria-hidden="true">
          <span className="aq-code-dot aq-code-dot-red" />
          <span className="aq-code-dot aq-code-dot-yellow" />
          <span className="aq-code-dot aq-code-dot-green" />
        </div>
        <span className="aq-code-language">{toLanguageLabel(language)}</span>
      </div>
      <div className="aq-code-body">
        <div className="aq-code-shell">{preElement}</div>
        <button
          type="button"
          className={`aq-code-copy aq-code-copy-bottom${copied ? " is-copied" : ""}`}
          onClick={handleCopy}
          aria-label={copied ? "코드가 복사되었습니다" : "코드 복사"}
          title={copied ? "복사됨" : "복사"}
        >
          {copied ? <span className="aq-code-copy-done">Copy</span> : <AppIcon name="copy" />}
        </button>
      </div>
    </div>
  )
}

export default PrettyCodeBlock
