import Link from "next/link"
import AppIcon from "src/components/icons/AppIcon"
import ProfileImage from "src/components/ProfileImage"
import type {
  AdminHubNextAction,
  AdminHubPrimaryAction,
  AdminHubRecentWorkItem,
  AdminHubSupportRailGroup,
} from "./AdminHubSurface"
import {
  ActionStripGrid,
  BorderlessMetricRow,
  BorderlessPanel,
  BorderlessPanelLink,
  BorderlessSection,
  BorderlessSupportSection,
  HeroActions,
  HeroCopy,
  HeroHeader,
  HeroHeading,
  HeroPanel,
  LandingGrid,
  LandingLayout,
  LandingMain,
  Main,
  PrimaryActionLink,
  ProfileCopy,
  ProfileFallback,
  ProfileFrame,
  ProfileSnapshot,
  RailActionLink,
  RecentWorkActions,
  RecentWorkGrid,
  RecentWorkSummary,
  SecondaryActionLink,
  SectionHeader,
  SupportHeader,
  SupportList,
  SupportRail,
} from "./AdminHubSurface.styles"

type AdminHubSurfaceSectionsProps = {
  displayName: string
  displayNameInitial: string
  profileSrc: string
  profileRole?: string
  profileBio?: string
  recentWorkSummary: string
  recentWorkItems: AdminHubRecentWorkItem[]
  resolvedSupportRailGroups: AdminHubSupportRailGroup[]
  resolvedPriorityActions: AdminHubNextAction[]
  resolvedHandoffActions: AdminHubNextAction[]
  primaryAction: AdminHubPrimaryAction
}

export const AdminHubSurfaceSections = ({
  displayName,
  displayNameInitial,
  profileSrc,
  profileRole,
  profileBio,
  recentWorkSummary,
  recentWorkItems,
  resolvedSupportRailGroups,
  resolvedPriorityActions,
  resolvedHandoffActions,
  primaryAction,
}: AdminHubSurfaceSectionsProps) => (
  <Main>
    <HeroPanel>
      <HeroHeader>
        <HeroCopy>
          <HeroHeading>관리자</HeroHeading>
        </HeroCopy>
        <HeroActions>
          <Link href={primaryAction.href} passHref legacyBehavior>
            <PrimaryActionLink>
              <AppIcon name="edit" aria-hidden="true" />
              <span>{primaryAction.cta}</span>
            </PrimaryActionLink>
          </Link>
          <Link href={primaryAction.secondaryHref} passHref legacyBehavior>
            <SecondaryActionLink>{primaryAction.secondaryLabel}</SecondaryActionLink>
          </Link>
        </HeroActions>
      </HeroHeader>
    </HeroPanel>

    <LandingLayout>
      <LandingMain>
        <BorderlessSection aria-label="지금 할 일">
          <SectionHeader>
            <h2>지금 할 일</h2>
          </SectionHeader>
          <ActionStripGrid>
            {resolvedPriorityActions.map((item, index) => (
              <Link key={`${item.href}-${item.title}`} href={item.href} passHref legacyBehavior>
                <BorderlessPanelLink
                  data-tone={item.tone || "neutral"}
                  data-featured={index === 0 ? "true" : "false"}
                >
                  <div className="copy">
                    <small>{index === 0 ? "우선" : "이어서"}</small>
                    <strong>{item.title}</strong>
                  </div>
                </BorderlessPanelLink>
              </Link>
            ))}
          </ActionStripGrid>
        </BorderlessSection>

        <LandingGrid>
          <BorderlessSection>
            <SectionHeader>
              <h2>최근 작업</h2>
            </SectionHeader>
            <RecentWorkSummary>
              <strong>{recentWorkSummary}</strong>
            </RecentWorkSummary>

            <RecentWorkGrid aria-label="최근 작업 상태">
              {recentWorkItems.map((item) => (
                <BorderlessMetricRow
                  key={`${item.label}-${item.value}`}
                  data-tone={item.tone || "neutral"}
                >
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </BorderlessMetricRow>
              ))}
            </RecentWorkGrid>

            <RecentWorkActions aria-label="최근 작업 이어가기">
              {resolvedHandoffActions.map((item, index) => (
                <Link key={`${item.href}-${item.title}`} href={item.href} passHref legacyBehavior>
                  <BorderlessPanelLink
                    data-tone={item.tone || "neutral"}
                    data-featured={index === 0 ? "true" : "false"}
                  >
                    <div className="copy">
                      <small>{index === 0 ? "우선" : "다음"}</small>
                      <strong>{item.title}</strong>
                    </div>
                  </BorderlessPanelLink>
                </Link>
              ))}
            </RecentWorkActions>
          </BorderlessSection>

          <BorderlessSection data-variant="subtle">
            <SectionHeader>
              <h2>공개 노출 상태</h2>
            </SectionHeader>
            <ProfileSnapshot>
              <ProfileFrame>
                {profileSrc ? (
                  <ProfileImage src={profileSrc} alt={displayName} fillContainer />
                ) : (
                  <ProfileFallback>{displayNameInitial}</ProfileFallback>
                )}
              </ProfileFrame>
              <ProfileCopy>
                <strong>{displayName}</strong>
                <span>{profileRole || "역할 미설정"}</span>
                {profileBio ? <p>{profileBio}</p> : null}
              </ProfileCopy>
            </ProfileSnapshot>
            <Link href="/admin/profile" passHref legacyBehavior>
              <RailActionLink>프로필 편집</RailActionLink>
            </Link>
          </BorderlessSection>
        </LandingGrid>
      </LandingMain>

      <SupportRail aria-label="허브 지원 정보">
        {resolvedSupportRailGroups.map((group) => (
          <BorderlessSupportSection key={group.title}>
            <SupportHeader>
              <h3>{group.title}</h3>
            </SupportHeader>
            <SupportList>
              {group.items.map((item) =>
                item.href ? (
                  <Link key={`${group.title}-${item.label}`} href={item.href} passHref legacyBehavior>
                    <BorderlessPanelLink data-tone={item.tone || "neutral"}>
                      <span>{item.label}</span>
                      <strong>{item.cta || item.value || item.label}</strong>
                    </BorderlessPanelLink>
                  </Link>
                ) : (
                  <BorderlessPanel key={`${group.title}-${item.label}`} data-tone={item.tone || "neutral"}>
                    <span>{item.label}</span>
                    <strong>{item.value || "-"}</strong>
                  </BorderlessPanel>
                )
              )}
            </SupportList>
          </BorderlessSupportSection>
        ))}
      </SupportRail>
    </LandingLayout>
  </Main>
)
