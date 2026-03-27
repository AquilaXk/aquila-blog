export type BlockEditorLoadGuardState = {
  expectedBody: string
  ignoreUntilMs: number
  ignoredInitialEmpty: boolean
}

const DEFAULT_GUARD_HOLD_MS = 1_200

export const normalizeEditorMarkdown = (value: string) => value.replace(/\r\n?/g, "\n").trim()

export const createBlockEditorLoadGuardState = (
  resolvedBody: string,
  nowMs: number = Date.now(),
  holdMs: number = DEFAULT_GUARD_HOLD_MS
): BlockEditorLoadGuardState => {
  const normalizedBody = normalizeEditorMarkdown(resolvedBody)
  if (!normalizedBody) {
    return { expectedBody: "", ignoreUntilMs: 0, ignoredInitialEmpty: false }
  }

  return {
    expectedBody: normalizedBody,
    ignoreUntilMs: nowMs + Math.max(0, holdMs),
    ignoredInitialEmpty: false,
  }
}

export const shouldIgnoreBlockEditorEmptyUpdate = ({
  nextMarkdown,
  currentMarkdown,
  guardState,
  nowMs = Date.now(),
}: {
  nextMarkdown: string
  currentMarkdown: string
  guardState: BlockEditorLoadGuardState
  nowMs?: number
}) => {
  const normalizedNext = normalizeEditorMarkdown(nextMarkdown)
  const normalizedCurrent = normalizeEditorMarkdown(currentMarkdown)

  return (
    normalizedNext.length === 0 &&
    normalizedCurrent.length > 0 &&
    guardState.expectedBody.length > 0 &&
    !guardState.ignoredInitialEmpty &&
    nowMs <= guardState.ignoreUntilMs
  )
}

export const consumeGuardOnExpectedUpdate = (
  guardState: BlockEditorLoadGuardState,
  nextMarkdown: string
): BlockEditorLoadGuardState => {
  const normalizedNext = normalizeEditorMarkdown(nextMarkdown)
  if (normalizedNext.length > 0 && normalizedNext === guardState.expectedBody) {
    return {
      ...guardState,
      ignoreUntilMs: 0,
    }
  }
  return guardState
}

export const markGuardEmptyUpdateIgnored = (
  guardState: BlockEditorLoadGuardState
): BlockEditorLoadGuardState => ({
  ...guardState,
  ignoreUntilMs: 0,
  ignoredInitialEmpty: true,
})
