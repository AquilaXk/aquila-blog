import type { RefObject } from "react"
import styled from "@emotion/styled"

import ProfileImage from "src/components/ProfileImage"

type NoticeState = {
  tone: "idle" | "loading" | "success" | "error"
  text: string
}

type EditorStudioLegacyProfileSectionProps = {
  displayName: string
  displayNameInitial: string
  profilePreviewSrc: string
  profileRoleInput: string
  profileBioInput: string
  profileImageFileInputRef: RefObject<HTMLInputElement | null>
  profileImageHint: string
  profileImageNotice: NoticeState
  profileNotice: NoticeState
  profileImageStatus: string
  profileRoleStatus: string
  profileBioStatus: string
  profileUpdatedText: string
  isProfileImageUploadDisabled: boolean
  isProfileImageUploading: boolean
  isProfileRefreshDisabled: boolean
  isProfileCardUpdateDisabled: boolean
  onProfileImageSelected: (file: File | null, fileName: string) => void
  onProfileRoleChange: (value: string) => void
  onProfileBioChange: (value: string) => void
  onRefreshAdminProfile: () => void
  onUpdateMemberProfileCard: () => void
}

export const EditorStudioLegacyProfileSection = ({
  displayName,
  displayNameInitial,
  profilePreviewSrc,
  profileRoleInput,
  profileBioInput,
  profileImageFileInputRef,
  profileImageHint,
  profileImageNotice,
  profileNotice,
  profileImageStatus,
  profileRoleStatus,
  profileBioStatus,
  profileUpdatedText,
  isProfileImageUploadDisabled,
  isProfileImageUploading,
  isProfileRefreshDisabled,
  isProfileCardUpdateDisabled,
  onProfileImageSelected,
  onProfileRoleChange,
  onProfileBioChange,
  onRefreshAdminProfile,
  onUpdateMemberProfileCard,
}: EditorStudioLegacyProfileSectionProps) => (
  <Section id="profile-studio">
    <SectionTop>
      <div>
        <SectionEyebrow>Profile Studio</SectionEyebrow>
        <h2>관리자 프로필 관리</h2>
        <SectionDescription>
          현재 로그인한 관리자 1명의 프로필만 여기서 수정합니다. 프로필 사진은 파일 선택 즉시
          업로드되고, 역할과 소개 문구는 별도 저장으로 반영됩니다.
        </SectionDescription>
      </div>
    </SectionTop>
    <ProfileStudioGrid>
      <ProfileCardPanel>
        <ProfilePreview>
          {profilePreviewSrc ? (
            <ProfileImage
              className="previewImage"
              src={profilePreviewSrc}
              alt="profile preview"
              width={120}
              height={120}
              priority
            />
          ) : (
            <ProfileFallback>{displayNameInitial}</ProfileFallback>
          )}
        </ProfilePreview>
        <ProfileSummary>
          <strong>{displayName}</strong>
          <span>{profileRoleInput.trim() || "역할을 아직 입력하지 않았습니다."}</span>
          <p>{profileBioInput.trim() || "소개 문구를 입력하면 메인 프로필 카드에 반영됩니다."}</p>
        </ProfileSummary>
        <input
          ref={profileImageFileInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null
            onProfileImageSelected(file, file?.name || "")
          }}
        />
        <PrimaryButton
          type="button"
          disabled={isProfileImageUploadDisabled}
          onClick={() => profileImageFileInputRef.current?.click()}
        >
          {isProfileImageUploading ? "업로드 중..." : "프로필 이미지 선택"}
        </PrimaryButton>
        <InlineHint title={profileImageHint}>{profileImageHint}</InlineHint>
        <InlineStatus data-tone={profileImageNotice.tone}>{profileImageNotice.text}</InlineStatus>
      </ProfileCardPanel>

      <FormPanelCard>
        <ProfileCurrentGrid>
          <ProfileCurrentItem>
            <label>현재 프로필 이미지</label>
            <strong>{profileImageStatus}</strong>
          </ProfileCurrentItem>
          <ProfileCurrentItem>
            <label>현재 역할</label>
            <strong>{profileRoleStatus}</strong>
          </ProfileCurrentItem>
          <ProfileCurrentItem className="wide">
            <label>현재 소개</label>
            <strong>{profileBioStatus}</strong>
          </ProfileCurrentItem>
          <ProfileCurrentItem>
            <label>최종 수정 시각</label>
            <strong>{profileUpdatedText}</strong>
          </ProfileCurrentItem>
        </ProfileCurrentGrid>
        <FieldGrid>
          <FieldBox>
            <FieldLabel htmlFor="profile-role">프로필 역할</FieldLabel>
            <Input
              id="profile-role"
              placeholder="예: backend developer"
              value={profileRoleInput}
              onChange={(event) => onProfileRoleChange(event.target.value)}
            />
          </FieldBox>
          <FieldBox className="wide">
            <FieldLabel htmlFor="profile-bio">소개 문구</FieldLabel>
            <ProfileBioTextArea
              id="profile-bio"
              placeholder="메인 페이지 소개문구"
              value={profileBioInput}
              onChange={(event) => onProfileBioChange(event.target.value)}
            />
          </FieldBox>
        </FieldGrid>
        <ActionRow>
          <Button type="button" disabled={isProfileRefreshDisabled} onClick={onRefreshAdminProfile}>
            현재 저장값 다시 불러오기
          </Button>
          <PrimaryButton type="button" disabled={isProfileCardUpdateDisabled} onClick={onUpdateMemberProfileCard}>
            역할/소개 저장
          </PrimaryButton>
        </ActionRow>
        <InlineStatus data-tone={profileNotice.tone}>{profileNotice.text}</InlineStatus>
      </FormPanelCard>
    </ProfileStudioGrid>
  </Section>
)

