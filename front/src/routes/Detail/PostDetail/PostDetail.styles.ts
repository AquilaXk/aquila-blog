import styled from "@emotion/styled"

export const StyledWrapper = styled.div`
  width: 100%;
  max-width: none;
  box-sizing: border-box;
  margin: 0 auto;
  min-width: 0;
  padding: 0;

  .detailLayout {
    display: grid;
    width: 74rem;
    margin-left: calc(50% - 32rem);
    grid-template-columns: 80px minmax(0, var(--article-readable-width, 48rem)) minmax(0, 15rem);
    justify-content: start;
    gap: 3rem;
    min-width: 0;
    overflow: visible;
  }

  article {
    margin: 0 auto;
    max-width: var(--article-readable-width, 48rem);
    display: grid;
    gap: 1.15rem;
    min-width: 0;
    width: 100%;
    position: relative;
    z-index: 0;
  }

  article::before {
    content: "";
    display: ${({ theme }) => (theme.blogDesign === "grid" ? "block" : "none")};
    position: absolute;
    inset: -1.4rem -1.5rem;
    z-index: -1;
    border-radius: 18px;
    border: 1px solid ${({ theme }) => theme.publicDesign.border};
    background: ${({ theme }) => theme.publicDesign.readableSurface};
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.24);
    pointer-events: none;
  }

  @media (max-width: 768px) {
    article::before {
      inset: -0.95rem -0.85rem;
      border-radius: 14px;
    }
  }

  article > * {
    min-width: 0;
  }

  .relatedPrefetchTrigger {
    width: 100%;
    height: 1px;
  }

  .leftRail,
  .rightRail {
    min-width: 0;
    position: sticky;
    top: calc(var(--app-header-height, 5.4rem) + 1rem);
    align-self: start;
    overflow: visible;
    z-index: 1;
  }

  .leftRailInner,
  .rightRailInner {
    position: static;
  }

  .detailLayout[data-left-hybrid="true"] .leftRail,
  .detailLayout[data-right-hybrid="true"] .rightRail {
    position: relative;
    top: 0;
    align-self: stretch;
  }

  .detailLayout[data-left-hybrid="true"] .leftRailInner,
  .detailLayout[data-right-hybrid="true"] .rightRailInner {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
  }

  .floatingActionButton {
    width: 3.5rem;
    height: 3.5rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border-radius: 999px;
    border: 1px solid ${({ theme }) =>
      theme.blogDesign === "grid"
        ? theme.publicDesign.border
        : theme.scheme === "dark"
          ? "rgba(148, 163, 184, 0.28)"
          : theme.colors.gray6};
    background: ${({ theme }) =>
      theme.blogDesign === "grid"
        ? theme.publicDesign.surface
        : theme.scheme === "dark"
          ? "rgba(15, 23, 42, 0.32)"
          : "rgba(255, 255, 255, 0.92)"};
    color: ${({ theme }) => theme.colors.gray12};
    cursor: pointer;
    transition: border-color 0.18s ease, background-color 0.18s ease, color 0.18s ease, transform 0.18s ease;

    svg {
      width: 1em;
      height: 1em;
      font-size: 1.75rem;
    }

    &:hover {
      transform: translateY(-1px);
      border-color: ${({ theme }) =>
        theme.blogDesign === "grid"
          ? theme.publicDesign.borderStrong
          : theme.scheme === "dark"
            ? "rgba(148, 163, 184, 0.62)"
            : theme.colors.gray8};
      background: ${({ theme }) =>
        theme.blogDesign === "grid"
          ? theme.publicDesign.surfaceElevated
          : theme.scheme === "dark"
            ? "rgba(17, 24, 39, 0.62)"
            : "#ffffff"};
    }

    &:disabled {
      opacity: 0.7;
      cursor: not-allowed;
      transform: none;
    }
  }

  @media (hover: hover) and (pointer: fine) {
    .floatingActionButton[data-tooltip] {
      position: relative;
    }

    .floatingActionButton[data-tooltip]::after {
      content: attr(data-tooltip);
      position: absolute;
      left: calc(100% + 0.6rem);
      top: 50%;
      transform: translateY(-50%);
      white-space: nowrap;
      padding: 0.3rem 0.48rem;
      border-radius: 8px;
      border: 1px solid ${({ theme }) =>
        theme.blogDesign === "grid" ? theme.publicDesign.border : theme.colors.gray6};
      background: ${({ theme }) =>
        theme.blogDesign === "grid" ? theme.publicDesign.surfaceElevated : theme.colors.gray2};
      color: ${({ theme }) => theme.colors.gray11};
      font-size: 0.68rem;
      line-height: 1;
      font-weight: 700;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.15s ease;
    }

    .floatingActionButton[data-tooltip]:hover::after,
    .floatingActionButton[data-tooltip]:focus-visible::after {
      opacity: 1;
    }
  }

  .floatingLikeButton[data-active="true"] {
    border-color: ${({ theme }) => theme.colors.red7};

    svg {
      color: ${({ theme }) => theme.colors.red10};
    }
  }

  .floatingShareButton {
    color: ${({ theme }) => theme.colors.gray10};
  }

  .floatingLikeCluster {
    display: grid;
    justify-items: center;
    row-gap: 0.54rem;
  }

  .floatingLikeStat {
    display: grid;
    justify-items: center;
    row-gap: 0.36rem;
  }

  .floatingShareStat {
    display: grid;
    justify-items: center;
    row-gap: 0.36rem;
  }

  .floatingLikeCount {
    font-size: 0.88rem;
    line-height: 1;
    font-weight: 720;
    color: ${({ theme }) => theme.colors.gray10};
  }

  .floatingShareFeedback {
    font-size: 0.64rem;
    line-height: 1;
    font-weight: 600;
    color: ${({ theme }) => theme.colors.gray9};
    text-align: center;
  }

  .rightRailInner {
    border-left: 1px solid ${({ theme }) =>
      theme.blogDesign === "grid"
        ? theme.publicDesign.border
        : theme.scheme === "dark"
          ? "rgba(148, 163, 184, 0.26)"
          : theme.colors.gray6};
    padding: 0.2rem 0 0.2rem 1.4rem;
    background: transparent;

    .rightRailHead {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      margin-bottom: 0.42rem;
    }

    .rightRailTitleGroup {
      display: grid;
      gap: 0.18rem;
      min-width: 0;
    }

    .rightRailTitle {
      margin: 0;
      color: ${({ theme }) => theme.colors.gray12};
      font-size: 0.96rem;
      line-height: 1.2;
      font-weight: 780;
      letter-spacing: -0.02em;
    }

    .rightRailMeta {
      color: ${({ theme }) => theme.colors.gray10};
      font-size: 0.76rem;
      line-height: 1.2;
      font-weight: 620;
    }

    .tocDepthToggle {
      border: 1px solid ${({ theme }) =>
        theme.blogDesign === "grid" ? theme.publicDesign.border : theme.colors.gray6};
      border-radius: 999px;
      background: ${({ theme }) =>
        theme.blogDesign === "grid" ? theme.publicDesign.surfaceElevated : theme.colors.gray2};
      color: ${({ theme }) => theme.colors.gray10};
      font-size: 0.71rem;
      font-weight: 700;
      line-height: 1;
      padding: 0.32rem 0.5rem;
      cursor: pointer;
      flex-shrink: 0;

      &:hover {
        color: ${({ theme }) => theme.colors.gray12};
        border-color: ${({ theme }) =>
          theme.blogDesign === "grid" ? theme.publicDesign.borderStrong : theme.colors.gray8};
      }
    }

    ol {
      margin: 0;
      padding: 0;
      list-style: none;
      display: block;
      max-height: min(34rem, calc(100vh - 10rem));
      overflow-y: auto;
      overflow-x: hidden;
    }

    li {
      min-width: 0;
      margin: 0;
    }

    li[data-level="3"] button {
      padding-left: 0.54rem;
      font-size: 0.78rem;
    }

    li[data-level="4"] button {
      padding-left: 0.88rem;
      font-size: 0.75rem;
    }

    button {
      width: 100%;
      text-align: left;
      border: 0;
      border-radius: 8px;
      min-height: 32px;
      box-sizing: border-box;
      max-width: 100%;
      padding: 0.34rem 0.68rem 0.34rem 0.1rem;
      background: transparent;
      color: ${({ theme }) => theme.colors.gray9};
      font-size: 0.8125rem;
      line-height: 1.36;
      cursor: pointer;
      white-space: normal;
      overflow-wrap: anywhere;
      word-break: keep-all;
      position: relative;
      display: block;
      transition: color 0.15s ease, background-color 0.15s ease;
    }

    button:hover {
      color: ${({ theme }) => theme.colors.gray11};
      background: ${({ theme }) =>
        theme.blogDesign === "grid" ? theme.publicDesign.surfaceElevated : theme.colors.gray2};
    }

    button::before {
      content: "";
      position: absolute;
      left: -1.18rem;
      top: 0.18rem;
      bottom: 0.18rem;
      width: 1px;
      opacity: 0;
      background: ${({ theme }) => (theme.blogDesign === "grid" ? theme.publicDesign.accent : theme.colors.accentBorder)};
      transition: opacity 0.15s ease;
    }

    button[data-active="true"] {
      color: ${({ theme }) => theme.colors.gray12};
      font-weight: 700;
      background: ${({ theme }) =>
        theme.blogDesign === "grid" ? theme.publicDesign.accentMuted : theme.colors.accentSurfaceSubtle};
    }

    button[data-active="true"]::before {
      opacity: 1;
    }
  }

  @media (max-width: 1365px) {
    .detailLayout {
      width: auto;
      margin-left: 0;
      grid-template-columns: 72px minmax(0, var(--article-readable-width, 48rem));
      gap: 2rem;
    }

    .rightRail {
      display: none;
    }
  }

  @media (max-width: 1279px) {
    .detailLayout {
      width: auto;
      margin-left: 0;
      grid-template-columns: 72px minmax(0, var(--article-readable-width, 48rem));
      gap: 1.6rem;
    }
  }

  @media (max-width: 1200px) {
    .detailLayout {
      width: min(100%, var(--article-readable-width, 48rem));
      margin: 0 auto;
      grid-template-columns: minmax(0, 1fr);
      justify-content: center;
      gap: 0;
    }

    .leftRail {
      display: none;
    }
  }

  @media (max-width: 1080px) {
    width: 100%;
    max-width: 50rem;
    padding: 0;

    .detailLayout {
      width: auto;
      margin-left: 0;
      grid-template-columns: minmax(0, 50rem);
      gap: 0;
    }

    article {
      max-width: 50rem;
    }
  }
`

export const BodySection = styled.div`
  margin-top: 0.8rem;
  padding-top: 1.05rem;
  border-top: 1px solid ${({ theme }) =>
    theme.blogDesign === "grid" ? theme.publicDesign.border : theme.colors.gray6};
  width: 100%;
  min-width: 0;

  @media (max-width: 768px) {
    margin-top: 0.55rem;
    padding-top: 0.85rem;
  }
`

export { CompactTocSection, MobileSummaryBar, RelatedSection, RelatedSkeletonItem } from "./PostDetailSection.styles"
