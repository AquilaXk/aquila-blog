import styled from "@emotion/styled";
export const MobileSummaryBar = styled.div `
  display: none;

  @media (max-width: 820px) {
    position: static;
    display: flex;
    gap: 8px;
    padding: 0;
    margin-bottom: 28px;

    button {
      width: 42px;
      height: 42px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      border-radius: 6px;
      border: 1px solid ${({ theme }) => theme.colors.gray6};
      background: ${({ theme }) => theme.publicDesign.readableSurface};
      color: ${({ theme }) => theme.colors.gray10};
      box-shadow: none;
    }

    button[data-active="true"] {
      border-color: ${({ theme }) => theme.colors.accentBorder};
      background: ${({ theme }) => theme.publicDesign.readableSurface};
      color: ${({ theme }) => (theme.colors.accentLink)};
    }

    button[data-active="true"][data-tone="danger"] {
      border-color: ${({ theme }) => theme.colors.statusDangerBorder};
      background: ${({ theme }) => theme.colors.statusDangerSurface};
      color: ${({ theme }) => theme.colors.statusDangerText};
    }

    button span,
    button strong {
      display: none;
    }
  }
`;
export const RelatedSection = styled.section `
  margin-top: 64px;
  padding-top: 40px;
  border-top: 1px solid #dfe1e5;
  content-visibility: auto;
  contain-intrinsic-size: 1px 420px;

  .monoLabel {
    display: inline-flex;
    margin-bottom: 12px;
    color: #155eef;
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
    font-size: 11px;
    font-weight: 700;
    line-height: 1;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  h3 {
    margin: 0 0 22px;
    color: #111216;
    font-size: 22px;
    line-height: 1.25;
    font-weight: 800;
    letter-spacing: -0.03em;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  li {
    min-width: 0;
  }

  li a {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 20px;
    min-width: 0;
    padding: 18px 0;
    border-top: 1px solid #dfe1e5;
    color: #111216;
    text-decoration: none;
    transition: color 0.14s ease-in;

    &:hover {
      color: #155eef;
    }
  }

  .relatedItemCopy {
    display: grid;
    gap: 6px;
    min-width: 0;
  }

  strong {
    color: currentColor;
    font-size: 16px;
    line-height: 1.4;
    font-weight: 780;
    letter-spacing: -0.02em;
    word-break: keep-all;
    overflow-wrap: anywhere;
  }

  .relatedMeta {
    color: #646a73;
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
    font-size: 12px;
    line-height: 1.4;
    font-weight: 600;
  }

  .relatedArrow {
    color: currentColor;
    font-size: 18px;
    line-height: 1;
  }
`;
export const RelatedSkeletonItem = styled.li `
  display: grid;
  min-width: 0;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 20px;
  padding: 18px 0;
  border-top: 1px solid #dfe1e5;

  .titleLine,
  .metaLine {
    display: block;
    border-radius: 999px;
    background: #dfe1e5;
    animation: related-skeleton-pulse 1.18s ease-in-out infinite;
  }

  .titleLine {
    width: min(70%, 17rem);
    height: 0.98rem;
  }

  .metaLine {
    width: 1.2rem;
    height: 1rem;
  }

  @keyframes related-skeleton-pulse {
    0% {
      opacity: 0.7;
    }
    50% {
      opacity: 1;
    }
    100% {
      opacity: 0.7;
    }
  }
`;
