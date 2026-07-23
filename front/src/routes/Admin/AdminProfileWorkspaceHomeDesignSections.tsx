import type { ProfileWorkspaceContent } from "src/libs/profileWorkspace"
import {
  FieldBox,
  FieldGrid,
  FieldLabel,
  FieldSectionCard,
  Input,
  SectionBlockHeader,
  SectionStack,
  TextArea,
} from "src/routes/Admin/AdminProfileWorkspace.styles"

export const renderAdminProfileHomeSection = (props: Record<string, any>) => {
  const { draft, updateDraft } = props as Record<string, any> & { draft: ProfileWorkspaceContent }

  return (
    <SectionStack>
      <FieldSectionCard>
        <SectionBlockHeader>
          <div>
            <h3>헤더 문구</h3>
          </div>
        </SectionBlockHeader>
        <FieldBox>
          <FieldLabel htmlFor="blog-title">헤더 제목</FieldLabel>
          <Input
            id="blog-title"
            value={draft.blogTitle}
            placeholder="예: aquilaXk's Blog"
            onChange={(event) => updateDraft("blogTitle", event.target.value)}
          />
        </FieldBox>
      </FieldSectionCard>

      <FieldSectionCard>
        <SectionBlockHeader>
          <div>
            <h3>홈 인트로</h3>
          </div>
        </SectionBlockHeader>
        <FieldGrid data-columns="2">
          <FieldBox>
            <FieldLabel htmlFor="home-title">첫 문장</FieldLabel>
            <Input
              id="home-title"
              value={draft.homeIntroTitle}
              placeholder="예: 비밀스러운 IT 공작소"
              onChange={(event) => updateDraft("homeIntroTitle", event.target.value)}
            />
          </FieldBox>
          <FieldBox data-span="full">
            <FieldLabel htmlFor="home-description">설명</FieldLabel>
            <TextArea
              id="home-description"
              value={draft.homeIntroDescription}
              placeholder="설명을 입력하세요"
              onChange={(event) => updateDraft("homeIntroDescription", event.target.value)}
            />
          </FieldBox>
        </FieldGrid>
      </FieldSectionCard>
    </SectionStack>
  )
}
