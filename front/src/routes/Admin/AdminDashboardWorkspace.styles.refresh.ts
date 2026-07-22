import styled from "@emotion/styled"
import {
  adminBorder,
  adminSurfaceRaised,
  adminTeal,
  adminTextMuted,
  adminTextPrimary,
} from "src/routes/Admin/adminColorTokens"

export const FreshnessLabel = styled.span`
  display: inline-flex;
  align-items: center;
  min-height: 38px;
  padding: 0 0.55rem;
  color: ${adminTextMuted};
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  white-space: nowrap;
`

export const RefreshButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 38px;
  padding: 0 0.9rem;
  border-radius: 2px;
  border: 1px solid ${adminBorder};
  background: ${adminSurfaceRaised};
  color: ${adminTextPrimary};
  font-size: 0.82rem;
  font-weight: 780;
  cursor: pointer;

  &:disabled {
    opacity: 0.62;
    cursor: not-allowed;
  }

  &:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px color-mix(in srgb, ${adminTeal} 28%, transparent);
  }
`
