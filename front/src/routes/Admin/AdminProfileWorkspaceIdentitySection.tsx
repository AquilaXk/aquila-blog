import ProfileImage from "src/components/ProfileImage"
import type { ProfileWorkspaceContent } from "src/libs/profileWorkspace"
import {
  AvatarFallback,
  AvatarWorkspaceCard,
  FieldBox,
  FieldGrid,
  FieldLabel,
  FieldSectionCard,
  GhostButton,
  Input,
  SectionStack,
  TextArea,
} from "src/routes/Admin/AdminProfileWorkspace.styles"

export const renderAdminProfileIdentitySection = (props: Record<string, any>) => {
  const {
    displayNameInput,
    draft,
    loadingKey,
    profileImageFileName,
    sessionMember,
    setDisplayNameInput,
    setIsProfileImageEditorOpen,
    updateDraft,
  } = props as Record<string, any> & { draft: ProfileWorkspaceContent }
  const displayName = displayNameInput.trim() || sessionMember?.nickname || sessionMember?.username || "관리자"
  const displayNameInitial = displayName.slice(0, 2).toUpperCase()

  return (
    <SectionStack>
      <AvatarWorkspaceCard>
        <div className="avatarPreview">
          {draft.profileImageUrl ? (
            <ProfileImage src={draft.profileImageUrl} alt={displayName} width={88} height={88} priority />
          ) : (
            <AvatarFallback>{displayNameInitial}</AvatarFallback>
          )}
        </div>
        <div className="avatarMeta">
          <strong>{displayName}</strong>
          {profileImageFileName ? <span>{profileImageFileName}</span> : null}
        </div>
        <GhostButton
          type="button"
          onClick={() => setIsProfileImageEditorOpen(true)}
          disabled={loadingKey === "upload"}
        >
          {loadingKey === "upload" ? "업로드 중..." : "이미지 바꾸기"}
        </GhostButton>
      </AvatarWorkspaceCard>

      <FieldSectionCard>
        <FieldGrid data-columns="2">
          <FieldBox>
            <FieldLabel htmlFor="profile-display-name">계정 이름</FieldLabel>
            <Input
              id="profile-display-name"
              value={displayNameInput}
              maxLength={30}
              placeholder="공개 프로필에 표시할 이름"
              autoComplete="nickname"
              onChange={(event) => setDisplayNameInput(event.target.value)}
            />
          </FieldBox>
          <FieldBox>
            <FieldLabel htmlFor="profile-role">한 줄 역할</FieldLabel>
            <Input
              id="profile-role"
              value={draft.profileRole}
              placeholder="예: 플랫폼 백엔드 엔지니어"
              onChange={(event) => updateDraft("profileRole", event.target.value)}
            />
          </FieldBox>
          <FieldBox data-span="full">
            <FieldLabel htmlFor="profile-bio">짧은 소개</FieldLabel>
            <TextArea
              id="profile-bio"
              value={draft.profileBio}
              placeholder="프로필 카드에서 바로 읽히는 한두 문장 소개를 적어주세요."
              onChange={(event) => updateDraft("profileBio", event.target.value)}
            />
          </FieldBox>
        </FieldGrid>
      </FieldSectionCard>
    </SectionStack>
  )
}
