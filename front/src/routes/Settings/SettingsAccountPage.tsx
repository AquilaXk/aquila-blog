import Link from "next/link"
import { FormEvent, useState } from "react"
import { deletePrivacyAccount } from "src/apis/backend/privacy"
import { ConfirmDialog } from "src/design-system/ConfirmDialog"
import useAuthSession from "src/hooks/useAuthSession"
import SettingsLayout, { settingsStyles } from "./SettingsLayout"
import { resolveAccountDeletionFailure } from "./settingsAccountDeletionFeedback"

type FeedbackTone = "danger" | "success"

type FeedbackState = {
  tone: FeedbackTone
  text: string
}

const SettingsAccountPage = () => {
  const { clearMe, me } = useAuthSession()
  const [password, setPassword] = useState("")
  const [reason, setReason] = useState("")
  const [confirmed, setConfirmed] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deletionCompleted, setDeletionCompleted] = useState(false)
  const [feedback, setFeedback] = useState<FeedbackState | null>(null)
  const [passwordError, setPasswordError] = useState("")
  const [sessionExpired, setSessionExpired] = useState(false)
  const [revokedSessionCount, setRevokedSessionCount] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const accountIdentity = me?.nickname?.trim() || me?.username?.trim() || "현재 계정"

  const openConfirm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!confirmed || submitting) return
    setPasswordError("")
    setSessionExpired(false)
    setFeedback(null)
    setConfirmOpen(true)
  }

  const runDeletion = async () => {
    setConfirmOpen(false)
    setSubmitting(true)
    setPasswordError("")
    setSessionExpired(false)
    setFeedback(null)
    const trimmedPassword = password.trim()
    try {
      const response = await deletePrivacyAccount({
        password: trimmedPassword ? password : undefined,
        oauthAccountDeletionConfirmed: !trimmedPassword && confirmed,
        reason: reason.trim() || undefined,
      })
      setRevokedSessionCount(response.data.revokedSessionCount)
      setFeedback({ tone: "success", text: response.msg })
      setDeletionCompleted(true)
      clearMe()
    } catch (error) {
      const failure = resolveAccountDeletionFailure(error)
      if (failure.kind === "password") {
        setPasswordError(failure.message)
      } else if (failure.kind === "session") {
        setSessionExpired(true)
        setFeedback({ tone: "danger", text: failure.message })
      } else {
        setFeedback({ tone: "danger", text: failure.message })
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (deletionCompleted) {
    return (
      <main className="settingsPage">
        <section className="panel completionPanel" aria-label="계정 탈퇴 완료">
          <h1>계정 탈퇴 완료</h1>
          <p
            className="feedback"
            data-tone="success"
            role="status"
            aria-live="polite"
          >
            {feedback?.text || "계정 탈퇴가 완료되었습니다."}
          </p>
          {revokedSessionCount != null ? (
            <p className="result" data-tone="success" role="status" aria-live="polite">
              폐기된 세션 {revokedSessionCount}개
            </p>
          ) : null}
          <p className="notice">
            로그인 세션이 종료되었습니다. 홈으로 이동해 서비스를 계속 이용할 수 있습니다.
          </p>
          <Link className="primaryLink" href="/">
            홈으로 이동
          </Link>
        </section>
        <style jsx global>{settingsStyles}</style>
        <style jsx>{accountPageStyles}</style>
      </main>
    )
  }

  return (
    <SettingsLayout active="account" title="계정 보안">
      <div className="settingsGrid">
        <section className="panel" aria-label="계정 탈퇴">
          <h2>계정 탈퇴</h2>
          <p className="notice">
            탈퇴하면 로그인 세션이 폐기되고 계정은 삭제 상태로 전환됩니다. 법적 의무와 보안 감사에 필요한 최소 기록는
            제한된 접근으로 보관될 수 있습니다.
          </p>
          <form className="deleteForm" onSubmit={openConfirm}>
            <label>
              비밀번호 재확인 (이메일 계정)
              <input
                autoComplete="current-password"
                type="password"
                value={password}
                aria-invalid={passwordError ? true : undefined}
                aria-describedby={passwordError ? "account-password-error" : undefined}
                onChange={(event) => {
                  setPassword(event.target.value)
                  if (passwordError) setPasswordError("")
                }}
              />
            </label>
            {passwordError ? (
              <p id="account-password-error" className="feedback" data-tone="danger" role="alert">
                {passwordError}
              </p>
            ) : null}
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
          {sessionExpired ? (
            <p className="sessionGuidance">
              <Link className="primaryLink" href="/login?next=/settings/account">
                다시 로그인
              </Link>
            </p>
          ) : null}
        </section>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        titleId="settings-account-delete-title"
        descriptionId="settings-account-delete-description"
        title="계정을 탈퇴할까요?"
        description={
          <>
            <span className="rowTitle">{accountIdentity}</span>
            <span>이 작업은 되돌릴 수 없습니다. 탈퇴를 진행하면 로그인 세션이 폐기되고 계정은 삭제 상태로 전환됩니다.</span>
          </>
        }
        confirmLabel="계정 탈퇴"
        confirmTone="danger"
        onConfirm={() => {
          void runDeletion()
        }}
        onCancel={() => setConfirmOpen(false)}
      />

      <style jsx>{accountPageStyles}</style>
    </SettingsLayout>
  )
}

const accountPageStyles = `
  .notice {
    margin: 0 0 18px;
    color: var(--aq-text-secondary);
    line-height: 1.65;
  }

  .completionPanel {
    margin-top: 48px;
  }

  .completionPanel h1 {
    margin: 0 0 12px;
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
    display: flex;
    align-items: flex-start;
    gap: 8px;
    font-weight: 800;
    line-height: 1.55;
  }

  .feedback::before,
  .result::before {
    content: "";
    width: 8px;
    height: 8px;
    margin-top: 0.45em;
    border-radius: 50%;
    flex: 0 0 auto;
    background: currentColor;
  }

  .feedback[data-tone="danger"],
  .result[data-tone="danger"] {
    color: var(--aq-status-danger);
  }

  .feedback[data-tone="success"],
  .result[data-tone="success"] {
    color: var(--aq-status-success);
  }

  .sessionGuidance {
    margin: 12px 0 0;
  }

  .sessionGuidance :global(.primaryLink) {
    margin-top: 0;
  }
`

export default SettingsAccountPage
