import styled from "@emotion/styled";
import { HEADER_AUTH_ADMIN_ATTR } from "src/libs/headerAuthShell";
export const StyledWrapper = styled.header `
  width: min(100%, 880px);
  margin: 0 auto;
  padding: 0;

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

  .title {
    margin: 0.875rem 0 1.375rem;
    font-size: clamp(42px, 5.3vw, 70px);
    line-height: 1.08;
    letter-spacing: -0.065em;
    font-weight: 850;
    color: #111216;
    overflow-wrap: break-word;
    word-break: keep-all;
  }

  .deck {
    max-width: 820px;
    margin: 0 0 2rem;
    color: #646a73;
    font-size: 1.125rem;
    line-height: 1.75;
    overflow-wrap: anywhere;
    word-break: keep-all;
  }

  .metaRow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    flex-wrap: wrap;
    margin-top: 0;
  }

  .author {
    display: flex;
    align-items: center;
    gap: 11px;
    min-width: 0;
  }

  .avatar {
    position: relative;
    width: 38px;
    height: 38px;
    border-radius: 50%;
    overflow: hidden;
    background: #f0f1f2;
    box-shadow: inset 0 0 0 1px #dfe1e5;

    img {
      object-fit: cover;
      object-position: center 38%;
    }
  }

  .avatarFallback {
    position: absolute;
    inset: 5px;
    display: block;
    color: #465b66;
  }

  .avatarFallback::before,
  .avatarFallback::after {
    content: "";
    position: absolute;
    left: 50%;
    background: currentColor;
    transform: translateX(-50%);
  }

  .avatarFallback::before {
    top: 0;
    width: 42%;
    aspect-ratio: 1;
    border-radius: 50%;
  }

  .avatarFallback::after {
    right: 0;
    bottom: 0;
    left: 0;
    height: 45%;
    border-radius: 999px 999px 2px 2px;
    transform: none;
  }

  .authorText {
    display: grid;
    gap: 0.18rem;
    min-width: 0;

    strong {
      color: #111216;
      font-size: 0.9375rem;
      font-weight: 800;
      line-height: 1.25;
      overflow-wrap: anywhere;
    }
  }

  .metaText {
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.42rem;
    color: #646a73;
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
    font-size: 0.6875rem;
    min-width: 0;
    font-weight: 550;
    color: #8c9199;
  }

  .metaUtilities {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 0.52rem;
    min-width: 0;
    margin-left: auto;
  }

  .stats {
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px 22px;
    min-width: 0;
    color: #8c9199;
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
    font-size: 12px;
    line-height: 1.4;
    font-weight: 600;
  }

  .authorUtilities {
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.45rem;
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
    border-color: #ead0d0;
    background: transparent;
    color: #c33a3a;
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
    min-height: auto;
    padding: 0;
    border-radius: 0;
    border: 0;
    background: transparent;
    color: inherit;
    font-size: inherit;
    font-weight: inherit;
    line-height: 1;
  }

  .thumbnail {
    overflow: hidden;
    position: relative;
    margin-top: 2rem;
    border-radius: 0;
    width: 100%;
    border: 1px solid #dfe1e5;
    background-color: #f0f1f2;
    padding-bottom: 52%;
  }

  @media (max-width: 820px) {
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

  @media (max-width: 820px) {
    .metaRow {
      align-items: flex-start;
      flex-direction: column;
    }

    .metaUtilities {
      justify-content: flex-start;
      margin-left: 0;
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

  @media (min-width: 821px) {
    .likeButton[data-hide-desktop="true"],
    .shareButton[data-hide-desktop="true"],
    .shareFeedbackPill[data-hide-desktop="true"] {
      display: none;
    }
  }
`;
