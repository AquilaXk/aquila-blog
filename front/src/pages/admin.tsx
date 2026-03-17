import styled from "@emotion/styled"
import { GetServerSideProps, NextPage } from "next"
import Link from "next/link"
import { useRouter } from "next/router"
import { useMemo, useState } from "react"
import ProfileImage from "src/components/ProfileImage"
import useAuthSession from "src/hooks/useAuthSession"
import { replaceRoute, toLoginPath } from "src/libs/router"
import { AdminPageProps, getAdminPageProps } from "src/libs/server/adminPage"

export const getServerSideProps: GetServerSideProps<AdminPageProps> = async ({ req }) => {
  return await getAdminPageProps(req)
}

const AdminHubPage: NextPage<AdminPageProps> = ({ initialMember }) => {
  const router = useRouter()
  const { me, authStatus, logout } = useAuthSession()
  const sessionMember = authStatus === "loading" ? initialMember : me
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const profileSrc = useMemo(
    () => sessionMember?.profileImageDirectUrl || sessionMember?.profileImageUrl || "",
    [sessionMember?.profileImageDirectUrl, sessionMember?.profileImageUrl]
  )

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

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true)
      await logout()
    } finally {
      await replaceRoute(router, toLoginPath("/admin"), { preferHardNavigation: true })
      setIsLoggingOut(false)
    }
  }

  const handleMoveMain = async () => {
    await replaceRoute(router, "/", { preferHardNavigation: true })
  }

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
          <HeroActions>
            <GhostButton type="button" onClick={() => void handleMoveMain()}>
              메인으로 이동
            </GhostButton>
            <PrimaryAction type="button" onClick={() => void handleLogout()} disabled={isLoggingOut}>
              {isLoggingOut ? "로그아웃 중..." : "로그아웃"}
            </PrimaryAction>
          </HeroActions>
        </HeroIntro>
        <ProfilePanel>
          <ProfileFrame>
            {profileSrc ? (
              <ProfileImage src={profileSrc} alt={sessionMember.username} width={96} height={96} priority />
            ) : (
              <ProfileFallback>{sessionMember.username.slice(0, 2).toUpperCase()}</ProfileFallback>
            )}
          </ProfileFrame>
          <strong>{sessionMember.username}</strong>
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
              <span>바로 이동</span>
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
  padding: 1.6rem 1rem 2.6rem;
  display: grid;
  gap: 1rem;
`

const HeroCard = styled.section`
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) 320px;
  gap: 0.9rem;
  padding: 1.1rem;
  border-radius: 18px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  box-shadow: none;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
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

const BaseButton = styled.button`
  border-radius: 10px;
  border: 0;
  background: ${({ theme }) => theme.colors.gray3};
  color: ${({ theme }) => theme.colors.gray11};
  padding: 0.66rem 0.92rem;
  font-size: 0.92rem;
  font-weight: 700;
  cursor: pointer;
  transition:
    background-color 0.18s ease,
    color 0.18s ease;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.gray3};
    color: ${({ theme }) => theme.colors.gray12};
  }

  &:disabled {
    opacity: 1;
    cursor: not-allowed;
    background: ${({ theme }) => theme.colors.gray3};
    color: ${({ theme }) => theme.colors.gray10};
  }
`

const PrimaryAction = styled(BaseButton)`
  background: ${({ theme }) => theme.colors.blue9};
  color: #fff;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.blue10};
    color: #fff;
  }

  &:disabled {
    background: ${({ theme }) => theme.colors.gray4};
    color: ${({ theme }) => theme.colors.gray10};
  }
`

const GhostButton = styled(BaseButton)``

const ProfilePanel = styled.aside`
  display: grid;
  justify-items: center;
  align-content: center;
  gap: 0.45rem;
  padding: 1rem;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
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
  gap: 0.85rem;

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`

const QuickCard = styled.a`
  display: grid;
  gap: 0.7rem;
  padding: 1rem;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
  text-decoration: none;
  color: inherit;
  box-shadow: none;
  transition: border-color 0.18s ease, background-color 0.18s ease;

  &:hover {
    border-color: ${({ theme }) => theme.colors.gray8};
    background: ${({ theme }) => theme.colors.gray3};
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
