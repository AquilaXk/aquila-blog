import styled from "@emotion/styled"
import Link from "next/link"
import { ReactNode } from "react"

type AuthShellProps = {
  activeTab: "login" | "signup"
  title: string
  subtitle: string
  eyebrow: string
  heroTitle: string
  heroDescription?: string
  statItems?: {
    label: string
    value: string
  }[]
  tips?: string[]
  footer: ReactNode
  children: ReactNode
  loginHref?: string
  signupHref?: string
}

const AuthShell = ({
  activeTab,
  title,
  subtitle,
  eyebrow,
  footer,
  children,
  loginHref = "/login",
  signupHref = "/signup",
}: AuthShellProps) => {
  return (
    <Main>
      <Backdrop />
      <Shell data-auth-shell="true">
        <FormPanel>
          <Top>
            <Eyebrow>{eyebrow}</Eyebrow>
            <Title>{title}</Title>
            <SubTitle>{subtitle}</SubTitle>
          </Top>

          <Tabs>
            {activeTab === "login" ? (
              <>
                <ActiveTab>로그인</ActiveTab>
                <PassiveTab href={signupHref}>회원가입</PassiveTab>
              </>
            ) : (
              <>
                <PassiveTab href={loginHref}>로그인</PassiveTab>
                <ActiveTab>회원가입</ActiveTab>
              </>
            )}
          </Tabs>

          <Body>{children}</Body>
          <Footer>{footer}</Footer>
        </FormPanel>
      </Shell>
    </Main>
  )
}

export default AuthShell

const Main = styled.main`
  position: relative;
  min-height: calc(100vh - 4rem);
  min-height: calc(100dvh - 4rem);
  padding: 1.8rem 1rem;
  display: grid;
  place-items: center;
`

const Backdrop = styled.div`
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 16% -6%, rgba(59, 130, 246, 0.075), transparent 34%),
    ${({ theme }) => theme.colors.gray1};
`

const Shell = styled.section`
  position: relative;
  z-index: 1;
  width: min(520px, 100%);
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  border-radius: 22px;
  overflow: hidden;
  background: ${({ theme }) => theme.colors.gray1};
  box-shadow: ${({ theme }) =>
    theme.scheme === "light"
      ? "0 18px 40px rgba(15, 23, 42, 0.08)"
      : "0 18px 40px rgba(0, 0, 0, 0.3)"};
`

const FormPanel = styled.section`
  padding: 1.6rem 1.35rem 1.28rem;
  background: transparent;
  display: grid;
  align-content: start;

  @media (max-width: 720px) {
    padding: 1.2rem 0.9rem 1rem;
  }
`

const Top = styled.div`
  margin-bottom: 1.04rem;
`

const Eyebrow = styled.span`
  display: inline-flex;
  align-items: center;
  margin-bottom: 0.38rem;
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.74rem;
  font-weight: 760;
  letter-spacing: 0.08em;
  text-transform: uppercase;
`

const Title = styled.h2`
  margin: 0;
  font-size: 1.48rem;
  letter-spacing: -0.025em;
  color: ${({ theme }) => theme.colors.gray12};
`

const SubTitle = styled.p`
  margin: 0.45rem 0 0;
  color: ${({ theme }) => theme.colors.gray11};
  line-height: 1.6;
`

const Tabs = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.42rem;
  margin-bottom: 1.08rem;
`

const ActiveTab = styled.div`
  border-radius: 11px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => (theme.scheme === "light" ? theme.colors.gray2 : theme.colors.gray3)};
  color: ${({ theme }) => theme.colors.gray12};
  padding: 0.66rem 0.76rem;
  text-align: center;
  font-weight: 700;
`

const PassiveTab = styled(Link)`
  border-radius: 11px;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  background: ${({ theme }) => (theme.scheme === "light" ? "#f8fafc" : theme.colors.gray1)};
  color: ${({ theme }) => theme.colors.gray11};
  padding: 0.66rem 0.76rem;
  text-align: center;
  text-decoration: none;
  font-weight: 600;
`

const Body = styled.div`
  form {
    display: grid;
    gap: 0.85rem;
  }
`

const Footer = styled.div`
  margin-top: 1rem;
  color: ${({ theme }) => theme.colors.gray11};

  a {
    color: ${({ theme }) => theme.colors.accentLink};
    text-decoration: underline;
    text-underline-offset: 3px;
  }
`
