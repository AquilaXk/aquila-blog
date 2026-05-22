import type { ProfileWorkspaceContent } from "src/libs/profileWorkspace"
import {
  EmptyStateCard,
  FieldBox,
  FieldGrid,
  FieldLabel,
  FieldSectionCard,
  Input,
  SectionBlockHeader,
  SectionStack,
  SegmentButton,
  SegmentedControl,
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

export const renderAdminProfileDesignSection = (props: Record<string, any>) => {
  const { draft, updateDraft } = props as Record<string, any> & { draft: ProfileWorkspaceContent }

  return (
    <SectionStack>
      <FieldSectionCard>
        <SectionBlockHeader>
          <div>
            <h3>블로그 디자인</h3>
          </div>
        </SectionBlockHeader>
        <FieldGrid data-columns="2">
          <FieldBox as="div">
            <FieldLabel as="span">공개 디자인</FieldLabel>
            <SegmentedControl role="group" aria-label="공개 블로그 디자인">
              <SegmentButton
                type="button"
                data-active={draft.blogDesign === "legacy"}
                onClick={() => updateDraft("blogDesign", "legacy")}
              >
                Legacy
              </SegmentButton>
              <SegmentButton
                type="button"
                data-active={draft.blogDesign === "grid"}
                onClick={() => updateDraft("blogDesign", "grid")}
              >
                Grid
              </SegmentButton>
            </SegmentedControl>
          </FieldBox>

          {draft.blogDesign === "legacy" ? (
            <FieldBox as="div">
              <FieldLabel as="span">Legacy 색상</FieldLabel>
              <SegmentedControl role="group" aria-label="Legacy 색상">
                <SegmentButton
                  type="button"
                  data-active={draft.legacyBlogScheme === "light"}
                  onClick={() => updateDraft("legacyBlogScheme", "light")}
                >
                  Light
                </SegmentButton>
                <SegmentButton
                  type="button"
                  data-active={draft.legacyBlogScheme === "dark"}
                  onClick={() => updateDraft("legacyBlogScheme", "dark")}
                >
                  Dark
                </SegmentButton>
              </SegmentedControl>
            </FieldBox>
          ) : (
            <EmptyStateCard>
              <strong>Grid dark presentation</strong>
              <p>Grid 디자인은 dark presentation으로 고정됩니다.</p>
            </EmptyStateCard>
          )}
        </FieldGrid>
      </FieldSectionCard>
    </SectionStack>
  )
}
