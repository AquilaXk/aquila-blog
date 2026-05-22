import { css, type Theme } from "@emotion/react"

export const markdownRendererRootCardStyles = (theme: Theme) => css`
  .aq-bookmark-card,
  .aq-file-card,
  .aq-embed-card,
  .aq-formula-card {
    width: min(100%, var(--article-readable-width, 48rem));
    margin: 1.25rem auto;
    border-radius: 16px;
    border: 1px solid ${ theme.colors.gray6};
    background: ${
      theme.scheme === "dark" ? "rgba(17, 19, 24, 0.94)" : "rgba(255, 255, 255, 0.98)"};
    box-shadow: ${
      theme.scheme === "dark" ? "0 18px 38px rgba(2, 6, 23, 0.24)" : "0 18px 36px rgba(15, 23, 42, 0.06)"};
    overflow: hidden;
  }

  .aq-bookmark-card a,
  .aq-file-card a {
    display: flex;
    gap: 0.9rem;
    padding: 1rem 1.08rem;
    text-decoration: none;
  }

  .aq-link-card-thumb,
  .aq-embed-thumb {
    overflow: hidden;
    border-radius: 14px;
    background: ${
      theme.scheme === "dark" ? "rgba(255, 255, 255, 0.05)" : "rgba(15, 23, 42, 0.04)"};
    aspect-ratio: 16 / 10;
  }

  .aq-link-card-thumb {
    width: min(11rem, 36%);
    flex-shrink: 0;
  }

  .aq-link-card-thumb img,
  .aq-embed-thumb img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .aq-link-card-copy,
  .aq-embed-copy {
    display: grid;
    gap: 0.34rem;
    min-width: 0;
  }

  .aq-link-card-copy small,
  .aq-embed-copy small {
    color: ${ theme.colors.gray10};
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }

  .aq-bookmark-card strong,
  .aq-file-card strong,
  .aq-embed-card strong {
    color: ${ theme.colors.gray12};
    font-size: 1rem;
    font-weight: 700;
  }

  .aq-bookmark-card span,
  .aq-file-card span,
  .aq-embed-caption,
  .aq-embed-fallback p {
    color: ${ theme.colors.gray10};
    font-size: 0.86rem;
    line-height: 1.55;
  }

  .aq-bookmark-card p,
  .aq-file-card p {
    margin: 0;
    color: ${ theme.colors.gray11};
    font-size: 0.92rem;
    line-height: 1.65;
  }

  .aq-embed-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
    padding: 1rem 1.08rem 0.72rem;
  }

  .aq-embed-header a {
    color: ${ theme.colors.blue8};
    font-size: 0.84rem;
    font-weight: 700;
    text-decoration: none;
  }

  .aq-embed-frame {
    padding: 0 1.08rem 0.92rem;
  }

  .aq-embed-frame iframe {
    display: block;
    width: 100%;
    aspect-ratio: 16 / 9;
    border: 0;
    border-radius: 12px;
    background: ${ theme.colors.gray2};
  }

  .aq-embed-fallback {
    padding: 0 1.08rem 0.92rem;
  }

  .aq-embed-thumb {
    margin: 0 1.08rem 0.92rem;
  }

  .aq-embed-caption {
    margin: 0;
    padding: 0 1.08rem 1rem;
  }

  .aq-formula-card {
    padding: 1rem 1.08rem;
    text-align: center;
  }

  .aq-formula-render {
    width: 100%;
    overflow-x: auto;
    overflow-y: hidden;
    padding-bottom: 0.18rem;
  }

  .aq-formula-render .katex-display {
    margin: 0;
    overflow-x: auto;
    overflow-y: hidden;
    padding: 0.2rem 0 0.3rem;
  }

  .aq-formula-render .katex {
    color: ${ theme.colors.gray12};
    font-size: clamp(1.02rem, 2vw, 1.28rem);
  }

  .katex {
    color: ${ theme.colors.gray12};
  }

  .katex-display {
    overflow-x: auto;
    overflow-y: hidden;
  }

  .aq-formula-fallback {
    display: inline-block;
    color: ${ theme.colors.gray12};
    font-family: "Times New Roman", Georgia, serif;
    font-size: clamp(1.05rem, 2vw, 1.35rem);
    line-height: 1.8;
    white-space: pre-wrap;
  }

  .aq-inline-color {
    color: var(--aq-inline-color, inherit);
    font-weight: 700;
  }
`
