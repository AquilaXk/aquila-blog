export type LegalPolicyKind = "privacy" | "terms" | "cookies"

export type LegalDocumentType = "PRIVACY_POLICY" | "TERMS_OF_SERVICE" | "COOKIE_POLICY"

export type LegalPolicyStatus = "draft" | "effective" | "superseded"

export type LegalPolicySection = {
  id: string
  title: string
  body: string[]
}

export type LegalPolicyDocument = {
  documentType: LegalDocumentType
  locale: "ko-KR"
  version: string
  status: LegalPolicyStatus
  publishedAt: string
  effectiveAt: string
  contentSha256: string
  supersedes: string | null
  owner: string
  contactEmail: string
  changeSummary: string[]
  sections: LegalPolicySection[]
  reviewRequired?: string[]
}

export type LegalPolicySummary = {
  kind: LegalPolicyKind
  title: string
  version: string
  effectiveAt: string
  contentSha256: string
  href: string
  currentHref: string
  changeSummary: string[]
}

export type LegalPolicyPageProps = {
  policy: LegalPolicyDocument
  kind: LegalPolicyKind
  currentHref: string
  versionHref: string
  historyHref: string
  downloadText: string
}
