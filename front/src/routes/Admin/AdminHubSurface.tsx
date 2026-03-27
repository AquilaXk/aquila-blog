import styled from "@emotion/styled"
import Link from "next/link"
import ProfileImage from "src/components/ProfileImage"

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

type Props = {
  displayName: string
  displayNameInitial: string
  profileSrc?: string
  profileRole?: string
  profileBio?: string
  profileUpdatedText: string
  primaryAction: AdminHubPrimaryAction
  secondaryLinks: AdminHubSecondaryLink[]
}

const AdminHubSurface = ({
  displayName,
  displayNameInitial,
  profileSrc = "",
  profileRole,
  profileBio,
  profileUpdatedText,
  primaryAction,
  secondaryLinks,
}: Props) => {
  return (
    <Main>
      <HeaderPanel>
        <HeaderCopy>
          <h1>관리자 작업 공간</h1>
          <p>가장 자주 하는 작업부터 바로 시작합니다.</p>
        </HeaderCopy>
        <SummaryRail aria-label="관리자 상태 요약">
          <StatusItem>
            <span>현재 계정</span>
            <strong>{displayName}</strong>
          </StatusItem>
          <StatusItem>
            <span>역할</span>
            <strong>{profileRole || "미설정"}</strong>
          </StatusItem>
          <StatusItem>
            <span>마지막 업데이트</span>
            <strong>{profileUpdatedText}</strong>
          </StatusItem>
        </SummaryRail>
      </HeaderPanel>

      <HeroPanel>
        <HeroLabel>지금 할 일</HeroLabel>
        <HeroBody>
          <HeroCopy>
            <h2>{primaryAction.title}</h2>
            <p>{primaryAction.description}</p>
          </HeroCopy>
          <HeroActions>
            <Link href={primaryAction.href} passHref legacyBehavior>
              <PrimaryActionLink>{primaryAction.cta}</PrimaryActionLink>
            </Link>
            <Link href={primaryAction.secondaryHref} passHref legacyBehavior>
              <SecondaryActionLink>{primaryAction.secondaryLabel}</SecondaryActionLink>
            </Link>
          </HeroActions>
        </HeroBody>
      </HeroPanel>

      <ShortcutPanel>
        <SectionHeader>
          <h2>보조 작업</h2>
          <p>프로필 정리와 운영 진단은 여기서 이어서 엽니다.</p>
        </SectionHeader>
        <ShortcutGrid>
          {secondaryLinks.map((item) => (
            <Link key={item.href} href={item.href} passHref legacyBehavior>
              <ShortcutLink>
                <ShortcutCopy>
                  <strong>{item.title}</strong>
                  <p>{item.description}</p>
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

const Main = styled.main`
  max-width: 1080px;
  margin: 0 auto;
  padding: 1.2rem 1rem 2.4rem;
  display: grid;
  gap: 1.15rem;

  @media (max-width: 900px) {
    gap: 0.88rem;
    padding-top: 1rem;
  }
`

const HeaderPanel = styled.section`
  display: grid;
  gap: 0.58rem;
  padding: 0.76rem 0.84rem;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  background: ${({ theme }) => theme.colors.gray2};
  box-shadow: none;
`

const HeaderCopy = styled.div`
  display: grid;
  gap: 0.32rem;

  h1 {
    margin: 0;
    font-size: clamp(1.62rem, 3vw, 2rem);
    letter-spacing: -0.03em;
  }

  p {
    margin: 0;
    max-width: 34rem;
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.82rem;
    line-height: 1.45;
  }
`

const SummaryRail = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.38rem;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`

const StatusItem = styled.div`
  display: grid;
  gap: 0.2rem;
  min-width: 0;
  padding: 0.4rem 0.48rem;
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.72rem;
    font-weight: 700;
  }

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.8rem;
    font-weight: 700;
    line-height: 1.35;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`

const HeroPanel = styled.section`
  display: grid;
  gap: 0.72rem;
  padding: 1.08rem 1rem;
  border-radius: 16px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background:
    linear-gradient(180deg, ${({ theme }) => theme.colors.gray3} 0%, ${({ theme }) => theme.colors.gray2} 100%);
  box-shadow: none;
`

const HeroLabel = styled.span`
  display: inline-flex;
  width: fit-content;
  min-height: 28px;
  align-items: center;
  padding: 0 0.6rem;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.72rem;
  font-weight: 800;
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
  gap: 0.32rem;

  h2 {
    margin: 0;
    font-size: clamp(1.72rem, 3vw, 2rem);
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
  display: grid;
  gap: 0.58rem;
  justify-items: start;

  @media (max-width: 760px) {
    width: 100%;
  }
`

const PrimaryActionLink = styled.a`
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  padding: 0 1rem;
  border: 1px solid ${({ theme }) => theme.colors.blue8};
  background: ${({ theme }) => theme.colors.blue8};
  color: ${({ theme }) => theme.colors.gray12};
  font-size: 0.94rem;
  font-weight: 800;
  text-decoration: none;
  transition:
    transform 0.16s ease,
    border-color 0.16s ease,
    background-color 0.16s ease;

  &:hover {
    transform: translateY(-1px);
    border-color: ${({ theme }) => theme.colors.blue9};
    background: ${({ theme }) => theme.colors.blue9};
  }

  @media (max-width: 760px) {
    width: 100%;
  }
`

const SecondaryActionLink = styled.a`
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.84rem;
  font-weight: 700;
  text-decoration: none;

  &:hover {
    color: ${({ theme }) => theme.colors.gray12};
    text-decoration: underline;
  }
`

const ShortcutPanel = styled.section`
  display: grid;
  gap: 0.62rem;
`

const SectionHeader = styled.div`
  display: grid;
  gap: 0.24rem;

  h2 {
    margin: 0;
    font-size: 1rem;
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
  gap: 0.58rem;

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`

const ShortcutLink = styled.a`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.56rem;
  align-items: center;
  padding: 0.72rem 0.76rem;
  border-radius: 10px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  color: inherit;
  text-decoration: none;
  transition:
    border-color 0.16s ease,
    background-color 0.16s ease,
    color 0.16s ease;

  &:hover {
    border-color: ${({ theme }) => theme.colors.gray7};
    background: ${({ theme }) => theme.colors.gray3};
  }

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
    gap: 0.45rem;
  }
`

const ShortcutCopy = styled.div`
  min-width: 0;
  display: grid;
  gap: 0.22rem;

  strong {
    font-size: 0.9rem;
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

const ShortcutMeta = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 28px;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: transparent;
  color: ${({ theme }) => theme.colors.gray11};
  padding: 0 0.54rem;
  font-size: 0.72rem;
  font-weight: 700;
  white-space: nowrap;
`

const ProfileCompact = styled.section`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 0.56rem;
  align-items: center;
  padding: 0.62rem 0.72rem;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  background: ${({ theme }) => theme.colors.gray2};

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
  width: 52px;
  height: 52px;
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
  gap: 0.18rem;

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.88rem;
  }

  span {
    color: ${({ theme }) => theme.colors.gray11};
    font-weight: 700;
    font-size: 0.74rem;
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.74rem;
    line-height: 1.4;
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
  justify-content: center;
  min-height: 30px;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray11};
  text-decoration: none;
  padding: 0 0.62rem;
  font-size: 0.74rem;
  font-weight: 700;

  @media (max-width: 760px) {
    grid-column: 1 / -1;
    justify-self: start;
  }
`
