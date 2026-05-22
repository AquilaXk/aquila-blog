import { css, type Theme } from "@emotion/react"

export const markdownRendererRootBaseStyles = (theme: Theme) => css`
  h1,
  h2,
  h3,
  h4 {
    scroll-margin-top: 6.8rem;
  }

  figure {
    margin: 1.25rem 0;
  }

  .aq-image-frame {
    width: min(100%, var(--article-readable-width, 48rem));
    margin: 0 auto;
    position: relative;
    min-width: 0;
  }

  .aq-image-frame[data-width-mode="custom"] {
    width: min(100%, var(--aq-image-width));
  }

  .aq-image-frame img {
    display: block;
    width: 100%;
    max-width: 100%;
    height: auto;
    max-height: min(76vh, 880px);
    object-fit: contain;
    border-radius: 12px;
    border: 1px solid ${ theme.colors.gray6};
    background: ${ theme.colors.gray2};
    box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
  }

  .aq-image-frame[data-editable="true"] .aq-image-resize-handle {
    position: absolute;
    right: 0.85rem;
    bottom: 0.85rem;
    width: 2rem;
    height: 2rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    border: 1px solid ${ theme.colors.gray6};
    background: ${ (theme.scheme === "dark" ? "rgba(15, 23, 42, 0.82)" : "rgba(255, 255, 255, 0.92)")};
    color: ${ theme.colors.gray12};
    cursor: ew-resize;
    box-shadow: 0 12px 28px rgba(2, 6, 23, 0.2);
    backdrop-filter: blur(8px);
  }

  .aq-image-frame[data-editable="true"] .aq-image-resize-handle span {
    display: inline-block;
    width: 0.95rem;
    height: 0.95rem;
    border-right: 2px solid currentColor;
    border-bottom: 2px solid currentColor;
    transform: rotate(0deg);
    opacity: 0.92;
  }

  .aq-image-frame[data-editable="true"] .aq-image-resize-handle:hover {
    transform: translateY(-1px);
  }

  .aq-image-frame figcaption {
    margin-top: 0.62rem;
    color: ${ theme.colors.gray11};
    font-size: 0.84rem;
    line-height: 1.56;
    text-align: center;
  }

  ul.contains-task-list,
  ol.contains-task-list {
    list-style: none;
    padding-left: 0.2rem;
  }

  li.task-list-item {
    list-style: none;
    display: flex;
    align-items: flex-start;
    gap: 0.52rem;
  }

  li.task-list-item input[type="checkbox"] {
    margin: 0.34rem 0 0;
    width: 0.95rem;
    height: 0.95rem;
    accent-color: ${ (theme.scheme === "dark" ? "#4493f8" : "#0969da")};
  }

`
