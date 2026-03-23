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
      description: "관리자 사진, 역할, 소개 문구를 수정합니다.",
      eyebrow: "Profile",
    },
    {
      href: "/admin/posts/new",
      title: "글 작성 및 목록 관리",
      description: "새 글 작성, 기존 글 불러오기, 메타데이터 관리까지 한 번에 처리합니다.",
      eyebrow: "Content",
    },
    {
      href: "/admin/tools",
      title: "운영 도구",
      description: "댓글 점검과 시스템 상태 확인을 별도 작업실에서 수행합니다.",
      eyebrow: "Tools",
    },
  ]

  if (!sessionMember) return null

  return (
    <Main>
      <HeroCard>
        <HeroIntro>
          <Eyebrow>Admin Hub</Eyebrow>
          <h1>운영 허브</h1>
          <p>
            자주 쓰는 관리자 기능을 역할별로 분리했습니다. 허브에서는 현재 계정 상태를 확인하고,
            필요한 작업실로 바로 이동하면 됩니다.
          </p>
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
            <Link href="/" passHref legacyBehavior>
              <ActionLink data-tone="ghost">메인으로 이동</ActionLink>
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
        {quickLinks.map((item, index) => (
          <Link key={item.href} href={item.href} passHref legacyBehavior>
            <QuickCard>
              <small>{item.eyebrow}</small>
              <h2>{item.title}</h2>
              <p>{item.description}</p>
              <span>{`${index + 1}. 바로 이동`}</span>
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
  min-height: ${({ theme }) => `${theme.variables.ui.button.minHeightSm}px`};
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
`

const StatusRow = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.55rem;
  max-width: 44rem;

  @media (max-width: 760px) {
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
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.95rem;

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
    color: ${({ theme }) => theme.colors.gray11};
    font-weight: 650;
    font-size: 0.84rem;
  }
`
