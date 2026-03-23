import styled from "@emotion/styled"
import { GetServerSideProps, NextPage } from "next"
import Link from "next/link"
import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { apiFetch, getApiBaseUrl } from "src/apis/backend/client"
import AppIcon, { IconName } from "src/components/icons/AppIcon"
import ProfileImage from "src/components/ProfileImage"
import {
  DEFAULT_CONTACT_ITEM_ICON,
  DEFAULT_SERVICE_ITEM_ICON,
  getProfileCardIconOptions,
  isAllowedProfileLinkHref,
  normalizeProfileCardLinkItem,
  ProfileCardIconOption,
  ProfileCardLinkItem,
  ProfileCardLinkSection,
} from "src/constants/profileCardLinks"
import useAuthSession, { AuthMember } from "src/hooks/useAuthSession"
import { setAdminProfileCache, toAdminProfile } from "src/hooks/useAdminProfile"
import { resolveContactLinks, resolveServiceLinks } from "src/libs/utils/profileCardLinks"
import { AdminPageProps, getAdminPageProps } from "src/libs/server/adminPage"
import {
  buildImageOptimizationSummary,
  normalizeProfileImageUploadError,
  prepareProfileImageForUpload,
  PROFILE_IMAGE_UPLOAD_RULE_LABEL,
} from "src/libs/profileImageUpload"

export const getServerSideProps: GetServerSideProps<AdminPageProps> = async ({ req }) => {
  return await getAdminPageProps(req)
}

type NoticeTone = "idle" | "loading" | "success" | "error"

type MemberMe = AuthMember
type LinkSectionType = "service" | "contact"
type OpenIconPicker = `${LinkSectionType}:${number}` | null

const buildMemberRevisionKey = (member: MemberMe) =>
  [
    member.id,
    member.modifiedAt || "",
    member.profileImageDirectUrl || "",
    member.profileImageUrl || "",
    member.profileRole || "",
    member.profileBio || "",
    member.homeIntroTitle || "",
    member.homeIntroDescription || "",
  ].join("|")

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

const normalizeLinkInputs = (
  section: ProfileCardLinkSection,
  items: ProfileCardLinkItem[],
  defaultIcon: IconName
): ProfileCardLinkItem[] =>
  items
    .map((item) => normalizeProfileCardLinkItem(item, defaultIcon, section))
    .filter((item): item is ProfileCardLinkItem => item !== null)

const toPayloadLinks = (
  section: ProfileCardLinkSection,
  items: ProfileCardLinkItem[],
  defaultIcon: IconName
): ProfileCardLinkItem[] =>
  normalizeLinkInputs(section, items, defaultIcon).map((item) => ({
    icon: item.icon,
    label: item.label.trim(),
    href: item.href.trim(),
  }))

const validateLinkInputs = (
  section: ProfileCardLinkSection,
  sectionLabel: "Service" | "Contact",
  items: ProfileCardLinkItem[]
): string | null => {
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]
    const label = item.label.trim()
    const href = item.href.trim()
    const rowLabel = `${sectionLabel} ${index + 1}번 항목`

    if (!label && !href) {
      return `${rowLabel}이 비어 있습니다. 입력하거나 삭제해주세요.`
    }
    if (!label || !href) {
      return `${rowLabel}은 표시 이름과 링크를 모두 입력해야 합니다.`
    }
    if (!isAllowedProfileLinkHref(section, href)) {
      if (section === "service") {
        return `${rowLabel} 링크는 https:// 또는 http:// 형식만 허용됩니다.`
      }
      return `${rowLabel} 링크는 https://, http://, mailto:, tel: 형식만 허용됩니다.`
    }
  }

  return null
}

const normalizeComparableText = (value: string | null | undefined) => (value || "").trim()

const serializeComparableLinks = (
  section: ProfileCardLinkSection,
  items: ProfileCardLinkItem[],
  defaultIcon: IconName
) => JSON.stringify(toPayloadLinks(section, items, defaultIcon))

