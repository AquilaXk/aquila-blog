import styled from "@emotion/styled"
import Link from "next/link"
import AppIcon, { type IconName } from "src/components/icons/AppIcon"
import ProfileImage from "src/components/ProfileImage"
import {
  AdminElevatedCard,
  AdminInfoLinkCard,
  AdminInfoList,
  AdminInfoStatusItem,
  AdminInfoStatusList,
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

export type AdminHubSummaryItem = {
  label: string
  value: string
  tone?: "neutral" | "good" | "warn"
}

export type AdminHubNextAction = {
  href: string
  title: string
  tone?: "neutral" | "good" | "warn"
}

type Props = {
  displayName: string
  displayNameInitial: string
  profileSrc?: string
  profileRole?: string
  profileBio?: string
  summaryItems: AdminHubSummaryItem[]
  nextActions: AdminHubNextAction[]
  primaryAction: AdminHubPrimaryAction
  secondaryLinks: AdminHubSecondaryLink[]
}

type QuickLinkItem = {
  href: string
  label: string
  icon: IconName
}

const resolveQuickLinkIcon = (href: string): IconName => {
  if (href.includes("/profile")) return "camera"
  if (href.includes("/dashboard")) return "service"
  if (href.includes("/tools")) return "laptop"
  if (href.includes("/posts")) return "spark"
  return "edit"
}

const AdminHubSurface = ({
  displayName,
  displayNameInitial,
  profileSrc = "",
  profileRole,
  profileBio,
  summaryItems,
  nextActions,
  primaryAction,
  secondaryLinks,
}: Props) => {
  const quickLinks: QuickLinkItem[] = [
    {
      href: primaryAction.href,
      label: primaryAction.cta,
      icon: "edit",
    },
    {
      href: primaryAction.secondaryHref,
      label: primaryAction.secondaryLabel,
      icon: resolveQuickLinkIcon(primaryAction.secondaryHref),
    },
    ...secondaryLinks.map((item) => ({
      href: item.href,
      label: item.cta,
      icon: resolveQuickLinkIcon(item.href),
    })),
  ]

  return (
    <Main>
      <div className="mid">
        <HeroPanel>
          <HeroHeader>
            <HeroHeading>관리자 허브</HeroHeading>
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

          <SummaryRail aria-label="관리자 상태 요약">
            {summaryItems.map((item) => (
              <SummaryCard key={`${item.label}-${item.value}`} data-tone={item.tone || "neutral"}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </SummaryCard>
            ))}
          </SummaryRail>
        </HeroPanel>

        <ActionStrip aria-label="다음 작업">
          <SectionHeader>
            <h2>다음 작업</h2>
          </SectionHeader>
          <ActionStripGrid>
            {nextActions.map((item, index) => (
              <Link key={`${item.href}-${item.title}`} href={item.href} passHref legacyBehavior>
                <ActionCard data-tone={item.tone || "neutral"} data-featured={index === 0 ? "true" : "false"}>
                  <div className="copy">
                    <strong>{item.title}</strong>
                  </div>
                </ActionCard>
              </Link>
            ))}
          </ActionStripGrid>
        </ActionStrip>

        <WorkspaceBoard>
          <SectionCard>
            <SectionHeader>
              <h2>주요 작업</h2>
            </SectionHeader>

            <PrimaryWorkflow>
              <div className="iconWrap">
                <AppIcon name="spark" aria-hidden="true" />
              </div>
              <div className="copy">
                <strong>{primaryAction.title}</strong>
              </div>
              <Link href={primaryAction.href} passHref legacyBehavior>
                <WorkflowAction>{primaryAction.cta}</WorkflowAction>
              </Link>
            </PrimaryWorkflow>

            <ShortcutGrid>
              {secondaryLinks.map((item) => (
                <Link key={item.href} href={item.href} passHref legacyBehavior>
                  <ShortcutLink>
                    <ShortcutTitleRow>
                      <div className="iconWrap">
                        <AppIcon name={resolveQuickLinkIcon(item.href)} aria-hidden="true" />
                      </div>
                      <div className="copy">
                        <strong>{item.title}</strong>
                      </div>
                    </ShortcutTitleRow>
                    <span className="meta">{item.cta}</span>
                  </ShortcutLink>
                </Link>
              ))}
            </ShortcutGrid>
          </SectionCard>

          <SectionCard>
            <SectionHeader>
              <h2>체크</h2>
            </SectionHeader>
            <Checklist>
              {summaryItems.map((item) => (
                <ChecklistItem key={`checkpoint-${item.label}`} data-tone={item.tone || "neutral"}>
                  <div className="copy">
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                  <StatusDot data-tone={item.tone || "neutral"} aria-hidden="true" />
                </ChecklistItem>
              ))}
            </Checklist>
          </SectionCard>
        </WorkspaceBoard>
      </div>

      <RailColumn className="rt">
        <RailCard>
          <SectionHeader>
            <h2>프로필</h2>
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
            </ProfileCopy>
          </ProfileSnapshot>
          <Link href="/admin/profile" passHref legacyBehavior>
            <RailActionLink>편집</RailActionLink>
          </Link>
        </RailCard>

        <RailCard>
          <SectionHeader>
            <h2>바로가기</h2>
          </SectionHeader>
          <AdminInfoList>
            {quickLinks.map((item) => (
              <Link key={`${item.href}-${item.label}`} href={item.href} passHref legacyBehavior>
                <AdminInfoLinkCard>
                  <span className="iconWrap">
                    <AppIcon name={item.icon} aria-hidden="true" />
                  </span>
                  <span className="copy">
                    <strong>{item.label}</strong>
                  </span>
                </AdminInfoLinkCard>
              </Link>
            ))}
          </AdminInfoList>
        </RailCard>

        <RailCard>
          <SectionHeader>
            <h2>상태</h2>
          </SectionHeader>
          <AdminInfoStatusList>
            {summaryItems.map((item) => (
              <AdminInfoStatusItem key={`mini-${item.label}`} data-tone={item.tone || "neutral"}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </AdminInfoStatusItem>
            ))}
          </AdminInfoStatusList>
        </RailCard>
      </RailColumn>
    </Main>
  )
}

export default AdminHubSurface

const Main = styled.main`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 1.25rem;
  align-items: start;
  width: min(100%, 1180px);
  margin: 0 auto;
  padding: 1.15rem 0 2.4rem;

  @media (min-width: 1280px) {
    grid-template-columns: minmax(0, 1fr) minmax(17.25rem, 18.75rem);
    column-gap: 1.35rem;
  }

  @media (max-width: 768px) {
    padding-top: 0.8rem;
    gap: 1rem;
  }

  > .mid {
    display: grid;
    gap: 1rem;
    min-width: 0;
  }
`

const HeroPanel = styled(AdminElevatedCard)`
  display: grid;
  gap: 1rem;
  padding: 1.25rem;
  border-radius: 28px;
`

const HeroHeader = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: center;

  @media (max-width: 860px) {
    flex-direction: column;
    align-items: stretch;
  }
`

const HeroHeading = styled.h1`
  margin: 0;
  min-width: 0;
  color: ${({ theme }) => theme.colors.gray12};
  font-size: clamp(2rem, 3.2vw, 2.9rem);
  line-height: 1.08;
  font-weight: 800;
  letter-spacing: -0.04em;

  @media (max-width: 768px) {
    font-size: clamp(1.85rem, 9vw, 2.4rem);
  }
`

const HeroActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.72rem;
  justify-content: flex-end;

  @media (max-width: 860px) {
    justify-content: flex-start;
  }
`

const PrimaryActionLink = styled.a`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  min-height: 48px;
  padding: 0 1.25rem;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.blue8};
  background: ${({ theme }) => theme.colors.blue8};
  color: #ffffff;
  text-decoration: none;
  font-size: 0.95rem;
  font-weight: 800;
  transition:
    transform 0.16s ease,
    background-color 0.16s ease,
    border-color 0.16s ease;

  &:hover {
    transform: translateY(-1px);
    background: ${({ theme }) => theme.colors.blue9};
    border-color: ${({ theme }) => theme.colors.blue9};
  }
`

const SecondaryActionLink = styled.a`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 48px;
  padding: 0 1.15rem;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) =>
    theme.scheme === "light" ? "rgba(255, 255, 255, 0.7)" : "rgba(31, 31, 31, 0.88)"};
  color: ${({ theme }) => theme.colors.gray12};
  text-decoration: none;
  font-size: 0.92rem;
  font-weight: 760;
`

const SummaryRail = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(10.5rem, 1fr));
  gap: 0.75rem;

  @media (max-width: 640px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`

const SummaryCard = styled.div`
  display: grid;
  gap: 0.35rem;
  min-width: 0;
  padding: 1rem 1.05rem;
  border-radius: 20px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) =>
    theme.scheme === "light" ? "rgba(255, 255, 255, 0.86)" : "rgba(31, 31, 31, 0.9)"};

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
    font-size: 1.12rem;
    font-weight: 800;
    line-height: 1.28;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
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
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;

  @media (max-width: 960px) {
    grid-template-columns: 1fr;
  }
