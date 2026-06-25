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

  article::before {
    content: "";
    display: ${({ theme }) => ("none")};
    position: absolute;
    inset: -1.4rem -1.5rem;
    z-index: -1;
    border-radius: 18px;
    border: 1px solid var(--detail-v4-line);
    background: var(--detail-v4-paper);
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
    top: 94px;
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
    transition: border-color 0.18s ease, background-color 0.18s ease, color 0.18s ease, transform 0.18s ease;

    svg {
      width: 1em;
      height: 1em;
      font-size: 1.125rem;
    }

    &:hover {
      transform: translateY(-1px);
      border-color: var(--detail-v4-accent);
      background: var(--detail-v4-paper);
      color: var(--detail-v4-accent);
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
    font-size: 0.88rem;
    line-height: 1;
    font-weight: 720;
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
      margin-bottom: 0.42rem;
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
      text-align: left;
      border: 0;
      border-radius: 8px;
      min-height: 32px;
      box-sizing: border-box;
      max-width: 100%;
      padding: 0.34rem 0.68rem 0.34rem 0.1rem;
      background: transparent;
      color: var(--detail-v4-muted);
      font-size: 0.75rem;
      line-height: 1.4;
      cursor: pointer;
      white-space: normal;
      overflow-wrap: anywhere;
      word-break: keep-all;
      position: relative;
      display: block;
      transition: color 0.15s ease, background-color 0.15s ease;
    }

    button:hover {
      color: var(--detail-v4-ink);
      background: transparent;
    }

    button::before {
      content: "";
      position: absolute;
      left: -1.18rem;
      top: 0.18rem;
      bottom: 0.18rem;
      width: 1px;
      opacity: 0;
      background: var(--detail-v4-accent);
      transition: opacity 0.15s ease;
    }

    button[data-active="true"] {
      color: var(--detail-v4-accent);
      font-weight: 700;
      background: transparent;
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

  @media (max-width: 768px) {
    margin-top: 0.55rem;
    padding-top: 0.85rem;

    .leadSummary {
      margin-bottom: 32px;
      font-size: 1rem;
    }
  }
`;
export { CompactTocSection, MobileSummaryBar, RelatedSection, RelatedSkeletonItem } from "./PostDetailSection.styles";
