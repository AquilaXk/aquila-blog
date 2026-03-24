import styled from "@emotion/styled"
import { GetServerSideProps, NextPage } from "next"
import Link from "next/link"
import { useMemo } from "react"
import ProfileImage from "src/components/ProfileImage"
import useAuthSession from "src/hooks/useAuthSession"
import { AdminPageProps, getAdminPageProps } from "src/libs/server/adminPage"

export const getServerSideProps: GetServerSideProps<AdminPageProps> = async ({ req }) => {
  return await getAdminPageProps(req)
}

const AdminHubPage: NextPage<AdminPageProps> = ({ initialMember }) => {
  const { me, authStatus } = useAuthSession()
  const sessionMember = authStatus === "loading" ? initialMember : me
  const displayName = sessionMember?.nickname || sessionMember?.username || "관리자"
  const displayNameInitial = displayName.slice(0, 2).toUpperCase()

  const profileSrc = useMemo(
    () => sessionMember?.profileImageDirectUrl || sessionMember?.profileImageUrl || "",
    [sessionMember?.profileImageDirectUrl, sessionMember?.profileImageUrl]
  )

  const profileUpdatedText = sessionMember?.modifiedAt
    ? sessionMember.modifiedAt.slice(0, 16).replace("T", " ")
    : "확인 전"

  const quickLinks = [
    {
      href: "/admin/profile",
      title: "프로필 관리",
      description: "사진, 역할, 소개 문구를 정리합니다.",
      eyebrow: "Profile",
      cta: "프로필 열기",
    },
    {
      href: "/admin/posts/new",
      title: "글 작업실",
      description: "목록 관리와 작성/발행 흐름을 나눠 다룹니다.",
      eyebrow: "Content",
      cta: "글 작업실 열기",
    },
    {
      href: "/admin/tools",
      title: "운영 도구",
      description: "요약, 빠른 실행, 고급 진단을 확인합니다.",
      eyebrow: "Tools",
      cta: "도구 열기",
    },
  ]

  if (!sessionMember) return null

  return (
    <Main>
      <HeroCard>
        <HeroIntro>
          <Eyebrow>Admin Hub</Eyebrow>
          <h1>운영 허브</h1>
          <p>계정 상태를 확인한 뒤 필요한 작업실로 바로 이동할 수 있게 구성했습니다.</p>
          <StatusRow>
            <StatusItem>
              <span>현재 계정</span>
              <strong>{displayName}</strong>
            </StatusItem>
            <StatusItem>
              <span>역할</span>
              <strong>{sessionMember.profileRole || "미설정"}</strong>
            </StatusItem>
            <StatusItem>
              <span>최근 수정</span>
              <strong>{profileUpdatedText}</strong>
            </StatusItem>
          </StatusRow>
          <HeroActions>
            <Link href="/admin/profile" passHref legacyBehavior>
              <ActionLink data-tone="ghost">프로필 관리</ActionLink>
            </Link>
            <Link href="/admin/posts/new" passHref legacyBehavior>
              <ActionLink data-tone="primary">글 작업실 바로가기</ActionLink>
            </Link>
          </HeroActions>
        </HeroIntro>
        <ProfilePanel>
          <ProfileFrame>
            {profileSrc ? (
              <ProfileImage src={profileSrc} alt={displayName} width={96} height={96} priority />
            ) : (
              <ProfileFallback>{displayNameInitial}</ProfileFallback>
            )}
          </ProfileFrame>
          <strong>{displayName}</strong>
          <span>{sessionMember.profileRole || "관리자 역할 미설정"}</span>
          <p>{sessionMember.profileBio || "관리자 소개 문구가 아직 없습니다."}</p>
        </ProfilePanel>
      </HeroCard>

      <CardGrid>
        {quickLinks.map((item) => (
          <Link key={item.href} href={item.href} passHref legacyBehavior>
            <QuickCard>
              <small>{item.eyebrow}</small>
              <h2>{item.title}</h2>
              <p>{item.description}</p>
              <span>{item.cta}</span>
            </QuickCard>
          </Link>
        ))}
      </CardGrid>
    </Main>
  )
}

export default AdminHubPage

const Main = styled.main`
  max-width: 1120px;
  margin: 0 auto;
  padding: 1.5rem 1rem 2.6rem;
  display: grid;
  gap: 1.1rem;

  @media (max-width: 900px) {
    gap: 0.92rem;
    padding-top: 1.1rem;
  }
`

const HeroCard = styled.section`
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) 320px;
  gap: 1rem;
  padding: ${({ theme }) => `${theme.variables.ui.card.paddingLg}px`};
  border-radius: ${({ theme }) => `${theme.variables.ui.card.radiusLg}px`};
  border: ${({ theme }) => `${theme.variables.ui.card.borderWidth}px solid ${theme.colors.gray5}`};
  background: ${({ theme }) => theme.colors.gray2};
  box-shadow: ${({ theme }) => theme.variables.ui.card.shadow};

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
    gap: 0.75rem;
    padding: 0.84rem;
    border-radius: 16px;
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.2);
  }
`

