import styled from "@emotion/styled"

export const CompactTocSection = styled.section`
  display: none;
  margin-top: 0.2rem;
  border: 1px solid ${({ theme }) =>
    theme.blogDesign === "grid" ? theme.publicDesign.border : theme.colors.gray6};
  border-radius: 14px;
  background: ${({ theme }) => (theme.blogDesign === "grid" ? theme.publicDesign.surface : theme.colors.gray2)};
  overflow: hidden;

  details {
    display: grid;
  }

  summary {
    list-style: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
    padding: 0.9rem 1rem;
    cursor: pointer;
  }

  summary::-webkit-details-marker {
    display: none;
  }

  .summaryCopy {
    display: grid;
    gap: 0.2rem;
    min-width: 0;
  }

  .summaryCopy strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.96rem;
    line-height: 1.3;
    font-weight: 760;
  }

  .summaryCopy span {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.82rem;
    line-height: 1.45;
  }

  .summaryChevron {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border-radius: 999px;
    border: 1px solid ${({ theme }) =>
      theme.blogDesign === "grid" ? theme.publicDesign.border : theme.colors.gray6};
    color: ${({ theme }) => theme.colors.gray10};
    flex-shrink: 0;
    transition: transform 0.16s ease;
  }

  details[open] .summaryChevron {
    transform: rotate(180deg);
  }

  details:not([open]) ol {
    display: none;
  }

  ol {
    list-style: none;
    margin: 0;
    padding: 0 0.78rem 0.88rem;
    display: grid;
    gap: 0.12rem;
    max-height: 14rem;
    overflow-y: auto;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
  }

  li[data-level="3"] button {
    padding-left: 0.78rem;
    font-size: 0.84rem;
  }

  li[data-level="4"] button {
    padding-left: 1.26rem;
    font-size: 0.8rem;
  }

  button {
    width: 100%;
    min-height: 38px;
    border: 0;
    border-radius: 10px;
    background: transparent;
    color: ${({ theme }) => theme.colors.gray10};
    text-align: left;
    font-size: 0.88rem;
    line-height: 1.4;
    padding: 0.45rem 0.6rem;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    transition: background-color 0.16s ease, color 0.16s ease;
  }

  button:hover {
    background: ${({ theme }) =>
      theme.blogDesign === "grid" ? theme.publicDesign.surfaceElevated : theme.colors.gray3};
    color: ${({ theme }) => theme.colors.gray12};
  }

  button[data-active="true"] {
    background: ${({ theme }) =>
      theme.blogDesign === "grid" ? theme.publicDesign.accentMuted : theme.colors.gray3};
    color: ${({ theme }) => theme.colors.gray12};
    font-weight: 700;
  }

  @media (max-width: 1365px) {
    display: block;
  }
`

export const MobileSummaryBar = styled.div`
  display: none;

  @media (max-width: 1023px) {
    position: sticky;
    top: calc(var(--app-header-height, 64px) + 0.4rem);
    z-index: 14;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.45rem;
    padding: 0.16rem 0 0.4rem;
    margin-bottom: 0.18rem;

    button {
      min-height: 44px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.36rem;
      padding: 0 0.55rem;
      border-radius: 999px;
      border: 1px solid ${({ theme }) =>
        theme.blogDesign === "grid" ? theme.publicDesign.border : theme.colors.gray6};
      background: ${({ theme }) =>
        theme.blogDesign === "grid"
          ? `color-mix(in srgb, ${theme.publicDesign.surface} 88%, transparent)`
          : `color-mix(in srgb, ${theme.colors.gray1} 88%, transparent)`};
      color: ${({ theme }) => theme.colors.gray11};
      box-shadow: 0 10px 24px rgba(15, 23, 42, 0.12);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      font-size: 0.78rem;
      font-weight: 700;
      letter-spacing: -0.01em;
    }

    button[data-active="true"] {
      border-color: ${({ theme }) =>
        theme.blogDesign === "grid" ? theme.publicDesign.borderStrong : theme.colors.accentBorder};
      background: ${({ theme }) =>
        theme.blogDesign === "grid" ? theme.publicDesign.accentMuted : theme.colors.accentSurfaceSubtle};
      color: ${({ theme }) => (theme.blogDesign === "grid" ? theme.publicDesign.accent : theme.colors.accentLink)};
    }

    button[data-active="true"][data-tone="danger"] {
      border-color: ${({ theme }) => theme.colors.statusDangerBorder};
      background: ${({ theme }) => theme.colors.statusDangerSurface};
      color: ${({ theme }) => theme.colors.statusDangerText};
    }

    button span,
    button strong {
      white-space: nowrap;
    }

    button strong {
      color: ${({ theme }) => theme.colors.gray12};
      font-size: 0.74rem;
    }
  }
`

