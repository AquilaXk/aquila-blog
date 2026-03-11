export const isNavigationCancelledError = (error: unknown): boolean => {
  if (!error) return false
  if (typeof error === "string") return error.toLowerCase().includes("cancelled")
  if (error instanceof Error) return error.message.toLowerCase().includes("cancelled")
  return false
}
