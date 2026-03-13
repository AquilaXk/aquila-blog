import styled from "@emotion/styled"
import { GetServerSideProps, NextPage } from "next"
import Link from "next/link"
import { ChangeEvent, useCallback, useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { apiFetch, getApiBaseUrl } from "src/apis/backend/client"
import ProfileImage from "src/components/ProfileImage"
import useAuthSession, { AuthMember } from "src/hooks/useAuthSession"
import { setAdminProfileCache, toAdminProfile } from "src/hooks/useAdminProfile"
import { AdminPageProps, getAdminPageProps } from "src/libs/server/adminPage"

export const getServerSideProps: GetServerSideProps<AdminPageProps> = async ({ req }) => {
  return await getAdminPageProps(req)
}

type NoticeTone = "idle" | "loading" | "success" | "error"

type MemberMe = AuthMember

const parseResponseErrorBody = async (response: Response): Promise<string> => {
  const text = await response.text().catch(() => "")
  if (!text) return ""

  try {
    const parsed = JSON.parse(text) as { resultCode?: string; msg?: string }
    const msg = parsed.msg?.trim()
    if (!msg) return text
    return parsed.resultCode ? `${msg} (${parsed.resultCode})` : msg
  } catch {
    return text
  }
}

const AdminProfilePage: NextPage<AdminPageProps> = ({ initialMember }) => {
  const queryClient = useQueryClient()
  const { me, authStatus, setMe } = useAuthSession()
  const sessionMember = authStatus === "loading" ? initialMember : me
  const [loadingKey, setLoadingKey] = useState("")
  const [notice, setNotice] = useState<{ tone: NoticeTone; text: string }>({
    tone: "idle",
    text: "",
  })
  const [profileRoleInput, setProfileRoleInput] = useState(initialMember.profileRole || "")
  const [profileBioInput, setProfileBioInput] = useState(initialMember.profileBio || "")
  const [homeIntroTitleInput, setHomeIntroTitleInput] = useState(initialMember.homeIntroTitle || "")
  const [homeIntroDescriptionInput, setHomeIntroDescriptionInput] = useState(initialMember.homeIntroDescription || "")
  const [profileImageFileName, setProfileImageFileName] = useState("")
  const [profileImgInputUrl, setProfileImgInputUrl] = useState(
    () => (initialMember.profileImageDirectUrl || initialMember.profileImageUrl || "").trim()
  )
  const profileImageFileInputRef = useRef<HTMLInputElement>(null)

  const syncProfileState = useCallback((member: MemberMe) => {
    setMe(member)
    setAdminProfileCache(queryClient, toAdminProfile(member))
    setProfileRoleInput(member.profileRole || "")
    setProfileBioInput(member.profileBio || "")
    setHomeIntroTitleInput(member.homeIntroTitle || "")
    setHomeIntroDescriptionInput(member.homeIntroDescription || "")
    setProfileImgInputUrl((member.profileImageDirectUrl || member.profileImageUrl || "").trim())
  }, [queryClient, setMe])

  const refreshAdminProfile = useCallback(async (memberId: number, fallback?: MemberMe) => {
    try {
      const detailed = await apiFetch<MemberMe>(`/member/api/v1/adm/members/${memberId}`)
      syncProfileState(detailed)
      return detailed
    } catch {
      if (fallback) syncProfileState(fallback)
      return fallback ?? null
    }
  }, [syncProfileState])

  useEffect(() => {
    if (!sessionMember) return
    syncProfileState(sessionMember)
  }, [sessionMember, syncProfileState])

  const handleUploadMemberProfileImage = async (selectedFile?: File) => {
    const file = selectedFile || profileImageFileInputRef.current?.files?.[0]
    if (!file) return
    if (!sessionMember?.id) return

    try {
      setLoadingKey("upload")
      setNotice({ tone: "loading", text: "프로필 이미지를 업로드하고 있습니다..." })

      const formData = new FormData()
      formData.append("file", file)

      const uploadResponse = await fetch(
        `${getApiBaseUrl()}/member/api/v1/adm/members/${sessionMember.id}/profileImageFile`,
        {
          method: "POST",
          credentials: "include",
          body: formData,
        }
      )

      if (!uploadResponse.ok) {
        const body = await parseResponseErrorBody(uploadResponse)
        throw new Error(`이미지 업로드 실패 (${uploadResponse.status}) ${body}`.trim())
      }

      const uploadData = (await uploadResponse.json()) as MemberMe
      syncProfileState(uploadData)
      setNotice({ tone: "success", text: "프로필 이미지가 저장되었습니다." })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setNotice({ tone: "error", text: `프로필 이미지 저장 실패: ${message}` })
    } finally {
      setLoadingKey("")
    }
  }

  const handleUpdateMemberProfileCard = async () => {
    if (!sessionMember?.id) return

    try {
      setLoadingKey("save")
      setNotice({ tone: "loading", text: "프로필 카드와 메인 소개 카드 내용을 저장하고 있습니다..." })
      const updated = await apiFetch<MemberMe>(`/member/api/v1/adm/members/${sessionMember.id}/profileCard`, {
        method: "PATCH",
        body: JSON.stringify({
          role: profileRoleInput.trim(),
          bio: profileBioInput.trim(),
          homeIntroTitle: homeIntroTitleInput.trim(),
          homeIntroDescription: homeIntroDescriptionInput.trim(),
        }),
      })
      syncProfileState(updated)
      setNotice({ tone: "success", text: "프로필 카드와 메인 소개 카드 내용이 저장되었습니다." })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setNotice({ tone: "error", text: `프로필 저장 실패: ${message}` })
    } finally {
      setLoadingKey("")
    }
  }

  if (!sessionMember) return null

  const profileSrc = profileImgInputUrl.trim()
  const profileUpdatedText = sessionMember?.modifiedAt
    ? sessionMember.modifiedAt.slice(0, 16).replace("T", " ")
    : "확인 전"

  return (
    <Main>
      <HeaderCard>
        <HeaderCopy>
          <Eyebrow>Profile Studio</Eyebrow>
          <h1>관리자 프로필 관리</h1>
          <p>관리자 1명의 프로필 카드 정보만 여기서 수정합니다.</p>
        </HeaderCopy>
        <HeaderActions>
          <Link href="/admin" passHref legacyBehavior>
            <LinkButton>허브로 돌아가기</LinkButton>
          </Link>
          <Link href="/admin/posts/new" passHref legacyBehavior>
            <LinkButton>글 작업실로 이동</LinkButton>
          </Link>
        </HeaderActions>
      </HeaderCard>

      <ProfileGrid>
        <PreviewCard>
          <AvatarFrame>
            {profileSrc ? (
              <ProfileImage src={profileSrc} alt={sessionMember.username} width={128} height={128} priority />
            ) : (
              <AvatarFallback>{sessionMember.username.slice(0, 2).toUpperCase()}</AvatarFallback>
            )}
          </AvatarFrame>
          <strong>{sessionMember.username}</strong>
          <span>{profileRoleInput.trim() || "역할 미설정"}</span>
          <p>{profileBioInput.trim() || "소개 문구 미설정"}</p>
          <input
            ref={profileImageFileInputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              const file = e.target.files?.[0]
              setProfileImageFileName(file?.name || "")
              if (file) void handleUploadMemberProfileImage(file)
            }}
          />
          <PrimaryButton
            type="button"
            onClick={() => profileImageFileInputRef.current?.click()}
            disabled={loadingKey === "upload"}
          >
            {loadingKey === "upload" ? "업로드 중..." : "프로필 이미지 선택"}
          </PrimaryButton>
          <Hint>{profileImageFileName || "아직 선택된 파일이 없습니다."}</Hint>
        </PreviewCard>

        <FormCard>
          <InfoGrid>
            <InfoItem>
              <label>현재 계정</label>
              <strong>{sessionMember.username}</strong>
            </InfoItem>
            <InfoItem>
              <label>최종 수정 시각</label>
              <strong>{profileUpdatedText}</strong>
            </InfoItem>
          </InfoGrid>
          {notice.text ? <Notice data-tone={notice.tone}>{notice.text}</Notice> : null}
          <FieldGrid>
            <FieldBox>
              <FieldLabel htmlFor="profile-role">프로필 역할</FieldLabel>
              <Input
                id="profile-role"
                placeholder="예: Backend Developer"
                value={profileRoleInput}
                onChange={(e) => setProfileRoleInput(e.target.value)}
              />
            </FieldBox>
            <FieldBox>
              <FieldLabel htmlFor="profile-bio">소개 문구</FieldLabel>
              <TextArea
                id="profile-bio"
                placeholder="메인 프로필 카드에 노출할 소개 문구"
                value={profileBioInput}
                onChange={(e) => setProfileBioInput(e.target.value)}
              />
            </FieldBox>
            <FieldBox>
              <FieldLabel htmlFor="home-intro-title">메인 소개 카드 타이틀</FieldLabel>
              <Input
                id="home-intro-title"
                placeholder="예: aquilaXk's Blog"
                value={homeIntroTitleInput}
                onChange={(e) => setHomeIntroTitleInput(e.target.value)}
              />
            </FieldBox>
            <FieldBox>
              <FieldLabel htmlFor="home-intro-description">메인 소개 카드 설명</FieldLabel>
              <TextArea
                id="home-intro-description"
                placeholder="메인 페이지 소개 카드에 노출할 설명 문구"
                value={homeIntroDescriptionInput}
                onChange={(e) => setHomeIntroDescriptionInput(e.target.value)}
              />
            </FieldBox>
          </FieldGrid>
          <ActionRow>
            <Button
              type="button"
              disabled={loadingKey === "refresh"}
              onClick={async () => {
                if (!sessionMember?.id) return
                try {
                  setLoadingKey("refresh")
                  setNotice({ tone: "loading", text: "현재 저장값을 다시 불러오는 중입니다..." })
                  const refreshed = await refreshAdminProfile(sessionMember.id, sessionMember)
                  if (refreshed) {
                    setNotice({ tone: "success", text: "현재 저장값을 다시 불러왔습니다." })
                  }
                } finally {
                  setLoadingKey("")
                }
              }}
            >
              현재 저장값 다시 불러오기
            </Button>
            <PrimaryButton type="button" disabled={loadingKey === "save"} onClick={() => void handleUpdateMemberProfileCard()}>
              {loadingKey === "save" ? "저장 중..." : "프로필/메인 소개 저장"}
            </PrimaryButton>
          </ActionRow>
        </FormCard>
      </ProfileGrid>
    </Main>
  )
}

