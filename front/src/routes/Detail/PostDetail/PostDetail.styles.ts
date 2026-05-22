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
