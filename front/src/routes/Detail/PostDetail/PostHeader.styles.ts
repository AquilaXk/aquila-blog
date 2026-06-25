import styled from "@emotion/styled";
import { HEADER_AUTH_ADMIN_ATTR } from "src/libs/headerAuthShell";
export const StyledWrapper = styled.header `
  padding: 0 0 2.625rem;
  border-bottom: 1px solid #dfe1e5;

  .backLink {
    display: flex;
    width: max-content;
    align-items: center;
    gap: 0.44rem;
    margin-bottom: 2.125rem;
    color: #646a73;
    font-size: 0.875rem;
    font-weight: 650;
    line-height: 1.2;
    text-decoration: none;

    &:hover {
      color: #111216;
    }
  }

  .heroLabel {
    display: inline-flex;
    align-items: center;
    gap: 0.42rem;
    margin-bottom: 0.875rem;
    color: #155eef;
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
    font-size: 0.6875rem;
    font-weight: 700;
    line-height: 1.4;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .taxonomyRow {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.44rem;
    margin-bottom: 0.875rem;

    > span {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
      min-height: 26px;
      padding: 0 0.5rem;
      border-radius: 6px;
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
      font-size: 0.6875rem;
      line-height: 1;
      font-weight: 650;
      text-transform: uppercase;
    }
  }

  .staticTag {
    display: inline-flex;
    align-items: center;
    min-height: 26px;
    padding: 0 0.5rem;
    border-radius: 6px;
    border: 1px solid #dfe1e5;
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
    font-size: 0.6875rem;
    line-height: 1;
    font-weight: 650;
    text-transform: uppercase;
    color: #646a73;
    background-color: transparent;
  }

  .title {
    margin: 0.875rem 0 1.375rem;
    font-size: clamp(42px, 5.3vw, 70px);
    line-height: 1.08;
    letter-spacing: 0;
    font-weight: 850;
    color: #111216;
    max-width: 14ch;
    overflow-wrap: break-word;
    word-break: keep-all;
  }

  .deck {
    max-width: 820px;
    margin: 0 0 2rem;
    color: #646a73;
    font-size: 1.125rem;
    line-height: 1.75;
    word-break: keep-all;
  }

  .metaRow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
    margin-top: 0;
  }

  .author {
    display: flex;
    align-items: center;
    gap: 0.85rem;
    min-width: 0;
  }

  .avatar {
    position: relative;
    width: 48px;
    height: 48px;
    border-radius: 0;
    overflow: hidden;
    border: 1px solid #c8ccd2;
    background: #ffffff;

    img {
      object-fit: cover;
      object-position: center 38%;
    }
  }

  .authorText {
    display: grid;
    gap: 0.18rem;
    min-width: 0;

    strong {
      color: #111216;
      font-size: 0.8125rem;
      font-weight: 800;
      overflow-wrap: anywhere;
    }
  }

  .metaText,
  .stats {
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.42rem;
    color: #646a73;
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
    font-size: 0.6875rem;
    min-width: 0;
  }

  .metaText {
    font-weight: 550;
    color: #8c9199;
  }

  .authorUtilities {
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.45rem;
    margin-top: 0.5rem;
  }

  .authorUtilities[data-shell-only="true"] {
    display: none;
  }

  html[${HEADER_AUTH_ADMIN_ATTR}="true"] & .authorUtilities[data-shell-only="true"] {
    display: inline-flex;
  }

  .actions {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 0.52rem;
  }

  .engagementRow {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 0.52rem;
    min-width: 0;
  }

  .shareFeedbackPill {
    display: inline-flex;
    align-items: center;
    min-height: 34px;
    padding: 0 0.78rem;
    border-radius: 6px;
    border: 1px solid #dfe1e5;
    background: #ffffff;
    color: #646a73;
    font-size: 0.82rem;
    font-weight: 650;
    line-height: 1;
  }

  .adminButton {
    display: inline-flex;
    align-items: center;
    gap: 0.42rem;
    min-height: 34px;
    padding: 0 0.76rem;
    border-radius: 6px;
    border: 1px solid #dfe1e5;
    background: #ffffff;
    color: #111216;
    font-size: 0.82rem;
    font-weight: 700;
    cursor: pointer;
    transition:
      border-color 0.18s ease,
      background-color 0.18s ease,
      color 0.18s ease;

    :disabled {
      opacity: 0.72;
      cursor: not-allowed;
    }
  }

  .adminButton[data-shell-fallback="true"] {
    display: none;
  }

  html[${HEADER_AUTH_ADMIN_ATTR}="true"] & .adminButton[data-shell-fallback="true"] {
    display: inline-flex;
  }

  .dangerButton {
    border-color: #c33a3a;
    background: transparent;
    color: #c33a3a;
  }

  .mobileMetaOnly {
    display: none;
  }

  .metaInlineMetric {
    align-items: center;
    gap: 0.32rem;
    color: #646a73;
    font-size: 0.84rem;
    font-weight: 600;
    line-height: 1;

    svg {
      font-size: 0.9rem;
    }
  }

  .metaInlineViewStat {
    color: #111216;
    white-space: nowrap;
  }

  .likeButton {
    display: inline-flex;
    align-items: center;
    gap: 0.42rem;
    min-height: 40px;
    padding: 0 0.9rem;
    border-radius: 6px;
    border: 1px solid #dfe1e5;
    background: transparent;
    color: #111216;
    font-size: 0.9rem;
    font-weight: 700;
    cursor: pointer;
    transition:
      border-color 0.18s ease,
      background-color 0.18s ease,
      color 0.18s ease;

    svg {
      font-size: 1.05rem;
    }

    &[data-active="true"] {
      border-color: #155eef;
      background: transparent;
      color: #111216;

      svg {
        color: #155eef;
      }
    }

    :disabled {
      opacity: 0.72;
      cursor: not-allowed;
    }
  }

  .shareButton {
    display: inline-flex;
    align-items: center;
    gap: 0.42rem;
    min-height: 40px;
    padding: 0 0.9rem;
    border-radius: 6px;
    border: 1px solid #dfe1e5;
    background: transparent;
    color: #111216;
    font-size: 0.9rem;
    font-weight: 700;
    cursor: pointer;
    transition:
      border-color 0.18s ease,
      background-color 0.18s ease,
      color 0.18s ease;

    svg {
      font-size: 1rem;
    }
  }

  .dot {
    width: 0.22rem;
    height: 0.22rem;
    border-radius: 50%;
    background: #c8ccd2;
  }

  .statChip {
    display: inline-flex;
    align-items: center;
    gap: 0.42rem;
    min-height: 40px;
    padding: 0 0.82rem;
    border-radius: 6px;
    border: 1px solid #dfe1e5;
    background: transparent;
    color: #646a73;
    font-size: 0.9rem;
    font-weight: 650;
    line-height: 1;
  }

  .viewStatChip {
    justify-content: space-between;
  }

  .statMetaLabel {
    display: inline-flex;
    align-items: center;
    gap: 0.34rem;
    color: #646a73;

    svg {
      font-size: 0.96rem;
    }
  }

  .statMetricValue {
    color: #111216;
    font-size: 0.96rem;
    font-weight: 760;
    letter-spacing: -0.02em;
  }

  .thumbnail {
    overflow: hidden;
    position: relative;
    margin-top: 2rem;
    border-radius: 10px;
    width: 100%;
    border: 1px solid #dfe1e5;
    background-color: #f0f1f2;
    padding-bottom: 52%;
  }

  @media (max-width: 768px) {
    .taxonomyRow {
      margin-bottom: 0.8rem;
    }

    .taxonomyRow > span {
      min-height: 30px;
      font-size: 0.8rem;
    }

    .title {
      font-size: clamp(38px, 11vw, 43px);
      line-height: 1.08;
    }

    .deck {
      font-size: 1rem;
    }

    .metaRow {
      margin-top: 1.15rem;
      align-items: flex-start;
    }
  }

  @media (max-width: 1023px) {
    .mobileMetaOnly {
      display: inline-flex;
    }

    .actions[data-hide-mobile="true"] {
      display: none;
    }

    .likeButton[data-hide-mobile="true"],
    .shareButton[data-hide-mobile="true"],
    .shareFeedbackPill[data-hide-mobile="true"] {
      display: none;
    }
  }

  @media (min-width: 1201px) {
    .likeButton[data-hide-desktop="true"],
    .shareButton[data-hide-desktop="true"],
    .shareFeedbackPill[data-hide-desktop="true"] {
      display: none;
    }
  }
`;
