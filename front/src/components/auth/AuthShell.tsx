import styled from "@emotion/styled"
import Link from "next/link"
import { ReactNode } from "react"

type AuthShellProps = {
  activeTab: "login" | "signup"
  title: string
  subtitle: string
  eyebrow: string
  heroTitle: string
  heroDescription: string
  statItems: {
    label: string
    value: string
  }[]
  tips: string[]
  footer: ReactNode
  children: ReactNode
}

const AuthShell = ({
  activeTab,
  title,
  subtitle,
  eyebrow,
  heroTitle,
  heroDescription,
  statItems,
  tips,
  footer,
  children,
}: AuthShellProps) => {
  return (
    <Main>
      <Backdrop />
      <Shell>
        <HeroPanel>
          <Eyebrow>{eyebrow}</Eyebrow>
          <HeroTitle>{heroTitle}</HeroTitle>
          <HeroDescription>{heroDescription}</HeroDescription>

          <StatGrid>
            {statItems.map((item) => (
              <StatCard key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </StatCard>
            ))}
          </StatGrid>

          <TipList>
            {tips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </TipList>
        </HeroPanel>

        <FormPanel>
          <Top>
            <Title>{title}</Title>
            <SubTitle>{subtitle}</SubTitle>
          </Top>

          <Tabs>
            {activeTab === "login" ? (
              <>
                <ActiveTab>로그인</ActiveTab>
                <PassiveTab href="/signup">회원가입</PassiveTab>
              </>
            ) : (
              <>
                <PassiveTab href="/login">로그인</PassiveTab>
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
  width: min(1120px, 100%);
  margin: 0 auto;
  min-height: calc(100vh - 6.5rem);
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(360px, 460px);
  border: 1px solid rgba(148, 163, 184, 0.14);
  border-radius: 28px;
  overflow: hidden;
  background: rgba(7, 10, 18, 0.72);
  backdrop-filter: blur(18px);
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.32);

  @media (max-width: 980px) {
    grid-template-columns: 1fr;
  }
`

const HeroPanel = styled.aside`
  padding: 3rem 2.4rem;
  display: grid;
  align-content: center;
  gap: 1.1rem;
  background:
    linear-gradient(180deg, rgba(15, 23, 42, 0.94), rgba(3, 7, 18, 0.9)),
    radial-gradient(circle at 20% 20%, rgba(56, 189, 248, 0.08), transparent 32%);
  color: rgba(248, 250, 252, 0.96);

  @media (max-width: 980px) {
    padding: 2rem 1.4rem 1.25rem;
  }
`

const Eyebrow = styled.span`
  width: fit-content;
  border-radius: 999px;
  border: 1px solid rgba(125, 211, 252, 0.28);
  background: rgba(8, 47, 73, 0.48);
  color: rgba(186, 230, 253, 0.94);
  padding: 0.42rem 0.82rem;
  font-size: 0.78rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
`

const HeroTitle = styled.h1`
  margin: 0;
  font-size: clamp(2.1rem, 4vw, 3.4rem);
  line-height: 1.04;
  letter-spacing: -0.05em;
`

const HeroDescription = styled.p`
  margin: 0;
  max-width: 34rem;
  color: rgba(226, 232, 240, 0.78);
  line-height: 1.75;
  font-size: 0.98rem;
`

const StatGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.8rem;

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
`

const StatCard = styled.div`
  border-radius: 18px;
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: rgba(15, 23, 42, 0.66);
  padding: 0.95rem 1rem;

  span {
    display: block;
    color: rgba(148, 163, 184, 0.88);
    font-size: 0.76rem;
    margin-bottom: 0.32rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  strong {
    display: block;
    font-size: 1rem;
    color: rgba(248, 250, 252, 0.96);
  }
`

const TipList = styled.ul`
  list-style: none;
  margin: 0.35rem 0 0;
  padding: 0;
  display: grid;
  gap: 0.7rem;

  li {
    padding-left: 1rem;
    position: relative;
    color: rgba(226, 232, 240, 0.82);
    line-height: 1.6;
  }

  li::before {
    content: "";
    position: absolute;
    left: 0;
    top: 0.72rem;
    width: 0.4rem;
    height: 0.4rem;
    border-radius: 999px;
    background: linear-gradient(135deg, #38bdf8, #22c55e);
    transform: translateY(-50%);
  }
`

const FormPanel = styled.section`
  padding: 2.1rem 1.6rem;
  background: ${({ theme }) =>
    theme.scheme === "light" ? "rgba(255,255,255,0.94)" : "rgba(9, 13, 24, 0.84)"};
  display: grid;
  align-content: center;

  @media (max-width: 980px) {
    padding: 1.35rem 1rem 1.2rem;
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
