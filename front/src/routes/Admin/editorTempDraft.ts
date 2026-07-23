export const TEMP_DRAFT_TITLE_PLACEHOLDER = "임시글"
export const TEMP_DRAFT_BODY_PLACEHOLDER = "임시글 입니다."

type TempDraftCandidate = {
  title?: string
  published: boolean
  listed: boolean
  tempDraft?: boolean
}

export const isTempDraftTitlePlaceholder = (value: string) => value.trim() === TEMP_DRAFT_TITLE_PLACEHOLDER

export const isLegacyTempDraft = (candidate: TempDraftCandidate) =>
  !candidate.published && !candidate.listed && isTempDraftTitlePlaceholder(candidate.title ?? "")

export const isServerTempDraftPost = (candidate: TempDraftCandidate) =>
  candidate.tempDraft === true || isLegacyTempDraft(candidate)
