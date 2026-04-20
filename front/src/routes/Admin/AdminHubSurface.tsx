import styled from "@emotion/styled"
import Link from "next/link"
import AppIcon from "src/components/icons/AppIcon"
import ProfileImage from "src/components/ProfileImage"
import {
  AdminElevatedCard,
  AdminSectionTitleStack,
  adminElevatedBorder,
  adminElevatedSurface,
  adminElevatedShadow,
} from "./AdminSurfacePrimitives"

export type AdminHubPrimaryAction = {
  href: string
  title: string
  cta: string
  secondaryHref: string
  secondaryLabel: string
}

export type AdminHubSecondaryLink = {
  href: string
  title: string
  cta: string
}

export type AdminHubSupportRailItem = {
  label: string
  value?: string
  href?: string
  cta?: string
  tone?: "neutral" | "good" | "warn"
}

export type AdminHubSupportRailGroup = {
  title: string
  items: AdminHubSupportRailItem[]
}

export type AdminHubNextAction = {
  href: string
  title: string
  tone?: "neutral" | "good" | "warn"
}

export type AdminHubRecentWorkItem = {
  label: string
  value: string
  tone?: "neutral" | "good" | "warn"
}

type Props = {
  displayName: string
  displayNameInitial: string
  profileSrc?: string
  profileRole?: string
  profileBio?: string
  recentWorkSummary: string
  recentWorkItems: AdminHubRecentWorkItem[]
  supportRailGroups?: AdminHubSupportRailGroup[]
  summaryItems?: AdminHubSupportRailItem[]
  priorityActions: AdminHubNextAction[]
  handoffActions: AdminHubNextAction[]
  nextActions?: AdminHubNextAction[]
  primaryAction: AdminHubPrimaryAction
  secondaryLinks?: AdminHubSecondaryLink[]
}

const AdminHubSurface = ({
  displayName,
  displayNameInitial,
  profileSrc = "",
  profileRole,
  profileBio,
  recentWorkSummary,
  recentWorkItems,
  supportRailGroups,
  summaryItems,
  priorityActions,
  handoffActions,
  nextActions,
  primaryAction,
}: Props) => {
  const resolvedPriorityActions = priorityActions || nextActions || []
  const resolvedHandoffActions = handoffActions || nextActions || []
  const resolvedSupportRailGroups =
    supportRailGroups ||
    (summaryItems?.length
      ? [
          {
            title: "허브 지원 정보",
            items: summaryItems,
          },
        ]
      : [])

  return (
    <Main>
      <HeroPanel>
        <HeroHeader>
          <HeroCopy>
            <HeroHeading>오늘 블로그 운영은 이 흐름으로 정리됩니다</HeroHeading>
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
        <ActionStrip aria-label="지금 할 일">
          <SectionHeader>
            <h2>지금 할 일</h2>
          </SectionHeader>
          <ActionStripGrid>
            {resolvedPriorityActions.map((item, index) => (
              <Link key={`${item.href}-${item.title}`} href={item.href} passHref legacyBehavior>
                <ActionCard data-tone={item.tone || "neutral"} data-featured={index === 0 ? "true" : "false"}>
                  <div className="copy">
                    <small>{index === 0 ? "우선" : "이어서"}</small>
                    <strong>{item.title}</strong>
                  </div>
                </ActionCard>
              </Link>
            ))}
          </ActionStripGrid>
        </ActionStrip>

        <LandingGrid>
          <SectionCard>
            <SectionHeader>
              <h2>최근 작업</h2>
            </SectionHeader>
            <RecentWorkSummary>
              <strong>{recentWorkSummary}</strong>
            </RecentWorkSummary>

            <RecentWorkGrid aria-label="최근 작업 상태">
              {recentWorkItems.map((item) => (
                <RecentWorkCard key={`${item.label}-${item.value}`} data-tone={item.tone || "neutral"}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </RecentWorkCard>
              ))}
            </RecentWorkGrid>

            <RecentWorkActions aria-label="최근 작업 이어가기">
              {resolvedHandoffActions.map((item, index) => (
                <Link key={`${item.href}-${item.title}`} href={item.href} passHref legacyBehavior>
                  <RecentWorkAction data-tone={item.tone || "neutral"} data-featured={index === 0 ? "true" : "false"}>
                    <div className="copy">
                      <small>{index === 0 ? "우선" : "다음"}</small>
                      <strong>{item.title}</strong>
                    </div>
                  </RecentWorkAction>
                </Link>
              ))}
            </RecentWorkActions>
          </SectionCard>

          <SectionCard data-variant="subtle">
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
          </SectionCard>
        </LandingGrid>
        </LandingMain>

        <SupportRail aria-label="허브 지원 정보">
          {resolvedSupportRailGroups.map((group) => (
            <SupportCard key={group.title}>
              <SupportHeader>
                <h3>{group.title}</h3>
              </SupportHeader>
              <SupportList>
                {group.items.map((item) =>
                  item.href ? (
                    <Link key={`${group.title}-${item.label}`} href={item.href} passHref legacyBehavior>
                      <SupportLink data-tone={item.tone || "neutral"}>
                        <span>{item.label}</span>
                        <strong>{item.cta || item.value || item.label}</strong>
                      </SupportLink>
                    </Link>
                  ) : (
                    <SupportItem key={`${group.title}-${item.label}`} data-tone={item.tone || "neutral"}>
                      <span>{item.label}</span>
                      <strong>{item.value || "-"}</strong>
                    </SupportItem>
                  )
                )}
              </SupportList>
            </SupportCard>
          ))}
        </SupportRail>
      </LandingLayout>
    </Main>
  )
}