export default AdminProfilePage

const Main = styled.main`
  max-width: 1120px;
  margin: 0 auto;
  padding: 2rem 1rem 3rem;
  display: grid;
  gap: 1rem;
`

const HeaderCard = styled.section`
  display: grid;
  gap: 1.15rem;
  padding: 1.35rem 1.25rem 1.25rem;
  border-radius: 24px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background:
    radial-gradient(circle at top left, rgba(37, 99, 235, 0.12), transparent 36%),
    linear-gradient(180deg, ${({ theme }) => theme.colors.gray2}, ${({ theme }) => theme.colors.gray1});

  h1 {
    margin: 0;
    font-size: clamp(1.85rem, 4vw, 2.4rem);
    letter-spacing: -0.05em;
    line-height: 1.08;
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray11};
    line-height: 1.75;
  }
`

const HeaderCopy = styled.div`
  display: grid;
  gap: 0.7rem;
  max-width: 38rem;
`

const Eyebrow = styled.span`
  width: fit-content;
  border-radius: 999px;
  padding: 0.42rem 0.82rem;
  border: 1px solid ${({ theme }) => theme.colors.blue7};
  background: ${({ theme }) => theme.colors.blue3};
  color: ${({ theme }) => theme.colors.blue11};
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
`

const HeaderActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
`

const BaseButton = styled.button`
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray7};
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray12};
  padding: 0.72rem 1rem;
  font-size: 0.92rem;
  font-weight: 700;
  cursor: pointer;
