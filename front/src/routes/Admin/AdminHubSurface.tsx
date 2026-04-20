import styled from "@emotion/styled"
import Link from "next/link"
import { useEffect, useState } from "react"
import AppIcon from "src/components/icons/AppIcon"
import ProfileImage from "src/components/ProfileImage"
import {
  AdminElevatedCard,
  AdminLandingSectionLead,
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
  summaryItems: AdminHubSummaryItem[]
  nextActions: AdminHubNextAction[]
  primaryAction: AdminHubPrimaryAction
  secondaryLinks?: AdminHubSecondaryLink[]
}

type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
  cancelIdleCallback?: (handle: number) => void
}

const AdminHubSurface = ({
  displayName,
  displayNameInitial,
  profileSrc = "",
  profileRole,
  profileBio,
  recentWorkSummary,
  recentWorkItems,
  summaryItems,
  nextActions,
  primaryAction,
}: Props) => {
  const [showDeferredPanels, setShowDeferredPanels] = useState(false)

  useEffect(() => {
    if (showDeferredPanels || typeof window === "undefined") return

    const idleWindow = window as IdleWindow
    const activate = () => setShowDeferredPanels(true)

    if (typeof idleWindow.requestIdleCallback === "function") {
      const handle = idleWindow.requestIdleCallback(() => activate(), { timeout: 720 })
      return () => {
        if (typeof idleWindow.cancelIdleCallback === "function") {
          idleWindow.cancelIdleCallback(handle)
        }
      }
    }

    const handle = window.setTimeout(activate, 280)
    return () => window.clearTimeout(handle)
  }, [showDeferredPanels])

  return (
    <Main>
      <HeroPanel>
        <HeroHeader>
          <HeroCopy>
            <HeroHeading>오늘 블로그 운영은 이 흐름으로 정리됩니다</HeroHeading>
            <AdminLandingSectionLead>
              새 글 작성, 최근 초안 복귀, 프로필 점검, 운영 상태 확인까지 지금 필요한 흐름만 먼저 보여줍니다.
            </AdminLandingSectionLead>
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

        <SummaryRail aria-label="관리자 상태 요약">
          {summaryItems.map((item) => (
            <SummaryCard key={`${item.label}-${item.value}`} data-tone={item.tone || "neutral"}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </SummaryCard>
          ))}
        </SummaryRail>
      </HeroPanel>

      {showDeferredPanels ? (
        <>
          <ActionStrip aria-label="지금 할 일">
            <SectionHeader>
              <h2>지금 할 일</h2>
            </SectionHeader>
            <ActionStripGrid>
              {nextActions.map((item, index) => (
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
                <p>최근에 확인한 상태와 이어서 처리할 작업을 함께 봅니다.</p>
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
                {nextActions.map((item, index) => (
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
                  <p>{profileBio || "프로필 소개와 링크를 정리해 공개 카드와 같은 톤으로 맞춥니다."}</p>
                </ProfileCopy>
              </ProfileSnapshot>
              <Link href="/admin/profile" passHref legacyBehavior>
                <RailActionLink>프로필 편집</RailActionLink>
              </Link>
            </SectionCard>
          </LandingGrid>
        </>
      ) : null}
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
  gap: 0.22rem;

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.96rem;
    font-weight: 820;
    line-height: 1.35;
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.82rem;
    line-height: 1.55;
  }
`

const RecentWorkGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.68rem;

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }
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
