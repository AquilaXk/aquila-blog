import { css, type Theme } from "@emotion/react"

export const markdownRendererRootCardStyles = (theme: Theme) => css`
  .aq-bookmark-card,
  .aq-file-card,
  .aq-embed-card,
  .aq-formula-card {
    width: 100%;
    margin: 24px 0;
    border-radius: 0;
    border: 1px solid ${ theme.colors.gray6};
    background: ${ theme.publicDesign.readableSurface};
    box-shadow: none;
    overflow: hidden;
  }

  .aq-bookmark-card a,
  .aq-file-card a {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 20px;
    padding: 17px;
    text-decoration: none;
  }

  .aq-link-card-thumb,
  .aq-embed-thumb {
    overflow: hidden;
    border-radius: 0;
    background: ${ theme.publicDesign.surfaceElevated};
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
    gap: 0;
    min-width: 0;
  }

  .aq-link-card-copy small,
  .aq-embed-copy small {
    margin-bottom: 5px;
    color: ${ theme.publicDesign.accent};
    font: 700 10px / 1.4 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  .aq-bookmark-card strong,
  .aq-file-card strong,
  .aq-embed-card strong {
    display: block;
    color: ${ theme.colors.gray12};
    font-size: 15px;
    font-weight: 700;
    line-height: 1.42;
  }

  .aq-embed-caption,
  .aq-embed-fallback p {
    color: ${ theme.colors.gray10};
    font-size: 13px;
    line-height: 1.5;
  }

  .aq-bookmark-card span,
  .aq-file-card span {
    max-width: 240px;
    overflow: hidden;
    color: ${ theme.colors.gray9};
    font: 600 10px / 1.4 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .aq-bookmark-card p,
  .aq-file-card p {
    margin: 5px 0 0;
    color: ${ theme.colors.gray10};
    font-size: 13px;
    line-height: 1.5;
  }

  .aq-embed-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    padding: 15px;
  }

  .aq-embed-header a {
    color: ${ theme.colors.blue8};
    font-size: 0.84rem;
    font-weight: 700;
    text-decoration: none;
  }

  .aq-embed-frame {
    padding: 0 17px 15px;
  }

  .aq-embed-frame iframe {
    display: block;
    width: 100%;
    aspect-ratio: 16 / 9;
    border: 0;
    border-radius: 0;
    background: ${ theme.colors.gray2};
  }

  .aq-embed-fallback {
    padding: 0 17px 15px;
  }

  .aq-embed-thumb {
    margin: 0 17px 15px;
  }

  .aq-embed-caption {
    margin: 0;
    padding: 0 17px 15px;
  }

  .aq-formula-card {
    padding: 17px;
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

  @media (max-width: 820px) {
    .aq-bookmark-card a,
    .aq-file-card a {
      grid-template-columns: 1fr;
    }

    .aq-link-card-thumb {
      width: 100%;
    }

    .aq-bookmark-card span,
    .aq-file-card span {
      max-width: 100%;
    }
  }
`