const HeroIntro = styled.div`
  display: grid;
  gap: 0.9rem;

  h1 {
    margin: 0;
    font-size: clamp(1.82rem, 3.5vw, 2.32rem);
    letter-spacing: -0.03em;
  }

  p {
    margin: 0;
    max-width: 44rem;
    color: ${({ theme }) => theme.colors.gray11};
    line-height: 1.7;
  }

  @media (max-width: 900px) {
    gap: 0.68rem;

    h1 {
      font-size: clamp(1.56rem, 7vw, 1.88rem);
    }

    p {
      font-size: 0.9rem;
      line-height: 1.62;
    }
  }
`

const Eyebrow = styled.span`
  width: fit-content;
  padding: 0;
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
`

const HeroActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;

  @media (max-width: 1024px) {
    width: 100%;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 560px) {
    grid-template-columns: 1fr;
  }
`

const ActionLink = styled.a`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: ${({ theme }) => `${theme.variables.ui.button.radius}px`};
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray11};
  padding: 0.66rem 0.92rem;
  min-height: max(40px, ${({ theme }) => `${theme.variables.ui.button.minHeightSm}px`});
  font-size: ${({ theme }) => `${theme.variables.ui.button.fontSize}rem`};
  font-weight: 700;
  text-decoration: none;
  cursor: pointer;
  transition:
    background-color 0.18s ease,
    border-color 0.18s ease,
    color 0.18s ease;

  &:hover {
    border-color: ${({ theme }) => theme.colors.gray8};
    background: ${({ theme }) => theme.colors.gray3};
    color: ${({ theme }) => theme.colors.gray12};
  }

  &[data-tone="primary"] {
    border-color: ${({ theme }) => theme.colors.blue8};
    background: ${({ theme }) => theme.colors.blue9};
    color: #fff;
  }

  &[data-tone="primary"]:hover {
    border-color: ${({ theme }) => theme.colors.blue10};
    background: ${({ theme }) => theme.colors.blue10};
    color: #fff;
  }

  @media (max-width: 1024px) {
    width: 100%;
  }
`

const ProfilePanel = styled.aside`
  display: grid;
  justify-items: center;
  align-content: center;
  gap: 0.45rem;
  padding: 1rem;
  border-radius: ${({ theme }) => `${theme.variables.ui.card.radius}px`};
  border: ${({ theme }) => `${theme.variables.ui.card.borderWidth}px solid ${theme.colors.gray5}`};
  background: ${({ theme }) => theme.colors.gray3};
  text-align: center;

  strong {
    font-size: 1.1rem;
  }

  span {
    color: ${({ theme }) => theme.colors.blue10};
    font-weight: 700;
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray11};
    line-height: 1.6;
    white-space: pre-line;
    word-break: break-word;
  }

  @media (max-width: 900px) {
    grid-template-columns: auto minmax(0, 1fr);
    justify-items: start;
    text-align: left;
    padding: 0.72rem;
    gap: 0.3rem 0.62rem;

    > div:first-of-type {
      grid-row: span 3;
      width: 76px;
      height: 76px;
    }

    p {
      display: none;
    }
  }
`

const StatusRow = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.55rem;
  max-width: 44rem;

  @media (max-width: 900px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 560px) {
    grid-template-columns: 1fr;
  }
`

const StatusItem = styled.div`
  min-width: 0;
  display: grid;
  gap: 0.22rem;
  padding: 0.56rem 0.64rem;
  border-radius: ${({ theme }) => `${theme.variables.ui.card.radius}px`};
  border: ${({ theme }) => `${theme.variables.ui.card.borderWidth}px solid ${theme.colors.gray5}`};
  background: ${({ theme }) => theme.colors.gray1};

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.92rem;
    font-weight: 700;
    line-height: 1.35;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`

const ProfileFrame = styled.div`
  width: 96px;
  height: 96px;
  border-radius: 999px;
  overflow: hidden;
`

const ProfileFallback = styled.div`
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  font-size: 1.4rem;
  font-weight: 800;
  background: ${({ theme }) => theme.colors.gray4};
  color: ${({ theme }) => theme.colors.gray11};
`

const CardGrid = styled.section`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.95rem;

  @media (max-width: 960px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`

const QuickCard = styled.a`
  display: grid;
  gap: 0.7rem;
  padding: ${({ theme }) => `${theme.variables.ui.card.padding}px`};
  border-radius: ${({ theme }) => `${theme.variables.ui.card.radius}px`};
  border: ${({ theme }) => `${theme.variables.ui.card.borderWidth}px solid ${theme.colors.gray5}`};
  background: ${({ theme }) => theme.colors.gray2};
  text-decoration: none;
  color: inherit;
  box-shadow: ${({ theme }) => theme.variables.ui.card.shadow};
  transition: border-color 0.18s ease, background-color 0.18s ease, transform 0.18s ease, box-shadow 0.18s ease;

  &:hover {
    border-color: ${({ theme }) => theme.colors.gray7};
    background: ${({ theme }) => theme.colors.gray3};
    transform: translateY(-4px);
    box-shadow: ${({ theme }) => theme.variables.ui.card.shadowHover};
  }

  small {
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.74rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  h2 {
    margin: 0;
    font-size: 1.16rem;
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray11};
    line-height: 1.7;
  }

  span {
    width: fit-content;
    min-height: 38px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 0.78rem;
    border-radius: 999px;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.colors.gray1};
    color: ${({ theme }) => theme.colors.gray12};
    font-weight: 700;
    font-size: 0.82rem;
  }
`