const AdminProfilePage: NextPage<AdminPageProps> = ({ initialMember }) => {
  const queryClient = useQueryClient()
  const { me, authStatus, setMe } = useAuthSession()
  const sessionMember = authStatus === "loading" || authStatus === "unavailable" ? initialMember : me
  const [loadingKey, setLoadingKey] = useState("")
  const [imageNotice, setImageNotice] = useState<{ tone: NoticeTone; text: string }>({
    tone: "idle",
    text: "",
  })
  const [profileNotice, setProfileNotice] = useState<{ tone: NoticeTone; text: string }>({
    tone: "idle",
    text: "",
  })
  const [profileRoleInput, setProfileRoleInput] = useState(initialMember.profileRole || "")
  const [profileBioInput, setProfileBioInput] = useState(initialMember.profileBio || "")
  const [homeIntroTitleInput, setHomeIntroTitleInput] = useState(initialMember.homeIntroTitle || "")
  const [homeIntroDescriptionInput, setHomeIntroDescriptionInput] = useState(initialMember.homeIntroDescription || "")
  const [serviceLinksInput, setServiceLinksInput] = useState<ProfileCardLinkItem[]>(
    resolveServiceLinks(initialMember)
  )
  const [contactLinksInput, setContactLinksInput] = useState<ProfileCardLinkItem[]>(
    resolveContactLinks(initialMember)
  )
  const [profileImageFileName, setProfileImageFileName] = useState("")
  const [profileImgInputUrl, setProfileImgInputUrl] = useState(
    () => (initialMember.profileImageDirectUrl || initialMember.profileImageUrl || "").trim()
  )
  const [openIconPicker, setOpenIconPicker] = useState<OpenIconPicker>(null)
  const profileImageFileInputRef = useRef<HTMLInputElement>(null)
  const lastSyncedRevisionRef = useRef<string>(buildMemberRevisionKey(initialMember))

  const syncProfileState = useCallback((member: MemberMe) => {
    setMe(member)
    setAdminProfileCache(queryClient, toAdminProfile(member))
    setProfileRoleInput(member.profileRole || "")
    setProfileBioInput(member.profileBio || "")
    setHomeIntroTitleInput(member.homeIntroTitle || "")
    setHomeIntroDescriptionInput(member.homeIntroDescription || "")
    setServiceLinksInput(resolveServiceLinks(member))
    setContactLinksInput(resolveContactLinks(member))
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
    if (authStatus === "loading") return
    const nextRevision = buildMemberRevisionKey(sessionMember)
    if (lastSyncedRevisionRef.current === nextRevision) return

    syncProfileState(sessionMember)
    lastSyncedRevisionRef.current = nextRevision
  }, [authStatus, sessionMember, syncProfileState])

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (target.closest("[data-icon-picker-root='true']")) return
      setOpenIconPicker(null)
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenIconPicker(null)
      }
    }

    document.addEventListener("mousedown", handlePointerDown)
    document.addEventListener("keydown", handleEscape)
    return () => {
      document.removeEventListener("mousedown", handlePointerDown)
      document.removeEventListener("keydown", handleEscape)
    }
  }, [])

  const toPickerKey = useCallback((section: LinkSectionType, index: number): OpenIconPicker => {
    return `${section}:${index}`
  }, [])

  const getSectionIconOptions = useCallback((section: ProfileCardLinkSection): ProfileCardIconOption[] => {
    return getProfileCardIconOptions(section)
  }, [])

  const updateLinkItem = useCallback(
    (
      section: LinkSectionType,
      index: number,
      field: keyof ProfileCardLinkItem,
      value: string
    ) => {
      const updater = (items: ProfileCardLinkItem[]) =>
        items.map((item, itemIndex) =>
          itemIndex === index
            ? {
                ...item,
                [field]: value,
              }
            : item
        )

      if (section === "service") {
        setServiceLinksInput(updater)
      } else {
        setContactLinksInput(updater)
      }
    },
    []
  )

  const appendLinkItem = useCallback((section: LinkSectionType) => {
    const blankItem: ProfileCardLinkItem =
      section === "service"
        ? { icon: DEFAULT_SERVICE_ITEM_ICON, label: "", href: "" }
        : { icon: DEFAULT_CONTACT_ITEM_ICON, label: "", href: "" }

    if (section === "service") {
      setServiceLinksInput((prev) => [...prev, blankItem])
    } else {
      setContactLinksInput((prev) => [...prev, blankItem])
    }
  }, [])

  const removeLinkItem = useCallback((section: LinkSectionType, index: number) => {
    const updater = (items: ProfileCardLinkItem[]) => items.filter((_, itemIndex) => itemIndex !== index)
    if (section === "service") {
      setServiceLinksInput(updater)
    } else {
      setContactLinksInput(updater)
    }
    setOpenIconPicker((current) => {
      if (current === `${section}:${index}`) return null
      return current
    })
  }, [])

  const handleUploadMemberProfileImage = async (selectedFile?: File) => {
    const file = selectedFile || profileImageFileInputRef.current?.files?.[0]
    if (!file) return
    if (!sessionMember?.id) return

    try {
      setLoadingKey("upload")
      setImageNotice({ tone: "loading", text: "프로필 이미지를 최적화하고 업로드하고 있습니다..." })
      const prepared = await prepareProfileImageForUpload(file)

      const formData = new FormData()
      formData.append("file", prepared.file, prepared.file.name)

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
      setImageNotice({
        tone: "success",
        text: `프로필 이미지가 저장되었습니다. ${buildImageOptimizationSummary(prepared)}`,
      })
    } catch (error) {
      const message = normalizeProfileImageUploadError(error)
      setImageNotice({ tone: "error", text: `프로필 이미지 저장 실패: ${message}` })
    } finally {
      if (profileImageFileInputRef.current) {
        profileImageFileInputRef.current.value = ""
      }
      setLoadingKey("")
    }
  }

  const handleUpdateMemberProfileCard = async () => {
    if (!sessionMember?.id) return

    const serviceValidationError = validateLinkInputs("service", "Service", serviceLinksInput)
    if (serviceValidationError) {
      setProfileNotice({ tone: "error", text: serviceValidationError })
      return
    }

    const contactValidationError = validateLinkInputs("contact", "Contact", contactLinksInput)
    if (contactValidationError) {
      setProfileNotice({ tone: "error", text: contactValidationError })
      return
    }

    try {
      setLoadingKey("save")
      setProfileNotice({ tone: "loading", text: "프로필 카드와 메인 소개 카드 내용을 저장하고 있습니다..." })
      const updated = await apiFetch<MemberMe>(`/member/api/v1/adm/members/${sessionMember.id}/profileCard`, {
        method: "PATCH",
        body: JSON.stringify({
          role: profileRoleInput.trim(),
          bio: profileBioInput.trim(),
          homeIntroTitle: homeIntroTitleInput.trim(),
          homeIntroDescription: homeIntroDescriptionInput.trim(),
          serviceLinks: toPayloadLinks("service", serviceLinksInput, DEFAULT_SERVICE_ITEM_ICON),
          contactLinks: toPayloadLinks("contact", contactLinksInput, DEFAULT_CONTACT_ITEM_ICON),
        }),
      })
      syncProfileState(updated)
      setProfileNotice({ tone: "success", text: "프로필 카드와 메인 소개 카드 내용이 저장되었습니다." })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setProfileNotice({ tone: "error", text: `프로필 저장 실패: ${message}` })
    } finally {
      setLoadingKey("")
    }
  }

  const hasUnsavedChanges = useMemo(() => {
    if (!sessionMember) return false

    const currentProfileImage = normalizeComparableText(profileImgInputUrl)
    const savedProfileImage = normalizeComparableText(sessionMember.profileImageDirectUrl || sessionMember.profileImageUrl)
    if (currentProfileImage !== savedProfileImage) return true

    if (normalizeComparableText(profileRoleInput) !== normalizeComparableText(sessionMember.profileRole)) return true
    if (normalizeComparableText(profileBioInput) !== normalizeComparableText(sessionMember.profileBio)) return true
    if (normalizeComparableText(homeIntroTitleInput) !== normalizeComparableText(sessionMember.homeIntroTitle)) return true
    if (normalizeComparableText(homeIntroDescriptionInput) !== normalizeComparableText(sessionMember.homeIntroDescription)) {
      return true
    }

    const currentService = serializeComparableLinks("service", serviceLinksInput, DEFAULT_SERVICE_ITEM_ICON)
    const savedService = serializeComparableLinks(
      "service",
      resolveServiceLinks(sessionMember),
      DEFAULT_SERVICE_ITEM_ICON
    )
    if (currentService !== savedService) return true

    const currentContact = serializeComparableLinks("contact", contactLinksInput, DEFAULT_CONTACT_ITEM_ICON)
    const savedContact = serializeComparableLinks(
      "contact",
      resolveContactLinks(sessionMember),
      DEFAULT_CONTACT_ITEM_ICON
    )

    return currentContact !== savedContact
  }, [
    contactLinksInput,
    homeIntroDescriptionInput,
    homeIntroTitleInput,
    profileBioInput,
    profileImgInputUrl,
    profileRoleInput,
    serviceLinksInput,
    sessionMember,
  ])

  if (!sessionMember) return null

  const profileSrc = profileImgInputUrl.trim()
  const displayName = sessionMember.nickname || sessionMember.username || "관리자"
  const displayNameInitial = displayName.slice(0, 2).toUpperCase()
  const profileUpdatedText = sessionMember.modifiedAt
    ? sessionMember.modifiedAt.slice(0, 16).replace("T", " ")
    : "확인 전"

  const handleRefreshStoredProfile = async () => {
    if (!sessionMember?.id) return
    try {
      setLoadingKey("refresh")
      setProfileNotice({ tone: "loading", text: "현재 저장값을 다시 불러오는 중입니다..." })
      const refreshed = await refreshAdminProfile(sessionMember.id, sessionMember)
      if (refreshed) {
        setProfileNotice({ tone: "success", text: "현재 저장값을 다시 불러왔습니다." })
      }
    } finally {
      setLoadingKey("")
    }
  }

  return (
    <Main>
      <HeaderCard>
        <HeaderCopy>
          <Eyebrow>Profile Studio</Eyebrow>
          <h1>관리자 프로필 관리</h1>
          <p>관리자 1명의 프로필 카드 정보만 여기서 수정합니다.</p>
        </HeaderCopy>
        <HeaderActions>
          <Link href="/" passHref legacyBehavior>
            <LinkButton>메인으로 이동</LinkButton>
          </Link>
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
              <ProfileImage src={profileSrc} alt={displayName} width={128} height={128} priority />
            ) : (
              <AvatarFallback>{displayNameInitial}</AvatarFallback>
            )}
          </AvatarFrame>
          <strong>{displayName}</strong>
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
          <Hint>{profileImageFileName ? `선택 파일: ${profileImageFileName}` : PROFILE_IMAGE_UPLOAD_RULE_LABEL}</Hint>
          {imageNotice.text ? <Notice data-tone={imageNotice.tone}>{imageNotice.text}</Notice> : null}
        </PreviewCard>

        <FormCard>
          <MetaBar aria-label="프로필 메타 정보">
            <MetaItem>
              <span>현재 계정</span>
              <strong>{displayName}</strong>
            </MetaItem>
            <MetaItem>
              <span>최종 수정 시각</span>
              <strong>{profileUpdatedText}</strong>
            </MetaItem>
          </MetaBar>
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
            <LinkSectionCard>
              <LinkSectionHeader>
                <div>
                  <h3>Service 항목</h3>
                  <p>메인 페이지 Service 카드에 표시할 링크를 순서대로 관리합니다.</p>
                </div>
                <Button type="button" onClick={() => appendLinkItem("service")}>
                  항목 추가
                </Button>
              </LinkSectionHeader>
              <LinkSectionHint>
                아이콘은 목록에서 고르고, 표시 이름은 직접 입력합니다.
              </LinkSectionHint>
              <LinkItemsWrap>
                {serviceLinksInput.length > 0 ? (
                  serviceLinksInput.map((item, index) => (
                    <LinkItemRow key={`service-${index}`}>
                      <IconPickerField data-icon-picker-root="true">
                        <FieldLabel as="span">아이콘</FieldLabel>
                        <IconPickerButton
                          type="button"
                          aria-expanded={openIconPicker === toPickerKey("service", index)}
                          onClick={() =>
                            setOpenIconPicker((current) =>
                              current === toPickerKey("service", index) ? null : toPickerKey("service", index)
                            )
                          }
                        >
                          <IconPreview>
                            <AppIcon name={item.icon} />
                          </IconPreview>
                          <IconPickerCopy>
                            <strong>{getSectionIconOptions("service").find((option) => option.id === item.icon)?.label || "서비스"}</strong>
                            <span>아이콘만 선택</span>
                          </IconPickerCopy>
                          <AppIcon name="chevron-down" />
                        </IconPickerButton>
                        {openIconPicker === toPickerKey("service", index) && (
                          <IconPickerPanel role="listbox" aria-label="서비스 아이콘 선택">
                            {getSectionIconOptions("service").map((option) => (
                              <IconOptionButton
                                key={option.id}
                                type="button"
                                data-selected={option.id === item.icon}
                                onClick={() => {
                                  updateLinkItem("service", index, "icon", option.id)
                                  setOpenIconPicker(null)
                                }}
                              >
                                <IconPreview data-compact="true">
                                  <AppIcon name={option.id} />
                                </IconPreview>
                                <IconOptionText>
                                  <strong>{option.label}</strong>
                                  <span>{option.id}</span>
                                </IconOptionText>
                              </IconOptionButton>
                            ))}
                          </IconPickerPanel>
                        )}
                      </IconPickerField>
                      <FieldBox>
                        <FieldLabel as="span">표시 이름</FieldLabel>
                        <Input
                          placeholder="예: aquila-blog"
                          value={item.label}
                          onChange={(e) => updateLinkItem("service", index, "label", e.target.value)}
                        />
                      </FieldBox>
                      <FieldBox>
                        <FieldLabel as="span">이동 링크</FieldLabel>
                        <Input
                          placeholder="https://..."
                          value={item.href}
                          onChange={(e) => updateLinkItem("service", index, "href", e.target.value)}
                        />
                      </FieldBox>
                      <RemoveButton type="button" onClick={() => removeLinkItem("service", index)}>
                        삭제
                      </RemoveButton>
                    </LinkItemRow>
                  ))
                ) : (
                  <InlineEmpty>Service 링크가 없습니다. 항목 추가를 눌러 시작하세요.</InlineEmpty>
                )}
              </LinkItemsWrap>
            </LinkSectionCard>
            <LinkSectionCard>
              <LinkSectionHeader>
                <div>
                  <h3>Contact 항목</h3>
                  <p>메인 페이지 Contact 카드에 표시할 연락처 링크를 관리합니다.</p>
                </div>
                <Button type="button" onClick={() => appendLinkItem("contact")}>
                  항목 추가
                </Button>
              </LinkSectionHeader>
              <LinkSectionHint>
                아이콘은 목록에서 고르고, 표시 이름은 직접 입력합니다.
              </LinkSectionHint>
              <LinkItemsWrap>
                {contactLinksInput.length > 0 ? (
                  contactLinksInput.map((item, index) => (
                    <LinkItemRow key={`contact-${index}`}>
                      <IconPickerField data-icon-picker-root="true">
                        <FieldLabel as="span">아이콘</FieldLabel>
                        <IconPickerButton
                          type="button"
                          aria-expanded={openIconPicker === toPickerKey("contact", index)}
                          onClick={() =>
                            setOpenIconPicker((current) =>
                              current === toPickerKey("contact", index) ? null : toPickerKey("contact", index)
                            )
                          }
                        >
                          <IconPreview>
                            <AppIcon name={item.icon} />
                          </IconPreview>
                          <IconPickerCopy>
                            <strong>{getSectionIconOptions("contact").find((option) => option.id === item.icon)?.label || "메시지"}</strong>
                            <span>아이콘만 선택</span>
                          </IconPickerCopy>
                          <AppIcon name="chevron-down" />
                        </IconPickerButton>
                        {openIconPicker === toPickerKey("contact", index) && (
                          <IconPickerPanel role="listbox" aria-label="연락처 아이콘 선택">
                            {getSectionIconOptions("contact").map((option) => (
                              <IconOptionButton
                                key={option.id}
                                type="button"
                                data-selected={option.id === item.icon}
                                onClick={() => {
                                  updateLinkItem("contact", index, "icon", option.id)
                                  setOpenIconPicker(null)
                                }}
                              >
                                <IconPreview data-compact="true">
                                  <AppIcon name={option.id} />
                                </IconPreview>
                                <IconOptionText>
                                  <strong>{option.label}</strong>
                                  <span>{option.id}</span>
                                </IconOptionText>
                              </IconOptionButton>
                            ))}
                          </IconPickerPanel>
                        )}
                      </IconPickerField>
                      <FieldBox>
                        <FieldLabel as="span">표시 이름</FieldLabel>
                        <Input
                          placeholder="예: github"
                          value={item.label}
                          onChange={(e) => updateLinkItem("contact", index, "label", e.target.value)}
                        />
                      </FieldBox>
                      <FieldBox>
                        <FieldLabel as="span">이동 링크</FieldLabel>
                        <Input
                          placeholder="예: mailto:me@example.com"
                          value={item.href}
                          onChange={(e) => updateLinkItem("contact", index, "href", e.target.value)}
                        />
                      </FieldBox>
                      <RemoveButton type="button" onClick={() => removeLinkItem("contact", index)}>
                        삭제
                      </RemoveButton>
                    </LinkItemRow>
                  ))
                ) : (
                  <InlineEmpty>Contact 링크가 없습니다. 항목 추가를 눌러 시작하세요.</InlineEmpty>
                )}
              </LinkItemsWrap>
            </LinkSectionCard>
          </FieldGrid>
          {profileNotice.text ? <Notice data-tone={profileNotice.tone}>{profileNotice.text}</Notice> : null}
        </FormCard>
      </ProfileGrid>

      <StickySaveBar data-dirty={hasUnsavedChanges ? "true" : "false"}>
        <StickySaveCopy>
          <strong>{hasUnsavedChanges ? "미저장 변경 사항이 있습니다." : "모든 변경 사항이 저장되어 있습니다."}</strong>
          <span>
            {hasUnsavedChanges
              ? "스크롤 위치와 상관없이 하단에서 바로 저장할 수 있습니다."
              : "항목을 수정하면 저장 버튼이 활성화됩니다."}
          </span>
        </StickySaveCopy>
        <StickySaveActions>
          <Button type="button" disabled={loadingKey === "refresh"} onClick={() => void handleRefreshStoredProfile()}>
            {loadingKey === "refresh" ? "불러오는 중..." : "저장값 다시 불러오기"}
          </Button>
          <PrimaryButton
            type="button"
            disabled={loadingKey === "save" || !hasUnsavedChanges}
            onClick={() => void handleUpdateMemberProfileCard()}
          >
            {loadingKey === "save" ? "저장 중..." : "변경 사항 저장"}
          </PrimaryButton>
        </StickySaveActions>
      </StickySaveBar>
    </Main>
  )
}

