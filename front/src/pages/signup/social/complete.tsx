import styled from "@emotion/styled"
import { GetServerSideProps } from "next"
import Link from "next/link"
import { useRouter } from "next/router"
import { FormEvent, useEffect, useMemo, useRef, useState } from "react"
import { apiFetch } from "src/apis/backend/client"
import { toAuthErrorMessage } from "src/apis/backend/errorMessages"
import { ACTIVE_LEGAL_DOCUMENTS, buildSocialSignupLegalAcceptancePayload } from "src/apis/backend/legal"
import AuthShell from "src/components/auth/AuthShell"
import { normalizeNextPath, replaceRoute, toLoginPath, toSignupPath } from "src/libs/router"
import { GuestPageProps, getGuestPageProps } from "src/libs/server/guestPage"

type RsData<T> = {
  resultCode: string
  msg: string
  data: T
}

type SocialSignupPendingDetails = {
  provider: string
  nickname: string
  profileImgUrl: string | null
  expiresAt: string
}

type SocialSignupFragment = {
  token: string | null
  provider: string | null
  next: string
}

export const getServerSideProps: GetServerSideProps<GuestPageProps> = async ({ req }) => {
  return await getGuestPageProps(req)
}

const readSocialSignupFragment = (): SocialSignupFragment => {
  if (typeof window === "undefined") {
    return { token: null, provider: null, next: "/" }
  }

  const fragment = window.location.hash.replace(/^#/, "")
  const params = new URLSearchParams(fragment)
  const token = params.get("token")?.trim() || null
  const provider = params.get("provider")?.trim() || null
  const next = normalizeNextPath(params.get("next"), "/")
  const cleanUrl = `${window.location.pathname}${window.location.search}`
  window.history.replaceState(window.history.state, "", cleanUrl)

  return { token, provider, next }
}

const providerLabel = (provider: string | null | undefined) => {
  const normalizedProvider = provider?.trim().toLowerCase()
  if (normalizedProvider === "kakao") return "Kakao"
  return provider?.trim() || "Social"
}

const SocialSignupCompletePage = () => {
  const router = useRouter()
  const [pending, setPending] = useState<SocialSignupPendingDetails | null>(null)
  const [loadingPending, setLoadingPending] = useState(true)
  const [pendingError, setPendingError] = useState("")
  const [nickname, setNickname] = useState("")
  const [provider, setProvider] = useState<string | null>(null)
  const [next, setNext] = useState("/")
  const [age14OrOlder, setAge14OrOlder] = useState(false)
  const [requiredPrivacyConfirmed, setRequiredPrivacyConfirmed] = useState(false)
  const [analyticsConsent, setAnalyticsConsent] = useState(false)
  const [overseasTransferAcknowledged, setOverseasTransferAcknowledged] = useState(false)
  const [submitError, setSubmitError] = useState("")
  const [submitLoading, setSubmitLoading] = useState(false)
  const [pendingRetryCount, setPendingRetryCount] = useState(0)
  const pendingTokenRef = useRef<string | null>(null)

  const fallbackNext = useMemo(() => normalizeNextPath(router.query.next, "/"), [router.query.next])

  useEffect(() => {
    if (!router.isReady) return

    const existingToken = pendingTokenRef.current
    const fragment = existingToken ? null : readSocialSignupFragment()
    const token = existingToken ?? fragment?.token ?? null
    pendingTokenRef.current = token
    if (fragment) {
      setProvider(fragment.provider)
      setNext(fragment.next || fallbackNext)
    }

    if (!token) {
      setPendingError("소셜 회원가입 세션이 올바르지 않습니다.")
      setLoadingPending(false)
      return
    }

    let cancelled = false

    const fetchPending = async () => {
      setLoadingPending(true)
      setPendingError("")

      try {
        const response = await apiFetch<RsData<SocialSignupPendingDetails>>(
          "/member/api/v1/signup/social/pending",
          {
            method: "POST",
            body: JSON.stringify({ token }),
          },
        )

        if (cancelled) return
        setPending(response.data)
        setProvider(response.data.provider)
        setNickname(response.data.nickname)
      } catch (error) {
        if (cancelled) return
        setPendingError(toAuthErrorMessage("signupVerify", error, "소셜 회원가입 세션을 확인하지 못했습니다."))
      } finally {
        if (!cancelled) setLoadingPending(false)
      }
    }

    void fetchPending()

    return () => {
      cancelled = true
    }
  }, [fallbackNext, pendingRetryCount, router.isReady])

  const retryPending = () => {
    if (!pendingTokenRef.current) return
    setPendingRetryCount((value) => value + 1)
  }

  const requiredLegalAccepted = age14OrOlder && requiredPrivacyConfirmed && overseasTransferAcknowledged
  const resolvedProviderLabel = providerLabel(pending?.provider ?? provider)
  const submitFeedbackMessage = submitError ? (
    <ErrorText>{submitError}</ErrorText>
  ) : (
    <InfoText>가입이 끝나면 로그인 화면으로 이동합니다. 이후부터는 {resolvedProviderLabel} 계정으로 로그인합니다.</InfoText>
  )

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!pending || !pendingTokenRef.current) {
      setSubmitError("소셜 회원가입 세션이 준비되지 않았습니다.")
      return
    }

    if (!nickname.trim()) {
      setSubmitError("프로필 이름을 입력해주세요.")
      return
    }

    if (!requiredLegalAccepted) {
      setSubmitError("만 14세 이상, 개인정보 필수 안내, 국외 이전 안내를 모두 확인해주세요.")
      return
    }

    setSubmitLoading(true)
    setSubmitError("")

    try {
      await apiFetch<RsData<unknown>>("/member/api/v1/signup/social/complete", {
        method: "POST",
        body: JSON.stringify({
          token: pendingTokenRef.current,
          nickname: nickname.trim(),
          ...buildSocialSignupLegalAcceptancePayload({
            age14OrOlder,
            requiredPrivacyConfirmed,
            analyticsConsent,
            overseasTransferAcknowledged,
          }),
        }),
      })

      await replaceRoute(router, `/login?signup=done&next=${encodeURIComponent(next)}`)
    } catch (error) {
      setSubmitError(toAuthErrorMessage("signupComplete", error, "소셜 회원가입에 실패했습니다."))
    } finally {
      setSubmitLoading(false)
    }
  }

  return (
    <AuthShell
      activeTab="signup"
      title="소셜 회원가입"
      eyebrow="Social Signup"
      heroTitle="소셜 회원가입"
      heroDescription="Kakao에서 받은 프로필 정보를 확인하고 필수 약관에 동의하면 가입이 완료됩니다."
      hideTabs
      footer={
        <FooterText>
          다시 시작하려면 <Link href={toSignupPath(next)}>회원가입 처음으로</Link>
        </FooterText>
      }
      loginHref={toLoginPath(next)}
      signupHref={toSignupPath(next)}
    >
      {loadingPending ? (
        <InfoText>소셜 회원가입 세션을 확인하고 있습니다...</InfoText>
      ) : pendingError ? (
        <ErrorPanel>
          <ErrorText>{pendingError}</ErrorText>
          <GhostButton type="button" onClick={retryPending} disabled={!pendingTokenRef.current}>
            다시 확인
          </GhostButton>
        </ErrorPanel>
      ) : pending ? (
        <form onSubmit={onSubmit}>
          <ProfileSummary aria-label="소셜 회원가입 프로필 정보">
            <AvatarFrame>
              {pending.profileImgUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={pending.profileImgUrl} alt="" />
              ) : (
                <AvatarFallback>{resolvedProviderLabel.slice(0, 1)}</AvatarFallback>
              )}
            </AvatarFrame>
            <div>
              <ProviderName>{resolvedProviderLabel}</ProviderName>
              <ProfileName>{pending.nickname}</ProfileName>
            </div>
          </ProfileSummary>

          <Field>
            <FieldTop>
              <Label htmlFor="social-signup-nickname">프로필 이름</Label>
              <FieldHint>Kakao 프로필에서 가져옴</FieldHint>
            </FieldTop>
            <Input
              id="social-signup-nickname"
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              placeholder="프로필 이름을 입력하세요."
              autoComplete="nickname"
            />
          </Field>

          <CollectedDataBox aria-label="Kakao OAuth 처리 항목">
            <strong>처리 항목</strong>
            <ul>
              <li>Kakao OAuth provider subject hash</li>
              <li>프로필 이름</li>
              <li>프로필 이미지 URL</li>
              <li>OAuth state와 redirect origin</li>
            </ul>
          </CollectedDataBox>

          <RequiredConsentBox aria-label="소셜 회원가입 완료 필수 확인">
            <p>
              가입 시점 기준 정책 버전: 이용약관 {ACTIVE_LEGAL_DOCUMENTS.terms.version}, 개인정보처리방침{" "}
              {ACTIVE_LEGAL_DOCUMENTS.privacy.version}
            </p>
            <label>
              <input
                type="checkbox"
                checked={age14OrOlder}
                onChange={(event) => setAge14OrOlder(event.target.checked)}
              />
              <span>만 14세 이상입니다.</span>
            </label>
            <label>
              <input
                type="checkbox"
                checked={requiredPrivacyConfirmed}
                onChange={(event) => setRequiredPrivacyConfirmed(event.target.checked)}
              />
              <span>
                <Link href="/privacy">개인정보처리방침</Link>의 Kakao 로그인 및 필수 수집·이용 항목을 확인했습니다.
              </span>
            </label>
            <label>
              <input
                type="checkbox"
                checked={overseasTransferAcknowledged}
                onChange={(event) => setOverseasTransferAcknowledged(event.target.checked)}
              />
              <span>Kakao OAuth와 서비스 운영에 필요한 외부 처리자 안내를 확인했습니다.</span>
            </label>
            <label>
              <input
                type="checkbox"
                checked={analyticsConsent}
                onChange={(event) => setAnalyticsConsent(event.target.checked)}
              />
              <span>서비스 품질 개선을 위한 analytics/RUM 처리에 선택 동의합니다.</span>
            </label>
          </RequiredConsentBox>

          <FeedbackSlot aria-live="polite">{submitFeedbackMessage}</FeedbackSlot>

          <ActionRow>
            <CancelLink href={toSignupPath(next)}>취소</CancelLink>
            <PrimaryButton type="submit" disabled={submitLoading || !requiredLegalAccepted}>
              {submitLoading ? "가입 중..." : "가입"}
            </PrimaryButton>
          </ActionRow>
        </form>
      ) : null}
    </AuthShell>
  )
}