`

const Button = styled(BaseButton)``

const PrimaryButton = styled(BaseButton)`
  border-color: ${({ theme }) => theme.colors.blue8};
  background: ${({ theme }) => theme.colors.blue9};
  color: white;
`

const LinkButton = styled.a`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray7};
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray12};
  text-decoration: none;
  padding: 0.72rem 1rem;
  font-size: 0.92rem;
  font-weight: 700;
`

const ProfileGrid = styled.section`
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: 1rem;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`

const PanelCard = styled.section`
  border-radius: 24px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  padding: 1.15rem;
`

const PreviewCard = styled(PanelCard)`
  display: grid;
  justify-items: center;
  align-content: start;
  gap: 0.65rem;
  text-align: center;

  strong {
    font-size: 1.15rem;
  }

  span {
    color: ${({ theme }) => theme.colors.blue10};
    font-weight: 700;
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray11};
    line-height: 1.65;
  }
`

const AvatarFrame = styled.div`
  width: 128px;
  height: 128px;
  border-radius: 999px;
  overflow: hidden;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
`

const AvatarFallback = styled.div`
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  font-size: 1.6rem;
  font-weight: 800;
  background: ${({ theme }) => theme.colors.gray4};
  color: ${({ theme }) => theme.colors.gray11};
