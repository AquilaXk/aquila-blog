import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { expect, test } from "@playwright/test"
import { buildProfileWorkspaceAdminProfileCacheFields, normalizeProfileWorkspaceContent } from "src/libs/profileWorkspace"

test.describe("admin profile state contract", () => {
  test("admin profile workspace residual file boundaries는 600 line companion budget을 유지한다", () => {
    const adminRoot = path.resolve(__dirname, "../src/routes/Admin")
    const requiredModules = [
      "AdminProfileWorkspaceSections.tsx",
      "AdminProfileWorkspacePageDraftActions.ts",
      "AdminProfileWorkspacePageImageDraft.ts",
      "AdminProfileWorkspaceIdentitySection.tsx",
      "AdminProfileWorkspaceAboutSection.tsx",
      "AdminProfileWorkspaceHomeDesignSections.tsx",
      "AdminProfileWorkspaceLinksSection.tsx",
      "AdminProfileWorkspace.styles.links.ts",
    ]

    for (const sourcePath of requiredModules) {
      expect(existsSync(path.join(adminRoot, sourcePath)), sourcePath).toBe(true)
    }

    const boundedSourceFiles = [
      path.resolve(__dirname, "../src/pages/admin/profile.tsx"),
      "AdminProfileWorkspacePageModel.ts",
      "AdminProfileWorkspaceSections.tsx",
      "AdminProfileWorkspacePageDraftActions.ts",
      "AdminProfileWorkspacePageImageDraft.ts",
      "AdminProfileWorkspaceSectionRenderer.tsx",
      "AdminProfileWorkspaceIdentitySection.tsx",
      "AdminProfileWorkspaceAboutSection.tsx",
      "AdminProfileWorkspaceHomeDesignSections.tsx",
      "AdminProfileWorkspaceLinksSection.tsx",
      "AdminProfileWorkspace.styles.layout.ts",
      "AdminProfileWorkspace.styles.links.ts",
      "AdminProfileWorkspace.styles.sections.ts",
    ].map((sourcePath) => (path.isAbsolute(sourcePath) ? sourcePath : path.join(adminRoot, sourcePath)))
    const sourceRoot = path.resolve(__dirname, "../src")

    const oversizedFiles = boundedSourceFiles
      .filter((sourcePath) => existsSync(sourcePath))
      .map((sourcePath) => ({
        sourcePath: path.relative(sourceRoot, sourcePath),
        lineCount: readFileSync(sourcePath, "utf8").split("\n").length,
      }))
      .filter(({ lineCount }) => lineCount > 600)

    expect(oversizedFiles).toEqual([])

    const pageModelSource = readFileSync(path.join(adminRoot, "AdminProfileWorkspacePageModel.ts"), "utf8")
    const pageEntrySource = readFileSync(path.resolve(__dirname, "../src/pages/admin/profile.tsx"), "utf8")
    const rendererSource = readFileSync(path.join(adminRoot, "AdminProfileWorkspaceSectionRenderer.tsx"), "utf8")
    const layoutSource = readFileSync(path.join(adminRoot, "AdminProfileWorkspace.styles.layout.ts"), "utf8")

    expect(pageEntrySource).toContain('export { default } from "src/routes/Admin/AdminProfileWorkspacePage"')
    expect(pageEntrySource).not.toContain("useViewportImageEditor")
    expect(pageEntrySource).not.toContain("AdminProfilePreviewRail")
    expect(pageModelSource).toContain("useAdminProfileWorkspaceDraftActions")
    expect(pageModelSource).toContain("useAdminProfileWorkspaceImageDraft")
    expect(pageModelSource).not.toContain("const updateLinkItem = useCallback")
    expect(pageModelSource).not.toContain("useViewportImageEditor")
    expect(rendererSource).toContain("renderAdminProfileIdentitySection")
    expect(rendererSource).toContain("renderAdminProfileLinksSection")
    expect(rendererSource).not.toContain("<AvatarWorkspaceCard>")
    expect(layoutSource).toContain("AdminProfileWorkspace.styles.links")
    expect(layoutSource).not.toContain("export const LinkRowCard = styled.div")
  })

  test("프로필 이미지는 저장된 URL 로드 실패 시 기본 이미지를 한 번만 fallback 한다", () => {
    const profileImageSource = readFileSync(
      path.resolve(__dirname, "../src/components/ProfileImage.tsx"),
      "utf8"
    )
    const identitySource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/AdminProfileWorkspaceIdentitySection.tsx"),
      "utf8"
    )
    const previewSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/AdminProfilePreviewRail.tsx"),
      "utf8"
    )

    expect(profileImageSource).not.toContain('import { CONFIG } from "site.config"')
    expect(profileImageSource).toContain("fallbackSrc,")
    expect(profileImageSource).toContain("const requestedSrc = src || fallbackSrc")
    expect(profileImageSource).toContain("const [resolvedSrc, setResolvedSrc] = React.useState(requestedSrc)")
    expect(profileImageSource).toContain("const fallbackAttemptSourceRef = React.useRef<string | undefined>(undefined)")
    expect(profileImageSource).toContain("fallbackAttemptSourceRef.current = undefined")
    expect(profileImageSource).toContain("setResolvedSrc(requestedSrc)")
    expect(profileImageSource).toContain("}, [requestedSrc])")
    expect(profileImageSource).toContain("fallbackAttemptSourceRef.current === requestedSrc")
    expect(profileImageSource).toContain("fallbackAttemptSourceRef.current = requestedSrc")
    expect(profileImageSource).toContain("setResolvedSrc(fallbackSrc)")
    expect(identitySource).toContain("src={draft.profileImageUrl || undefined}")
    expect(identitySource).toContain("fallbackSrc={CONFIG.profile.image}")
    expect(identitySource).not.toContain("<AvatarFallback>")
    expect(previewSource).toContain("src={previewContent.profileImageUrl || undefined}")
    expect(previewSource).toContain("fallbackSrc={CONFIG.profile.image}")
    expect(previewSource).not.toContain("<AvatarFallback>")
  })

  test("profile 작업공간은 공통 section nav/action dock primitive 위에서 반응형 분기를 유지한다", () => {
    const sectionSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/AdminProfileWorkspaceSections.tsx"),
      "utf8",
    )
    const identitySource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/AdminProfileWorkspaceIdentitySection.tsx"),
      "utf8"
    )
    const pageModelSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/AdminProfileWorkspacePageModel.ts"),
      "utf8"
    )
    const layoutStyleSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/AdminProfileWorkspace.styles.layout.ts"),
      "utf8"
    )
    const sectionStyleSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/AdminProfileWorkspace.styles.sections.ts"),
      "utf8"
    )
    const previewSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/AdminProfilePreviewRail.tsx"),
      "utf8",
    )
    const combinedWorkspaceSource = [sectionSource, identitySource, layoutStyleSource, sectionStyleSource].join("\n")

    expect(layoutStyleSource).toContain("export const SectionRail = styled(AdminWorkspaceSectionNav)`")
    expect(layoutStyleSource).toContain("grid-template-columns: 210px minmax(0, 760px) 288px;")
    expect(layoutStyleSource).toContain("border-top: 1px solid")
    expect(layoutStyleSource).toContain("@media (max-width: 1180px)")
    expect(layoutStyleSource).toContain("export const SectionRailButton = styled(AdminWorkspaceSectionNavButton)`")
    expect(layoutStyleSource).toContain("border-bottom: 1px solid")
    expect(sectionSource).toContain("role=\"tab\"")
    expect(sectionSource).toContain("aria-selected={activeSection === section.id}")
    expect(sectionStyleSource).toContain("export const EditorActionDock = styled(AdminWorkspaceActionDock)``")
    expect(sectionSource).toContain("<AdminWorkspaceActionDockInner>")
    expect(sectionStyleSource).toContain("export const PreviewViewport = styled(AdminInfoPanelCard)`")
    expect(previewSource).toContain('className="identityRow"')
    expect(identitySource).toContain('id="profile-display-name"')
    expect(pageModelSource).toContain('apiFetch<AuthMember>(`/member/api/v1/adm/members/${memberId}/nickname`')
    expect(layoutStyleSource).toContain("export const FieldSectionCard = styled.div`")
    expect(combinedWorkspaceSource).not.toContain("const MobileSectionRail = styled.div`")
    expect(combinedWorkspaceSource).not.toContain("<PreviewActionDock>")
    expect(combinedWorkspaceSource).not.toContain("const LockedField = styled.div`")
    expect(combinedWorkspaceSource).not.toContain("const PreviewStatusRail = styled(AdminInfoStatusList)`")
    expect(combinedWorkspaceSource).not.toContain("const SectionStateDot = styled.span`")
    expect(combinedWorkspaceSource).not.toContain("<h3>텍스트</h3>")
    expect(combinedWorkspaceSource).not.toContain("공개 프로필 카드와 관리자 셸에 함께 표시됩니다.")
    expect(combinedWorkspaceSource).not.toContain("const PreviewStatusCard = styled(AdminRailCard)`")
    expect(combinedWorkspaceSource).not.toContain("const PreviewMeta = styled.small`")
    expect(combinedWorkspaceSource).not.toContain("const PreviewStatusText = styled.p`")
    expect(combinedWorkspaceSource).not.toContain("const PreviewStatusMeta = styled.small`")
    expect(combinedWorkspaceSource).not.toContain('data-tone="synced">동기화됨')
    expect(combinedWorkspaceSource).not.toContain("현재 이미지")
  })

  test("profile page는 workspace 순수 모델을 Admin route model로 위임한다", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/AdminProfileWorkspacePageModel.ts"),
      "utf8"
    )
    const modelPath = path.resolve(__dirname, "../src/routes/Admin/AdminProfileWorkspaceModel.ts")
    expect(existsSync(modelPath)).toBe(true)
    const modelSource = existsSync(modelPath) ? readFileSync(modelPath, "utf8") : ""

    expect(source).toContain('} from "src/routes/Admin/AdminProfileWorkspaceModel"')
    expect(modelSource).toContain("export const WORKSPACE_SECTIONS")
    expect(modelSource).toContain("export const serializeWorkspaceSection = (")
    expect(modelSource).toContain("export const createBlankLinkItem = (")
    expect(modelSource).toContain("export const validateLinkInputs = (")
    expect(modelSource).toContain("export const toPayloadLinks = (")
    expect(modelSource).toContain("export const buildWorkspaceFallback = (")
    expect(source).not.toContain("const WORKSPACE_SECTIONS:")
    expect(source).not.toContain("const pickWorkspaceSectionContent =")
    expect(source).not.toContain("const serializeWorkspaceSection =")
    expect(source).not.toContain("const moveListItem =")
    expect(source).not.toContain("const createBlankLinkItem =")
    expect(source).not.toContain("const validateLinkInputs =")
    expect(source).not.toContain("const toPayloadLinks =")
    expect(source).not.toContain("const buildWorkspaceFallback =")
    expect(source.split("\n").length).toBeLessThan(2250)
  })

  test("profile page는 persistence helper를 Admin route model로 위임한다", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/AdminProfileWorkspacePageModel.ts"),
      "utf8"
    )
    const modelPath = path.resolve(__dirname, "../src/routes/Admin/AdminProfilePersistenceModel.ts")
    expect(existsSync(modelPath)).toBe(true)
    const modelSource = existsSync(modelPath) ? readFileSync(modelPath, "utf8") : ""

    expect(source).toContain('} from "src/routes/Admin/AdminProfilePersistenceModel"')
    expect(modelSource).toContain("export const PROFILE_UNSAVED_CHANGES_MESSAGE")
    expect(modelSource).toContain("export const readImageSourceSizeFromFile =")
    expect(modelSource).toContain("export const parseResponseErrorBody =")
    expect(modelSource).toContain("export const revalidatePublicBlogAppearance =")
    expect(modelSource).toContain("export const requestProfileImageUpload =")
    expect(source).not.toContain("const PROFILE_UNSAVED_CHANGES_MESSAGE =")
    expect(source).not.toContain("const readImageSourceSizeFromFile =")
    expect(source).not.toContain("const parseResponseErrorBody =")
    expect(source).not.toContain("const revalidatePublicBlogAppearance =")
    expect(source).not.toContain("const requestProfileImageUpload =")
    expect(source.split("\n").length).toBeLessThan(2190)
  })

  test("profile page는 preview rail 렌더링을 Admin route component로 위임한다", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/AdminProfileWorkspaceSections.tsx"),
      "utf8"
    )
    const previewPath = path.resolve(__dirname, "../src/routes/Admin/AdminProfilePreviewRail.tsx")
    expect(existsSync(previewPath)).toBe(true)
    const previewSource = existsSync(previewPath) ? readFileSync(previewPath, "utf8") : ""

    expect(source).toContain('AdminProfilePreviewRail from "src/routes/Admin/AdminProfilePreviewRail"')
    expect(source).toContain("<AdminProfilePreviewRail")
    expect(previewSource).toContain("export type AdminProfilePreviewRailProps")
    expect(previewSource).toContain("export default function AdminProfilePreviewRail")
    expect(previewSource).toContain("<PreviewRail>")
    expect(previewSource).toContain("<PreviewProfileCard>")
    expect(previewSource).toContain("<PreviewAboutCard>")
    expect(previewSource).toContain("<PreviewLinksCard>")
    expect(previewSource).toContain('className="identityRow"')
    expect(source).not.toContain("<PreviewRail>")
    expect(source).not.toContain("<PreviewProfileCard>")
    expect(source).not.toContain("<PreviewAboutCard>")
    expect(source).not.toContain("<PreviewLinksCard>")
    expect(source.split("\n").length).toBeLessThan(2050)
  })

  test("profile page는 이미지 편집 modal 렌더링을 Admin route component로 위임한다", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/AdminProfileWorkspaceSections.tsx"),
      "utf8"
    )
    const modalPath = path.resolve(__dirname, "../src/routes/Admin/AdminProfileImageEditorModal.tsx")
    expect(existsSync(modalPath)).toBe(true)
    const modalSource = existsSync(modalPath) ? readFileSync(modalPath, "utf8") : ""

    expect(source).toContain('AdminProfileImageEditorModal from "src/routes/Admin/AdminProfileImageEditorModal"')
    expect(source).toContain("<AdminProfileImageEditorModal")
    expect(modalSource).toContain("export type AdminProfileImageEditorModalProps")
    expect(modalSource).toContain("export default function AdminProfileImageEditorModal")
    expect(modalSource).toContain("<ModalOverlay")
    expect(modalSource).toContain("<ModalEditorFrame")
    expect(modalSource).toContain("<ModalSliderWrap")
    expect(modalSource).toContain("프로필 이미지 편집")
    expect(modalSource).toContain("편집 결과 저장")
    expect(source).not.toContain("<ModalOverlay")
    expect(source).not.toContain("<ModalEditorFrame")
    expect(source).not.toContain("<ModalSliderWrap")
    expect(source).not.toContain('aria-label="프로필 이미지 편집"')
    expect(source.split("\n").length).toBeLessThan(1950)
  })

  test("profile 작업공간은 공개 노출 기준의 상세형 hero와 rail copy를 사용한다", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/AdminProfileWorkspaceSections.tsx"),
      "utf8"
    )

    expect(source).toContain('<span className="settingsLabel">Settings</span>')
    expect(source).toContain("<h1>개인정보와 계정 설정</h1>")
    expect(source).toContain('className="settingsHeroDeck"')
    expect(source).toContain('className="settingsPanelLabel"')
    expect(source).toContain("변경 사항은 초안 저장 후 공개 적용으로 블로그와 About 페이지에 반영됩니다.")
    expect(source).not.toContain(
      "프로필 이미지, 소개 문구, 헤더 카피, 외부 링크를 공개 화면 문맥에서 바로 조정합니다."
    )
    expect(source).not.toContain("<span>공개 노출 미리보기</span>")
    expect(source).not.toContain("<strong>빠진 항목</strong>")
    expect(source).not.toContain("<strong>최근 저장</strong>")
    expect(source).not.toContain("!isHomeSection ? (")
  })

  test("profile 빠진 항목은 메인 헤더 제목 또는 설명 한쪽만 비어도 incomplete로 판정한다", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/AdminProfileWorkspaceSections.tsx"),
      "utf8"
    )

    expect(source).toContain(
      'if (!draft.homeIntroTitle.trim() || !draft.homeIntroDescription.trim()) missingExposureItems.push("메인 헤더 카피")'
    )
    expect(source).not.toContain("missingExposureItems.slice(0, 4)")
  })

  test("profile publish cache와 공개 about 페이지는 같은 about 필드를 공유한다", () => {
    const profileSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/AdminProfileWorkspacePageModel.ts"),
      "utf8"
    )
    const aboutSource = readFileSync(path.resolve(__dirname, "../src/pages/about.tsx"), "utf8")

    expect(profileSource).toContain("syncPublishedAdminProfileCache(normalizeProfileWorkspaceContent(nextWorkspace.published))")
    expect(profileSource).toContain("...buildProfileWorkspaceAdminProfileCacheFields(content)")
    expect(profileSource).not.toContain("buildLegacyAboutDetails")
    expect(profileSource).not.toContain("aboutDetails:")
    expect(aboutSource).toContain("const displayHeadline = adminProfile?.aboutHeadline || DEFAULT_ABOUT_HEADLINE")
    expect(aboutSource).toContain("const displayRole = adminProfile?.aboutRole || CONFIG.profile.role")
    expect(aboutSource).toContain("const displayBio = adminProfile?.aboutBio || CONFIG.profile.bio")
    expect(aboutSource).toContain("adminProfile?.aboutSections && adminProfile.aboutSections.length > 0")
    expect(aboutSource).toContain("adminProfile?.aboutProjects && adminProfile.aboutProjects.length > 0")
    expect(aboutSource).not.toContain("PROJECT_PRESETS")
    expect(aboutSource).not.toContain("대표 글 보기")
  })

  test("profile workspace legacy cache bridge는 structured about 필드와 aboutDetails를 함께 만든다", () => {
    const bridge = buildProfileWorkspaceAdminProfileCacheFields({
      profileImageUrl: "/profile.png",
      profileRole: "Backend",
      profileBio: "운영 가능한 시스템을 설계합니다.",
      aboutHeadline: "이유를 먼저 따집니다.",
      aboutRole: "Full-stack",
      aboutBio: "문제와 운영을 같이 봅니다.",
      aboutSections: [
        {
          id: "career",
          title: "경력",
          items: ["2026.03 Aquila Blog 운영"],
          dividerBefore: false,
        },
      ],
      aboutProjectSectionTitle: "프로젝트",
      aboutProjects: [
        {
          id: "blog",
          name: "aquila-blog",
          summary: "관리자에서 직접 수정하는 프로젝트",
          role: "Full-stack",
          href: "https://github.com/AquilaXk/aquila-blog",
          linkLabel: "GitHub",
        },
      ],
      blogTitle: "AquilaLog",
      homeIntroTitle: "비밀스러운 IT 공작소",
      homeIntroDescription: "비밀스러운 지식들을 탐구하는데 목적을 두고 있습니다",
      blogDesign: "grid" as never,
      legacyBlogScheme: "light",
      serviceLinks: [],
      contactLinks: [],
    })

    expect(bridge.profileImageUrl).toBe("/profile.png")
    expect(bridge.profileImageDirectUrl).toBe("/profile.png")
    expect(bridge.aboutHeadline).toBe("이유를 먼저 따집니다.")
    expect(bridge.aboutSections.map((section) => section.title)).toEqual(["경력"])
    expect(bridge.aboutProjectSectionTitle).toBe("프로젝트")
    expect(bridge.aboutProjects.map((project) => project.name)).toEqual(["aquila-blog"])
    expect(bridge.blogDesign).toBe("legacy")
    expect(bridge.legacyBlogScheme).toBe("light")
    expect(bridge.aboutDetails).toContain("## 경력")
    expect(bridge.aboutDetails).toContain("- 2026.03 Aquila Blog 운영")
  })

  test("profile workspace 정규화는 전역 블로그 디자인 fallback을 고정한다", () => {
    const normalized = normalizeProfileWorkspaceContent({
      profileImageUrl: "",
      profileRole: "",
      profileBio: "",
      aboutHeadline: "",
      aboutRole: "",
      aboutBio: "",
      aboutSections: [],
      aboutProjectSectionTitle: "",
      aboutProjects: [],
      blogTitle: "",
      homeIntroTitle: "",
      homeIntroDescription: "",
      blogDesign: "unknown" as never,
      legacyBlogScheme: "blue" as never,
      serviceLinks: [],
      contactLinks: [],
    })

    expect(normalized.blogDesign).toBe("legacy")
    expect(normalized.legacyBlogScheme).toBe("dark")
  })

  test("profile 화면은 디자인 섹션 없이 공개 설정을 legacy로 고정한다", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/AdminProfileWorkspaceHomeDesignSections.tsx"),
      "utf8"
    )
    const modelSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/AdminProfileWorkspaceModel.ts"),
      "utf8"
    )

    expect(modelSource).not.toContain('id: "design"')
    expect(modelSource).not.toContain('label: "디자인"')
    expect(source).not.toContain('updateDraft("blogDesign",')
    expect(source).not.toContain('updateDraft("legacyBlogScheme",')
    expect(source).not.toContain('draft.blogDesign')
  })

  test("profile 공개 적용은 primary action에서 저장 후 publish까지 처리한다", () => {
    const pageModelSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/AdminProfileWorkspacePageModel.ts"),
      "utf8"
    )
    const sectionSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/AdminProfileWorkspaceSections.tsx"),
      "utf8"
    )
    const previewSource = readFileSync(path.resolve(__dirname, "../src/routes/Admin/AdminProfilePreviewRail.tsx"), "utf8")
    const persistenceModelSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/AdminProfilePersistenceModel.ts"),
      "utf8"
    )

    expect(persistenceModelSource).toContain("export const revalidatePublicBlogAppearance = async (): Promise<boolean> => {")
    expect(persistenceModelSource).toContain('await fetch("/api/revalidate", {')
    expect(pageModelSource).toContain("const validateDraftBeforePersistence = useCallback(")
    expect(pageModelSource).toContain("const saveWorkspaceDraft = useCallback(")
    expect(pageModelSource).toContain("const shouldPublishWorkspace = workspaceForPublish?.dirtyFromPublished ?? hasPublishedDiff")
    expect(pageModelSource).toContain("const publicCacheRevalidated = await revalidatePublicBlogAppearance()")
    expect(pageModelSource).toContain("공개 적용과 공개 사이트 갱신을 완료했습니다.")
    expect(sectionSource).toContain('hasUnsavedChanges ? "저장 후 공개 적용" : "공개 적용"')
    expect(sectionSource).toContain("초안 저장")
    expect(previewSource).toContain("편집 중")
    expect(previewSource).toContain("현재 공개")
    expect(sectionSource).not.toContain("로컬 변경 사항을 먼저 임시 저장한 뒤 공개할 수 있습니다.")
  })

  test("profile workspace 정규화는 structured 프로젝트가 있으면 legacy 프로젝트 상세 블록을 제거한다", () => {
    const normalized = normalizeProfileWorkspaceContent({
      profileImageUrl: "",
      profileRole: "",
      profileBio: "",
      aboutHeadline: "",
      aboutRole: "",
      aboutBio: "",
      aboutSections: [
        {
          id: "career",
          title: "경력",
          items: ["2026.03 Aquila Blog 운영"],
          dividerBefore: false,
        },
        {
          id: "projects",
          title: "프로젝트",
          items: ["고구마마켓", "aquila-blog"],
          dividerBefore: false,
        },
      ],
      aboutProjectSectionTitle: "프로젝트",
      aboutProjects: [
        {
          id: "blog",
          name: "aquila-blog",
          summary: "관리자에서 직접 수정하는 프로젝트",
          role: "Full-stack",
          href: "https://github.com/AquilaXk/aquila-blog",
          linkLabel: "GitHub",
        },
      ],
      blogTitle: "",
      homeIntroTitle: "",
      homeIntroDescription: "",
      blogDesign: "legacy",
      legacyBlogScheme: "dark",
      serviceLinks: [],
      contactLinks: [],
    })

    expect(normalized.aboutSections.map((section) => section.title)).toEqual(["경력"])
    expect(normalized.aboutProjectSectionTitle).toBe("프로젝트")
    expect(normalized.aboutProjects.map((project) => project.name)).toEqual(["aquila-blog"])
  })
})
