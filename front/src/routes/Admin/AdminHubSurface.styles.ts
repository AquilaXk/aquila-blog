import styled from "@emotion/styled"
import {
  adminAccentText,
  adminAppBackground,
  adminBorder,
  adminBorderStrong,
  adminControlText,
  adminSurface,
  adminSurfaceAccent,
  adminSurfaceRaised,
  adminTeal,
  adminTealBorder,
  adminTealHover,
  adminTextMuted,
  adminTextPrimary,
  adminTextSecondary,
} from "src/routes/Admin/adminColorTokens"

export const Main = styled.main`
  display: grid;
  gap: 1.05rem;
  align-items: start;
  width: 100%;
  min-width: 0;
  margin: 0;
  padding: 1.25rem 1.45rem 2.4rem;
  background: ${adminAppBackground};

  @media (max-width: 768px) {
    padding: 1rem 0.82rem 2rem;
  }
`

export const HeroHeader = styled.section`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 1rem;
  align-items: start;
  min-width: 0;

  @media (max-width: 860px) {
    grid-template-columns: 1fr;
  }
`

export const HeroCopy = styled.div`
  display: grid;
  gap: 0.3rem;
  min-width: 0;

  p {
    margin: 0;
    color: ${adminTextMuted};
    font-size: 0.86rem;
    font-weight: 650;
    line-height: 1.5;
  }
`

export const HeroKicker = styled.span`
  color: ${adminTextMuted};
  font-size: 0.68rem;
  font-weight: 820;
  letter-spacing: 0.08em;
`

export const HeroHeading = styled.h1`
  margin: 0;
  min-width: 0;
  color: ${adminTextPrimary};
  font-size: 1.78rem;
  line-height: 1.12;
  font-weight: 840;
  letter-spacing: 0;
  word-break: keep-all;

  @media (max-width: 768px) {
    font-size: 1.38rem;
  }
`

export const HeroActions = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.55rem;

  @media (max-width: 860px) {
    justify-content: flex-start;
  }
`

export const PrimaryActionLink = styled.a`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  min-width: 6rem;
  min-height: 2.5rem;
  padding: 0 0.95rem;
  border: 1px solid ${adminTealBorder};
  border-radius: 2px;
  background: ${adminTeal};
  color: ${adminControlText};
  text-decoration: none;
  font-size: 0.82rem;
  font-weight: 820;

  &:hover {
    background: ${adminTealHover};
  }
`

export const SecondaryActionLink = styled.a`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2.28rem;
  padding: 0 0.86rem;
  border: 1px solid ${adminBorder};
  border-radius: 2px;
  background: ${adminSurfaceRaised};
  color: ${adminTextPrimary};
  text-decoration: none;
  font-size: 0.82rem;
  font-weight: 780;
`

export const MetricGrid = styled.section`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.78rem;

  @media (max-width: 1040px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 560px) {
    grid-template-columns: 1fr;
  }
`

export const MetricCard = styled.div`
  display: grid;
  gap: 0.22rem;
  min-width: 0;
  min-height: 5.9rem;
  align-content: center;
  padding: 0.88rem 0.96rem;
  border: 1px solid ${adminBorder};
  border-radius: 2px;
  background: ${adminSurface};

  &[data-tone="good"] {
    border-color: ${adminTealBorder};
    background: ${adminSurfaceAccent};
  }

  &[data-tone="warn"] {
    border-color: ${adminBorderStrong};
    background: ${adminSurfaceRaised};
  }

  span {
    color: ${adminTextMuted};
    font-size: 0.7rem;
    font-weight: 820;
    letter-spacing: 0.08em;
  }

  strong {
    color: ${adminTextPrimary};
    font-size: 1.72rem;
    font-weight: 840;
    line-height: 1.05;
  }

  small {
    color: ${adminTextSecondary};
    font-size: 0.74rem;
    font-weight: 700;
  }
`

export const LandingLayout = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 19.5rem;
  gap: 1rem;
  align-items: start;

  > aside {
    display: grid;
    gap: 1rem;
    min-width: 0;
  }

  @media (max-width: 1120px) {
    grid-template-columns: 1fr;
  }
`

export const Panel = styled.section`
  display: grid;
  gap: 0.72rem;
  min-width: 0;
  padding: 0.95rem;
  border: 1px solid ${adminBorder};
  border-radius: 2px;
  background: ${adminSurface};
`

export const PanelHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;

  h2 {
    margin: 0;
    color: ${adminTextPrimary};
    font-size: 0.98rem;
    font-weight: 820;
    line-height: 1.25;
  }

  a {
    color: ${adminAccentText};
    font-size: 0.78rem;
    font-weight: 780;
    text-decoration: none;
  }
`

export const ContentList = styled.div`
  display: grid;
  gap: 0;
`

export const ContentRow = styled.a`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.8rem;
  align-items: center;
  min-width: 0;
  min-height: 4.25rem;
  padding: 0.76rem 0;
  border-top: 1px solid ${adminBorder};
  color: inherit;
  text-decoration: none;

  &:first-of-type {
    border-top: 0;
    padding-top: 0.2rem;
  }

  &:hover strong {
    color: ${adminAccentText};
  }

  div {
    display: grid;
    gap: 0.2rem;
    min-width: 0;
  }

  strong,
  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    color: ${adminTextPrimary};
    font-size: 0.92rem;
    font-weight: 800;
  }

  span {
    color: ${adminTextMuted};
    font-size: 0.76rem;
    font-weight: 680;
  }

  small {
    min-width: 5.6rem;
    padding: 0.28rem 0.45rem;
    border: 1px solid ${adminBorder};
    border-radius: 2px;
    color: ${adminTextSecondary};
    font-size: 0.67rem;
    font-weight: 820;
    text-align: center;
    letter-spacing: 0.04em;
  }

  &[data-tone="good"] small {
    border-color: ${adminTealBorder};
    background: ${adminSurfaceAccent};
    color: ${adminTeal};
  }
`

export const EmptyPanel = styled.div`
  min-height: 7.5rem;
  display: grid;
  place-items: center;
  border-top: 1px solid ${adminBorder};
  color: ${adminTextMuted};
  font-size: 0.86rem;
  font-weight: 700;
`

export const StatusList = styled.div`
  display: grid;
  gap: 0;
`

export const ActivityList = styled.div`
  display: grid;
  gap: 0;
`

export const StatusRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.75rem;
  align-items: center;
  min-height: 2.65rem;
  padding: 0.52rem 0;
  border-top: 1px solid ${adminBorder};

  &:first-of-type {
    border-top: 0;
    padding-top: 0;
  }

  span {
    color: ${adminTextMuted};
    font-size: 0.78rem;
    font-weight: 720;
  }

  strong {
    color: ${adminTextPrimary};
    font-size: 0.8rem;
    font-weight: 820;
    text-align: right;
  }

  &[data-tone="good"] strong {
    color: ${adminTeal};
  }

  &[data-tone="warn"] strong {
    color: ${adminTextPrimary};
  }
`