`

const Hint = styled.p`
  margin: 0;
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.86rem;
`

const FormCard = styled(PanelCard)`
  display: grid;
  gap: 1rem;
`

const InfoGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
`

const InfoItem = styled.div`
  border-radius: 18px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
  padding: 0.85rem 0.9rem;

  label {
    display: block;
    margin-bottom: 0.35rem;
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.78rem;
  }

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 1rem;
  }
`

const Notice = styled.div`
  border-radius: 16px;
  padding: 0.8rem 0.95rem;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
  color: ${({ theme }) => theme.colors.gray12};
  line-height: 1.6;

  &[data-tone="success"] {
    border-color: ${({ theme }) => theme.colors.green7};
    background: ${({ theme }) => theme.colors.green3};
    color: ${({ theme }) => theme.colors.green11};
  }

  &[data-tone="error"] {
    border-color: ${({ theme }) => theme.colors.red7};
    background: ${({ theme }) => theme.colors.red3};
    color: ${({ theme }) => theme.colors.red11};
  }

  &[data-tone="loading"] {
    border-color: ${({ theme }) => theme.colors.blue7};
    background: ${({ theme }) => theme.colors.blue3};
    color: ${({ theme }) => theme.colors.blue11};
  }
`

const FieldGrid = styled.div`
  display: grid;
  gap: 1rem;
`

const FieldBox = styled.label`
  display: grid;
  gap: 0.45rem;
`

const FieldLabel = styled.label`
  font-size: 0.82rem;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.gray11};
`

const Input = styled.input`
  width: 100%;
  border-radius: 16px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
  color: ${({ theme }) => theme.colors.gray12};
  padding: 0.9rem 1rem;
  font-size: 0.98rem;
`

const TextArea = styled.textarea`
  width: 100%;
  min-height: 140px;
  border-radius: 16px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
  color: ${({ theme }) => theme.colors.gray12};
  padding: 0.9rem 1rem;
  font-size: 0.98rem;
  line-height: 1.7;
  resize: vertical;
`

const ActionRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.7rem;
`
