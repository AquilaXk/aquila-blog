import { css } from "@emotion/react"

/** Shared focus-visible ring using the global --aq-focus-ring token. */
export const focusVisibleRing = css`
  &:focus-visible {
    outline: 2px solid var(--aq-focus-ring);
    outline-offset: 2px;
  }

  &:focus:not(:focus-visible) {
    outline: none;
  }
`
