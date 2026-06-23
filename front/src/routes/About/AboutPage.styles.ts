import styled from "@emotion/styled"

export const StyledWrapper = styled.div`
  padding: 70px 0 100px;

  .about-content {
    display: block;
  }

  .page-head {
    display: block;
    padding-bottom: 34px;
    border-bottom: 2px solid ${({ theme }) => theme.colors.gray12};
  }

  .mono-label {
    color: ${({ theme }) => theme.colors.gray10};
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
    font-size: 0.6875rem;
    line-height: 1;
    font-weight: 780;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .page-head h1 {
    margin: 13px 0 0;
    max-width: 920px;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 54px;
    line-height: 1.05;
    letter-spacing: -0.06em;
    font-weight: 850;
    word-break: keep-all;
  }

  .profile-image {
    position: relative;
    width: 132px;
    aspect-ratio: 1;
    border-radius: 50%;
    border: 1px solid ${({ theme }) => theme.publicDesign.border};
    background: ${({ theme }) => theme.publicDesign.readableSurface};
    overflow: hidden;
  }

  .profile-image img {
    object-fit: cover;
  }

  .profile-inline {
    display: grid;
    grid-template-columns: 132px minmax(0, 1fr);
    gap: 18px;
    align-items: start;
    margin-bottom: 18px;
  }

  .profile-copy {
    min-width: 0;
    display: grid;
    gap: 6px;
  }

  .profile-copy strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 1.125rem;
    line-height: 1.35;
    font-weight: 820;
    word-break: keep-all;
  }

  .profile-copy span {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.875rem;
    line-height: 1.5;
    font-weight: 700;
    text-transform: uppercase;
  }

  .profile-copy p {
    margin: 8px 0 0;
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 1rem;
    line-height: 1.75;
    word-break: keep-all;
    white-space: pre-line;
  }

  .about-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 60px;
    padding-top: 48px;
  }

  .about-grid section {
    min-width: 0;
  }

  .about-grid h2 {
    margin: 0 0 16px;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 30px;
    line-height: 1.25;
    letter-spacing: -0.04em;
    font-weight: 820;
  }

  .stack-list {
    border-top: 1px solid ${({ theme }) => theme.colors.gray12};
  }

  .stack-row {
    display: grid;
    grid-template-columns: 140px minmax(0, 1fr);
    gap: 20px;
    padding: 14px 0;
    border-bottom: 1px solid ${({ theme }) => theme.publicDesign.border};
  }

  .stack-row strong {
    color: ${({ theme }) => theme.colors.gray9};
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
    font-size: 0.6875rem;
    line-height: 1.5;
    font-weight: 700;
    text-transform: uppercase;
  }

  .stack-row span,
  .stack-row a {
    min-width: 0;
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.9375rem;
    line-height: 1.55;
    word-break: keep-all;
    overflow-wrap: anywhere;
  }

  .stack-row a {
    text-decoration: none;
  }

  .stack-row a:hover {
    color: ${({ theme }) => theme.colors.gray12};
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  @media (max-width: 820px) {
    padding: 44px 0 70px;

    .page-head h1 {
      font-size: 42px;
    }

    .about-grid {
      grid-template-columns: 1fr;
      gap: 34px;
    }

    .profile-inline {
      grid-template-columns: 96px minmax(0, 1fr);
    }

    .profile-image {
      width: 96px;
    }
  }
`
