import styled from "@emotion/styled"
import Link from "next/link"
import AppIcon from "src/components/icons/AppIcon"
import ProfileImage from "src/components/ProfileImage"
import type { Theme } from "@emotion/react"

export type AdminHubPrimaryAction = {
  href: string
  title: string
  description: string
  cta: string
  secondaryHref: string
  secondaryLabel: string
}

export type AdminHubSecondaryLink = {
  href: string
  title: string
  description: string
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
  detail: string
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
  return (
    <Main>
      <HeaderPanel>
        <HeaderCopy>
          <h1>관리자 허브</h1>
        </HeaderCopy>
        <SummaryRail aria-label="관리자 상태 요약">
          {summaryItems.map((item) => (
            <StatusItem key={`${item.label}-${item.value}`} data-tone={item.tone || "neutral"}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </StatusItem>
          ))}
        </SummaryRail>
        <NextActionStrip aria-label="지금 해야 할 일">
          <SectionHeader>
            <h2>지금 해야 할 일</h2>
          </SectionHeader>
          <NextActionGrid>
            {nextActions.map((item) => (
              <Link key={`${item.href}-${item.title}`} href={item.href} passHref legacyBehavior>
                <NextActionLink data-tone={item.tone || "neutral"}>
                  <div className="copy">
                    <strong>{item.title}</strong>
                    <p>{item.detail}</p>
                  </div>
                  <span className="meta">바로 가기</span>
                </NextActionLink>
              </Link>
            ))}
          </NextActionGrid>
        </NextActionStrip>
      </HeaderPanel>

      <HeroPanel>
        <HeroBody>
          <HeroCopy>
            <h2>{primaryAction.title}</h2>
            {primaryAction.description ? <p>{primaryAction.description}</p> : null}
          </HeroCopy>
          <HeroActions>
            <Link href={primaryAction.href} passHref legacyBehavior>
              <PrimaryActionLink>
                <AppIcon name="edit" aria-hidden="true" />
                <span>{primaryAction.cta}</span>
              </PrimaryActionLink>
            </Link>
            <Link href={primaryAction.secondaryHref} passHref legacyBehavior>
              <SecondaryActionLink>
                <span>{primaryAction.secondaryLabel}</span>
              </SecondaryActionLink>
            </Link>
          </HeroActions>
        </HeroBody>
      </HeroPanel>

      <ShortcutPanel>
        <SectionHeader>
          <h2>보조 작업</h2>
        </SectionHeader>
        <ShortcutGrid>
          {secondaryLinks.map((item) => (
            <Link key={item.href} href={item.href} passHref legacyBehavior>
              <ShortcutLink>
                <ShortcutCopy>
                  <ShortcutTitleRow>
                    <strong>{item.title}</strong>
                    <AppIcon name="chevron-down" aria-hidden="true" className="chevron" />
                  </ShortcutTitleRow>
                  {item.description ? <p>{item.description}</p> : null}
                </ShortcutCopy>
                <ShortcutMeta>{item.cta}</ShortcutMeta>
              </ShortcutLink>
            </Link>
          ))}
        </ShortcutGrid>
      </ShortcutPanel>

      <ProfileCompact>
        <ProfileFrame>
          {profileSrc ? (
            <ProfileImage src={profileSrc} alt={displayName} fillContainer priority />
          ) : (
            <ProfileFallback>{displayNameInitial}</ProfileFallback>
          )}
        </ProfileFrame>
        <ProfileCopy>
          <strong>{displayName}</strong>
          <span>{profileRole || "관리자 역할 미설정"}</span>
          <p>{profileBio || "관리자 소개 문구가 없습니다."}</p>
        </ProfileCopy>
        <Link href="/admin/profile" passHref legacyBehavior>
          <ProfileAction>프로필 편집</ProfileAction>
        </Link>
      </ProfileCompact>
    </Main>
  )
}

export default AdminHubSurface

const statusItemSurface = (theme: Theme) =>
  theme.scheme === "light"
    ? theme.colors.gray1
    : "linear-gradient(180deg, rgba(58, 86, 122, 0.22) 0%, rgba(31, 43, 65, 0.42) 100%)"

const statusItemShadow = (theme: Theme) =>
  theme.scheme === "light"
    ? "inset 0 1px 0 rgba(255, 255, 255, 0.86), 0 8px 20px rgba(15, 23, 42, 0.06)"
    : "inset 0 1px 0 rgba(255, 255, 255, 0.04), 0 0 0 1px rgba(59, 130, 246, 0.08), 0 16px 34px rgba(17, 24, 39, 0.18)"

const nextActionSurface = (theme: Theme) =>
  theme.scheme === "light"
    ? theme.colors.gray1
    : "linear-gradient(180deg, rgba(58, 86, 122, 0.12) 0%, rgba(30, 35, 46, 0.9) 100%)"

const heroPanelSurface = (theme: Theme) =>
  theme.scheme === "light"
    ? theme.colors.gray1
    : "linear-gradient(180deg, rgba(58, 86, 122, 0.18) 0%, rgba(32, 39, 52, 0.76) 100%)"

