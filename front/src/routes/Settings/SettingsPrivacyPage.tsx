import Link from "next/link"
import { useRouter } from "next/router"
import { FormEvent, useEffect, useState } from "react"
import { getLegalReconsentStatus, LegalReconsentStatus, submitLegalReconsent } from "src/apis/backend/legal"
import {
  createPrivacyRequest,
  getPrivacyExport,
  PrivacyExportResponse,
  PrivacyRequestItem,
  PrivacyRequestType,
} from "src/apis/backend/privacy"
import {
  OPTIONAL_TRACKING_CONSENT_CHANGE_EVENT,
  type OptionalTrackingConsentRecord,
  hasBrowserPrivacyOptOutSignal,
  hasOptionalTrackingConsent,
  readOptionalTrackingConsent,
  setOptionalTrackingConsent,
} from "src/libs/privacy/optionalTrackingConsentCore"
import { normalizeNextPath, replaceRoute } from "src/libs/router"
import SettingsLayout from "./SettingsLayout"

const dateTimeFormatter = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
})

const formatDateTime = (value?: string | null) => {
  if (!value) return "미확인"
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? "미확인" : dateTimeFormatter.format(parsed)
}

const optionalTrackingSourceLabels: Record<OptionalTrackingConsentRecord["source"], string> = {
  settings: "개인정보 설정",
  "signup-email": "이메일 회원가입",
  "signup-social": "소셜 회원가입",
  "privacy-request": "개인정보 처리 요청",
  "legal-reconsent": "법적 문서 재동의",
  "legacy-string": "이전 저장 형식",
}