`

const ActionCard = styled.a`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.72rem;
  align-items: center;
  padding: 1rem 1.05rem;
  border-radius: 22px;
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

const WorkspaceBoard = styled.section`
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(0, 0.9fr);
  gap: 1rem;

  @media (max-width: 980px) {
    grid-template-columns: 1fr;
  }
`

const SectionCard = styled(AdminElevatedCard)`
  display: grid;
  gap: 0.95rem;
  padding: 1.1rem;
  border-radius: 24px;
  border-color: ${({ theme }) => adminElevatedBorder(theme)};
  background: ${({ theme }) => adminElevatedSurface(theme)};
  box-shadow: ${({ theme }) => adminElevatedShadow(theme)};
`

const PrimaryWorkflow = styled.div`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 0.95rem;
  align-items: center;
  padding: 1rem;
  border-radius: 22px;
  border: 1px solid ${({ theme }) => theme.colors.blue7};
  background: ${({ theme }) =>
    theme.scheme === "light" ? "rgba(59, 130, 246, 0.08)" : "rgba(59, 130, 246, 0.16)"};

  .iconWrap {
    width: 3rem;
    height: 3rem;
    border-radius: 16px;
    display: grid;
    place-items: center;
    background: ${({ theme }) => theme.colors.blue8};
    color: #ffffff;
    flex-shrink: 0;
  }

  .copy {
    min-width: 0;
    display: grid;
    gap: 0.16rem;
  }

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 1rem;
    font-weight: 800;
  }

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
    align-items: start;
  }
`

