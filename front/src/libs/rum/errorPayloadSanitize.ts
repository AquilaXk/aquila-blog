const MAX_ERROR_MESSAGE_LENGTH = 200
const MAX_STACK_FRAMES = 5

const URL_PATTERN = /https?:\/\/[^\s]+/gi
const WWW_URL_PATTERN = /\bwww\.[^\s]+/gi
const EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g

const basenameFromPath = (value: string) => {
  const withoutQuery = value.split(/[?#]/, 1)[0] || value
  const parts = withoutQuery.split(/[/\\]/)
  return parts[parts.length - 1] || withoutQuery
}

const normalizeFrameFunction = (value: string | undefined) => {
  const trimmed = (value || "").trim()
  if (!trimmed || trimmed === "Object.<anonymous>" || trimmed === "<anonymous>") return "anonymous"
  return trimmed.replace(/\s+/g, " ").slice(0, 80)
}

const parseLocation = (location: string): { file: string; lineNo: string } | null => {
  const match = location.trim().match(/^(.*?):(\d+)(?::\d+)?$/)
  if (!match) return null
  const [, file, lineNo] = match
  if (!file || !lineNo) return null
  if (file.includes("node:internal") || file.startsWith("node:")) return null
  return { file, lineNo }
}

const parseStackFrame = (line: string): string | null => {
  const trimmed = line.trim()
  if (!trimmed) return null

  // Firefox / Safari: fn@https://host/path/file.js:10:20
  const atSeparated = trimmed.match(/^(.*)@(.+)$/)
  if (atSeparated && !trimmed.startsWith("at ")) {
    const [, fn, location] = atSeparated
    const parsed = location ? parseLocation(location) : null
    if (!parsed) return null
    return `${normalizeFrameFunction(fn)}@${basenameFromPath(parsed.file)}:${parsed.lineNo}`
  }

  // V8: at fn (https://host/path/file.js:10:20) | at https://host/path/file.js:10:20
  const v8WithFn = trimmed.match(/^at\s+(.+?)\s+\((.+)\)$/)
  if (v8WithFn) {
    const [, fn, location] = v8WithFn
    const parsed = location ? parseLocation(location) : null
    if (!parsed) return null
    return `${normalizeFrameFunction(fn)}@${basenameFromPath(parsed.file)}:${parsed.lineNo}`
  }

  const v8Bare = trimmed.match(/^at\s+(.+)$/)
  if (v8Bare) {
    const parsed = parseLocation(v8Bare[1] || "")
    if (!parsed) return null
    return `anonymous@${basenameFromPath(parsed.file)}:${parsed.lineNo}`
  }

  return null
}

export const sanitizeErrorMessage = (value: unknown, maxLength = MAX_ERROR_MESSAGE_LENGTH) => {
  if (typeof value !== "string") return ""
  const stripped = value
    .replace(URL_PATTERN, "[url]")
    .replace(WWW_URL_PATTERN, "[url]")
    .replace(EMAIL_PATTERN, "[email]")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  return stripped.slice(0, maxLength)
}

export const extractStackTop = (error: unknown, maxFrames = MAX_STACK_FRAMES) => {
  if (!(error instanceof Error) || typeof error.stack !== "string" || !error.stack.trim()) {
    return ""
  }

  const frames: string[] = []
  for (const line of error.stack.split("\n")) {
    const frame = parseStackFrame(line)
    if (!frame) continue
    frames.push(frame)
    if (frames.length >= maxFrames) break
  }

  return frames.join("|")
}

export const resolveErrorMessageFromUnknown = (error: unknown) => {
  if (error instanceof Error) return sanitizeErrorMessage(error.message)
  if (typeof error === "string") return sanitizeErrorMessage(error)
  return ""
}

export const toUrlPathOnly = (value: string | undefined | null) => {
  if (typeof value !== "string" || !value.trim()) return ""

  try {
    if (value.includes("://")) {
      const parsed = new URL(value)
      return parsed.pathname || "/"
    }
  } catch {
    // fall through to relative path handling
  }

  const pathOnly = value.split(/[?#]/, 1)[0]?.trim() || ""
  if (!pathOnly.startsWith("/")) return ""
  return pathOnly.slice(0, 260)
}
