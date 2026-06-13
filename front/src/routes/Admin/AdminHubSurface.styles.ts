import styled from "@emotion/styled"
import { AdminSectionTitleStack } from "./AdminSurfacePrimitives"
import {
  adminAccentSurface,
  adminCardBorder,
  adminControlText,
  adminGold,
  adminMutedText,
  adminPlainSurface,
  adminPrimaryText,
  adminRaisedSurface,
  adminSecondaryText,
  adminStrongBorder,
  adminTeal,
  adminTealBorder,
} from "src/routes/Admin/adminColorTokens"

export const Main = styled.main`
  display: grid;
  gap: 1.1rem;
  align-items: start;
  width: min(100%, 1088px);
  margin: 0 auto;
  padding: 1.15rem 0 2.4rem;

  @media (max-width: 768px) {
    padding-top: 0.8rem;
    gap: 1rem;
  }
`

export const HeroPanel = styled.section`
  display: grid;
  gap: 0.82rem;
  padding: 0 0 0.96rem;
  border-bottom: 1px solid ${({ theme }) => adminCardBorder(theme)};
`

export const HeroHeader = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 1rem 1.2rem;
  align-items: start;

  @media (max-width: 1480px) {
    grid-template-columns: minmax(0, 1fr);
  }

  @media (max-width: 860px) {
    gap: 0.88rem;
  }
`

export const HeroCopy = styled.div`
  display: grid;
  gap: 0.28rem;
  min-width: 0;
`

export const HeroHeading = styled.h1`
  margin: 0;
  min-width: 0;
  color: ${({ theme }) => adminPrimaryText(theme)};
  font-size: clamp(1.56rem, 2.6vw, 2.1rem);
  line-height: 1.1;
  font-weight: 800;
  letter-spacing: 0;
  word-break: keep-all;

  @media (max-width: 768px) {
    font-size: clamp(1.48rem, 7vw, 1.92rem);
  }
`

export const HeroActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.72rem;
  justify-content: flex-end;

  @media (max-width: 1480px) {
    justify-content: flex-start;
  }

  @media (max-width: 860px) {
    justify-content: flex-start;
  }
`

export const PrimaryActionLink = styled.a`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  min-width: 6rem;
  min-height: 2.65rem;
  padding: 0 1rem;
  border: 1px solid ${adminTealBorder};
  border-radius: 999px;
  background: ${adminTeal};
  color: ${adminControlText};
  text-decoration: none;
  font-size: 0.94rem;
  font-weight: 800;
`

export const SecondaryActionLink = styled.a`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2.65rem;
  padding: 0 0.9rem;
  border: 1px solid ${({ theme }) => adminCardBorder(theme)};
  border-radius: 999px;
  background: ${({ theme }) => adminRaisedSurface(theme)};
  color: ${({ theme }) => adminSecondaryText(theme)};
  text-decoration: none;
  font-size: 0.88rem;
  font-weight: 760;
`

export const LandingLayout = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 1rem;

  @media (max-width: 1120px) {
    grid-template-columns: 1fr;
  }
`

export const LandingMain = styled.div`
  display: grid;
  gap: 1rem;
  min-width: 0;
`

export const SupportRail = styled.aside`
  display: grid;
  gap: 0.82rem;
  align-self: start;
`

export const BorderlessSupportSection = styled.section`
  display: grid;
  gap: 0.66rem;
  min-width: 0;
  padding: 0 0 0.92rem;
  border-bottom: 1px solid ${({ theme }) => adminCardBorder(theme)};

  &:last-of-type {
    padding-bottom: 0;
    border-bottom: 0;
  }
`

export const SupportHeader = styled.div`
  h3 {
    margin: 0;
    color: ${({ theme }) => adminPrimaryText(theme)};
    font-size: 0.96rem;
    font-weight: 800;
    line-height: 1.35;
  }
`

export const SupportList = styled.div`
  display: grid;
  gap: 0.6rem;
`

export const BorderlessSection = styled.section`
  display: grid;
  min-width: 0;
  gap: 0.82rem;
  padding: 0 0 1rem;
  border-bottom: 1px solid ${({ theme }) => adminCardBorder(theme)};

  &[data-variant="subtle"] {
    padding-bottom: 0;
    border-bottom: 0;
  }
`

export const BorderlessPanel = styled.div`
  display: grid;
  gap: 0.24rem;
  min-width: 0;
  padding: 0.78rem 0.84rem;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => adminCardBorder(theme)};
  background: ${({ theme }) => adminPlainSurface(theme)};

  &[data-tone="good"] {
    border-color: ${({ theme }) => theme.colors.green7};
  }

  &[data-tone="warn"] {
    border-color: ${({ theme }) => theme.colors.orange7};
  }

  span {
    color: ${({ theme }) => adminMutedText(theme)};
    font-size: 0.75rem;
    font-weight: 700;
  }

  strong {
    min-width: 0;
    color: ${({ theme }) => adminPrimaryText(theme)};
    font-size: 0.9rem;
    font-weight: 800;
    line-height: 1.36;
    word-break: keep-all;
  }
