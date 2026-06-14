import styled from "@emotion/styled";
import { HEADER_AUTH_ADMIN_ATTR } from "src/libs/headerAuthShell";
import { articleTypographyScale } from "src/libs/markdown/contentTypography";
export const StyledWrapper = styled.header `
  .taxonomyRow {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.55rem;
    margin-bottom: 1rem;

    > span {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
      min-height: 32px;
      padding: 0.38rem 0.78rem;
      border-radius: 999px;
      font-size: 0.86rem;
      line-height: 1.2;
      font-weight: 600;
    }
  }

  .staticTag {
    display: inline-flex;
    align-items: center;
    min-height: 32px;
    padding: 0.38rem 0.78rem;
    border-radius: 999px;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    font-size: 0.86rem;
    line-height: 1.2;
    font-weight: 600;
    color: ${({ theme }) => theme.colors.gray11};
    background-color: ${({ theme }) => theme.colors.gray3};
  }

  .title {
    margin: 0;
    font-size: ${articleTypographyScale.postTitleFontSize};
    line-height: ${articleTypographyScale.postTitleLineHeight};
    letter-spacing: 0;
    font-weight: 700;
    color: ${({ theme }) => theme.colors.gray12};
    max-width: 18ch;
    overflow-wrap: break-word;
    word-break: keep-all;
  }

  .metaRow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
    margin-top: 1.4rem;
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
    border-radius: 50%;
    overflow: hidden;
    background: ${({ theme }) => theme.colors.gray3};

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
      color: ${({ theme }) => theme.colors.gray12};
      font-size: 1rem;
      font-weight: 700;
      overflow-wrap: anywhere;
    }
  }

  .metaText,
  .stats {
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.42rem;
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.9rem;
    min-width: 0;
  }

  .metaText {
    font-weight: 500;
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
    border-radius: 999px;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => (theme.colors.gray2)};
    color: ${({ theme }) => theme.colors.gray11};
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
    border-radius: 999px;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => (theme.colors.gray2)};
    color: ${({ theme }) => theme.colors.gray12};
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
    border-color: ${({ theme }) => theme.colors.red7};
    background: transparent;
    color: ${({ theme }) => theme.colors.red11};
  }

  .mobileMetaOnly {
    display: none;
  }

  .metaInlineMetric {
    align-items: center;
    gap: 0.32rem;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.84rem;
    font-weight: 600;
    line-height: 1;

    svg {
      font-size: 0.9rem;
    }
  }

  .metaInlineViewStat {
    color: ${({ theme }) => theme.colors.gray12};
    white-space: nowrap;
  }

  .likeButton {
    display: inline-flex;
    align-items: center;
    gap: 0.42rem;
    min-height: 40px;
    padding: 0 0.9rem;
    border-radius: 8px;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: transparent;
    color: ${({ theme }) => theme.colors.gray12};
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
      border-color: ${({ theme }) => theme.colors.red7};
      background: transparent;
      color: ${({ theme }) => theme.colors.gray12};

      svg {
        color: ${({ theme }) => theme.colors.red10};
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
    border-radius: 8px;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: transparent;
    color: ${({ theme }) => theme.colors.gray12};
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
    background: ${({ theme }) => (theme.colors.gray8)};
  }

  .statChip {
    display: inline-flex;
    align-items: center;
    gap: 0.42rem;
    min-height: 40px;
    padding: 0 0.82rem;
    border-radius: 8px;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: transparent;
    color: ${({ theme }) => theme.colors.gray11};
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
    color: ${({ theme }) => theme.colors.gray11};

    svg {
      font-size: 0.96rem;
    }
  }

  .statMetricValue {
    color: ${({ theme }) => theme.colors.gray12};
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
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background-color: ${({ theme }) => theme.colors.gray3};
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
      font-size: ${articleTypographyScale.postTitleFontSizeMobile};
      line-height: ${articleTypographyScale.postTitleLineHeightMobile};
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