export default AdminProfilePage

const Main = styled.main`
  max-width: 1120px;
  margin: 0 auto;
  padding: 1.5rem 1rem 2.6rem;
  display: grid;
  gap: 1.1rem;
`

const HeaderCard = styled.section`
  display: grid;
  gap: 0.95rem;
  padding: 1.05rem 1.1rem;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  border-radius: 16px;
  background: ${({ theme }) => theme.colors.gray2};
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.22);

  h1 {
    margin: 0;
    font-size: clamp(1.72rem, 3.2vw, 2.15rem);
    letter-spacing: -0.03em;
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
  padding: 0;
  border: 0;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray11};
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
  border-radius: 10px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray11};
  padding: 0.66rem 0.92rem;
  font-size: 0.92rem;
  font-weight: 700;
  cursor: pointer;
  transition:
    background-color 0.18s ease,
    border-color 0.18s ease,
    color 0.18s ease;

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.gray8};
    background: ${({ theme }) => theme.colors.gray3};
    color: ${({ theme }) => theme.colors.gray12};
  }

  &:disabled {
    opacity: 1;
    cursor: not-allowed;
    border-color: ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.colors.gray3};
    color: ${({ theme }) => theme.colors.gray10};
  }
`

const Button = styled(BaseButton)``

const PrimaryButton = styled(BaseButton)`
  border-color: ${({ theme }) => theme.colors.blue8};
  color: ${({ theme }) => theme.colors.blue11};

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.blue10};
    background: ${({ theme }) => theme.colors.blue3};
    color: ${({ theme }) => theme.colors.blue11};
  }

  &:disabled {
    border-color: ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.colors.gray4};
    color: ${({ theme }) => theme.colors.gray10};
  }
`