`

export const BorderlessPanelLink = styled.a`
  display: grid;
  gap: 0.22rem;
  align-items: center;
  min-width: 0;
  min-height: 3.75rem;
  padding: 0.82rem 0.88rem;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => adminCardBorder(theme)};
  background: ${({ theme }) => adminPlainSurface(theme)};
  color: inherit;
  text-decoration: none;
  transition:
    transform 0.16s ease,
    border-color 0.16s ease,
    background 0.16s ease;

  &[data-featured="true"] {
    border-color: ${({ theme }) => adminStrongBorder(theme)};
    background: ${({ theme }) => adminAccentSurface(theme)};
  }

  &[data-tone="good"] {
    border-color: ${({ theme }) => theme.colors.green7};
  }

  &[data-tone="warn"] {
    border-color: ${({ theme }) => theme.colors.orange7};
  }

  &:hover {
    transform: translateY(-1px);
    border-color: ${({ theme }) => adminStrongBorder(theme)};
    background: ${({ theme }) => adminRaisedSurface(theme)};
  }

  .copy {
    min-width: 0;
    display: grid;
    gap: 0.16rem;
  }

  small,
  span {
    color: ${({ theme }) => adminMutedText(theme)};
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.04em;
  }

  strong {
    min-width: 0;
    color: ${({ theme }) => adminPrimaryText(theme)};
    font-size: 0.92rem;
    font-weight: 800;
    line-height: 1.36;
    word-break: keep-all;
  }

  @media (max-width: 560px) {
    min-height: 0;
  }
`

export const SectionHeader = styled(AdminSectionTitleStack)`
  h2 {
    font-size: 1.02rem;
  }
`

export const ActionStripGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
  gap: 0.75rem;
`

export const LandingGrid = styled.div`
  display: grid;
  gap: 1rem;
`

export const RecentWorkSummary = styled.div`
  display: grid;
  gap: 0;

  strong {
    color: ${({ theme }) => adminPrimaryText(theme)};
    font-size: 0.96rem;
    font-weight: 820;
    line-height: 1.35;
  }
`

export const RecentWorkGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(11.5rem, 1fr));
  gap: 0.68rem;
`

export const BorderlessMetricRow = styled.div`
  display: grid;
  gap: 0.24rem;
  min-width: 0;
  padding: 0.78rem 0.84rem;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => adminCardBorder(theme)};
  background: ${({ theme }) => adminPlainSurface(theme)};

  &[data-tone="good"] {
    border-color: ${({ theme }) => theme.colors.green7};
  }

  &[data-tone="warn"] {
    border-color: ${({ theme }) => theme.colors.orange7};
  }

  span {
    color: ${({ theme }) => adminMutedText(theme)};
    font-size: 0.75rem;
    font-weight: 700;
  }

  strong {
    color: ${({ theme }) => adminPrimaryText(theme)};
    font-size: 0.9rem;
    font-weight: 800;
    line-height: 1.35;
  }
`

export const RecentWorkActions = styled.div`
  display: grid;
  gap: 0.68rem;
`

export const ProfileSnapshot = styled.div`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.8rem;
  align-items: center;
`

export const ProfileFrame = styled.div`
  position: relative;
  width: 4.25rem;
  height: 4.25rem;
  border-radius: 999px;
  overflow: hidden;
  background: ${({ theme }) => adminRaisedSurface(theme)};
`

export const ProfileFallback = styled.div`
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  color: ${({ theme }) => adminPrimaryText(theme)};
  font-size: 1rem;
  font-weight: 800;
`

export const ProfileCopy = styled.div`
  min-width: 0;
  display: grid;
  gap: 0.14rem;

  strong {
    color: ${({ theme }) => adminPrimaryText(theme)};
    font-size: 1rem;
    font-weight: 800;
  }

  span {
    color: ${({ theme }) => adminSecondaryText(theme)};
    font-size: 0.82rem;
    font-weight: 700;
  }

  p {
    margin: 0;
    color: ${({ theme }) => adminMutedText(theme)};
    font-size: 0.8rem;
    line-height: 1.5;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow: hidden;
  }
`

export const RailActionLink = styled.a`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  padding: 0 0.95rem;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => adminCardBorder(theme)};
  background: ${({ theme }) => adminRaisedSurface(theme)};
  color: ${({ theme }) => (theme.scheme === "light" ? adminPrimaryText(theme) : adminGold)};
  text-decoration: none;
  font-size: 0.84rem;
  font-weight: 760;
  width: fit-content;
`
