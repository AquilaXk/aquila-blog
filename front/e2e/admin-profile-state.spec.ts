import { readFileSync } from "node:fs"
import path from "node:path"
import { expect, test } from "@playwright/test"
import { normalizeProfileWorkspaceContent } from "src/libs/profileWorkspace"

test.describe("admin profile state contract", () => {
  test("profile 작업공간은 공통 section nav/action dock primitive 위에서 반응형 분기를 유지한다", () => {
    const source = readFileSync(path.resolve(__dirname, "../src/pages/admin/profile.tsx"), "utf8")

    expect(source).toContain("const SectionRail = styled(AdminWorkspaceSectionNav)`")
    expect(source).toContain("@media (max-width: 1360px)")
    expect(source).toContain("const SectionRailButton = styled(AdminWorkspaceSectionNavButton)`")
    expect(source).toContain("role=\"tab\"")
    expect(source).toContain("aria-selected={activeSection === section.id}")
    expect(source).toContain("const EditorActionDock = styled(AdminWorkspaceActionDock)``")
    expect(source).toContain("<AdminWorkspaceActionDockInner>")
    expect(source).toContain("const PreviewViewport = styled(AdminInfoPanelCard)`")
    expect(source).toContain('className="identityRow"')
    expect(source).toContain('id="profile-display-name"')
    expect(source).toContain('apiFetch<AuthMember>(`/member/api/v1/adm/members/${memberId}/nickname`')
    expect(source).toContain("const FieldSectionCard = styled.div`")
    expect(source).not.toContain("const MobileSectionRail = styled.div`")
    expect(source).not.toContain("<PreviewActionDock>")
    expect(source).not.toContain("const LockedField = styled.div`")
    expect(source).not.toContain("const PreviewStatusRail = styled(AdminInfoStatusList)`")
    expect(source).not.toContain("const SectionStateDot = styled.span`")
    expect(source).not.toContain("<h3>텍스트</h3>")
    expect(source).not.toContain("공개 프로필 카드와 관리자 셸에 함께 표시됩니다.")
    expect(source).not.toContain("const PreviewStatusCard = styled(AdminRailCard)`")
    expect(source).not.toContain("const PreviewMeta = styled.small`")
    expect(source).not.toContain("const PreviewStatusText = styled.p`")
    expect(source).not.toContain("const PreviewStatusMeta = styled.small`")
    expect(source).not.toContain('data-tone="synced">동기화됨')
    expect(source).not.toContain("현재 이미지")
  })

  test("profile 작업공간은 공개 노출 기준의 상세형 hero와 rail copy를 사용한다", () => {
    const source = readFileSync(path.resolve(__dirname, "../src/pages/admin/profile.tsx"), "utf8")

    expect(source).toContain("메인과 About에 보일 인상을 다듬습니다")
    expect(source).not.toContain(
      "프로필 이미지, 소개 문구, 헤더 카피, 외부 링크를 공개 화면 문맥에서 바로 조정합니다."
    )
    expect(source).not.toContain("<span>공개 노출 미리보기</span>")
    expect(source).not.toContain("<strong>빠진 항목</strong>")
    expect(source).not.toContain("<strong>최근 저장</strong>")
    expect(source).not.toContain("!isHomeSection ? (")
  })

  test("profile 빠진 항목은 메인 헤더 제목 또는 설명 한쪽만 비어도 incomplete로 판정한다", () => {
    const source = readFileSync(path.resolve(__dirname, "../src/pages/admin/profile.tsx"), "utf8")

    expect(source).toContain(
      'if (!draft.homeIntroTitle.trim() || !draft.homeIntroDescription.trim()) missingExposureItems.push("메인 헤더 카피")'
    )
    expect(source).not.toContain("missingExposureItems.slice(0, 4)")
  })

  test("profile publish cache와 공개 about 페이지는 같은 about 필드를 공유한다", () => {
    const profileSource = readFileSync(path.resolve(__dirname, "../src/pages/admin/profile.tsx"), "utf8")
    const aboutSource = readFileSync(path.resolve(__dirname, "../src/pages/about.tsx"), "utf8")

    expect(profileSource).toContain("syncPublishedAdminProfileCache(normalizeProfileWorkspaceContent(nextWorkspace.published))")
    expect(profileSource).toContain("aboutHeadline: content.aboutHeadline")
    expect(profileSource).toContain("aboutRole: content.aboutRole")
    expect(profileSource).toContain("aboutBio: content.aboutBio")
    expect(profileSource).toContain("aboutSections: content.aboutSections")
    expect(profileSource).toContain("aboutProjectSectionTitle: content.aboutProjectSectionTitle")
    expect(profileSource).toContain("aboutProjects: content.aboutProjects")
    expect(aboutSource).toContain("const displayHeadline = adminProfile?.aboutHeadline || DEFAULT_ABOUT_HEADLINE")
    expect(aboutSource).toContain("const displayRole = adminProfile?.aboutRole || CONFIG.profile.role")
    expect(aboutSource).toContain("const displayBio = adminProfile?.aboutBio || CONFIG.profile.bio")
    expect(aboutSource).toContain("adminProfile?.aboutSections && adminProfile.aboutSections.length > 0")
    expect(aboutSource).toContain("adminProfile?.aboutProjects && adminProfile.aboutProjects.length > 0")
    expect(aboutSource).not.toContain("PROJECT_PRESETS")
    expect(aboutSource).not.toContain("대표 글 보기")
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
      serviceLinks: [],
      contactLinks: [],
    })

    expect(normalized.aboutSections.map((section) => section.title)).toEqual(["경력"])
    expect(normalized.aboutProjectSectionTitle).toBe("프로젝트")
    expect(normalized.aboutProjects.map((project) => project.name)).toEqual(["aquila-blog"])
  })
})
