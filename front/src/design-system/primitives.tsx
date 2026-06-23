import styled from "@emotion/styled"
import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes } from "react"
import { control, fontWeight, radius, semanticColors, space } from "./tokens"

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger"
type ControlSize = "sm" | "md" | "lg"
type SurfaceTone = "default" | "raised" | "muted"
type BadgeTone = "neutral" | "accent" | "success" | "danger"

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
      background: colors.accent,
      border: colors.accent,
      color: colors.accentText,
    }
  }

  if (variant === "danger") {
    return {
      background: colors.dangerSurface,
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
  border-radius: ${radius.md}px;
  background: ${({ theme, $variant }) => buttonColors($variant, theme).background};
  color: ${({ theme, $variant }) => buttonColors($variant, theme).color};
  font-weight: ${fontWeight.bold};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: ${space[2]}px;
  transition:
    background-color 140ms ease,
    border-color 140ms ease,
    color 140ms ease,
    transform 140ms ease;

  &:not(:disabled):hover {
    transform: translateY(-1px);
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
  }

const StyledIconButton = styled.button<StyledButtonProps>`
  width: ${({ $size }) => controlHeight($size)};
  min-width: ${({ $size }) => controlHeight($size)};
  height: ${({ $size }) => controlHeight($size)};
  border: 1px solid ${({ theme, $variant }) => buttonColors($variant, theme).border};
  border-radius: ${radius.md}px;
  background: ${({ theme, $variant }) => buttonColors($variant, theme).background};
  color: ${({ theme, $variant }) => buttonColors($variant, theme).color};
  display: inline-flex;
  align-items: center;
  justify-content: center;
`

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ size = "md", type = "button", variant = "secondary", ...props }, ref) => (
    <StyledIconButton ref={ref} type={type} $size={size} $variant={variant} {...props} />
  )
)

IconButton.displayName = "IconButton"

export type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  fieldSize?: ControlSize
}

const StyledTextField = styled.input<{ $fieldSize: ControlSize }>`
  width: 100%;
  min-height: ${({ $fieldSize }) => controlHeight($fieldSize)};
  border: 1px solid ${({ theme }) => semanticColors(theme).border};
  border-radius: ${radius.md}px;
  background: ${({ theme }) => semanticColors(theme).surface};
  color: ${({ theme }) => semanticColors(theme).textPrimary};
  padding: 0 ${space[4]}px;

  &::placeholder {
    color: ${({ theme }) => semanticColors(theme).textMuted};
  }
`

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  ({ fieldSize = "lg", ...props }, ref) => (
    <StyledTextField ref={ref} $fieldSize={fieldSize} {...props} />
  )
)

TextField.displayName = "TextField"

export type SurfaceProps = HTMLAttributes<HTMLElement> & {
  tone?: SurfaceTone
}

const StyledSurface = styled.section<{ $tone: SurfaceTone }>`
  border: 1px solid ${({ theme }) => semanticColors(theme).border};
  border-radius: ${radius.lg}px;
  background: ${({ theme, $tone }) => {
    const colors = semanticColors(theme)
    if ($tone === "raised") return colors.surfaceRaised
    if ($tone === "muted") return colors.surfaceMuted
    return colors.surface
  }};
`

export const Surface = forwardRef<HTMLElement, SurfaceProps>(
  ({ tone = "default", ...props }, ref) => (
    <StyledSurface ref={ref} $tone={tone} {...props} />
  )
)

Surface.displayName = "Surface"

export type ChipProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  selected?: boolean
}

const StyledChip = styled.button<{ $selected: boolean }>`
  min-height: ${control.md}px;
  padding: 0 ${space[3]}px;
  border: 1px solid ${({ theme, $selected }) =>
    $selected ? semanticColors(theme).accent : semanticColors(theme).border};
  border-radius: ${radius.pill}px;
  background: ${({ theme, $selected }) =>
    $selected ? semanticColors(theme).accentSurface : semanticColors(theme).surface};
  color: ${({ theme, $selected }) =>
    $selected ? semanticColors(theme).accentLink : semanticColors(theme).textSecondary};
  font-weight: ${fontWeight.semibold};
`

export const Chip = forwardRef<HTMLButtonElement, ChipProps>(
  ({ selected = false, type = "button", ...props }, ref) => (
    <StyledChip ref={ref} type={type} $selected={selected} {...props} />
  )
)

Chip.displayName = "Chip"

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone
}

const StyledBadge = styled.span<{ $tone: BadgeTone }>`
  min-height: ${control.sm}px;
  padding: 0 ${space[3]}px;
  border-radius: ${radius.pill}px;
  display: inline-flex;
  align-items: center;
  color: ${({ theme, $tone }) => {
    const colors = semanticColors(theme)
    if ($tone === "accent") return colors.accentLink
    if ($tone === "success") return colors.success
    if ($tone === "danger") return colors.danger
    return colors.textSecondary
  }};
  background: ${({ theme, $tone }) => {
    const colors = semanticColors(theme)
    if ($tone === "accent") return colors.accentSurface
    if ($tone === "success") return colors.successSurface
    if ($tone === "danger") return colors.dangerSurface
    return colors.surfaceMuted
  }};
  font-weight: ${fontWeight.semibold};
`

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ tone = "neutral", ...props }, ref) => (
    <StyledBadge ref={ref} $tone={tone} {...props} />
  )
)

Badge.displayName = "Badge"