const shortcutSurface = (theme: Theme) =>
  theme.scheme === "light"
    ? theme.colors.gray1
    : "linear-gradient(180deg, rgba(58, 86, 122, 0.12) 0%, rgba(30, 35, 46, 0.85) 100%)"

const shortcutSurfaceHover = (theme: Theme) =>
  theme.scheme === "light"
    ? theme.colors.gray2
    : "linear-gradient(180deg, rgba(58, 86, 122, 0.18) 0%, rgba(34, 41, 54, 0.92) 100%)"

const profileCompactSurface = (theme: Theme) =>
  theme.scheme === "light"
    ? theme.colors.gray1
    : "linear-gradient(180deg, rgba(58, 86, 122, 0.14) 0%, rgba(30, 35, 46, 0.9) 100%)"

const Main = styled.main`
  max-width: 1120px;
  margin: 0 auto;
  padding: 1.35rem 1rem 2.6rem;
  display: grid;
  gap: 1.2rem;

  @media (max-width: 900px) {
    gap: 0.92rem;
    padding-top: 1rem;
  }
`

const HeaderPanel = styled.section`
  display: grid;
  gap: 0.9rem;
`

const HeaderCopy = styled.div`
  display: grid;

  h1 {
    margin: 0;
    font-size: clamp(1.72rem, 3vw, 2.15rem);
    font-weight: 800;
    letter-spacing: -0.03em;
  }
`

const SummaryRail = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
  gap: 0.78rem;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`

const StatusItem = styled.div`
  display: grid;
  gap: 0.42rem;
  min-width: 0;
  padding: 1rem 1.1rem;
  border-radius: 16px;
  border: 1px solid ${({ theme }) => theme.colors.blue7};
  background: ${({ theme }) => statusItemSurface(theme)};
  box-shadow: ${({ theme }) => statusItemShadow(theme)};

  &[data-tone="good"] {
    border-color: ${({ theme }) => theme.colors.green7};
    box-shadow: ${({ theme }) =>
      theme.scheme === "light"
        ? "inset 0 1px 0 rgba(255, 255, 255, 0.9), 0 0 0 1px rgba(74, 222, 128, 0.14), 0 8px 20px rgba(15, 23, 42, 0.06)"
        : "inset 0 1px 0 rgba(255, 255, 255, 0.04), 0 0 0 1px rgba(74, 222, 128, 0.08), 0 16px 34px rgba(17, 24, 39, 0.18)"};
  }

  &[data-tone="warn"] {
    border-color: ${({ theme }) => theme.colors.orange7};
    box-shadow: ${({ theme }) =>
      theme.scheme === "light"
        ? "inset 0 1px 0 rgba(255, 255, 255, 0.9), 0 0 0 1px rgba(251, 191, 36, 0.14), 0 8px 20px rgba(15, 23, 42, 0.06)"
        : "inset 0 1px 0 rgba(255, 255, 255, 0.04), 0 0 0 1px rgba(251, 191, 36, 0.08), 0 16px 34px rgba(17, 24, 39, 0.18)"};
  }

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.84rem;
    font-weight: 700;
  }

  strong {
    min-width: 0;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 1.18rem;
    font-weight: 800;
    line-height: 1.32;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`

const NextActionStrip = styled.section`
  display: grid;
  gap: 0.62rem;
`

const NextActionGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.72rem;

  @media (max-width: 960px) {
    grid-template-columns: 1fr;
  }
`

const NextActionLink = styled.a`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.7rem;
  align-items: center;
  padding: 0.88rem 0.96rem;
  border-radius: 16px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => nextActionSurface(theme)};
  color: inherit;
  text-decoration: none;
  transition:
    border-color 0.16s ease,
    transform 0.16s ease,
    background-color 0.16s ease;

  &[data-tone="warn"] {
    border-color: ${({ theme }) => theme.colors.orange7};
  }

  &[data-tone="good"] {
    border-color: ${({ theme }) => theme.colors.green7};
  }

  &:hover {
    border-color: ${({ theme }) => theme.colors.blue7};
    transform: translateY(-1px);
  }

  .copy {
    min-width: 0;
    display: grid;
    gap: 0.18rem;
  }

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.92rem;
    font-weight: 800;
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.78rem;
    line-height: 1.5;
  }

  .meta {
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.76rem;
    font-weight: 700;
    white-space: nowrap;
  }

  @media (max-width: 560px) {
    grid-template-columns: 1fr;
    align-items: start;
  }
`

const HeroPanel = styled.section`
  display: grid;
  padding: 1.18rem 1.2rem;
  border-radius: 18px;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  background: ${({ theme }) => heroPanelSurface(theme)};
`

const HeroBody = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 1rem;
  align-items: end;

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
    align-items: start;
  }
`

const HeroCopy = styled.div`
  display: grid;
  gap: 0.2rem;

  h2 {
    margin: 0;
    font-size: clamp(1.9rem, 3vw, 2.3rem);
    font-weight: 800;
    color: ${({ theme }) => theme.colors.gray12};
    letter-spacing: -0.03em;
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.92rem;
    line-height: 1.4;
    max-width: 34rem;
  }