const Section = styled.section`
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  border-radius: 14px;
  padding: 0.9rem;
  margin-bottom: 1.2rem;
  background: ${({ theme }) => theme.colors.gray2};
  box-shadow: none;

  h2 {
    margin: 0;
    font-size: 1.2rem;
    color: ${({ theme }) => theme.colors.gray12};
  }

  @media (max-width: 420px) {
    border-radius: 12px;
    padding: 0.74rem;
    margin-bottom: 0.95rem;
  }
`

const SectionTop = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.95rem;
`

const SectionEyebrow = styled.span`
  display: none;
`

const SectionDescription = styled.p`
  margin: 0.22rem 0 0;
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.82rem;
  line-height: 1.5;
`

const ProfileStudioGrid = styled.div`
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: 0.9rem;
  align-items: start;

  @media (max-width: 980px) {
    grid-template-columns: 1fr;
  }
`

const ProfileCardPanel = styled.div`
  border-radius: 0;
  border: 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.gray6};
  background: transparent;
  padding: 0 0 0.9rem;
  display: grid;
  gap: 0.85rem;
  width: 100%;
  min-width: 0;
  overflow: hidden;
  justify-items: center;
  text-align: center;
  align-content: start;
`

const ProfilePreview = styled.div`
  display: grid;
  place-items: center;
  padding: 0.15rem;
  width: 124px;
  height: 124px;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: transparent;
  overflow: hidden;
  flex-shrink: 0;

  .previewImage {
    width: 120px;
    height: 120px;
    object-fit: cover;
    object-position: center 38%;
    border-radius: 999px;
    display: block;
    border: none;
  }
`

const ProfileFallback = styled.div`
  width: 120px;
  height: 120px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: ${({ theme }) => theme.colors.gray4};
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 1.6rem;
  font-weight: 800;
`

const ProfileSummary = styled.div`
  display: grid;
  gap: 0.18rem;
  width: 100%;
  min-width: 0;

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 1rem;
    overflow-wrap: anywhere;
  }

  span {
    color: ${({ theme }) => theme.colors.blue11};
    font-size: 0.84rem;
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  p {
    margin: 0.2rem 0 0;
    color: ${({ theme }) => theme.colors.gray11};
    line-height: 1.6;
    font-size: 0.85rem;
    white-space: pre-line;
    overflow-wrap: anywhere;
  }
`

const InlineHint = styled.p`
  margin: 0;
  width: 100%;
  min-width: 0;
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.8rem;
  line-height: 1.5;
  overflow-wrap: anywhere;
  word-break: break-word;
`

const FormPanelCard = styled.div`
  border-radius: 0;
  border: 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.gray6};
  background: transparent;
  padding: 0 0 0.9rem;
