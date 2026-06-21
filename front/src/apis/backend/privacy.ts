import { apiFetch } from "src/apis/backend/client"

export type PrivacyRequestType =
  | "EXPORT"
  | "CORRECTION"
  | "DELETION"
  | "PROCESSING_RESTRICTION"
  | "CONSENT_WITHDRAWAL"

export type PrivacyRequestStatus = "RECEIVED" | "IN_PROGRESS" | "COMPLETED" | "REJECTED"

export type PrivacyExportResponse = {
  generatedAt: string
  member: {
    id: number
    email: string | null
    username: string
    nickname: string
    createdAt: string
    modifiedAt: string
  }
  latestLegalAcceptance: {
    termsVersion?: string
    privacyVersion?: string
    analyticsConsent?: boolean
    overseasTransferAcknowledged?: boolean
    acceptedAt?: string
  } | null
}

export type PrivacyRequestItem = {
  id: number
  memberId: number
  type: PrivacyRequestType
  status: PrivacyRequestStatus
  message: string | null
  requestedAt: string
  dueAt: string
  completedAt: string | null
}

export type AccountDeletionResult = {
  memberId: number
  deletedAt: string
  revokedSessionCount: number
}

type RsData<T> = {
  resultCode: string
  msg: string
  data: T
}

const PRIVACY_EXPORT_PATH = "/member/api/v1/privacy/export"
const PRIVACY_REQUESTS_PATH = "/member/api/v1/privacy/requests"
const PRIVACY_ACCOUNT_PATH = "/member/api/v1/privacy/account"

export const getPrivacyExport = () => apiFetch<RsData<PrivacyExportResponse>>(PRIVACY_EXPORT_PATH)

export const createPrivacyRequest = (input: {
  type: PrivacyRequestType
  message?: string
}) =>
  apiFetch<RsData<{ item: PrivacyRequestItem }>>(PRIVACY_REQUESTS_PATH, {
    method: "POST",
    body: JSON.stringify(input),
  })

export const deletePrivacyAccount = (input: {
  password: string
  reason?: string
}) =>
  apiFetch<RsData<AccountDeletionResult>>(PRIVACY_ACCOUNT_PATH, {
    method: "DELETE",
    body: JSON.stringify(input),
  })