`

const HeroActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.85rem;
  align-items: center;
  justify-content: flex-end;

  @media (max-width: 760px) {
    justify-content: flex-start;
  }
`

const PrimaryActionLink = styled.a`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.46rem;
  min-height: 48px;
  padding: 0 1.2rem;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.blue8};
  background: ${({ theme }) => theme.colors.blue8};
  color: ${({ theme }) => theme.colors.gray12};
  font-size: 0.96rem;
  font-weight: 800;
  text-decoration: none;
  line-height: 1.2;
  transition:
    background-color 0.16s ease,
    border-color 0.16s ease,
    transform 0.16s ease;

  svg {
    font-size: 0.98rem;
  }

  &:hover {
    background: ${({ theme }) => theme.colors.blue9};
    border-color: ${({ theme }) => theme.colors.blue9};
    transform: translateY(-1px);
  }
`

const SecondaryActionLink = styled.a`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 48px;
  padding: 0 1.2rem;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.blue7};
  background: transparent;
  color: ${({ theme }) => theme.colors.blue9};
  font-size: 0.94rem;
  font-weight: 700;
  text-decoration: none;
  line-height: 1.2;
  transition:
    border-color 0.16s ease,
    background-color 0.16s ease;

  &:hover {
    border-color: ${({ theme }) => theme.colors.blue8};
    background: rgba(59, 130, 246, 0.08);
  }
`

const ShortcutPanel = styled.section`
  display: grid;
  gap: 0.72rem;
`

const SectionHeader = styled.div`
  display: grid;
  gap: 0.24rem;

  h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 800;
    color: ${({ theme }) => theme.colors.gray12};
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.78rem;
    line-height: 1.4;
  }
`

const ShortcutGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`

const ShortcutLink = styled.a`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.8rem;
  align-items: center;
  padding: 1rem 1.08rem;
  border-radius: 16px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => shortcutSurface(theme)};
  color: inherit;
  text-decoration: none;
  transition:
    border-color 0.16s ease,
    background-color 0.16s ease,
    color 0.16s ease;

  &:hover {
    border-color: ${({ theme }) => theme.colors.blue7};
    background: ${({ theme }) => shortcutSurfaceHover(theme)};
  }

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
    gap: 0.45rem;
  }
`

const ShortcutCopy = styled.div`
  min-width: 0;
  display: grid;
  gap: 0.12rem;

  strong {
    font-size: 1rem;
    font-weight: 800;
    color: ${({ theme }) => theme.colors.gray12};
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.74rem;
    line-height: 1.45;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 1;
    overflow: hidden;
  }
`

const ShortcutTitleRow = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;

  .chevron {
    font-size: 0.92rem;
    color: ${({ theme }) => theme.colors.gray10};
    transform: rotate(-90deg);
  }
`

const ShortcutMeta = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 32px;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: transparent;
  color: ${({ theme }) => theme.colors.gray11};
  padding: 0 0.74rem;
  font-size: 0.76rem;
  font-weight: 700;
  white-space: nowrap;
`

const ProfileCompact = styled.section`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 1rem;
  align-items: center;
  padding: 1rem 1.08rem;
  border-radius: 16px;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  background: ${({ theme }) => profileCompactSurface(theme)};

  @media (max-width: 760px) {
    grid-template-columns: auto minmax(0, 1fr);
  }

  @media (max-width: 560px) {
    grid-template-columns: 1fr;
    gap: 0.42rem;
    padding: 0.5rem 0.62rem;
  }
`

const ProfileFrame = styled.div`
  position: relative;
  width: 84px;
  height: 84px;
  border-radius: 999px;
  overflow: hidden;
`

const ProfileFallback = styled.div`
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  font-size: 1.1rem;
  font-weight: 800;
  background: ${({ theme }) => theme.colors.gray4};
  color: ${({ theme }) => theme.colors.gray11};
`

const ProfileCopy = styled.div`
  min-width: 0;
  display: grid;
  gap: 0.24rem;

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 1.35rem;
    font-weight: 800;
  }

  span {
    color: ${({ theme }) => theme.colors.gray11};
    font-weight: 700;
    font-size: 1rem;
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.94rem;
    line-height: 1.5;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow: hidden;
    overflow-wrap: anywhere;
  }

  @media (max-width: 560px) {
    p {
      -webkit-line-clamp: 1;
    }
  }
`

const ProfileAction = styled.a`
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  min-height: 40px;
  padding: 0;
  border: 0;
  background: transparent;
  color: ${({ theme }) => theme.colors.blue9};
  text-decoration: none;
  font-size: 0.96rem;
  font-weight: 800;
  line-height: 1.2;

  &:hover {
    color: ${({ theme }) => theme.colors.blue10};
    opacity: 0.92;
  }

  @media (max-width: 760px) {
    grid-column: 1 / -1;
    justify-self: start;
  }
`