const WorkflowAction = styled.a`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 42px;
  padding: 0 1rem;
  border-radius: 999px;
  background: ${({ theme }) => theme.colors.blue8};
  color: #ffffff;
  text-decoration: none;
  font-size: 0.84rem;
  font-weight: 800;
`

const ShortcutGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`

const ShortcutLink = styled.a`
  display: grid;
  gap: 0.75rem;
  padding: 0.95rem;
  border-radius: 20px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) =>
    theme.scheme === "light" ? "rgba(255, 255, 255, 0.82)" : "rgba(31, 31, 31, 0.88)"};
  color: inherit;
  text-decoration: none;

  .meta {
    color: ${({ theme }) => theme.colors.blue9};
    font-size: 0.78rem;
    font-weight: 760;
  }
`

const ShortcutTitleRow = styled.div`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.72rem;
  align-items: start;

  .iconWrap {
    width: 2.65rem;
    height: 2.65rem;
    border-radius: 15px;
    display: grid;
    place-items: center;
    background: ${({ theme }) =>
      theme.scheme === "light" ? "rgba(59, 130, 246, 0.1)" : "rgba(59, 130, 246, 0.18)"};
    color: ${({ theme }) => theme.colors.blue9};
  }

  .copy {
    min-width: 0;
    display: grid;
    gap: 0.18rem;
  }

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.95rem;
    font-weight: 800;
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.78rem;
    line-height: 1.5;
  }
`

const Checklist = styled.div`
  display: grid;
  gap: 0.65rem;
`

const ChecklistItem = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
  padding: 0.9rem 0.95rem;
  border-radius: 18px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) =>
    theme.scheme === "light" ? "rgba(255, 255, 255, 0.8)" : "rgba(31, 31, 31, 0.88)"};

  .copy {
    min-width: 0;
    display: grid;
    gap: 0.14rem;
  }

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.79rem;
    font-weight: 700;
  }

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.92rem;
    font-weight: 780;
    line-height: 1.4;
  }
`

const StatusDot = styled.span`
  width: 0.72rem;
  height: 0.72rem;
  border-radius: 999px;
  flex-shrink: 0;
  background: ${({ theme }) => theme.colors.blue8};

  &[data-tone="good"] {
    background: ${({ theme }) => theme.colors.green7};
  }

  &[data-tone="warn"] {
    background: ${({ theme }) => theme.colors.orange7};
  }
`

const RailColumn = styled.aside`
  display: grid;
  gap: 0.95rem;

  @media (min-width: 1280px) {
    position: sticky;
    top: calc(var(--app-header-height, 73px) + 0.8rem);
    align-self: start;
  }
`

const RailCard = styled(AdminElevatedCard)`
  display: grid;
  gap: 0.8rem;
  padding: 1rem;
  border-radius: 24px;
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
