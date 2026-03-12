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
  footer,
  children,
  loginHref = "/login",
  signupHref = "/signup",
}: AuthShellProps) => {
  return (
    <Main>
      <Backdrop />
      <Shell>
        <FormPanel>
          <Top>
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
  overflow: hidden;
  padding: 1.25rem;
`

const Backdrop = styled.div`
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 10% 15%, rgba(14, 165, 233, 0.15), transparent 30%),
    radial-gradient(circle at 78% 10%, rgba(59, 130, 246, 0.14), transparent 26%),
    linear-gradient(135deg, rgba(10, 14, 24, 0.98), rgba(15, 23, 42, 0.88));
`

const Shell = styled.section`
  position: relative;
  z-index: 1;
  width: min(520px, 100%);
  margin: 0 auto;
  min-height: calc(100vh - 5.5rem);
  border: 1px solid rgba(148, 163, 184, 0.14);
  border-radius: 28px;
  overflow: hidden;
  background: rgba(7, 10, 18, 0.72);
  backdrop-filter: blur(18px);
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.32);
`

const FormPanel = styled.section`
  padding: 2.1rem 1.5rem;
  background: ${({ theme }) =>
    theme.scheme === "light" ? "rgba(255,255,255,0.94)" : "rgba(9, 13, 24, 0.84)"};
  display: grid;
  align-content: center;

  @media (max-width: 720px) {
    padding: 1.25rem 0.95rem 1.1rem;
  }
`

const Top = styled.div`
  margin-bottom: 1rem;
`

const Title = styled.h2`
  margin: 0;
  font-size: 1.55rem;
  letter-spacing: -0.03em;
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
  gap: 0.5rem;
  margin-bottom: 1rem;
`

const ActiveTab = styled.div`
  border-radius: 14px;
  border: 1px solid ${({ theme }) => theme.colors.blue7};
  background: ${({ theme }) => theme.colors.blue3};
  color: ${({ theme }) => theme.colors.blue11};
  padding: 0.72rem 0.8rem;
  text-align: center;
  font-weight: 700;
`

const PassiveTab = styled(Link)`
  border-radius: 14px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
  color: ${({ theme }) => theme.colors.gray11};
  padding: 0.72rem 0.8rem;
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
  margin-top: 0.95rem;
  color: ${({ theme }) => theme.colors.gray11};

  a {
    color: ${({ theme }) => theme.colors.blue10};
    text-decoration: underline;
    text-underline-offset: 3px;
  }
`
