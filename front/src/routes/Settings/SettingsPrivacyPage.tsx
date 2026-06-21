import { FormEvent, useEffect, useState } from "react"
import {
  createPrivacyRequest,
  getPrivacyExport,
  PrivacyExportResponse,
  PrivacyRequestItem,
  PrivacyRequestType,
} from "src/apis/backend/privacy"
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

const SettingsPrivacyPage = () => {
  const [snapshot, setSnapshot] = useState<PrivacyExportResponse | null>(null)
  const [requestType, setRequestType] = useState<PrivacyRequestType>("EXPORT")
  const [message, setMessage] = useState("")
  const [createdRequest, setCreatedRequest] = useState<PrivacyRequestItem | null>(null)
  const [feedback, setFeedback] = useState("")
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

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
    return () => {
      cancelled = true
    }
  }, [])

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
      setFeedback(response.msg)
    } catch {
      setFeedback("개인정보 처리 요청을 접수하지 못했습니다.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <SettingsLayout active="privacy" title="개인정보 관리">
      <div className="settingsGrid">
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

        label {
          display: grid;
          gap: 7px;
          color: #44515f;
          font-weight: 800;
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