const LinkButton = styled.a`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray11};
  text-decoration: none;
  padding: 0.72rem 1rem;
  font-size: 0.92rem;
  font-weight: 700;
`

const ProfileGrid = styled.section`
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: 1rem;
  align-items: start;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`

const PanelCard = styled.section`
  border-radius: 14px;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  background: ${({ theme }) => theme.colors.gray2};
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.2);
  padding: 1rem;
`

const PreviewCard = styled(PanelCard)`
  display: grid;
  justify-items: center;
  align-content: start;
  gap: 0.65rem;
  text-align: center;
  align-self: start;
  height: fit-content;
  position: sticky;
  top: 1rem;
  width: 100%;
  min-width: 0;
  overflow: hidden;

  @media (max-width: 900px) {
    position: static;
  }

  strong {
    font-size: 1.15rem;
    width: 100%;
    min-width: 0;
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  span {
    color: ${({ theme }) => theme.colors.blue10};
    font-weight: 700;
    width: 100%;
    min-width: 0;
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray11};
    line-height: 1.65;
    width: 100%;
    min-width: 0;
    overflow-wrap: anywhere;
    word-break: break-word;
  }
`

const AvatarFrame = styled.div`
  width: 128px;
  height: 128px;
  border-radius: 999px;
  overflow: hidden;
  border: none;
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
  width: 100%;
  min-width: 0;
  color: ${({ theme }) => theme.colors.gray11};
  font-size: 0.86rem;
  line-height: 1.5;
  overflow-wrap: anywhere;
  word-break: break-word;
`