export default AdminHubSurface

const Main = styled.main`
  display: grid;
  gap: 1.1rem;
  align-items: start;
  width: min(100%, 1088px);
  margin: 0 auto;
  padding: 1.15rem 0 2.4rem;

  @media (max-width: 768px) {
    padding-top: 0.8rem;
    gap: 1rem;
  }
`

const HeroPanel = styled.section`
  display: grid;
  gap: 0.82rem;
  padding: 0 0 0.96rem;
  border-bottom: 1px solid ${({ theme }) => theme.colors.gray5};
`

const HeroHeader = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 1rem 1.2rem;
  align-items: start;

  @media (max-width: 1480px) {
    grid-template-columns: minmax(0, 1fr);
  }

  @media (max-width: 860px) {
    gap: 0.88rem;
  }
`

const HeroCopy = styled.div`
  display: grid;
  gap: 0.28rem;
  min-width: 0;
`

const HeroHeading = styled.h1`
  margin: 0;
  min-width: 0;
  color: ${({ theme }) => theme.colors.gray12};
  font-size: clamp(1.56rem, 2.6vw, 2.1rem);
  line-height: 1.1;
  font-weight: 800;
  letter-spacing: -0.03em;
  word-break: keep-all;

  @media (max-width: 768px) {
    font-size: clamp(1.48rem, 7vw, 1.92rem);
  }
`

const HeroActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.72rem;
  justify-content: flex-end;

  @media (max-width: 1480px) {
    justify-content: flex-start;
  }

  @media (max-width: 860px) {
    justify-content: flex-start;
  }
`

const PrimaryActionLink = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: ${({ theme }) => theme.colors.blue9};
  text-decoration: none;
  font-size: 0.94rem;
  font-weight: 800;
`

const SecondaryActionLink = styled.a`
  display: inline-flex;
  align-items: center;
  min-height: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray11};
  text-decoration: none;
  font-size: 0.88rem;
  font-weight: 760;
`

const LandingLayout = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 1rem;

  @media (max-width: 1120px) {
    grid-template-columns: 1fr;
  }
`

const LandingMain = styled.div`
  display: grid;
  gap: 1rem;
  min-width: 0;
`

const SupportRail = styled.aside`
  display: grid;
  gap: 0.82rem;
  align-self: start;
`

const SupportCard = styled(AdminElevatedCard)`
  display: grid;
  gap: 0.72rem;
  padding: 0.96rem;
  border-radius: 24px;
  border-color: ${({ theme }) => adminElevatedBorder(theme)};
  background: ${({ theme }) => adminElevatedSurface(theme)};
  box-shadow: ${({ theme }) => adminElevatedShadow(theme)};
`

const SupportHeader = styled.div`
  h3 {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.96rem;
    font-weight: 800;
    line-height: 1.35;
  }
`

const SupportList = styled.div`
  display: grid;
  gap: 0.6rem;
`

const SupportItem = styled.div`
  display: grid;
  gap: 0.35rem;
  min-width: 0;
  padding: 0.82rem 0.88rem;
  border-radius: 18px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) =>
    theme.scheme === "light" ? "rgba(255, 255, 255, 0.74)" : "rgba(24, 24, 24, 0.82)"};

  &[data-tone="good"] {
    border-color: ${({ theme }) => theme.colors.green7};
  }

  &[data-tone="warn"] {
    border-color: ${({ theme }) => theme.colors.orange7};
  }

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.8rem;
    font-weight: 700;
  }

  strong {
    min-width: 0;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.94rem;
    font-weight: 800;
    line-height: 1.4;
    word-break: keep-all;
  }
`

const SupportLink = styled.a`
  display: grid;
  gap: 0.2rem;
  min-width: 0;
  padding: 0.82rem 0.88rem;
  border-radius: 18px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) =>
    theme.scheme === "light" ? "rgba(255, 255, 255, 0.74)" : "rgba(24, 24, 24, 0.82)"};
  color: inherit;
  text-decoration: none;

  &[data-tone="good"] {
    border-color: ${({ theme }) => theme.colors.green7};
  }

  &[data-tone="warn"] {
    border-color: ${({ theme }) => theme.colors.orange7};
  }

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.8rem;
    font-weight: 700;
  }

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.92rem;
    font-weight: 800;
    line-height: 1.38;
  }
`

