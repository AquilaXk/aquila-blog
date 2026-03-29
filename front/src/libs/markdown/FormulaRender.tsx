import { FC, useEffect, useMemo, useState } from "react"
import { renderFormulaFallbackHtml, renderFormulaToHtml } from "src/libs/markdown/formula"

type Props = {
  formula: string
  displayMode?: boolean
  className?: string
}

const FormulaRender: FC<Props> = ({ formula, displayMode = true, className }) => {
  const normalizedFormula = String(formula || "").trim()
  const fallbackHtml = useMemo(
    () => renderFormulaFallbackHtml(normalizedFormula, { displayMode }),
    [displayMode, normalizedFormula]
  )
  const [renderedHtml, setRenderedHtml] = useState(fallbackHtml)

  useEffect(() => {
    let cancelled = false

    if (!normalizedFormula) {
      setRenderedHtml("")
      return () => {
        cancelled = true
      }
    }

    setRenderedHtml(fallbackHtml)

    void renderFormulaToHtml(normalizedFormula, { displayMode }).then((html) => {
      if (cancelled) return
      setRenderedHtml(html)
    })

    return () => {
      cancelled = true
    }
  }, [displayMode, fallbackHtml, normalizedFormula])

  if (!normalizedFormula) return null

  return <div className={className} dangerouslySetInnerHTML={{ __html: renderedHtml }} />
}

export default FormulaRender
