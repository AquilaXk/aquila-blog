import Link from "next/link"
import { ReactNode } from "react"
import useAuthSession from "src/hooks/useAuthSession"

type SettingsLayoutProps = {
  active: "privacy" | "account"
  title: string
  children: ReactNode
}

const SettingsLayout = ({ active, title, children }: SettingsLayoutProps) => {
  const { authStatus, me } = useAuthSession()

  if (authStatus === "loading") {
    return (
      <main className="settingsPage" aria-busy="true">
        <p className="statusText">인증 상태를 확인하는 중입니다.</p>
        <style jsx global>{settingsStyles}</style>
      </main>
    )
  }

  if (authStatus !== "authenticated" || !me) {
    return (
      <main className="settingsPage">
        <section className="emptyState" aria-label="로그인 필요">
          <h1>설정</h1>
          <p>로그인 후 개인정보와 계정 설정을 관리할 수 있습니다.</p>
          <Link className="primaryLink" href={`/login?next=/settings/${active}`}>로그인</Link>
        </section>
        <style jsx global>{settingsStyles}</style>
      </main>
    )
  }

  return (
    <main className="settingsPage">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">Settings</p>
          <h1>{title}</h1>
          <p className="summary">{me.nickname || me.username} 계정의 개인정보와 보안 상태를 관리합니다.</p>
        </div>
        <nav className="tabs" aria-label="설정 메뉴">
          <Link
            className={active === "privacy" ? "active" : ""}
            aria-current={active === "privacy" ? "page" : undefined}
            href="/settings/privacy"
          >
            개인정보
          </Link>
          <Link
            className={active === "account" ? "active" : ""}
            aria-current={active === "account" ? "page" : undefined}
            href="/settings/account"
          >
            계정 보안
          </Link>
        </nav>
      </header>
      {children}
      <style jsx global>{settingsStyles}</style>
    </main>
  )
}

export const settingsStyles = `
  .settingsPage {
    width: min(980px, calc(100% - 32px));
    margin: 0 auto;
    padding: 48px 0 72px;
    color: var(--aq-text);
  }

  .pageHeader {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 24px;
    padding-bottom: 24px;
    border-bottom: 1px solid var(--aq-border);
  }

  .eyebrow {
    margin: 0 0 8px;
    color: var(--aq-muted);
    font-size: 0.8rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0;
  }

  .settingsPage h1 {
    margin: 0;
    font-size: 2rem;
    line-height: 1.18;
    letter-spacing: 0;
  }

  .summary {
    margin: 10px 0 0;
    color: var(--aq-text-secondary);
    line-height: 1.6;
  }

  /* 패밀리룩(1219): 필형 탭 그룹 → 헤어라인 위 밑줄 강조 사각 탭 */
  .tabs {
    display: inline-flex;
    gap: 1.4rem;
    border-bottom: 1px solid var(--aq-border);
  }

  .settingsPage .tabs a {
    padding: 0 0 10px;
    margin-bottom: -1px;
    border-bottom: 2px solid transparent;
    color: var(--aq-text-secondary);
    text-align: center;
    text-decoration: none;
    font-weight: 600;
  }

  .settingsPage .tabs a.active {
    color: var(--aq-text);
    border-bottom-color: var(--aq-text);
    font-weight: 700;
  }

  .settingsGrid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 18px;
    margin-top: 24px;
  }

  /* 패밀리룩(1219): 라운드 카드 패널 → 헤어라인 구획 섹션(면/그림자 제거) */
  .panel {
    padding: 24px 0 0;
    border-top: 1px solid var(--aq-border);
  }

  .panel h2 {
    margin: 0 0 12px;
    font-size: 1.1rem;
    letter-spacing: 0;
  }

  .statusText,
  .emptyState {
    margin-top: 48px;
    color: var(--aq-text-secondary);
  }

  .settingsPage .primaryLink,
  .settingsPage button {
    min-height: 42px;
    padding: 0 16px;
    border: 0;
    border-radius: 7px;
    background: var(--aq-accent);
    color: var(--aq-on-accent);
    font-weight: 800;
    cursor: pointer;
  }

  .primaryLink {
    display: inline-flex;
    align-items: center;
    margin-top: 12px;
    text-decoration: none;
  }

  .settingsPage button:disabled {
    cursor: not-allowed;
    background: var(--aq-border-strong);
  }

  @media (max-width: 720px) {
    .settingsPage {
      width: min(100% - 24px, 980px);
      padding-top: 28px;
    }

    .pageHeader {
      align-items: stretch;
      flex-direction: column;
    }

    .tabs {
      width: 100%;
    }

    .settingsPage .tabs a {
      flex: 1;
    }
  }
`

export default SettingsLayout
