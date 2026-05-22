import type { AboutProjectBlock, AboutSectionBlock, ProfileWorkspaceContent } from "src/libs/profileWorkspace"
import {
  AboutProjectCard,
  AboutProjectList,
  AboutSectionCard,
  AboutSectionCardHeader,
  AboutSectionList,
  DangerButton,
  EmptyStateCard,
  FieldBox,
  FieldGrid,
  FieldLabel,
  FieldSectionCard,
  GhostButton,
  InlineActionRow,
  Input,
  ItemList,
  ItemRow,
  MiniButton,
  SectionBlockHeader,
  SectionStack,
  TextArea,
} from "src/routes/Admin/AdminProfileWorkspace.styles"

export const renderAdminProfileAboutSection = (props: Record<string, any>) => {
  const {
    addAboutItem,
    addAboutProject,
    addAboutSection,
    draft,
    moveAboutItem,
    moveAboutProject,
    moveAboutSection,
    removeAboutItem,
    removeAboutProject,
    removeAboutSection,
    updateAboutProject,
    updateAboutSection,
    updateDraft,
  } = props as Record<string, any> & { draft: ProfileWorkspaceContent }

  return (
    <SectionStack>
      <FieldSectionCard>
        <SectionBlockHeader>
          <div>
            <h3>상단 소개</h3>
          </div>
        </SectionBlockHeader>
        <FieldGrid data-columns="2">
          <FieldBox data-span="full">
            <FieldLabel htmlFor="about-headline">상단 문구</FieldLabel>
            <Input
              id="about-headline"
              value={draft.aboutHeadline}
              placeholder="예: 이유를 먼저 따지고, 운영 가능한 시스템을 설계합니다."
              onChange={(event) => updateDraft("aboutHeadline", event.target.value)}
            />
          </FieldBox>
          <FieldBox>
            <FieldLabel htmlFor="about-role">페이지 역할 문구</FieldLabel>
            <Input
              id="about-role"
              value={draft.aboutRole}
              placeholder="예: 운영과 구조를 설계하는 백엔드 엔지니어"
              onChange={(event) => updateDraft("aboutRole", event.target.value)}
            />
          </FieldBox>
          <FieldBox data-span="full">
            <FieldLabel htmlFor="about-bio">소개 문단</FieldLabel>
            <TextArea
              id="about-bio"
              value={draft.aboutBio}
              placeholder="About 페이지 첫 문단에서 보여줄 소개를 적어주세요."
              onChange={(event) => updateDraft("aboutBio", event.target.value)}
            />
          </FieldBox>
        </FieldGrid>
      </FieldSectionCard>

      <FieldSectionCard>
        <SectionBlockHeader>
          <div>
            <h3>상세 블록</h3>
          </div>
          <GhostButton type="button" onClick={addAboutSection}>
            블록 추가
          </GhostButton>
        </SectionBlockHeader>

        {draft.aboutSections.length > 0 ? (
          <AboutSectionList>
            {draft.aboutSections.map((section, sectionIndex) => (
              <AboutSectionCard key={section.id || `section-${sectionIndex}`}>
                <AboutSectionCardHeader>
                  <div>
                    <span>상세 블록 {sectionIndex + 1}</span>
                    <label>
                      <input
                        type="checkbox"
                        checked={section.dividerBefore}
                        onChange={(event) =>
                          updateAboutSection(sectionIndex, (current: AboutSectionBlock) => ({
                            ...current,
                            dividerBefore: event.target.checked,
                          }))
                        }
                      />
                      이전 블록과 구분선 넣기
                    </label>
                  </div>
                  <InlineActionRow>
                    <MiniButton
                      type="button"
                      disabled={sectionIndex === 0}
                      onClick={() => moveAboutSection(sectionIndex, -1)}
                    >
                      위로
                    </MiniButton>
                    <MiniButton
                      type="button"
                      disabled={sectionIndex === draft.aboutSections.length - 1}
                      onClick={() => moveAboutSection(sectionIndex, 1)}
                    >
                      아래로
                    </MiniButton>
                    <DangerButton type="button" onClick={() => removeAboutSection(sectionIndex)}>
                      삭제
                    </DangerButton>
                  </InlineActionRow>
                </AboutSectionCardHeader>

                <FieldBox>
                  <FieldLabel>블록 제목</FieldLabel>
                  <Input
                    value={section.title}
                    placeholder="예: 경력"
                    onChange={(event) =>
                      updateAboutSection(sectionIndex, (current: AboutSectionBlock) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                  />
                </FieldBox>

                <ItemList>
                  {section.items.map((item, itemIndex) => (
                    <ItemRow key={`${section.id}-${itemIndex}`}>
                      <span className="bullet">-</span>
                      <Input
                        value={item}
                        placeholder="항목 내용을 입력하세요."
                        onChange={(event) =>
                          updateAboutSection(sectionIndex, (current: AboutSectionBlock) => ({
                            ...current,
                            items: current.items.map((entry, index) =>
                              index === itemIndex ? event.target.value : entry
                            ),
                          }))
                        }
                      />
                      <InlineActionRow>
                        <MiniButton
                          type="button"
                          disabled={itemIndex === 0}
                          onClick={() => moveAboutItem(sectionIndex, itemIndex, -1)}
                        >
                          위로
                        </MiniButton>
                        <MiniButton
                          type="button"
                          disabled={itemIndex === section.items.length - 1}
                          onClick={() => moveAboutItem(sectionIndex, itemIndex, 1)}
                        >
                          아래로
                        </MiniButton>
                        <DangerButton type="button" onClick={() => removeAboutItem(sectionIndex, itemIndex)}>
                          삭제
                        </DangerButton>
                      </InlineActionRow>
                    </ItemRow>
                  ))}
                </ItemList>

                <GhostButton type="button" onClick={() => addAboutItem(sectionIndex)}>
                  항목 추가
                </GhostButton>
              </AboutSectionCard>
            ))}
          </AboutSectionList>
        ) : (
          <EmptyStateCard>
            <strong>아직 상세 블록이 없습니다</strong>
          </EmptyStateCard>
        )}
      </FieldSectionCard>

      <FieldSectionCard>
        <SectionBlockHeader>
          <div>
            <h3>프로젝트</h3>
          </div>
          <GhostButton type="button" onClick={addAboutProject}>
            프로젝트 추가
          </GhostButton>
        </SectionBlockHeader>

        <FieldBox>
          <FieldLabel htmlFor="about-project-title">섹션 제목</FieldLabel>
          <Input
            id="about-project-title"
            value={draft.aboutProjectSectionTitle}
            placeholder="예: 프로젝트"
            onChange={(event) => updateDraft("aboutProjectSectionTitle", event.target.value)}
          />
        </FieldBox>

        {draft.aboutProjects.length > 0 ? (
          <AboutProjectList>
            {draft.aboutProjects.map((project, projectIndex) => (
              <AboutProjectCard key={project.id || `project-${projectIndex}`}>
                <AboutSectionCardHeader>
                  <div>
                    <span>프로젝트 {projectIndex + 1}</span>
                  </div>
                  <InlineActionRow>
                    <MiniButton
                      type="button"
                      disabled={projectIndex === 0}
                      onClick={() => moveAboutProject(projectIndex, -1)}
                    >
                      위로
                    </MiniButton>
                    <MiniButton
                      type="button"
                      disabled={projectIndex === draft.aboutProjects.length - 1}
                      onClick={() => moveAboutProject(projectIndex, 1)}
                    >
                      아래로
                    </MiniButton>
                    <DangerButton type="button" onClick={() => removeAboutProject(projectIndex)}>
                      삭제
                    </DangerButton>
                  </InlineActionRow>
                </AboutSectionCardHeader>

                <FieldGrid data-columns="2">
                  <FieldBox>
                    <FieldLabel>제목</FieldLabel>
                    <Input
                      value={project.name}
                      placeholder="예: aquila-blog"
                      onChange={(event) =>
                        updateAboutProject(projectIndex, (current: AboutProjectBlock) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                    />
                  </FieldBox>
                  <FieldBox>
                    <FieldLabel>역할</FieldLabel>
                    <Input
                      value={project.role}
                      placeholder="예: Full-stack · Editor/SSR/Deploy"
                      onChange={(event) =>
                        updateAboutProject(projectIndex, (current: AboutProjectBlock) => ({
                          ...current,
                          role: event.target.value,
                        }))
                      }
                    />
                  </FieldBox>
                  <FieldBox data-span="full">
                    <FieldLabel>요약</FieldLabel>
                    <TextArea
                      value={project.summary}
                      placeholder="프로젝트 목록에 표시할 설명"
                      onChange={(event) =>
                        updateAboutProject(projectIndex, (current: AboutProjectBlock) => ({
                          ...current,
                          summary: event.target.value,
                        }))
                      }
                    />
                  </FieldBox>
                  <FieldBox>
                    <FieldLabel>URL</FieldLabel>
                    <Input
                      value={project.href}
                      placeholder="https://..."
                      onChange={(event) =>
                        updateAboutProject(projectIndex, (current: AboutProjectBlock) => ({
                          ...current,
                          href: event.target.value,
                        }))
                      }
                    />
                  </FieldBox>
                  <FieldBox>
                    <FieldLabel>링크 라벨</FieldLabel>
                    <Input
                      value={project.linkLabel}
                      placeholder="예: 링크 보기"
                      onChange={(event) =>
                        updateAboutProject(projectIndex, (current: AboutProjectBlock) => ({
                          ...current,
                          linkLabel: event.target.value,
                        }))
                      }
                    />
                  </FieldBox>
                </FieldGrid>
              </AboutProjectCard>
            ))}
          </AboutProjectList>
        ) : (
          <EmptyStateCard>
            <strong>아직 프로젝트가 없습니다</strong>
          </EmptyStateCard>
        )}
      </FieldSectionCard>
    </SectionStack>
  )
}