export const RelatedSection = styled.section`
  margin-top: 0.52rem;
  padding-top: 0.88rem;
  border-top: 1px solid ${({ theme }) =>
    theme.blogDesign === "grid" ? theme.publicDesign.border : theme.colors.gray6};
  display: grid;
  gap: 0.72rem;
  content-visibility: auto;
  contain-intrinsic-size: 1px 420px;

  > header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
  }

  > header .headerCopy {
    display: grid;
    gap: 0.16rem;
    min-width: 0;
  }

  h2 {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 760;
    line-height: 1.35;
    color: ${({ theme }) => theme.colors.gray12};
  }

  > header .sectionReason {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.8rem;
    line-height: 1.5;
    display: block;
  }

  > header a {
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.82rem;
    font-weight: 700;
    text-decoration: none;

    &:hover {
      color: ${({ theme }) => theme.colors.gray12};
      text-decoration: underline;
      text-underline-offset: 2px;
    }
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.48rem;
  }

  li {
    min-width: 0;
  }

  li a {
    display: grid;
    gap: 0.3rem;
    min-width: 0;
    padding: 0.68rem 0.74rem;
    border-radius: 10px;
    border: 1px solid ${({ theme }) =>
      theme.blogDesign === "grid" ? theme.publicDesign.border : theme.colors.gray6};
    background: ${({ theme }) => (theme.blogDesign === "grid" ? theme.publicDesign.surface : theme.colors.gray1)};
    text-decoration: none;
    transition: border-color 0.14s ease-in, background-color 0.14s ease-in, box-shadow 0.14s ease-in;

    &:hover {
      border-color: ${({ theme }) =>
        theme.blogDesign === "grid" ? theme.publicDesign.borderStrong : theme.colors.gray8};
      background: ${({ theme }) =>
        theme.blogDesign === "grid" ? theme.publicDesign.surfaceElevated : theme.colors.gray2};
      box-shadow: ${({ theme }) =>
        theme.blogDesign === "grid"
          ? "0 12px 26px rgba(0, 0, 0, 0.28)"
          : theme.scheme === "light"
            ? "0 10px 24px rgba(15, 23, 42, 0.05)"
            : "none"};
    }
  }

  .reasonChip {
    display: inline-flex;
    align-items: center;
    justify-self: start;
    min-height: 24px;
    padding: 0 0.52rem;
    border-radius: 999px;
    border: 1px solid ${({ theme }) =>
      theme.blogDesign === "grid" ? theme.publicDesign.border : theme.colors.gray6};
    background: ${({ theme }) =>
      theme.blogDesign === "grid" ? theme.publicDesign.surfaceElevated : theme.colors.gray2};
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.7rem;
    font-weight: 800;
    letter-spacing: -0.01em;
    font-style: normal;
  }

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.92rem;
    line-height: 1.42;
    font-weight: 720;
    letter-spacing: -0.01em;
    word-break: keep-all;
    overflow-wrap: anywhere;
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.82rem;
    line-height: 1.52;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    word-break: keep-all;
    overflow-wrap: anywhere;
  }

  span {
    color: ${({ theme }) => theme.colors.gray9};
    font-size: 0.75rem;
    line-height: 1.4;
  }

  @media (max-width: 768px) {
    margin-top: 0.38rem;
    padding-top: 0.74rem;

    > header {
      flex-direction: column;
      align-items: stretch;
    }
  }
`

export const RelatedSkeletonItem = styled.li`
  display: grid;
  gap: 0.34rem;
  min-width: 0;
  padding: 0.68rem 0.74rem;
  border-radius: 10px;
  border: 1px solid ${({ theme }) =>
    theme.blogDesign === "grid" ? theme.publicDesign.border : theme.colors.gray6};
  background: ${({ theme }) => (theme.blogDesign === "grid" ? theme.publicDesign.surface : theme.colors.gray1)};

  .titleLine,
  .summaryLine,
  .metaLine {
    display: block;
    border-radius: 999px;
    background: ${({ theme }) =>
      theme.blogDesign === "grid" ? theme.publicDesign.surfaceElevated : theme.colors.gray3};
    animation: related-skeleton-pulse 1.18s ease-in-out infinite;
  }

  .titleLine {
    width: min(70%, 17rem);
    height: 0.98rem;
  }

  .summaryLine {
    height: 0.82rem;
  }

  .summaryLine.wide {
    width: min(92%, 22rem);
  }

  .summaryLine.medium {
    width: min(68%, 14rem);
  }

  .metaLine {
    width: 5.4rem;
    height: 0.74rem;
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
`