`

const ProfileCurrentGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.65rem;
  margin-bottom: 0.85rem;

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }
`

const ProfileCurrentItem = styled.div`
  display: grid;
  gap: 0.2rem;
  padding: 0.56rem 0;
  border-radius: 0;
  border: 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.gray6};
  background: transparent;
  min-width: 0;

  &.wide {
    grid-column: span 2;

    @media (max-width: 720px) {
      grid-column: span 1;
    }

    strong {
      white-space: pre-line;
    }
  }

  label {
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.74rem;
    font-weight: 700;
  }

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.86rem;
    line-height: 1.5;
    overflow-wrap: anywhere;
  }
`

const FieldGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.7rem;

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }
`

const FieldBox = styled.div`
  display: grid;
  gap: 0.26rem;

  &.wide {
    grid-column: span 2;

    @media (max-width: 720px) {
      grid-column: span 1;
    }
  }
`

const FieldLabel = styled.label`
  font-size: 0.8rem;
  font-weight: 650;
  color: ${({ theme }) => theme.colors.gray11};
`

const Input = styled.input`
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 8px;
  padding: 0.72rem 0.8rem;
  min-height: 44px;
  min-width: 0;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray12};

  &:focus-visible {
    outline: none;
    border-color: ${({ theme }) => theme.colors.blue8};
    box-shadow: 0 0 0 4px ${({ theme }) => theme.colors.blue4};
  }
`

const ProfileBioTextArea = styled.textarea`
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 8px;
  padding: 0.72rem 0.8rem;
  min-height: 96px;
  min-width: 0;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray12};
  line-height: 1.6;
  resize: vertical;

  &:focus-visible {
    outline: none;
    border-color: ${({ theme }) => theme.colors.blue8};
    box-shadow: 0 0 0 4px ${({ theme }) => theme.colors.blue4};
  }
`

const ActionRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  margin-top: 0.85rem;
  align-items: center;

  > button {
    min-width: 8.8rem;
  }

  @media (max-width: 720px) {
    display: grid;
    grid-template-columns: 1fr;

    > button {
      width: 100%;
    }
  }
`

const InlineStatus = styled.div`
  margin-bottom: 0.85rem;
  padding: 0.62rem 0.72rem;
  border-radius: 8px;
  font-size: 0.82rem;
  line-height: 1.5;
  width: 100%;
  min-width: 0;
  overflow-wrap: anywhere;
  word-break: break-word;

  &[data-tone="idle"] {
    color: ${({ theme }) => theme.colors.gray11};
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: transparent;
  }

  &[data-tone="loading"] {
    color: ${({ theme }) => theme.colors.blue11};
    border: 1px solid ${({ theme }) => theme.colors.blue7};
    background: ${({ theme }) => theme.colors.blue3};
  }

  &[data-tone="success"] {
    color: ${({ theme }) => theme.colors.green11};
    border: 1px solid ${({ theme }) => theme.colors.green7};
    background: ${({ theme }) => theme.colors.green3};
  }

  &[data-tone="error"] {
    color: ${({ theme }) => theme.colors.red11};
    border: 1px solid ${({ theme }) => theme.colors.red7};
    background: ${({ theme }) => theme.colors.red3};
  }
`

const Button = styled.button`
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 8px;
  padding: 0.62rem 0.92rem;
  min-height: 44px;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray10};
  cursor: pointer;
  font-size: 0.84rem;
  font-weight: 600;
  transition:
    border-color 0.18s ease,
    background-color 0.18s ease,
    color 0.18s ease,
    box-shadow 0.18s ease;

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.gray8};
    background: ${({ theme }) => theme.colors.gray3};
    color: ${({ theme }) => theme.colors.gray12};
  }

  &:focus-visible {
    outline: none;
    border-color: ${({ theme }) => theme.colors.blue8};
    box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.blue4};
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
`

const PrimaryButton = styled(Button)`
  border-radius: 8px;
  padding: 0.6rem 0.88rem;
  border-color: ${({ theme }) => theme.colors.blue9};
  background: ${({ theme }) => theme.colors.blue9};
  color: ${({ theme }) => theme.colors.gray1};
  font-weight: 700;

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.blue10};
    background: ${({ theme }) => theme.colors.blue10};
    color: ${({ theme }) => theme.colors.gray1};
  }
`
