import styled from "@emotion/styled"
import Link from "next/link"
import ProfileImage from "src/components/ProfileImage"

export type AdminHubQuickLink = {
  href: string
  title: string
  description: string
  eyebrow: string
  cta: string
}

type Props = {
  displayName: string
  displayNameInitial: string
  profileSrc?: string
  profileRole?: string
  profileBio?: string
  profileUpdatedText: string
  quickLinks: AdminHubQuickLink[]
}

const AdminHubSurface = ({
  displayName,
  displayNameInitial,
  profileSrc = "",
  profileRole,
  profileBio,
  profileUpdatedText,
  quickLinks,
}: Props) => {
  return (
    <Main>
      <HeaderPanel>
        <HeaderCopy>
          <h1>관리자 작업 진입점</h1>
          <p>지금 필요한 화면만 빠르게 열 수 있도록 핵심 작업만 남겼습니다.</p>
        </HeaderCopy>
        <StatusStrip aria-label="관리자 상태 요약">
          <StatusItem>
            <span>현재 계정</span>
            <strong>{displayName}</strong>
          </StatusItem>
          <StatusItem>
            <span>역할</span>
            <strong>{profileRole || "미설정"}</strong>
          </StatusItem>
          <StatusItem>
            <span>최근 수정</span>
            <strong>{profileUpdatedText}</strong>
          </StatusItem>
        </StatusStrip>
      </HeaderPanel>

      <TaskPanel>
        <TaskPanelHeader>
          <div>
            <h2>주요 작업</h2>
            <p>프로필, 글 작업실, 운영 도구로 바로 이동합니다.</p>
          </div>
        </TaskPanelHeader>
        <TaskList>
          {quickLinks.map((item) => {
            const isPrimary = item.href === "/admin/posts/new"
            return (
              <Link key={item.href} href={item.href} passHref legacyBehavior>
                <TaskLink data-primary={isPrimary ? "true" : "false"}>
                  <TaskCopy>
                    <strong>{item.title}</strong>
                    <p>{item.description}</p>
                  </TaskCopy>
                  <TaskMeta>
                    <span>{item.cta}</span>
                  </TaskMeta>
                </TaskLink>
              </Link>
            )
          })}
        </TaskList>
      </TaskPanel>

      <ProfileCompact>
        <ProfileFrame>
          {profileSrc ? (
            <ProfileImage src={profileSrc} alt={displayName} width={72} height={72} priority />
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
          <ProfileAction>프로필 정리</ProfileAction>
        </Link>
      </ProfileCompact>
    </Main>
  )
}

export default AdminHubSurface

const Main = styled.main`
  max-width: 1080px;
  margin: 0 auto;
  padding: 1.2rem 1rem 2.3rem;
  display: grid;
  gap: 0.78rem;

  @media (max-width: 900px) {
    gap: 0.72rem;
    padding-top: 1rem;
  }
`

const HeaderPanel = styled.section`
  display: grid;
  gap: 0.68rem;
  padding: 0.84rem 0.92rem;
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
    font-size: 0.86rem;
    line-height: 1.55;
  }
`

const StatusStrip = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.45rem;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`

const StatusItem = styled.div`
  display: grid;
  gap: 0.2rem;
  min-width: 0;
  padding: 0.48rem 0.56rem;
  border-radius: 10px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};

  span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.72rem;
    font-weight: 700;
  }

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.84rem;
    font-weight: 700;
    line-height: 1.35;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`

const TaskPanel = styled.section`
  display: grid;
  gap: 0.7rem;
  padding: 0.84rem 0.92rem;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  background: ${({ theme }) => theme.colors.gray2};
  box-shadow: none;
`

const TaskPanelHeader = styled.div`
  display: grid;
  gap: 0.25rem;

  h2 {
    margin: 0;
    font-size: 1.04rem;
    color: ${({ theme }) => theme.colors.gray12};
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.8rem;
    line-height: 1.5;
  }
`

const TaskList = styled.div`
  display: grid;
  gap: 0.5rem;
`

const TaskLink = styled.a`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.7rem;
  align-items: center;
  padding: 0.72rem 0.78rem;
  border-radius: 10px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  color: inherit;
  text-decoration: none;
  transition:
    border-color 0.16s ease,
    background-color 0.16s ease,
    color 0.16s ease;

  &[data-primary="true"] {
    border-color: ${({ theme }) => theme.colors.blue8};
    background: ${({ theme }) => theme.colors.blue2};
  }

  &:hover {
    border-color: ${({ theme }) => theme.colors.gray7};
    background: ${({ theme }) => theme.colors.gray3};
  }

  &[data-primary="true"]:hover {
    border-color: ${({ theme }) => theme.colors.blue9};
    background: ${({ theme }) => theme.colors.blue4};
  }

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
    gap: 0.45rem;
  }
`

const TaskCopy = styled.div`
  min-width: 0;
  display: grid;
  gap: 0.22rem;

  strong {
    font-size: 0.94rem;
    color: ${({ theme }) => theme.colors.gray12};
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.78rem;
    line-height: 1.45;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 1;
    overflow: hidden;
  }
`

const TaskMeta = styled.div`
  display: inline-flex;
  align-items: center;
  justify-content: center;

  span {
    display: inline-flex;
    align-items: center;
    min-height: 30px;
    border-radius: 999px;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: transparent;
    color: ${({ theme }) => theme.colors.gray11};
    padding: 0 0.62rem;
    font-size: 0.75rem;
    font-weight: 700;
    white-space: nowrap;
  }
`

const ProfileCompact = styled.section`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 0.65rem;
  align-items: center;
  padding: 0.72rem 0.84rem;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  background: ${({ theme }) => theme.colors.gray2};

  @media (max-width: 760px) {
    grid-template-columns: auto minmax(0, 1fr);
  }

  @media (max-width: 560px) {
    grid-template-columns: 1fr;
  }
`

const ProfileFrame = styled.div`
  width: 60px;
  height: 60px;
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
    font-size: 0.92rem;
  }

  span {
    color: ${({ theme }) => theme.colors.gray11};
    font-weight: 700;
    font-size: 0.78rem;
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.78rem;
    line-height: 1.45;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow: hidden;
    overflow-wrap: anywhere;
  }
`

const ProfileAction = styled.a`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  color: ${({ theme }) => theme.colors.gray11};
  text-decoration: none;
  padding: 0 0.72rem;
  font-size: 0.78rem;
  font-weight: 700;

  @media (max-width: 760px) {
    grid-column: 1 / -1;
    justify-self: start;
  }
`
