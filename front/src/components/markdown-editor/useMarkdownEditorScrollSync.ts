import {
  type RefObject,
  type UIEvent as ReactUIEvent,
  type WheelEvent as ReactWheelEvent,
  useCallback,
} from "react"
import { getWheelDeltaYPixels } from "./markdownEditorToolbarModel"

type UseMarkdownEditorScrollSyncArgs = {
  textareaRef: RefObject<HTMLTextAreaElement | null>
  previewScrollRef: RefObject<HTMLDivElement | null>
}

export const useMarkdownEditorScrollSync = ({
  textareaRef,
  previewScrollRef,
}: UseMarkdownEditorScrollSyncArgs) => {
  const syncScrollPosition = useCallback((source: HTMLElement, target: HTMLElement | null) => {
    if (!target) return

    const sourceMax = source.scrollHeight - source.clientHeight
    const targetMax = target.scrollHeight - target.clientHeight
    if (sourceMax <= 0 || targetMax <= 0) return

    const ratio = source.scrollTop / sourceMax
    const nextScrollTop = ratio * targetMax
    if (Math.abs(target.scrollTop - nextScrollTop) < 1) return

    target.scrollTop = nextScrollTop
  }, [])

  const handleWriteScroll = useCallback(
    (event: ReactUIEvent<HTMLTextAreaElement>) => {
      syncScrollPosition(event.currentTarget, previewScrollRef.current)
    },
    [previewScrollRef, syncScrollPosition]
  )

  const handlePreviewScroll = useCallback(
    (event: ReactUIEvent<HTMLElement>) => {
      syncScrollPosition(event.currentTarget, textareaRef.current)
    },
    [syncScrollPosition, textareaRef]
  )

  const handlePreviewWheel = useCallback((event: ReactWheelEvent<HTMLElement>) => {
    if (event.deltaY === 0) return

    const preview = event.currentTarget
    const deltaYPixels = getWheelDeltaYPixels(event, preview)
    const maxScrollTop = preview.scrollHeight - preview.clientHeight
    const nextScrollTop = preview.scrollTop + deltaYPixels
    if (nextScrollTop >= 0 && nextScrollTop <= maxScrollTop) return

    event.preventDefault()

    const clampedScrollTop = Math.max(0, Math.min(nextScrollTop, maxScrollTop))
    const remainingDeltaY = nextScrollTop - clampedScrollTop
    preview.scrollTop = clampedScrollTop
    if (remainingDeltaY === 0) return

    window.scrollBy({
      top: remainingDeltaY,
    })
  }, [])

  return { handleWriteScroll, handlePreviewScroll, handlePreviewWheel }
}
