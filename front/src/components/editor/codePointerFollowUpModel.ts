import type { MutableRefObject } from "react"
import { markNextEditorPointerAfterCodeSelection } from "./blockHandleLayoutModel"

const CODE_POINTER_FOLLOW_UP_RECENT_MS = 8_000
const CODE_POINTER_SCROLL_PRESERVE_MS = 3_200
const CODE_POINTER_SCROLL_TOLERANCE_PX = 4

const getCodePointerFollowUpNow = () =>
  typeof performance !== "undefined" ? performance.now() : Date.now()

export const markRecentCodePointerFollowUp = (
  recentCodePointerUntilRef: MutableRefObject<number>
) => {
  recentCodePointerUntilRef.current =
    getCodePointerFollowUpNow() + CODE_POINTER_FOLLOW_UP_RECENT_MS
  markNextEditorPointerAfterCodeSelection()
}

export const promoteRecentCodePointerFollowUp = (
  recentCodePointerUntilRef: MutableRefObject<number>
) => {
  if (getCodePointerFollowUpNow() > recentCodePointerUntilRef.current) {
    return false
  }
  markNextEditorPointerAfterCodeSelection()
  preserveRecentCodePointerScroll()
  return true
}

export const preserveRecentCodePointerScroll = () => {
  if (typeof window === "undefined" || typeof document === "undefined") return
  const scrollingElement = document.scrollingElement
  const startY = Math.round(scrollingElement?.scrollTop ?? window.scrollY)
  const startedAt = getCodePointerFollowUpNow()
  let cancelled = false
  let intervalId: number | null = null
  let rafId: number | null = null

  const restore = () => {
    const currentY = Math.round(scrollingElement?.scrollTop ?? window.scrollY)
    if (Math.abs(currentY - startY) <= CODE_POINTER_SCROLL_TOLERANCE_PX) return
    if (Math.abs(currentY - startY) > 3_200) {
      cleanup()
      return
    }
    if (scrollingElement) scrollingElement.scrollTop = startY
    else document.documentElement.scrollTop = startY
  }
  const cleanup = () => {
    cancelled = true
    window.removeEventListener("scroll", restoreOnScroll, true)
    window.removeEventListener("wheel", cleanup, true)
    window.removeEventListener("pointerdown", cleanup, true)
    window.removeEventListener("keydown", cleanup, true)
    if (intervalId !== null) window.clearInterval(intervalId)
    if (rafId !== null) window.cancelAnimationFrame(rafId)
  }
  const tick = () => {
    if (cancelled) return
    if (getCodePointerFollowUpNow() - startedAt > CODE_POINTER_SCROLL_PRESERVE_MS) {
      cleanup()
      return
    }
    restore()
    rafId = window.requestAnimationFrame(tick)
  }
  const restoreOnScroll = () => {
    if (!cancelled) restore()
  }

  window.addEventListener("scroll", restoreOnScroll, {
    capture: true,
    passive: true,
  })
  window.addEventListener("wheel", cleanup, {
    capture: true,
    passive: true,
    once: true,
  })
  window.addEventListener("pointerdown", cleanup, { capture: true, once: true })
  window.addEventListener("keydown", cleanup, { capture: true, once: true })
  intervalId = window.setInterval(restore, 8)
  rafId = window.requestAnimationFrame(tick)
}
