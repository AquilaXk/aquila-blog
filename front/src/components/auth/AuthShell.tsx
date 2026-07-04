import styled from "@emotion/styled";
import Link from "next/link";
import { ReactNode } from "react";
type AuthShellProps = {
    activeTab: "login" | "signup";
    title: string;
    subtitle?: string;
    eyebrow: string;
    heroTitle: string;
    heroDescription?: string;
    statItems?: {
        label: string;
        value: string;
    }[];
    tips?: string[];
    footer: ReactNode;
    children: ReactNode;
    loginHref?: string;
    signupHref?: string;
    hideTabs?: boolean;
};
const AuthShell = ({ activeTab, title, subtitle, eyebrow, footer, children, loginHref = "/login", signupHref = "/signup", hideTabs = false, }: AuthShellProps) => {
    return (<Main>
      <Backdrop />
      <Shell data-auth-shell="true">
        <FormPanel>
          <Top>
            <Eyebrow>{eyebrow}</Eyebrow>
            <Title>{title}</Title>
            {subtitle ? <SubTitle>{subtitle}</SubTitle> : null}
          </Top>

          {hideTabs ? null : (<Tabs>
              {activeTab === "login" ? (<>
                  <ActiveTab>로그인</ActiveTab>
                  <PassiveTab href={signupHref}>회원가입</PassiveTab>
                </>) : (<>
                  <PassiveTab href={loginHref}>로그인</PassiveTab>
                  <ActiveTab>회원가입</ActiveTab>
                </>)}
            </Tabs>)}

          <Body>{children}</Body>
          <Footer>{footer}</Footer>
        </FormPanel>
      </Shell>
    </Main>);
};
export default AuthShell;
const Main = styled.main `
  position: relative;
  min-height: calc(100vh - 4rem);
  min-height: calc(100dvh - 4rem);
  padding: 1.8rem 1rem;
  display: grid;
  place-items: center;
`;
const Backdrop = styled.div `
  position: absolute;
  inset: 0;
  background: ${({ theme }) => theme.publicDesign.pageBackgroundColor};
`;
// 패밀리룩(1219): 라운드 카드 셸 + 그림자 제거 → 여백으로 구획하는 에디토리얼 단일 컬럼.
const Shell = styled.section `
  position: relative;
  z-index: 1;
  width: min(480px, 100%);
  background: transparent;
`;
const FormPanel = styled.section `
  padding: 0.4rem 0.2rem 1.28rem;
  background: transparent;
  display: grid;
  align-content: start;

  @media (max-width: 720px) {
    padding: 0.2rem 0 1rem;
  }
`;
const Top = styled.div `
  margin-bottom: 1.04rem;
`;
const Eyebrow = styled.span `
  display: inline-flex;
  align-items: center;
  margin-bottom: 0.38rem;
  color: ${({ theme }) => (theme.colors.gray10)};
  font-size: 0.74rem;
  font-weight: 760;
  letter-spacing: 0.08em;
  text-transform: uppercase;
`;
const Title = styled.h1 `
  margin: 0;
  font-size: 1.48rem;
  letter-spacing: -0.025em;
  color: ${({ theme }) => theme.colors.gray12};
`;
const SubTitle = styled.p `
  margin: 0.45rem 0 0;
  color: ${({ theme }) => theme.colors.gray11};
  line-height: 1.6;
`;
// 패밀리룩(1219): 필형 탭 → 헤어라인 위 밑줄 강조 사각 탭.
const Tabs = styled.div `
  display: flex;
  gap: 1.4rem;
  margin-bottom: 1.4rem;
  border-bottom: 1px solid ${({ theme }) => theme.publicDesign.border};
`;
const ActiveTab = styled.div `
  margin-bottom: -1px;
  padding: 0 0 0.62rem;
  border-bottom: 2px solid ${({ theme }) => theme.colors.gray12};
  color: ${({ theme }) => theme.colors.gray12};
  font-size: 0.95rem;
  font-weight: 700;
`;
const PassiveTab = styled(Link) `
  margin-bottom: -1px;
  padding: 0 0 0.62rem;
  border-bottom: 2px solid transparent;
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 0.95rem;
  text-align: center;
  text-decoration: none;
  font-weight: 600;

  &:hover {
    color: ${({ theme }) => theme.colors.gray12};
  }
`;
const Body = styled.div `
  form {
    display: grid;
    gap: 0.85rem;
  }
`;
const Footer = styled.div `
  margin-top: 1rem;
  color: ${({ theme }) => theme.colors.gray11};

  a {
    color: ${({ theme }) => (theme.colors.accentLink)};
    text-decoration: underline;
    text-underline-offset: 3px;
  }
`;