export default SocialSignupCompletePage

const Field = styled.div`
  display: grid;
  gap: 0.42rem;
`

const FieldTop = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;

  @media (max-width: 640px) {
    display: grid;
    gap: 0.16rem;
  }
`

const Label = styled.label`
  font-size: 0.92rem;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.gray12};
`

const FieldHint = styled.span`
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.78rem;
`

const Input = styled.input`
  width: 100%;
  border: 1px solid ${({ theme }) => theme.colors.gray7};
  border-radius: 14px;
  padding: 0.82rem 0.88rem;
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray12};
  transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.blue8};
    box-shadow: 0 0 0 4px ${({ theme }) => theme.colors.blue4};
    transform: translateY(-1px);
  }
`

const ProfileSummary = styled.div`
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 0.8rem;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 14px;
  background: ${({ theme }) => theme.colors.gray2};
  padding: 0.78rem 0.84rem;
`

const AvatarFrame = styled.div`
  position: relative;
  width: 64px;
  height: 64px;
  overflow: hidden;
  border-radius: 50%;
  background: ${({ theme }) => theme.colors.gray4};

  > img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`

const AvatarFallback = styled.div`
  display: grid;
  width: 100%;
  height: 100%;
  place-items: center;
  color: ${({ theme }) => theme.colors.gray12};
  font-weight: 800;
