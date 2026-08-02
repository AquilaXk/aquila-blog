import Link from "next/link"
import { useRouter } from "next/router"
import { FormEvent, useEffect, useRef, useState } from "react"
import { getLegalReconsentStatus, LegalReconsentStatus, submitLegalReconsent } from "src/apis/backend/legal"
import { toUserFacingMessage } from "src/apis/backend/errorClassification"
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
import { EmptyState, Skeleton } from "src/design-system/StatePresenters"
import SettingsLayout from "./SettingsLayout"
import { privacyPageStyles } from "./SettingsPrivacyPage.styles"

type FeedbackTone = "danger" | "success"

type FeedbackState = {
  tone: FeedbackTone
  text: string
}

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

const RECONSENT_INCOMPLETE_MESSAGE = "세 항목을 모두 확인해야 계속 이용할 수 있습니다."

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
  const [feedback, setFeedback] = useState<FeedbackState | null>(null)
  const [legalFeedback, setLegalFeedback] = useState<FeedbackState | null>(null)
  const [trackingConsent, setTrackingConsent] = useState<OptionalTrackingConsentRecord | null>(null)
  const [trackingAllowed, setTrackingAllowed] = useState(false)
  const [browserPrivacySignal, setBrowserPrivacySignal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [legalLoading, setLegalLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [legalSubmitting, setLegalSubmitting] = useState(false)
  const reconsentFormRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getPrivacyExport()
      .then((response) => {
        if (cancelled) return
        setSnapshot(response.data)
      })
      .catch((error) => {
        if (cancelled) return
        setFeedback({
          tone: "danger",
          text: toUserFacingMessage(error),
        })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    getLegalReconsentStatus()
      .then((status) => {
        if (!cancelled) setLegalReconsent(status)
      })
      .catch((error) => {
        if (!cancelled) {
          setLegalFeedback({
            tone: "danger",
            text: toUserFacingMessage(error),
          })
        }
      })
      .finally(() => {
        if (!cancelled) setLegalLoading(false)
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
    setFeedback(null)
    try {
      const response = await createPrivacyRequest({
        type: requestType,
        message: message.trim() || undefined,
      })
      setCreatedRequest(response.data.item)
      if (requestType === "CONSENT_WITHDRAWAL") {
        setOptionalTrackingConsent(false, "privacy-request")
      }
      setFeedback({ tone: "success", text: response.msg })
    } catch (error) {
      setFeedback({
        tone: "danger",
        text: toUserFacingMessage(error),
      })
    } finally {
      setSubmitting(false)
    }
  }

  const submitReconsent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (legalSubmitting) return
    if (!ageConfirmed || !privacyConfirmed || !overseasConfirmed) {
      // 필수 3항목이 비면 서버 400을 만들지 않고 화면에서 먼저 되돌려 첫 미확인 항목으로 포커스를 옮긴다.
      setLegalFeedback({ tone: "danger", text: RECONSENT_INCOMPLETE_MESSAGE })
      reconsentFormRef.current?.querySelector<HTMLInputElement>('input[type="checkbox"]:not(:checked)')?.focus()
      return
    }
    setLegalSubmitting(true)
    setLegalFeedback(null)
    try {
      const response = await submitLegalReconsent({
        age14OrOlder: ageConfirmed,
        requiredPrivacyConfirmed: privacyConfirmed,
        analyticsConsent: false,
        overseasTransferAcknowledged: overseasConfirmed,
      })
      setLegalReconsent(response.data.legalReconsent)
      setOptionalTrackingConsent(false, "legal-reconsent")
      setLegalFeedback({ tone: "success", text: response.msg })
      await replaceRoute(router, normalizeNextPath(router.query.next, "/"))
    } catch (error) {
      setLegalFeedback({
        tone: "danger",
        text: toUserFacingMessage(error),
      })
    } finally {
      setLegalSubmitting(false)
    }
  }

  const reconsentRequired = legalReconsent?.required === true
  const nextPath = normalizeNextPath(router.query.next, "/")
  const nextLabel = nextPath === "/" ? "홈" : nextPath
  // 법무 문구 고정: 세 항목의 라벨은 회원가입 동의와 같은 문장을 그대로 유지해야 감사 기록이 일치한다.
  const consentItems = [
    {
      id: "reconsent-age",
      label: "만 14세 이상입니다.",
      checked: ageConfirmed,
      onChange: setAgeConfirmed,
    },
    {
      id: "reconsent-privacy",
      label: "필수 개인정보 처리 안내를 확인했습니다.",
      checked: privacyConfirmed,
      onChange: setPrivacyConfirmed,
    },
    {
      id: "reconsent-overseas",
      label: "국외 이전 및 외부 처리자 안내를 확인했습니다.",
      checked: overseasConfirmed,
      onChange: setOverseasConfirmed,
    },
  ]
  const confirmedCount = consentItems.filter((item) => item.checked).length
  const trackingSummary = trackingAllowed ? "켜짐" : "꺼짐"
  const trackingRecordLabel = trackingConsent
    ? trackingConsent.state === "granted"
      ? "동의함"
      : "거부함"
    : "선택한 적 없음"

  return (
    <SettingsLayout active="privacy" title="개인정보 관리">
      <div className="settingsGrid">
        <section
          className={reconsentRequired ? "panel gatePanel" : "panel"}
          aria-label="법적 문서 재동의"
          data-gate={reconsentRequired ? "required" : undefined}
        >
          {legalLoading ? (
            <>
              <h2>약관·개인정보처리방침 동의</h2>
              <div className="statusSkeleton" aria-busy="true" aria-label="법적 문서 동의 상태 확인 중">
                <Skeleton height="1rem" width="42%" />
                <Skeleton height="1rem" width="66%" />
              </div>
            </>
          ) : reconsentRequired && legalReconsent ? (
            <>
              <p className="sectionLabel">RECONSENT</p>
              <h2 className="gateTitle">계속 이용하려면 다시 동의해 주세요</h2>
              <p className="lead">
                이용약관과 개인정보처리방침이 최신 버전(이용약관 {legalReconsent.termsVersion} · 개인정보처리방침{" "}
                {legalReconsent.privacyVersion})으로 갱신되어, 아래 세 항목을 다시 확인해야 합니다.
              </p>
              {router.isReady ? (
                <p className="gateReturn">
                  동의를 마치면 <span className="gateReturnPath">{nextLabel}</span> 화면으로 자동으로 돌아갑니다.
                </p>
              ) : null}
              <form className="consentForm" ref={reconsentFormRef} onSubmit={submitReconsent} noValidate>
                <ul className="consentList">
                  {consentItems.map((item) => (
                    <li key={item.id}>
                      <label className="consentRow">
                        <input
                          id={item.id}
                          type="checkbox"
                          checked={item.checked}
                          onChange={(event) => item.onChange(event.target.checked)}
                        />
                        <span className="consentText">{item.label}</span>
                      </label>
                    </li>
                  ))}
                </ul>
                <div className="actionRow">
                  <button type="submit" className="actionPrimary" disabled={legalSubmitting}>
                    {legalSubmitting ? "저장 중" : "동의하고 계속 이용"}
                  </button>
                  <p className="actionHint" role="status" aria-live="polite">
                    필수 {confirmedCount}/{consentItems.length} 확인
                  </p>
                </div>
              </form>
              <p className="muted">
                최신 문서는 <Link href="/terms">이용약관</Link>과 <Link href="/privacy">개인정보처리방침</Link>에서
                확인할 수 있습니다. 동의하지 않으려면 아래 <a href="#privacy-requests">처리 요청</a>에서 내보내기 또는
                삭제를 접수할 수 있습니다.
              </p>
            </>
          ) : legalReconsent ? (
            <>
              <h2>약관·개인정보처리방침 동의</h2>
              <p className="statusLine" data-tone="success">
                <span className="statusDot" aria-hidden="true" />
                최신 문서에 동의한 상태입니다.
              </p>
              <p className="muted">
                {legalReconsent.acceptedAt ? `${formatDateTime(legalReconsent.acceptedAt)} 동의 · ` : ""}이용약관{" "}
                {legalReconsent.termsVersion} · 개인정보처리방침 {legalReconsent.privacyVersion}
              </p>
              <p className="muted">
                <Link href="/terms">이용약관</Link> · <Link href="/privacy">개인정보처리방침</Link>
              </p>
            </>
          ) : (
            <>
              <h2>약관·개인정보처리방침 동의</h2>
              <p className="muted">동의 상태를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>
            </>
          )}
          {legalFeedback ? (
            <p
              className="feedback"
              data-tone={legalFeedback.tone}
              role={legalFeedback.tone === "danger" ? "alert" : "status"}
              aria-live={legalFeedback.tone === "danger" ? undefined : "polite"}
            >
              {legalFeedback.text}
            </p>
          ) : null}
        </section>

        <section className="panel" aria-label="선택 analytics와 RUM 설정">
          <h2>선택 분석</h2>
          <p className="lead">
            로그인과 보안에 필요한 쿠키는 필수입니다. 서비스 품질을 확인하기 위한 접속 분석(analytics)과 성능
            측정(RUM)은 선택 항목이며, 켜지 않아도 계정과 글 읽기 기능은 제한되지 않습니다.
          </p>
          <p className="statusLine" data-tone={trackingAllowed ? "accent" : "neutral"} role="status" aria-live="polite">
            <span className="statusDot" aria-hidden="true" />
            선택 분석: {trackingSummary}
          </p>
          {browserPrivacySignal ? (
            <p className="muted" id="tracking-signal-note">
              브라우저에서 추적 거부를 요청하고 있어 선택 분석은 항상 꺼진 상태로 유지됩니다.
            </p>
          ) : null}
          <div className="actionRow">
            <button
              type="button"
              className="actionSecondary"
              aria-describedby={browserPrivacySignal ? "tracking-signal-note" : undefined}
              disabled={browserPrivacySignal && !trackingAllowed}
              onClick={() => updateTrackingConsent(!trackingAllowed)}
            >
              {trackingAllowed ? "선택 분석 끄기" : "선택 분석 켜기"}
            </button>
          </div>
          <details className="detailBlock">
            <summary>내 선택 기록 자세히 보기</summary>
            <dl className="detailList">
              <div>
                <dt>내 선택</dt>
                <dd>{trackingRecordLabel}</dd>
              </div>
              <div>
                <dt>선택한 시각</dt>
                <dd>{formatDateTime(trackingConsent?.updatedAt)}</dd>
              </div>
              <div>
                <dt>선택한 곳</dt>
                <dd>
                  {trackingConsent
                    ? optionalTrackingSourceLabels[trackingConsent.source] || trackingConsent.source
                    : "없음"}
                </dd>
              </div>
              <div>
                <dt>적용 범위</dt>
                <dd>
                  접속 분석 {trackingConsent?.categories.analytics ? "허용" : "차단"} · 성능 측정{" "}
                  {trackingConsent?.categories.rum ? "허용" : "차단"}
                </dd>
              </div>
              <div>
                <dt>브라우저 추적 거부 요청</dt>
                <dd>{browserPrivacySignal ? "있음" : "없음"}</dd>
              </div>
            </dl>
          </details>
          <p className="muted">
            처리하는 항목과 외부 처리자는 <Link href="/cookies">쿠키 정책</Link>과{" "}
            <Link href="/privacy">개인정보처리방침</Link>에서 확인할 수 있습니다.
          </p>
        </section>

        <section className="panel" aria-label="개인정보 내보내기">
          <h2>내보내기 스냅샷</h2>
          {loading ? (
            <div className="snapshotSkeleton" aria-busy="true" aria-label="개인정보 내보내기 로딩">
              <Skeleton height="1rem" width="40%" />
              <Skeleton height="1.25rem" width="70%" />
              <Skeleton height="1rem" width="55%" />
              <Skeleton height="1.25rem" width="62%" />
            </div>
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
            <EmptyState
              label="EXPORT"
              description="조회 가능한 개인정보 스냅샷이 없습니다."
            />
          )}
        </section>

        <section className="panel" id="privacy-requests" aria-label="개인정보 처리 요청">
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
            <button type="submit" className="actionPrimary" disabled={submitting}>
              {submitting ? "접수 중" : "처리 요청 접수"}
            </button>
          </form>
          {feedback ? (
            <p
              className="feedback"
              data-tone={feedback.tone}
              role={feedback.tone === "danger" ? "alert" : "status"}
              aria-live={feedback.tone === "danger" ? undefined : "polite"}
            >
              {feedback.text}
            </p>
          ) : null}
          {createdRequest ? (
            <p className="requestResult">
              접수 번호 {createdRequest.id} · 상태 {createdRequest.status} · 기한 {formatDateTime(createdRequest.dueAt)}
            </p>
          ) : null}
        </section>
      </div>

      <style jsx>{privacyPageStyles}</style>
    </SettingsLayout>
  )
}

export default SettingsPrivacyPage
