import type { Theme } from "@emotion/react"
import styled from "@emotion/styled"

export const adminElevatedSurface = (theme: Theme) =>
  theme.scheme === "light"
    ? "linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(246, 249, 255, 0.94) 100%)"
    : "linear-gradient(180deg, rgba(23, 28, 36, 0.96) 0%, rgba(17, 20, 27, 0.94) 100%)"

export const adminElevatedBorder = (theme: Theme) => theme.colors.gray5

export const adminElevatedShadow = (theme: Theme) =>
  theme.scheme === "light" ? "0 18px 42px rgba(15, 23, 42, 0.06)" : "0 20px 44px rgba(0, 0, 0, 0.2)"

export const AdminElevatedCard = styled.section`
  border-radius: 24px;
  border: 1px solid ${({ theme }) => adminElevatedBorder(theme)};
  background: ${({ theme }) => adminElevatedSurface(theme)};
  box-shadow: ${({ theme }) => adminElevatedShadow(theme)};
`

export const AdminPlainCard = styled.section`
  border-radius: 20px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
`

export const AdminSubtleCard = styled.section`
  border-radius: 20px;
  border: 1px solid ${({ theme }) => theme.colors.gray5};
  background: ${({ theme }) => theme.colors.gray2};
`

export const AdminRailCard = styled(AdminSubtleCard)`
  display: grid;
  gap: 0.78rem;
  padding: 0.92rem;
`

export const AdminStickyRail = styled.aside`
  position: sticky;
  top: calc(var(--app-header-height, 64px) + 0.8rem);
  align-self: start;
  display: grid;
  gap: 0.82rem;
`

export const AdminSectionHeading = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 0.8rem;

  @media (max-width: 760px) {
    flex-direction: column;
    align-items: stretch;
  }
`

export const AdminSectionTitleStack = styled.div`
  min-width: 0;
  display: grid;
  gap: 0.2rem;

  h2,
  h3 {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 1.05rem;
    font-weight: 800;
    letter-spacing: -0.02em;
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.84rem;
    line-height: 1.55;
  }
`

export const AdminPaneHeader = styled.div`
  display: grid;
  gap: 0.22rem;
  padding-bottom: 0.95rem;
  border-bottom: 1px solid ${({ theme }) => theme.colors.gray5};

  h2 {
    margin: 0;
    font-size: clamp(1.24rem, 2vw, 1.5rem);
    line-height: 1.2;
    color: ${({ theme }) => theme.colors.gray12};
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.86rem;
    line-height: 1.55;
  }
`