`

const ProviderName = styled.div`
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.82rem;
  font-weight: 700;
`

const ProfileName = styled.div`
  margin-top: 0.18rem;
  color: ${({ theme }) => theme.colors.gray12};
  font-size: 1rem;
  font-weight: 800;
  word-break: break-word;
`

const CollectedDataBox = styled.div`
  display: grid;
  gap: 0.46rem;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 14px;
  background: ${({ theme }) => theme.colors.gray2};
  padding: 0.74rem 0.84rem;

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.84rem;
  }

  ul {
    margin: 0;
    padding-left: 1rem;
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.82rem;
    line-height: 1.55;
  }
`

const RequiredConsentBox = styled.div`
  display: grid;
  gap: 0.58rem;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 14px;
  background: ${({ theme }) => theme.colors.gray2};
  padding: 0.74rem 0.84rem;

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.82rem;
    line-height: 1.55;
  }

  label {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.5rem;
    align-items: start;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.84rem;
    line-height: 1.5;
  }

  input {
    margin-top: 0.22rem;
  }

  a {
    color: ${({ theme }) => theme.colors.blue10};
    font-weight: 700;
  }
`

const GhostButton = styled.button`
  border: 1px solid ${({ theme }) => theme.colors.gray7};
  border-radius: 14px;
  padding: 0.82rem 0.9rem;
  background: ${({ theme }) => theme.colors.gray2};
  color: ${({ theme }) => theme.colors.gray12};
  cursor: pointer;
  white-space: nowrap;

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`

const ErrorPanel = styled.div`
  display: grid;
  gap: 0.8rem;
`

const PrimaryButton = styled.button`
  min-width: 140px;
  border: 1px solid ${({ theme }) => theme.colors.green8};
  border-radius: 14px;
  padding: 0.9rem 1rem;
  background: ${({ theme }) => theme.colors.green9};
  color: #fff;
  font-weight: 700;
  cursor: pointer;

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`

const CancelLink = styled(Link)`
  min-width: 120px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 14px;
  padding: 0.9rem 1rem;
  background: ${({ theme }) => theme.colors.gray2};
  color: ${({ theme }) => theme.colors.gray11};
  text-decoration: none;
  font-weight: 700;
`

const ActionRow = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 0.8rem;

  @media (max-width: 640px) {
    display: grid;
    grid-template-columns: 1fr;
  }
`

const FeedbackSlot = styled.div`
  min-height: 4.8rem;
  display: flex;
  align-items: stretch;

  > * {
    width: 100%;
  }
`

const ErrorText = styled.p`
  margin: 0;
  border-radius: 14px;
  border: 1px solid ${({ theme }) => theme.colors.red7};
  background: ${({ theme }) => theme.colors.red3};
  color: ${({ theme }) => theme.colors.red11};
  padding: 0.82rem 0.9rem;
  font-size: 0.9rem;
  line-height: 1.55;
`

const InfoText = styled.p`
  margin: 0;
  border-radius: 14px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
  color: ${({ theme }) => theme.colors.gray11};
  padding: 0.82rem 0.9rem;
  font-size: 0.87rem;
  line-height: 1.65;
`

const FooterText = styled.div`
  font-size: 0.9rem;
`