const SettingsPrivacyPage = () => {
  const router = useRouter()
  const [snapshot, setSnapshot] = useState<PrivacyExportResponse | null>(null)
  const [requestType, setRequestType] = useState<PrivacyRequestType>("EXPORT")
  const [message, setMessage] = useState("")
  const [createdRequest, setCreatedRequest] = useState<PrivacyRequestItem | null>(null)
  const [legalReconsent, setLegalReconsent] = useState<LegalReconsentStatus | null>(null)
  const [ageConfirmed, setAgeConfirmed] = useState(false)
  const [privacyConfirmed, setPrivacyConfirmed] = useState(false)
  const [overseasConfirmed, setOverseasConfirmed] = useState(false)
  const [feedback, setFeedback] = useState("")
  const [legalFeedback, setLegalFeedback] = useState("")
  const [trackingConsent, setTrackingConsent] = useState<OptionalTrackingConsentRecord | null>(null)
  const [trackingAllowed, setTrackingAllowed] = useState(false)
  const [browserPrivacySignal, setBrowserPrivacySignal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [legalSubmitting, setLegalSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getPrivacyExport()
      .then((response) => {
        if (cancelled) return
        setSnapshot(response.data)
      })
      .catch(() => {
        if (cancelled) return
        setFeedback("개인정보 내보내기 데이터를 불러오지 못했습니다.")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    getLegalReconsentStatus()
      .then((status) => {
        if (!cancelled) setLegalReconsent(status)
      })
      .catch(() => {
        if (!cancelled) setLegalFeedback("법적 문서 동의 상태를 불러오지 못했습니다.")
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const syncTrackingConsent = () => {
      setTrackingConsent(readOptionalTrackingConsent())
      setTrackingAllowed(hasOptionalTrackingConsent())
      setBrowserPrivacySignal(hasBrowserPrivacyOptOutSignal())
    }

    syncTrackingConsent()
    window.addEventListener("storage", syncTrackingConsent)
    window.addEventListener(OPTIONAL_TRACKING_CONSENT_CHANGE_EVENT, syncTrackingConsent)
    return () => {
      window.removeEventListener("storage", syncTrackingConsent)
      window.removeEventListener(OPTIONAL_TRACKING_CONSENT_CHANGE_EVENT, syncTrackingConsent)
    }
  }, [])

  const updateTrackingConsent = (granted: boolean) => {
    setOptionalTrackingConsent(granted, "settings")
    setTrackingConsent(readOptionalTrackingConsent())
    setTrackingAllowed(hasOptionalTrackingConsent())
    setBrowserPrivacySignal(hasBrowserPrivacyOptOutSignal())
  }

  const submitRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setFeedback("")
    try {
      const response = await createPrivacyRequest({
        type: requestType,
        message: message.trim() || undefined,
      })
      setCreatedRequest(response.data.item)
      if (requestType === "CONSENT_WITHDRAWAL") {
        setOptionalTrackingConsent(false, "privacy-request")
      }
      setFeedback(response.msg)
    } catch {
      setFeedback("개인정보 처리 요청을 접수하지 못했습니다.")
    } finally {
      setSubmitting(false)
    }
  }

  const submitReconsent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLegalSubmitting(true)
    setLegalFeedback("")
    try {
      const response = await submitLegalReconsent({
        age14OrOlder: ageConfirmed,
        requiredPrivacyConfirmed: privacyConfirmed,
        analyticsConsent: false,
        overseasTransferAcknowledged: overseasConfirmed,
      })
      setLegalReconsent(response.data.legalReconsent)
      setOptionalTrackingConsent(false, "legal-reconsent")
      setLegalFeedback(response.msg)
      await replaceRoute(router, normalizeNextPath(router.query.next, "/"))
    } catch {
      setLegalFeedback("최신 약관과 개인정보처리방침 동의를 저장하지 못했습니다.")
    } finally {
      setLegalSubmitting(false)
    }
  }

  return (
    <SettingsLayout active="privacy" title="개인정보 관리">
      <div className="settingsGrid">
        <section className="panel" aria-label="법적 문서 재동의">
          <h2>약관·개인정보처리방침 동의</h2>
          {legalReconsent?.required ? (
            <>
              <p className="muted">
                기존 계정은 최신 <Link href="/terms">이용약관</Link>과{" "}
                <Link href="/privacy">개인정보처리방침</Link> 확인 후 계속 이용할 수 있습니다.
              </p>
              <form className="requestForm" onSubmit={submitReconsent}>
                <label className="checkLabel">
                  <input type="checkbox" checked={ageConfirmed} onChange={(event) => setAgeConfirmed(event.target.checked)} />
                  만 14세 이상입니다.
                </label>
                <label className="checkLabel">
                  <input
                    type="checkbox"
                    checked={privacyConfirmed}
                    onChange={(event) => setPrivacyConfirmed(event.target.checked)}
                  />
                  필수 개인정보 처리 안내를 확인했습니다.
                </label>
                <label className="checkLabel">
                  <input
                    type="checkbox"
                    checked={overseasConfirmed}
                    onChange={(event) => setOverseasConfirmed(event.target.checked)}
                  />
                  국외 이전 및 외부 처리자 안내를 확인했습니다.
                </label>
                <button type="submit" disabled={legalSubmitting || !ageConfirmed || !privacyConfirmed || !overseasConfirmed}>
                  {legalSubmitting ? "저장 중" : "동의하고 계속 이용"}
                </button>
              </form>
              <p className="muted">
                동의하지 않는 경우 이 화면에서 개인정보 내보내기 또는 삭제 요청을 접수할 수 있습니다.
              </p>
            </>
          ) : legalReconsent ? (
            <p className="muted">
              최신 약관·개인정보처리방침 동의 상태입니다.
              {legalReconsent?.acceptedAt ? ` 저장 시각: ${formatDateTime(legalReconsent.acceptedAt)}` : ""}
            </p>
          ) : (
            <p className="muted">법적 문서 동의 상태를 확인하는 중입니다.</p>
          )}
          {legalFeedback ? <p className="feedback">{legalFeedback}</p> : null}
        </section>

        <section className="panel" aria-label="선택 analytics와 RUM 설정">
          <h2>선택 analytics·RUM</h2>
          <p className="muted">
            로그인과 보안에 필요한 cookie는 필수이며, Vercel Analytics, Speed Insights, Google Analytics,
            자체 RUM은 서비스 품질 측정을 위한 선택 항목입니다. 선택하지 않아도 계정과 글 읽기 기능은 제한되지 않습니다.
          </p>
          <dl className="snapshotList">
            <div>
              <dt>현재 상태</dt>
              <dd>{trackingAllowed ? "동의됨" : trackingConsent?.state === "denied" ? "거부됨" : "미동의"}</dd>
            </div>
            <div>
              <dt>저장 버전</dt>
              <dd>{trackingConsent ? `v${trackingConsent.version}` : "미저장"}</dd>
            </div>
            <div>
              <dt>저장 시각</dt>
              <dd>{formatDateTime(trackingConsent?.updatedAt)}</dd>
            </div>
            <div>
              <dt>저장 경로</dt>
              <dd>{trackingConsent ? optionalTrackingSourceLabels[trackingConsent.source] || trackingConsent.source : "미저장"}</dd>
            </div>
            <div>
              <dt>선택 범주</dt>
              <dd>
                analytics {trackingConsent?.categories.analytics ? "허용" : "차단"} · RUM{" "}
                {trackingConsent?.categories.rum ? "허용" : "차단"}
              </dd>
            </div>
            <div>
              <dt>브라우저 거부 신호</dt>
              <dd>{browserPrivacySignal ? "감지됨" : "없음"}</dd>
            </div>
          </dl>
          {browserPrivacySignal ? (
            <p className="muted">Do Not Track 또는 Global Privacy Control 신호가 감지되어 선택 추적 전송을 차단합니다.</p>
          ) : null}
          <div className="buttonRow">
            <button type="button" onClick={() => updateTrackingConsent(true)} disabled={browserPrivacySignal}>
              선택 분석 동의
            </button>
            <button type="button" onClick={() => updateTrackingConsent(false)}>
              선택 분석 거부·철회
            </button>
          </div>
          <p className="muted">
            자세한 항목은 <Link href="/cookies">쿠키 정책</Link>과 <Link href="/privacy">개인정보처리방침</Link>에서 확인할 수 있습니다.
          </p>
        </section>

        <section className="panel" aria-label="개인정보 내보내기">
          <h2>내보내기 스냅샷</h2>
          {loading ? (
            <p className="muted">개인정보 내보내기 데이터를 불러오는 중입니다.</p>
          ) : snapshot ? (
            <dl className="snapshotList">
              <div>
                <dt>이메일</dt>
                <dd>{snapshot.member.email || "미등록"}</dd>
              </div>
              <div>
                <dt>사용자 식별자</dt>
                <dd>{snapshot.member.username}</dd>
              </div>
              <div>
                <dt>가입일</dt>
                <dd>{formatDateTime(snapshot.member.createdAt)}</dd>
              </div>
              <div>
                <dt>생성 시각</dt>
                <dd>{formatDateTime(snapshot.generatedAt)}</dd>
              </div>
              <div>
                <dt>개인정보처리방침</dt>
                <dd>개인정보처리방침 {snapshot.latestLegalAcceptance?.privacyVersion || "미확인"}</dd>
              </div>
            </dl>
          ) : (
            <p className="muted">조회 가능한 개인정보 스냅샷이 없습니다.</p>
          )}
        </section>

        <section className="panel" aria-label="개인정보 처리 요청">
          <h2>처리 요청</h2>
          <form className="requestForm" onSubmit={submitRequest}>
            <label>
              요청 유형
              <select value={requestType} onChange={(event) => setRequestType(event.target.value as PrivacyRequestType)}>
                <option value="EXPORT">내보내기</option>
                <option value="CORRECTION">정정</option>
                <option value="DELETION">삭제</option>
                <option value="PROCESSING_RESTRICTION">처리 제한</option>
                <option value="CONSENT_WITHDRAWAL">동의 철회</option>
              </select>
            </label>
            <label>
              요청 사유
              <textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={4} />
            </label>
            <button type="submit" disabled={submitting}>{submitting ? "접수 중" : "처리 요청 접수"}</button>
          </form>
          {feedback ? <p className="feedback">{feedback}</p> : null}
          {createdRequest ? (
            <p className="requestResult">
              접수 번호 {createdRequest.id} · 상태 {createdRequest.status} · 기한 {formatDateTime(createdRequest.dueAt)}
            </p>
          ) : null}
        </section>
      </div>

      <style jsx>{`
        .snapshotList {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
          margin: 0;
        }

        .snapshotList div {
          min-width: 0;
        }

        dt {
          color: #65758b;
          font-size: 0.82rem;
          font-weight: 800;
        }

        dd {
          margin: 5px 0 0;
          overflow-wrap: anywhere;
          color: #1f2933;
          font-weight: 700;
        }

        .requestForm {
          display: grid;
          gap: 14px;
        }

        .buttonRow {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 16px;
        }

        label {
          display: grid;
          gap: 7px;
          color: #44515f;
          font-weight: 800;
        }

        .checkLabel {
          display: flex;
          align-items: center;
          gap: 9px;
        }

        .checkLabel input {
          width: 18px;
          height: 18px;
        }

        select,
        textarea {
          width: 100%;
          border: 1px solid #c8d0da;
          border-radius: 7px;
          padding: 11px 12px;
          color: #1f2933;
          font: inherit;
        }

        .muted,
        .feedback,
        .requestResult {
          margin: 12px 0 0;
          color: #53606f;
          line-height: 1.6;
        }

        .feedback {
          color: #174ea6;
          font-weight: 800;
        }

        @media (max-width: 640px) {
          .snapshotList {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </SettingsLayout>
  )
}

export default SettingsPrivacyPage
