import styled from "@emotion/styled"
import { forwardRef, type ButtonHTMLAttributes } from "react"
import { focusVisibleRing } from "./focusRing"
import { motionTransition } from "./motion"
import { control, fontWeight, radius, semanticColors, space } from "./tokens"

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger"
type ControlSize = "sm" | "md" | "lg"

const controlHeight = (size: ControlSize) => `${control[size]}px`
const controlPadding = (size: ControlSize) =>
  size === "sm" ? `0 ${space[3]}px` : `0 ${space[4]}px`

const buttonColors = (
  variant: ButtonVariant,
  theme: Parameters<typeof semanticColors>[0]
) => {
  const colors = semanticColors(theme)

  if (variant === "primary") {
    return {
      background: theme.colors.gray12,
      border: theme.colors.gray12,
      color: theme.publicDesign.pageBackgroundColor,
    }
  }

  if (variant === "danger") {
    return {
      background: "transparent",
      border: theme.colors.statusDangerBorder,
      color: colors.danger,
    }
  }

  if (variant === "ghost") {
    return {
      background: "transparent",
      border: "transparent",
      color: colors.textSecondary,
    }
  }

  return {
    background: colors.surface,
    border: colors.border,
    color: colors.textPrimary,
  }
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  size?: ControlSize
  variant?: ButtonVariant
}

type StyledButtonProps = {
  $size: ControlSize
  $variant: ButtonVariant
}

const StyledButton = styled.button<StyledButtonProps>`
  min-height: ${({ $size }) => controlHeight($size)};
  padding: ${({ $size }) => controlPadding($size)};
  border: 1px solid ${({ theme, $variant }) => buttonColors($variant, theme).border};
  border-radius: ${radius.sm}px;
  background: ${({ theme, $variant }) => buttonColors($variant, theme).background};
  color: ${({ theme, $variant }) => buttonColors($variant, theme).color};
  font-weight: ${fontWeight.bold};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: ${space[2]}px;
  transition: ${motionTransition(["background-color", "border-color", "color"])};
  ${focusVisibleRing}

  &:not(:disabled):hover {
    border-color: ${({ theme, $variant }) =>
      $variant === "primary" ? theme.colors.gray12 : semanticColors(theme).borderStrong};
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.58;
  }
`

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ size = "lg", type = "button", variant = "secondary", ...props }, ref) => (
    <StyledButton ref={ref} type={type} $size={size} $variant={variant} {...props} />
  )
)

Button.displayName = "Button"

type AccessibleIconButtonName =
  | { "aria-label": string; "aria-labelledby"?: never }
  | { "aria-label"?: never; "aria-labelledby": string }

export type IconButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-label" | "aria-labelledby"
> &
  AccessibleIconButtonName & {
    size?: ControlSize
    variant?: ButtonVariant
    /** Expands the hit area to 44px while keeping the visual control size. */
    ensureTouchTarget?: boolean
  }

type StyledIconButtonProps = StyledButtonProps & {
  $ensureTouchTarget: boolean
}

const touchTargetSize = `${control.lg}px`

const StyledIconButton = styled.button<StyledIconButtonProps>`
  position: relative;
  width: ${({ $size }) => controlHeight($size)};
  min-width: ${({ $size }) => controlHeight($size)};
  height: ${({ $size }) => controlHeight($size)};
  border: 1px solid ${({ theme, $variant }) => buttonColors($variant, theme).border};
  border-radius: ${radius.sm}px;
  background: ${({ theme, $variant }) => buttonColors($variant, theme).background};
  color: ${({ theme, $variant }) => buttonColors($variant, theme).color};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: ${motionTransition(["background-color", "border-color", "color"])};
  ${focusVisibleRing}

  ${({ $ensureTouchTarget }) =>
    $ensureTouchTarget
      ? `
    &::before {
      content: "";
      position: absolute;
      inset: 50%;
      width: ${touchTargetSize};
      height: ${touchTargetSize};
      transform: translate(-50%, -50%);
    }
  `
      : ""}

  &:disabled {
    cursor: not-allowed;
    opacity: 0.58;
  }
`

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    { size = "md", type = "button", variant = "secondary", ensureTouchTarget = false, ...props },
    ref
  ) => (
    <StyledIconButton
      ref={ref}
      type={type}
      $size={size}
      $variant={variant}
      $ensureTouchTarget={ensureTouchTarget}
      {...props}
    />
  )
)

IconButton.displayName = "IconButton"