const ActionStrip = styled.section`
  display: grid;
  gap: 0.75rem;
`

const SectionHeader = styled(AdminSectionTitleStack)`
  h2 {
    font-size: 1.02rem;
  }
`

const ActionStripGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
  gap: 0.75rem;
`

const ActionCard = styled.a`
  display: grid;
  gap: 0.22rem;
  align-items: center;
  padding: 0.92rem 1rem;
  border-radius: 20px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => adminElevatedSurface(theme)};
  color: inherit;
  text-decoration: none;
  transition:
    transform 0.16s ease,
    border-color 0.16s ease;

  &[data-featured="true"] {
    border-color: ${({ theme }) => theme.colors.blue7};
  }

  &[data-tone="warn"] {
    border-color: ${({ theme }) => theme.colors.orange7};
  }

  &[data-tone="good"] {
    border-color: ${({ theme }) => theme.colors.green7};
  }

  &:hover {
    transform: translateY(-1px);
    border-color: ${({ theme }) => theme.colors.blue7};
  }

  .copy {
    min-width: 0;
    display: grid;
    gap: 0.16rem;
  }

  small {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.04em;
  }

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.94rem;
    font-weight: 800;
  }

  @media (max-width: 560px) {
    grid-template-columns: 1fr;
    align-items: start;
  }
`

const LandingGrid = styled.div`
  display: grid;
  gap: 1rem;
`

const SectionCard = styled(AdminElevatedCard)`
  min-width: 0;
  display: grid;
  gap: 0.8rem;
  padding: 1rem;
  overflow: hidden;
  border-radius: 24px;
  border-color: ${({ theme }) => adminElevatedBorder(theme)};
  background: ${({ theme }) => adminElevatedSurface(theme)};
  box-shadow: ${({ theme }) => adminElevatedShadow(theme)};

  &[data-variant="subtle"] {
    background: ${({ theme }) =>
      theme.scheme === "light" ? "rgba(255, 255, 255, 0.64)" : "rgba(24, 24, 24, 0.74)"};
    box-shadow: none;
  }
`

const RecentWorkSummary = styled.div`
  display: grid;
  gap: 0;

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.96rem;
    font-weight: 820;
    line-height: 1.35;
  }
`

const RecentWorkGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(11.5rem, 1fr));
  gap: 0.68rem;
`

const RecentWorkCard = styled.div`
  display: grid;
  gap: 0.24rem;
  padding: 0.86rem 0.92rem;
  border-radius: 18px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) =>
    theme.scheme === "light" ? "rgba(255, 255, 255, 0.82)" : "rgba(31, 31, 31, 0.88)"};

  &[data-tone="good"] {
    border-color: ${({ theme }) => theme.colors.green7};
  }

  &[data-tone="warn"] {
    border-color: ${({ theme }) => theme.colors.orange7};
  }

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.75rem;
    font-weight: 700;
  }

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.9rem;
    font-weight: 800;
    line-height: 1.35;
  }
`

const RecentWorkActions = styled.div`
  display: grid;
  gap: 0.68rem;
`

const RecentWorkAction = styled.a`
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.78rem;
  align-items: center;
  padding: 0.88rem 0.92rem;
  border-radius: 20px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) =>
    theme.scheme === "light" ? "rgba(255, 255, 255, 0.82)" : "rgba(31, 31, 31, 0.88)"};
  color: inherit;
  text-decoration: none;
  transition:
    transform 0.16s ease,
    border-color 0.16s ease;

  &:hover {
    transform: translateY(-1px);
    border-color: ${({ theme }) => theme.colors.blue7};
  }

  &[data-featured="true"] {
    border-color: ${({ theme }) => theme.colors.blue7};
  }

  .copy {
    min-width: 0;
    display: grid;
    gap: 0.2rem;
  }

  small {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.04em;
  }

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.92rem;
    font-weight: 800;
    word-break: keep-all;
  }
`

const ProfileSnapshot = styled.div`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.8rem;
  align-items: center;
`

const ProfileFrame = styled.div`
  position: relative;
  width: 4.25rem;
  height: 4.25rem;
  border-radius: 999px;
  overflow: hidden;
  background: ${({ theme }) => theme.colors.gray4};
`

const ProfileFallback = styled.div`
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  color: ${({ theme }) => theme.colors.gray12};
  font-size: 1rem;
  font-weight: 800;
`

const ProfileCopy = styled.div`
  min-width: 0;
  display: grid;
  gap: 0.14rem;

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 1rem;
    font-weight: 800;
  }

  span {
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.82rem;
    font-weight: 700;
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.8rem;
    line-height: 1.5;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow: hidden;
  }
`

const RailActionLink = styled.a`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  padding: 0 0.95rem;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) =>
    theme.scheme === "light" ? "rgba(255, 255, 255, 0.86)" : "rgba(31, 31, 31, 0.88)"};
  color: ${({ theme }) => theme.colors.gray12};
  text-decoration: none;
  font-size: 0.84rem;
  font-weight: 760;
  width: fit-content;
`