const FormCard = styled(PanelCard)`
  display: grid;
  gap: 1rem;
`

const MetaBar = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.7rem;

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`

const MetaItem = styled.div`
  display: grid;
  gap: 0.32rem;
  min-width: 0;
  border-radius: 10px;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  background: ${({ theme }) => theme.colors.gray1};
  padding: 0.62rem 0.72rem;

  span {
    font-size: 0.76rem;
    font-weight: 700;
    color: ${({ theme }) => theme.colors.gray10};
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }

  strong {
    font-size: 1.08rem;
    font-weight: 800;
    color: ${({ theme }) => theme.colors.gray12};
    line-height: 1.35;
    letter-spacing: -0.02em;
    word-break: break-word;
  }
`

const Notice = styled.div`
  border-radius: 8px;
  padding: 0.8rem 0.95rem;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: transparent;
  color: ${({ theme }) => theme.colors.gray12};
  width: 100%;
  min-width: 0;
  line-height: 1.6;
  overflow-wrap: anywhere;
  word-break: break-word;

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
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray12};
  padding: 0.9rem 1rem;
  font-size: 0.98rem;
`

const TextArea = styled.textarea`
  width: 100%;
  min-height: 140px;
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray12};
  padding: 0.9rem 1rem;
  font-size: 0.98rem;
  line-height: 1.7;
  resize: vertical;
