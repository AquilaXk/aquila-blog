import styled from "@emotion/styled"

export const Main = styled.main`
  max-width: 1360px;
  margin: 0 auto;
  padding: 1.5rem 1rem 2.8rem;

  @media (max-width: 720px) {
    padding-bottom: calc(7rem + env(safe-area-inset-bottom, 0px));
  }

  @media (max-width: 720px) {
    padding:
      1rem
      max(0.78rem, env(safe-area-inset-right))
      calc(7rem + env(safe-area-inset-bottom, 0px))
      max(0.78rem, env(safe-area-inset-left));
  }
`

export const HeroCard = styled.section`
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.72rem;
  border-radius: 16px;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  background: ${({ theme }) => theme.colors.gray2};
  box-shadow: none;
  padding: 0.88rem 0.96rem;
  margin-bottom: 0.92rem;

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
    gap: 0.78rem;
    border-radius: 16px;
    box-shadow: none;
    padding: 0.88rem 0.92rem;
  }

  &[data-compact-manage="true"] {
    margin-bottom: 0.7rem;

    @media (max-width: 760px) {
      gap: 0.6rem;
      padding: 0.72rem 0.8rem;
    }
  }
`

export const HeroIntro = styled.div`
  display: grid;
  gap: 0.42rem;

  h1 {
    margin: 0;
    font-size: clamp(1.74rem, 2.7vw, 2.3rem);
    line-height: 1.14;
    font-weight: 800;
    letter-spacing: -0.02em;
    word-break: keep-all;
    text-wrap: balance;
    color: ${({ theme }) => theme.colors.gray12};
  }

  p {
    margin: 0;
    max-width: 32rem;
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.84rem;
    line-height: 1.5;
  }

  &[data-compact-manage="true"] {
    gap: 0.5rem;

    p {
      font-size: 0.86rem;
      line-height: 1.55;
    }
  }
`

export const StudioStatusStrip = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.42rem;

  @media (max-width: 1100px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 560px) {
    grid-template-columns: 1fr;
  }
`

export const StudioStatusItem = styled.div`
  display: grid;
  gap: 0.18rem;
  min-width: 0;
  padding: 0.48rem 0.58rem;
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
    font-size: 0.82rem;
    line-height: 1.35;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  @media (max-width: 760px) {
    &[data-optional="true"] {
      display: none;
    }
  }
`

export const WorkspaceGrid = styled.div`
  display: block;
`

export const WorkspaceMain = styled.div`
  min-width: 0;
`
