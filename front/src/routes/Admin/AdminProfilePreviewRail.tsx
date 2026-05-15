import AppIcon from "src/components/icons/AppIcon"
import ProfileImage from "src/components/ProfileImage"
import type { ProfileWorkspaceContent } from "src/libs/profileWorkspace"
import {
  AvatarFallback,
  PreviewAboutCard,
  PreviewBody,
  PreviewCardShell,
  PreviewHeader,
  PreviewHeaderActions,
  PreviewHomeCard,
  PreviewLinksCard,
  PreviewProfileCard,
  PreviewRail,
  PreviewToggleButton,
  PreviewViewport,
  SegmentButton,
  SegmentedControl,
} from "src/routes/Admin/AdminProfileWorkspace.styles"
import type { PreviewMode, WorkspaceSectionId } from "src/routes/Admin/AdminProfileWorkspaceModel"

export type AdminProfilePreviewRailProps = {
  activeSection: WorkspaceSectionId
  activeSectionLabel: string
  displayName: string
  displayNameInitial: string
  hasMissingExposureItems: boolean
  isPreviewExpanded: boolean
  onPreviewModeChange: (mode: PreviewMode) => void
  onToggleExpanded: () => void
  previewContent: ProfileWorkspaceContent
  previewMode: PreviewMode
}

export default function AdminProfilePreviewRail({
  activeSection,
  activeSectionLabel,
  displayName,
  displayNameInitial,
  hasMissingExposureItems,
  isPreviewExpanded,
  onPreviewModeChange,
  onToggleExpanded,
  previewContent,
  previewMode,
}: AdminProfilePreviewRailProps) {
  return (
    <PreviewRail>
      <PreviewCardShell data-incomplete={previewMode === "draft" && hasMissingExposureItems ? "true" : undefined}>
        <PreviewHeader>
          <div>
            <strong>{activeSectionLabel}</strong>
          </div>
          <PreviewHeaderActions>
            <SegmentedControl>
              <SegmentButton
                type="button"
                data-active={previewMode === "draft"}
                onClick={() => onPreviewModeChange("draft")}
              >
                편집 중
              </SegmentButton>
              <SegmentButton
                type="button"
                data-active={previewMode === "published"}
                onClick={() => onPreviewModeChange("published")}
              >
                현재 공개
              </SegmentButton>
            </SegmentedControl>
            <PreviewToggleButton type="button" aria-expanded={isPreviewExpanded} onClick={onToggleExpanded}>
              {isPreviewExpanded ? "닫기" : "열기"}
            </PreviewToggleButton>
          </PreviewHeaderActions>
        </PreviewHeader>

        <PreviewBody data-expanded={isPreviewExpanded}>
          <PreviewViewport>
            {activeSection === "identity" ? (
              <PreviewProfileCard>
                <div className="identityRow">
                  <div className="avatar">
                    {previewContent.profileImageUrl ? (
                      <ProfileImage
                        src={previewContent.profileImageUrl}
                        alt={displayName}
                        width={72}
                        height={72}
                        priority
                      />
                    ) : (
                      <AvatarFallback>{displayNameInitial}</AvatarFallback>
                    )}
                  </div>
                  <div className="identityCopy">
                    <strong>{displayName}</strong>
                    {previewContent.profileRole ? <span>{previewContent.profileRole}</span> : null}
                  </div>
                </div>
                {previewContent.profileBio ? <p>{previewContent.profileBio}</p> : null}
              </PreviewProfileCard>
            ) : null}

            {activeSection === "about" ? (
              <PreviewAboutCard>
                <header>
                  <span>About</span>
                  <strong>{displayName}</strong>
                </header>
                {previewContent.aboutHeadline ? <h4>{previewContent.aboutHeadline}</h4> : null}
                {previewContent.aboutRole ? <h4>{previewContent.aboutRole}</h4> : null}
                {previewContent.aboutBio ? <p>{previewContent.aboutBio}</p> : null}
                {previewContent.aboutProjects.length > 0 ? (
                  <div className="sections">
                    <section>
                      <strong>{previewContent.aboutProjectSectionTitle || "프로젝트"}</strong>
                      <ul>
                        {previewContent.aboutProjects.slice(0, 3).map((project, index) => (
                          <li key={`${project.id}-${index}`}>{project.name || "프로젝트 제목"}</li>
                        ))}
                      </ul>
                    </section>
                  </div>
                ) : null}
                {previewContent.aboutSections.length > 0 ? (
                  <div className="sections">
                    {previewContent.aboutSections.map((section) => (
                      <section key={section.id}>
                        <strong>{section.title || "블록 제목"}</strong>
                        <ul>
                          {section.items.slice(0, 3).map((item, index) => (
                            <li key={`${section.id}-${index}`}>{item}</li>
                          ))}
                        </ul>
                      </section>
                    ))}
                  </div>
                ) : null}
              </PreviewAboutCard>
            ) : null}

            {activeSection === "home" ? (
              <PreviewHomeCard>
                <span>Home</span>
                <strong>{previewContent.blogTitle || displayName}</strong>
                <h4>{previewContent.homeIntroTitle || previewContent.blogTitle || displayName}</h4>
                {previewContent.homeIntroDescription ? <p>{previewContent.homeIntroDescription}</p> : null}
              </PreviewHomeCard>
            ) : null}

            {activeSection === "design" ? (
              <PreviewHomeCard>
                <span>Design</span>
                <strong>{previewContent.blogDesign === "grid" ? "Grid" : "Legacy"}</strong>
                <p>
                  {previewContent.blogDesign === "legacy"
                    ? `Legacy ${previewContent.legacyBlogScheme}`
                    : "Grid dark presentation"}
                </p>
              </PreviewHomeCard>
            ) : null}

            {activeSection === "links" ? (
              <PreviewLinksCard>
                {([
                  ["Service", previewContent.serviceLinks],
                  ["Contact", previewContent.contactLinks],
                ] as const).map(([title, items]) => (
                  <section key={title}>
                    <strong>{title}</strong>
                    {items.length > 0 ? (
                      <ul>
                        {items.map((item) => (
                          <li key={`${title}-${item.icon}-${item.label}-${item.href}`}>
                            <AppIcon name={item.icon} />
                            <span>{item.label}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </section>
                ))}
              </PreviewLinksCard>
            ) : null}
          </PreviewViewport>
        </PreviewBody>
      </PreviewCardShell>
    </PreviewRail>
  )
}