`

const LinkSectionCard = styled.section`
  display: grid;
  gap: 0.7rem;
  border-radius: 10px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  padding: 0.85rem;
`

const LinkSectionHeader = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  justify-content: space-between;
  align-items: center;

  h3 {
    margin: 0;
    font-size: 1rem;
    line-height: 1.35;
  }

  p {
    margin: 0.25rem 0 0;
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.86rem;
    line-height: 1.55;
  }
`

const LinkSectionHint = styled.p`
  margin: -0.15rem 0 0;
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.82rem;
  line-height: 1.5;
`

const LinkItemsWrap = styled.div`
  display: grid;
  gap: 0.8rem;
`

const LinkItemRow = styled.div`
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr) minmax(0, 1fr) auto;
  gap: 0.65rem;
  align-items: end;
  padding: 0.85rem 0;
  border-radius: 0;
  border: 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.gray6};
  background: transparent;

  @media (max-width: 980px) {
    grid-template-columns: 1fr;
  }
`

const IconPickerField = styled.div`
  display: grid;
  gap: 0.45rem;
  min-width: 0;
  position: relative;
  align-self: stretch;
`

const IconPickerButton = styled.button`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.72rem;
  width: 100%;
  min-height: 3.45rem;
  padding: 0.5rem 0.72rem;
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: transparent;
  color: ${({ theme }) => theme.colors.gray12};
  min-width: 0;
  cursor: pointer;

  &:hover {
    border-color: ${({ theme }) => theme.colors.gray8};
  }

  &[aria-expanded="true"] {
    border-color: ${({ theme }) => theme.colors.blue8};
    box-shadow: 0 0 0 1px ${({ theme }) => theme.colors.blue7};
  }

  > svg:last-of-type {
    font-size: 1rem;
    color: ${({ theme }) => theme.colors.gray10};
    flex-shrink: 0;
  }
`

