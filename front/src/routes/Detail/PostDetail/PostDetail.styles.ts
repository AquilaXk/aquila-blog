import styled from "@emotion/styled";
export const StyledWrapper = styled.div `
  --detail-v4-bg: #f7f7f5;
  --detail-v4-paper: ${({ theme }) => theme.publicDesign.readableSurface};
  --detail-v4-paper-2: #f0f1f2;
  --detail-v4-ink: #111216;
  --detail-v4-muted: #646a73;
  --detail-v4-faint: #8c9199;
  --detail-v4-line: #dfe1e5;
  --detail-v4-line-strong: #c8ccd2;
  --detail-v4-accent: #155eef;
  width: 100%;
  max-width: none;
  box-sizing: border-box;
  margin: 0 auto;
  min-width: 0;
  padding: 0;
  color: var(--detail-v4-ink);
  position: relative;
  z-index: 0;
  isolation: isolate;

  &::before {
    content: "";
    position: absolute;
    top: 0;
    bottom: 0;
    left: 50%;
    z-index: -1;
    width: 100vw;
    transform: translateX(-50%);
    background: var(--detail-v4-bg);
    pointer-events: none;
  }

  .detailReadProgress {
    position: fixed;
    top: 0;
    left: 0;
    z-index: 90;
    width: 100%;
    height: 2px;
    pointer-events: none;

    span {
      display: block;
      width: 100%;
      height: 100%;
      transform: scaleX(0);
      transform-origin: left center;
      background: var(--detail-v4-accent);
    }
  }

  .detailHero {
    width: 100%;
    margin: 0 auto;
    padding: 68px 20px 42px;
    border-bottom: 1px solid var(--detail-v4-line);
    box-sizing: border-box;
  }

  .detailLayout {
    display: grid;
    width: min(100%, 1180px);
    margin: 0 auto;
    grid-template-columns: 64px minmax(0, 760px) 240px;
    justify-content: center;
    gap: 44px;
    padding: 54px 20px 100px;
    min-width: 0;
    overflow: visible;
  }

  article {
    margin: 0 auto;
    max-width: 760px;
    display: grid;
    gap: 0;
    min-width: 0;
    width: 100%;
    position: relative;
    z-index: 0;
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
    top: calc(var(--app-header-height, var(--app-header-mobile-height, 64px)) + 1.25rem);
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
    width: 42px;
    height: 42px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border-radius: 6px;
    border: 1px solid var(--detail-v4-line);
    background: var(--detail-v4-paper);
    color: var(--detail-v4-muted);
    cursor: pointer;
    transition: border-color 0.18s ease, background-color 0.18s ease, color 0.18s ease;

    svg {
      width: 1em;
      height: 1em;
      font-size: 1.125rem;
    }

    &:hover {
      border-color: var(--detail-v4-accent);
      background: var(--detail-v4-paper);
      color: var(--detail-v4-accent);
    }

    &:disabled {
      opacity: 0.7;
      cursor: not-allowed;
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
      border-radius: 6px;
      border: 1px solid var(--detail-v4-line);
      background: var(--detail-v4-paper);
      color: var(--detail-v4-muted);
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
    border-color: var(--detail-v4-accent);

    svg {
      color: var(--detail-v4-accent);
    }
  }

  .floatingShareButton {
    color: var(--detail-v4-muted);
  }

  .floatingLikeCluster {
    display: grid;
    justify-items: center;
    row-gap: 8px;
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
    font-size: 10px;
    line-height: 1;
    font-weight: 600;
    color: var(--detail-v4-faint);
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
  }

  .floatingShareFeedback {
    font-size: 0.64rem;
    line-height: 1;
    font-weight: 600;
    color: var(--detail-v4-faint);
    text-align: center;
  }

  .rightRailInner {
    border-left: 1px solid var(--detail-v4-line);
    padding: 0 0 0 18px;
    background: transparent;

    .rightRailHead {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      margin-bottom: 14px;
    }

    .rightRailTitleGroup {
      display: grid;
      gap: 0.18rem;
      min-width: 0;
    }

    .rightRailTitle {
      margin: 0;
      color: var(--detail-v4-ink);
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
      font-size: 0.6875rem;
      line-height: 1;
      font-weight: 750;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .rightRailMeta {
      color: var(--detail-v4-faint);
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
      font-size: 0.6875rem;
      line-height: 1.2;
      font-weight: 620;
    }

    .tocDepthToggle {
      border: 1px solid var(--detail-v4-line);
      border-radius: 6px;
      background: var(--detail-v4-paper);
      color: var(--detail-v4-muted);
      font-size: 0.71rem;
      font-weight: 700;
      line-height: 1;
      padding: 0.32rem 0.5rem;
      cursor: pointer;
      flex-shrink: 0;

      &:hover {
        color: var(--detail-v4-ink);
        border-color: var(--detail-v4-line-strong);
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
      display: block;
      text-align: left;
      border: 0;
      border-radius: 0;
      min-height: 0;
      box-sizing: border-box;
      max-width: 100%;
      padding: 7px 0;
      background: transparent;
      color: var(--detail-v4-muted);
      font-size: 12px;
      line-height: 1.4;
      cursor: pointer;
      white-space: normal;
      overflow-wrap: anywhere;
      word-break: keep-all;
      position: relative;
      transition: color 0.15s ease;
    }

    button:hover {
      color: var(--detail-v4-ink);
      background: transparent;
    }

    button[data-active="true"] {
      color: var(--detail-v4-accent);
      font-weight: 750;
      background: transparent;
    }
  }

  @media (max-width: 1100px) {
    .detailLayout {
      grid-template-columns: 52px minmax(0, 1fr);
      gap: 44px;
    }

    .rightRail {
      display: none;
    }
  }

  @media (max-width: 820px) {
    .detailHero {
      padding: 44px 20px 28px;
    }

    .detailLayout {
      width: auto;
      display: block;
      gap: 0;
      padding: 30px 20px 70px;
    }

    .leftRail {
      display: none;
    }

    article {
      max-width: 760px;
    }
  }
`;
export const BodySection = styled.div `
  margin-top: 0;
  padding-top: 0;
  border-top: 0;
  width: 100%;
  min-width: 0;

  .leadSummary {
    margin: 0 0 42px;
    padding: 4px 0 4px 20px;
    border-left: 3px solid #155eef;
    color: #646a73;
    font-size: 1.125rem;
    line-height: 1.75;
    word-break: keep-all;
  }
`;
export { MobileSummaryBar, RelatedSection, RelatedSkeletonItem } from "./PostDetailSection.styles";
