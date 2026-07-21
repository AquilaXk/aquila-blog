import styled from "@emotion/styled"
import { type HTMLAttributes, type ReactNode } from "react"
import { editorialLabel, semanticColors } from "./tokens"
import { duration, easing, respectReducedMotion } from "./motion"

export type SkeletonProps = HTMLAttributes<HTMLDivElement> & {
  width?: string
  height?: string
}

export const Skeleton = ({
  width = "100%",
  height = "1rem",
  ...props
}: SkeletonProps) => <SkeletonBlock style={{ width, height }} {...props} />

const skeletonPulse = `
  @keyframes aq-skeleton-pulse {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }
`

const SkeletonBlock = styled.div`
  border-radius: 6px;
  background: linear-gradient(
    90deg,
    ${({ theme }) => theme.colors.gray3} 25%,
    ${({ theme }) => theme.colors.gray4} 50%,
    ${({ theme }) => theme.colors.gray3} 75%
  );
  background-size: 200% 100%;
  animation: aq-skeleton-pulse ${duration.skeleton}ms ${easing.standard} infinite;
  ${skeletonPulse}
  ${respectReducedMotion}
`

export type ErrorStateProps = {
  label: string
  title: string
  description: string
  meta?: string
  actions?: ReactNode
  "data-error-boundary"?: string
}

export const ErrorState = ({
  label,
  title,
  description,
  meta,
  actions,
  "data-error-boundary": dataErrorBoundary,
}: ErrorStateProps) => (
  <ErrorStateShell data-error-boundary={dataErrorBoundary}>
    <div className="shell">
      <div className="status" aria-hidden="true">
        {label}
      </div>
      <div className="copy">
        <h1>{title}</h1>
        <p>{description}</p>
        {meta ? <span>{meta}</span> : null}
      </div>
      {actions ? <div className="actions">{actions}</div> : null}
    </div>
  </ErrorStateShell>
)

const ErrorStateShell = styled.section`
  display: block;
  min-height: min(72vh, 42rem);
  padding: clamp(2.5rem, 8vw, 5rem) clamp(1rem, 5vw, 2rem);
  color: ${({ theme }) => theme.colors.gray12};

  .shell {
    width: min(100%, 46rem);
    margin: 0 auto;
    display: grid;
    gap: 1.1rem;
  }

  .status {
    font-family: ${editorialLabel.fontFamily};
    font-size: ${editorialLabel.fontSize};
    font-weight: ${editorialLabel.fontWeight};
    letter-spacing: ${editorialLabel.letterSpacing};
    text-transform: ${editorialLabel.textTransform};
    color: ${({ theme }) => theme.colors.gray10};
  }

  .copy {
    display: grid;
    gap: 0.85rem;
    padding-bottom: 1.5rem;
    border-bottom: 1px solid ${({ theme }) => theme.publicDesign.border};
  }

  h1 {
    margin: 0;
    font-size: clamp(1.9rem, 5vw, 2.8rem);
    line-height: 1.15;
    font-weight: 800;
    letter-spacing: -0.02em;
  }

  p {
    margin: 0;
    max-width: 40rem;
    color: ${({ theme }) => theme.colors.gray11};
    line-height: 1.7;
  }

  span {
    font-family: ${editorialLabel.fontFamily};
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.82rem;
    font-weight: 700;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    margin-top: 0.4rem;
  }

  .actions button,
  .actions a {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    padding: 0 1.1rem;
    border: 1px solid ${({ theme }) => theme.publicDesign.borderStrong};
    border-radius: 6px;
    background: transparent;
    color: ${({ theme }) => theme.colors.gray12};
    font: inherit;
    font-size: 0.92rem;
    font-weight: 800;
    text-decoration: none;
    cursor: pointer;
  }

  .actions a[data-tone="primary"] {
    border-color: ${({ theme }) => theme.colors.gray12};
    background: ${({ theme }) => theme.colors.gray12};
    color: ${({ theme }) => theme.publicDesign.pageBackgroundColor};
  }

  .actions button:hover {
    border-color: ${({ theme }) => theme.colors.gray12};
  }

  .actions a[data-tone="primary"]:hover {
    opacity: 0.88;
  }
`

export type EmptyStateProps = {
  label: string
  description: string
  title?: string
  actions?: ReactNode
}

export const EmptyState = ({ label, title, description, actions }: EmptyStateProps) => (
  <EmptyStateShell>
    <div className="status" aria-hidden="true">
      {label}
    </div>
    {title ? <h2>{title}</h2> : null}
    <p>{description}</p>
    {actions ? <div className="actions">{actions}</div> : null}
  </EmptyStateShell>
)

const EmptyStateShell = styled.section`
  display: grid;
  gap: 0.75rem;
  padding: 1.5rem 0;
  border-top: 1px solid ${({ theme }) => semanticColors(theme).hairline};
  border-bottom: 1px solid ${({ theme }) => semanticColors(theme).hairline};
  color: ${({ theme }) => semanticColors(theme).textPrimary};

  .status {
    font-family: ${editorialLabel.fontFamily};
    font-size: ${editorialLabel.fontSize};
    font-weight: ${editorialLabel.fontWeight};
    letter-spacing: ${editorialLabel.letterSpacing};
    text-transform: ${editorialLabel.textTransform};
    color: ${({ theme }) => semanticColors(theme).textMuted};
  }

  h2 {
    margin: 0;
    font-size: 1.15rem;
    line-height: 1.35;
    font-weight: 800;
    letter-spacing: -0.01em;
  }

  p {
    margin: 0;
    max-width: 36rem;
    color: ${({ theme }) => semanticColors(theme).textSecondary};
    line-height: 1.65;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.55rem;
    margin-top: 0.2rem;
  }
`