const IconPreview = styled.span`
  width: 2.25rem;
  height: 2.25rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: ${({ theme }) => theme.colors.gray11};
  flex-shrink: 0;
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: transparent;

  svg {
    font-size: 1.08rem;
  }

  &[data-compact="true"] {
    width: 1.95rem;
    height: 1.95rem;
    border-radius: 10px;
  }
`

const IconPickerCopy = styled.span`
  display: grid;
  gap: 0.12rem;
  min-width: 0;

  strong {
    font-size: 0.96rem;
    line-height: 1.2;
    color: ${({ theme }) => theme.colors.gray12};
  }

  span {
    font-size: 0.75rem;
    color: ${({ theme }) => theme.colors.gray10};
    line-height: 1.2;
  }
`

const IconPickerPanel = styled.div`
  position: absolute;
  top: calc(100% + 0.45rem);
  left: 0;
  z-index: 40;
  min-width: 100%;
  width: max-content;
  max-width: min(18rem, calc(100vw - 3rem));
  max-height: 16rem;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0.45rem;
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
  box-shadow: none;
  scrollbar-gutter: stable;
`

const IconOptionButton = styled.button`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 0.65rem;
  width: 100%;
  min-height: 2.85rem;
  padding: 0.46rem 0.52rem;
  border: 0;
  border-radius: 14px;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray12};
  text-align: left;
  cursor: pointer;

  &:hover {
    background: ${({ theme }) => theme.colors.gray3};
  }

  &[data-selected="true"] {
    background: ${({ theme }) => theme.colors.blue3};
    color: ${({ theme }) => theme.colors.blue11};
  }
`

