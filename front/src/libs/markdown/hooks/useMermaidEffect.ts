import { RefObject, useEffect } from "react"
import useScheme from "src/hooks/useScheme"
import { resolveMermaidPreset } from "src/libs/markdown/mermaidRuntimeConfig"
import { shouldScheduleFromMermaidMutations } from "src/libs/markdown/mermaidRuntimeMutations"
import { createMermaidRuntimeController } from "src/libs/markdown/mermaidRuntimeRender"
import type { MermaidRuntimeInstance } from "src/libs/markdown/mermaidRuntimeTypes"

interface MermaidEffectOptions {
  observeMutations?: boolean
  forceScheme?: "dark" | "light"
  allowDesktopWideLane?: boolean
  lazyViewport?: boolean
}

const useMermaidEffect = (
  rootRef?: RefObject<HTMLElement>,
  contentKey?: string,
  enabled = true,
  options?: MermaidEffectOptions
) => {
  const [scheme] = useScheme()
  const shouldLogMermaidWarnings = process.env.NODE_ENV !== "production"
  const observeMutations = options?.observeMutations ?? true
  const allowDesktopWideLane = options?.allowDesktopWideLane ?? true
  const lazyViewport = options?.lazyViewport ?? true
  const effectiveScheme = options?.forceScheme ?? (scheme === "dark" ? "dark" : "light")

  useEffect(() => {
    if (!enabled) return
    const root = rootRef?.current
    if (!root) return

    let disposed = false
    let running = false
    let rerunRequested = false
    let mutationObserver: MutationObserver | null = null
    let scheduledRunFrame: number | null = null
    let mermaidPromise: Promise<MermaidRuntimeInstance> | null = null
    let lastMermaidParseWarning: string | null = null
    const retryTimers = new Set<number>()
    const preset = resolveMermaidPreset(effectiveScheme)

    const getMermaid = async () => {
      if (!mermaidPromise) {
        mermaidPromise = import("mermaid").then(({ default: mermaid }) => {
          const mermaidRuntime = mermaid as MermaidRuntimeInstance
          mermaidRuntime.parseError = (error) => {
            lastMermaidParseWarning = String(error || "Mermaid parse error")
          }

          mermaidRuntime.initialize({
            startOnLoad: false,
            ...preset.config,
          })

          return mermaidRuntime
        })
      }

      return mermaidPromise
    }

    const controller = createMermaidRuntimeController({
      root,
      preset,
      allowDesktopWideLane,
      lazyViewport,
      shouldLogMermaidWarnings,
      getMermaid,
      isDisposed: () => disposed,
      retryTimers,
      readParseWarning: () => lastMermaidParseWarning,
      clearParseWarning: () => {
        lastMermaidParseWarning = null
      },
    })

    const scheduleRun = () => {
      if (disposed) return
      controller.resetLayoutCache()
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        rerunRequested = true
        return
      }
      if (running) {
        rerunRequested = true
        return
      }
      if (scheduledRunFrame !== null) return
      scheduledRunFrame = window.requestAnimationFrame(() => {
        scheduledRunFrame = null
        void run()
      })
    }

    const run = async () => {
      if (disposed) return
      if (running) {
        rerunRequested = true
        return
      }

      running = true

      try {
        await controller.renderMermaidBlocks()
      } catch (error) {
        if (shouldLogMermaidWarnings) {
          console.warn(error)
        }
      } finally {
        running = false
        if (rerunRequested && !disposed) {
          rerunRequested = false
          scheduleRun()
        }
      }
    }

    scheduleRun()
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        scheduleRun()
      }
    }
    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(scheduleRun) : null
    resizeObserver?.observe(root)
    mutationObserver =
      observeMutations && typeof MutationObserver !== "undefined"
        ? new MutationObserver((mutations) => {
            if (!shouldScheduleFromMermaidMutations(mutations)) return
            scheduleRun()
          })
        : null
    mutationObserver?.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
    })
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      disposed = true
      controller.dispose()
      resizeObserver?.disconnect()
      mutationObserver?.disconnect()
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      retryTimers.forEach((timerId) => window.clearTimeout(timerId))
      retryTimers.clear()
      if (scheduledRunFrame !== null) {
        window.cancelAnimationFrame(scheduledRunFrame)
        scheduledRunFrame = null
      }
    }
  }, [
    allowDesktopWideLane,
    contentKey,
    effectiveScheme,
    enabled,
    lazyViewport,
    observeMutations,
    rootRef,
    shouldLogMermaidWarnings,
  ])

  return
}

export default useMermaidEffect
