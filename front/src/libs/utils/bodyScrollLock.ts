let bodyScrollLockCount = 0
let previousBodyOverflow = ""

export const acquireBodyScrollLock = () => {
  if (typeof document === "undefined") return () => undefined

  let released = false

  if (bodyScrollLockCount === 0) {
    previousBodyOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
  }

  bodyScrollLockCount += 1

  return () => {
    if (released || typeof document === "undefined") return
    released = true
    bodyScrollLockCount = Math.max(0, bodyScrollLockCount - 1)

    if (bodyScrollLockCount === 0) {
      document.body.style.overflow = previousBodyOverflow
    }
  }
}

export const __resetBodyScrollLockForTests = () => {
  bodyScrollLockCount = 0
  previousBodyOverflow = ""
}
