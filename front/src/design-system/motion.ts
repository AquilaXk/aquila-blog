export const duration = {
  fast: 120,
  base: 140,
  slow: 180,
  skeleton: 1100,
} as const

export const easing = {
  standard: "ease",
  emphasized: "cubic-bezier(0.2, 0, 0, 1)",
} as const

export const prefersReducedMotionQuery = "@media (prefers-reduced-motion: reduce)"

export const motionTransition = (
  properties: string[],
  speed: keyof typeof duration = "base"
) =>
  properties
    .map((property) => `${property} ${duration[speed]}ms ${easing.standard}`)
    .join(", ")

/** Emotion css fragment: disable animation/transition when reduced motion is preferred. */
export const respectReducedMotion = `
  @media (prefers-reduced-motion: reduce) {
    animation: none !important;
    transition: none !important;
  }
`
