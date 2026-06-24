import styled from "@emotion/styled"
import {
  adminAccentText,
  adminAppBackground,
  adminBorder,
  adminBorderStrong,
  adminControlText,
  adminGoldTintFocus,
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
  gap: 2rem;
  align-items: start;
  min-width: 0;
  padding: 2.55rem 2.125rem 4.375rem;
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
  gap: 0.85rem;
  min-width: 0;

  p {
    margin: 0;
    color: ${adminTextMuted};
    font-size: 1rem;
    font-weight: 500;
    line-height: 1.5;
  }
`

export const HeroKicker = styled.span`
  color: ${adminTeal};
  font-size: 0.62rem;
  font-weight: 820;
  letter-spacing: 0.08em;
`

export const HeroHeading = styled.h1`
  margin: 0;
  color: ${adminTextPrimary};
  font-size: 2.125rem;
  line-height: 1.08;
  font-weight: 840;
  overflow-wrap: anywhere;

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
  min-height: 2.5rem;
  padding: 0 1rem;
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
  gap: 0;
  border: 1px solid ${adminBorder};
  background: ${adminSurface};

  @media (max-width: 1040px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 560px) {
    grid-template-columns: 1fr;
  }
`

export const MetricCard = styled.div`
  display: grid;
  gap: 0.48rem;
  min-width: 0;
  min-height: 9rem;
  align-content: center;
  padding: 1.25rem;
  border-right: 1px solid ${adminBorder};
  background: transparent;

  &:last-of-type {
    border-right: 0;
  }

  @media (max-width: 1040px) {
    &:nth-of-type(2n) {
      border-right: 0;
    }

    &:nth-of-type(-n + 2) {
      border-bottom: 1px solid ${adminBorder};
    }
  }

  @media (max-width: 560px) {
    border-right: 0;
    border-bottom: 1px solid ${adminBorder};

    &:last-of-type {
      border-bottom: 0;
    }
  }

  &[data-tone="good"] {
    background: transparent;
  }

  &[data-tone="warn"] {
    background: transparent;
  }

  span {
    color: ${adminTextMuted};
    font-size: 0.63rem;
    font-weight: 820;
    letter-spacing: 0.08em;
  }

  strong {
    color: ${adminTextPrimary};
    font-size: 1.8rem;
    font-weight: 840;
    line-height: 1.05;
  }

  small {
    color: ${adminTextSecondary};
    font-size: 0.82rem;
    font-weight: 500;
  }
`

export const LandingLayout = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 20rem;
  gap: 1.5rem;
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
  gap: 0;
  min-width: 0;
  border: 1px solid ${adminBorder};
  border-radius: 2px;
  background: ${adminSurface};
`

export const PanelHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  min-height: 3.25rem;
  padding: 0 1rem;
  border-bottom: 1px solid ${adminBorder};

  h2 {
    margin: 0;
    color: ${adminTextPrimary};
    font-size: 0.98rem;
    font-weight: 820;
    line-height: 1.25;
  }

  a {
    color: ${adminAccentText};
    font-size: 0.76rem;
    font-weight: 780;
    text-decoration: none;
  }
`

export const PanelDots = styled.span`
  color: ${adminTextMuted};
  font-size: 1rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  line-height: 1;
`

export const ContentList = styled.div`
  display: grid;
`

export const ContentRow = styled.a`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.8rem;
  align-items: center;
  min-width: 0;
  min-height: 4.3rem;
  padding: 0.88rem 1rem;
  border-bottom: 1px solid ${adminBorder};
  color: inherit;
  text-decoration: none;

  &:first-of-type {
    padding-top: 0.88rem;
  }

  &:last-of-type {
    border-bottom: 0;
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
  border-top: 0;
  color: ${adminTextMuted};
  font-size: 0.86rem;
  font-weight: 700;
`

export const StatusList = styled.div`
  display: grid;
`

export const ActivityList = styled.div`
  display: grid;
`

export const StatusRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.75rem;
  align-items: center;
  min-height: 4rem;
  padding: 0.72rem 1rem;
  border-bottom: 1px solid ${adminBorder};

  &:first-of-type {
    padding-top: 0.72rem;
  }

  &:last-of-type {
    border-bottom: 0;
  }

  span {
    display: flex;
    align-items: center;
    gap: 0.62rem;
    color: ${adminTextMuted};
    font-size: 0.82rem;
    font-weight: 500;
  }

  b {
    color: ${adminTextPrimary};
    font-size: 0.98rem;
    font-weight: 800;
  }

  i {
    width: 0.48rem;
    height: 0.48rem;
    border-radius: 50%;
    background: ${adminTeal};
    box-shadow: 0 0 0 4px rgba(17, 145, 112, 0.12);
  }

  strong {
    color: ${adminTextPrimary};
    font-size: 0.72rem;
    font-weight: 820;
    text-align: right;
    letter-spacing: 0.04em;
  }

  &[data-tone="good"] strong {
    color: ${adminTeal};
  }

  &[data-tone="warn"] strong {
    color: ${adminAccentText};
  }

  &[data-tone="warn"] i {
    background: ${adminAccentText};
    box-shadow: 0 0 0 4px ${adminGoldTintFocus};
  }

  &[data-kind="activity"] {
    grid-template-columns: 4.6rem minmax(0, 1fr);
    align-items: start;

    span {
      display: block;
      font-size: 0.68rem;
      font-weight: 760;
      letter-spacing: 0.04em;
    }

    strong {
      color: ${adminTextPrimary};
      font-size: 0.92rem;
      font-weight: 500;
      letter-spacing: 0;
      text-align: left;
      line-height: 1.4;
    }
  }
`