const IconOptionText = styled.span`
  display: grid;
  gap: 0.08rem;
  min-width: 0;

  strong {
    font-size: 0.92rem;
    line-height: 1.2;
    word-break: keep-all;
  }

  span {
    font-size: 0.72rem;
    color: ${({ theme }) => theme.colors.gray10};
    line-height: 1.2;
  }
`

const RemoveButton = styled(Button)`
  color: ${({ theme }) => theme.colors.red11};
  border-color: ${({ theme }) => theme.colors.red7};
  background: transparent;
  white-space: nowrap;
  min-height: 3.45rem;
`

const InlineEmpty = styled.p`
  margin: 0;
  border-radius: 0;
  border: 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.gray6};
  color: ${({ theme }) => theme.colors.gray11};
  padding: 0.72rem 0;
  font-size: 0.88rem;
`

const StickySaveBar = styled.section`
  position: sticky;
  bottom: 0.45rem;
  z-index: 15;
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  padding: 0.78rem 0.92rem;
  border-radius: 10px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};

  &[data-dirty="true"] {
    border-color: ${({ theme }) => theme.colors.blue8};
    background: ${({ theme }) => theme.colors.blue2};
  }
`

const StickySaveCopy = styled.div`
  min-width: 0;
  display: grid;
  gap: 0.16rem;

  strong {
    font-size: 0.92rem;
    color: ${({ theme }) => theme.colors.gray12};
    line-height: 1.35;
  }

  span {
    font-size: 0.8rem;
    color: ${({ theme }) => theme.colors.gray10};
    line-height: 1.45;
  }
`

const StickySaveActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
`
