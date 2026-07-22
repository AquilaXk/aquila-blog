import { useEffect, useState } from "react"
import { normalizeKeywordQuery } from "src/libs/query/normalize"

export const getSearchDebounceMs = (value: string) => {
  const trimmedLength = normalizeKeywordQuery(value).length
  if (trimmedLength === 0) return 0
  if (trimmedLength <= 2) return 120
  if (trimmedLength <= 5) return 180
  return 240
}

export const useDebouncedValue = (value: string, pause = false) => {
  const [debounced, setDebounced] = useState(value)
  const delayMs = getSearchDebounceMs(value)

  useEffect(() => {
    if (pause) return
    if (delayMs === 0) {
      setDebounced(value)
      return
    }
    const timer = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(timer)
  }, [value, delayMs, pause])

  return debounced
}
