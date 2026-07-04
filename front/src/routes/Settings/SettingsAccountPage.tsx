import { FormEvent, useState } from "react"
import { deletePrivacyAccount } from "src/apis/backend/privacy"
import useAuthSession from "src/hooks/useAuthSession"
import SettingsLayout from "./SettingsLayout"

const SettingsAccountPage = () => {
  const { clearMe } = useAuthSession()
  const [password, setPassword] = useState("")
  const [reason, setReason] = useState("")
  const [confirmed, setConfirmed] = useState(false)
  const [feedback, setFeedback] = useState("")
  const [revokedSessionCount, setRevokedSessionCount] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const submitDeletion = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!confirmed) return
    setSubmitting(true)
    setFeedback("")
    const trimmedPassword = password.trim()
    try {
      const response = await deletePrivacyAccount({
        password: trimmedPassword ? password : undefined,
        oauthAccountDeletionConfirmed: !trimmedPassword && confirmed,
        reason: reason.trim() || undefined,
      })
      setRevokedSessionCount(response.data.revokedSessionCount)
      setFeedback(response.msg)
      window.setTimeout(() => clearMe(), 1200)
    } catch {
      setFeedback("계정 확인 상태를 확인했지만 탈퇴를 완료하지 못했습니다.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <SettingsLayout active="account" title="계정 보안">
      <div className="settingsGrid">
        <section className="panel" aria-label="계정 탈퇴">
          <h2>계정 탈퇴</h2>
          <p className="notice">
            탈퇴하면 로그인 세션이 폐기되고 계정은 삭제 상태로 전환됩니다. 법적 의무와 보안 감사에 필요한 최소 기록은
            제한된 접근으로 보관될 수 있습니다.
          </p>
          <form className="deleteForm" onSubmit={submitDeletion}>
            <label>
              비밀번호 재확인 (이메일 계정)
              <input
                autoComplete="current-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <p className="fieldHint">비밀번호가 없는 소셜 계정은 비워두고 확인 체크 후 진행합니다.</p>
            <label>
              탈퇴 사유
              <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} />
            </label>
            <label className="checkRow">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              계정 탈퇴 영향을 확인했습니다.
            </label>
            <button type="submit" disabled={!confirmed || submitting}>
              {submitting ? "처리 중" : "계정 탈퇴"}
            </button>
          </form>
          {feedback ? <p className="feedback">{feedback}</p> : null}
          {revokedSessionCount != null ? <p className="result">폐기된 세션 {revokedSessionCount}개</p> : null}
        </section>
      </div>

      <style jsx>{`
        .notice {
          margin: 0 0 18px;
          color: var(--aq-text-secondary);
          line-height: 1.65;
        }

        .deleteForm {
          display: grid;
          gap: 14px;
        }

        label {
          display: grid;
          gap: 7px;
          color: var(--aq-text-secondary);
          font-weight: 800;
        }

        input[type="password"],
        textarea {
          width: 100%;
          border: 1px solid var(--aq-border);
          border-radius: 7px;
          padding: 11px 12px;
          color: var(--aq-text);
          font: inherit;
        }

        .fieldHint {
          margin: -8px 0 0;
          color: var(--aq-muted);
          font-size: 0.92rem;
          line-height: 1.5;
        }

        .checkRow {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .checkRow input {
          width: 18px;
          height: 18px;
        }

        .feedback,
        .result {
          margin: 12px 0 0;
          color: var(--aq-accent-link);
          font-weight: 800;
        }
      `}</style>
    </SettingsLayout>
  )
}

export default SettingsAccountPage
