import { RefObject, useEffect, useLayoutEffect } from "react"
import {
  PRISM_DEFAULT_MUTATION_DEBOUNCE_MS,
  PRISM_INITIAL_HYDRATION_TIMEOUT_MS,
  createPrismEffectRuntime,
} from "src/libs/markdown/prismEffectRuntime"

type PrismEffectOptions = {
  observeMutations?: boolean
  mutationDebounceMs?: number
}

const usePrismHydrationEffect = typeof window === "undefined" ? useEffect : useLayoutEffect

const usePrismEffect = (
  rootRef: RefObject<HTMLElement>,
  contentKey: string,
  enabled = true,
  options?: PrismEffectOptions
) => {
  const observeMutations = options?.observeMutations ?? true
  const mutationDebounceMs =
    typeof options?.mutationDebounceMs === "number"
      ? Math.max(16, options.mutationDebounceMs)
      : PRISM_DEFAULT_MUTATION_DEBOUNCE_MS

  usePrismHydrationEffect(() => {
    if (!enabled) return

    let disposed = false
    let hydrationSettled = false
    let running = false
    let rerunRequested = false
    let scheduledRunTimer: number | null = null
    let initialRunTimer: number | null = null
    let idleHandle: number | null = null
    let initialRunScheduled = false
    const root = rootRef.current
    if (!root) return

    const runtime = createPrismEffectRuntime({
      root,
      isDisposed: () => disposed,
    })

    const run = async () => {
      if (disposed) return
      if (running) {
        rerunRequested = true
        return
      }
      running = true
      try {
        do {
          rerunRequested = false
          const targets = runtime.collectTargetBlocks()
          if (!targets.length) continue
          await runtime.highlightCodeBlocks(targets)
        } while (!disposed && rerunRequested)
      } catch (error) {
        console.warn(error)
      } finally {
        running = false
      }
    }

    const scheduleRun = ({ fullRescan = false, block }: { fullRescan?: boolean; block?: HTMLElement } = {}) => {
      if (disposed) return
      if (fullRescan) {
        runtime.requestFullRescan()
      }
      if (block) {
        runtime.queueBlock(block)
      }
      if (!hydrationSettled) return
      if (scheduledRunTimer !== null) return
      scheduledRunTimer = window.setTimeout(() => {
        scheduledRunTimer = null
        void run()
      }, mutationDebounceMs)
    }

    const scheduleInitialRun = () => {
      if (initialRunScheduled || disposed) return
      initialRunScheduled = true

      if (runtime.hasCodeBlockMissingLineWrappers()) {
        hydrationSettled = true
        runtime.requestFullRescan()
        void run()
        return
      }

      const idleWindow = window as Window & {
        requestIdleCallback?: (
          callback: IdleRequestCallback,
          options?: IdleRequestOptions
        ) => number
        cancelIdleCallback?: (id: number) => void
      }

      if (typeof idleWindow.requestIdleCallback === "function") {
        idleHandle = idleWindow.requestIdleCallback(
          () => {
            idleHandle = null
            hydrationSettled = true
            scheduleRun({ fullRescan: true })
          },
          { timeout: PRISM_INITIAL_HYDRATION_TIMEOUT_MS }
        )
        return
      }

      initialRunTimer = window.setTimeout(() => {
        initialRunTimer = null
        hydrationSettled = true
        scheduleRun({ fullRescan: true })
      }, PRISM_INITIAL_HYDRATION_TIMEOUT_MS)
    }

    scheduleInitialRun()

    const observer =
      observeMutations && typeof MutationObserver !== "undefined"
        ? new MutationObserver((mutations) => {
            if (disposed) return
            runtime.handleMutationRecords(mutations, scheduleRun)
          })
        : null

    observer?.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "data-language", "data-theme"],
    })

    return () => {
      disposed = true
      if (scheduledRunTimer !== null) {
        window.clearTimeout(scheduledRunTimer)
        scheduledRunTimer = null
      }
      if (initialRunTimer !== null) {
        window.clearTimeout(initialRunTimer)
        initialRunTimer = null
      }
      if (idleHandle !== null) {
        const idleWindow = window as Window & {
          cancelIdleCallback?: (id: number) => void
        }
        if (typeof idleWindow.cancelIdleCallback === "function") {
          idleWindow.cancelIdleCallback(idleHandle)
        } else {
          window.clearTimeout(idleHandle)
        }
        idleHandle = null
      }
      observer?.disconnect()
    }
  }, [contentKey, enabled, mutationDebounceMs, observeMutations, rootRef])
}

export default usePrismEffect
