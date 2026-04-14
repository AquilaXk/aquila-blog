import styled from "@emotion/styled"
import Link from "next/link"
import AppIcon, { type IconName } from "src/components/icons/AppIcon"
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
  description: string
}

const resolveQuickLinkIcon = (href: string): IconName => {
  if (href.includes("/profile")) return "camera"
  if (href.includes("/dashboard")) return "service"
  if (href.includes("/tools")) return "laptop"
  if (href.includes("/posts")) return "spark"
  return "edit"
}

const resolveQuickLinkDescription = (href: string) => {
  if (href.includes("/profile")) return "프로필 이미지와 소개 문구를 정리합니다."
  if (href.includes("/dashboard")) return "핵심 운영 지표와 우선 점검 항목을 확인합니다."
  if (href.includes("/tools")) return "진단과 실행 기록, 위험 작업을 관리합니다."
  if (href.includes("/posts")) return "최근 글과 게시 상태를 빠르게 확인합니다."
  return "관리 화면으로 이동합니다."
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
      label: primaryAction.title,
      icon: "edit",
      description: "새 초안을 열고 바로 작성 흐름으로 이동합니다.",
    },
    {
      href: primaryAction.secondaryHref,
      label: "글 목록",
      icon: resolveQuickLinkIcon(primaryAction.secondaryHref),
      description: resolveQuickLinkDescription(primaryAction.secondaryHref),
    },
    ...secondaryLinks.map((item) => ({
      href: item.href,
      label: item.title,
      icon: resolveQuickLinkIcon(item.href),
      description: resolveQuickLinkDescription(item.href),
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

        <SectionCard>
          <SectionHeader>
            <h2>주요 작업</h2>
          </SectionHeader>

          <Link href={primaryAction.href} passHref legacyBehavior>
            <PrimaryWorkflowLink>
              <div className="iconWrap">
                <AppIcon name="spark" aria-hidden="true" />
              </div>
              <div className="copy">
                <strong>{primaryAction.title}</strong>
                <span>새 초안을 열고 바로 편집 화면으로 이동합니다.</span>
              </div>
            </PrimaryWorkflowLink>
          </Link>

          <ShortcutList aria-label="허브 빠른 이동">
            {quickLinks
              .filter((item) => item.href !== primaryAction.href)
              .map((item) => (
                <Link key={item.href} href={item.href} passHref legacyBehavior>
                  <ShortcutRowLink>
                    <div className="iconWrap">
                      <AppIcon name={item.icon} aria-hidden="true" />
                    </div>
                    <div className="copy">
                      <strong>{item.label}</strong>
                      <span>{item.description}</span>
                    </div>
                  </ShortcutRowLink>
                </Link>
              ))}
          </ShortcutList>
        </SectionCard>
      </div>

      <RailColumn className="rt">
        <RailCard data-variant="profile">
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
              <p>{profileBio || "프로필 소개와 링크를 정리해 공개 카드와 같은 톤으로 맞춥니다."}</p>
            </ProfileCopy>
          </ProfileSnapshot>
          <Link href="/admin/profile" passHref legacyBehavior>
            <RailActionLink>편집</RailActionLink>
          </Link>
        </RailCard>
      </RailColumn>
    </Main>
  )
}

export default AdminHubSurface

const Main = styled.main`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 1.1rem;
  align-items: start;
  width: min(100%, 1220px);
  margin: 0 auto;
  padding: 1.15rem 0 2.4rem;

  @media (min-width: 1280px) {
    grid-template-columns: minmax(0, 1fr) minmax(16.75rem, 18rem);
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
  gap: 0.9rem;
  padding: 1.1rem;
  border-radius: 28px;
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

const HeroHeading = styled.h1`
  margin: 0;
  min-width: 0;
  color: ${({ theme }) => theme.colors.gray12};
  font-size: clamp(2rem, 3.2vw, 2.9rem);
  line-height: 1.08;
  font-weight: 800;
  letter-spacing: -0.04em;
  word-break: keep-all;

  @media (max-width: 768px) {
    font-size: clamp(1.85rem, 9vw, 2.4rem);
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
  gap: 0.68rem;

  @media (max-width: 640px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`

const SummaryCard = styled.div`
  display: grid;
  gap: 0.35rem;
  min-width: 0;
  padding: 0.88rem 0.95rem;
  border-radius: 20px;
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

  @media (max-width: 1180px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 960px) {
    grid-template-columns: 1fr;
  }
`

const ActionCard = styled.a`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.72rem;
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

const PrimaryWorkflowLink = styled.a`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.95rem;
  align-items: center;
  padding: 0.92rem;
  border-radius: 22px;
  border: 1px solid ${({ theme }) => theme.colors.blue7};
  background: ${({ theme }) =>
    theme.scheme === "light" ? "rgba(59, 130, 246, 0.08)" : "rgba(59, 130, 246, 0.16)"};
  color: inherit;
  text-decoration: none;
  transition:
    transform 0.16s ease,
    border-color 0.16s ease,
    box-shadow 0.16s ease;

  &:hover {
    transform: translateY(-1px);
    border-color: ${({ theme }) => theme.colors.blue8};
    box-shadow: 0 14px 28px rgba(0, 0, 0, 0.12);
  }

  .iconWrap {
    width: 2.8rem;
    height: 2.8rem;
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

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.82rem;
    line-height: 1.55;
  }

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
    align-items: start;
  }
`

const ShortcutList = styled.div`
  display: grid;
  gap: 0.68rem;
`

const ShortcutRowLink = styled.a`
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
    gap: 0.2rem;
  }

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.92rem;
    font-weight: 800;
    word-break: keep-all;
  }

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.78rem;
    line-height: 1.5;
  }
`

const RailColumn = styled.aside`
  display: grid;
  gap: 0.8rem;

  @media (min-width: 1280px) {
    position: sticky;
    top: calc(var(--app-header-height, 73px) + 0.8rem);
    align-self: start;
  }

  @media (max-width: 1279px) {
    grid-template-columns: 1fr;
  }

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`

const RailCard = styled(AdminElevatedCard)`
  display: grid;
  gap: 0.68rem;
  padding: 0.88rem;
  border-radius: 24px;

  &[data-variant="utility"] {
    background: ${({ theme }) =>
      theme.scheme === "light" ? "rgba(255, 255, 255, 0.64)" : "rgba(24, 24, 24, 0.74)"};
    box-shadow: none;
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
