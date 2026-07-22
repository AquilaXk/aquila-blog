import { type KeyboardEvent as ReactKeyboardEvent, useCallback, useRef } from "react"
import styled from "@emotion/styled"

export type MarkdownEditorMode = "write" | "preview" | "split"

const MODE_ORDER: MarkdownEditorMode[] = ["write", "preview", "split"]

const MODE_LABEL: Record<MarkdownEditorMode, string> = {
  write: "Write",
  preview: "Preview",
  split: "Split",
}

type MarkdownEditorModeTabsProps = {
  mode: MarkdownEditorMode
  onModeChange: (mode: MarkdownEditorMode) => void
  writePanelId: string
  previewPanelId: string
  writeTabId: string
  previewTabId: string
  splitTabId: string
}

export const MarkdownEditorModeTabs = ({
  mode,
  onModeChange,
  writePanelId,
  previewPanelId,
  writeTabId,
  previewTabId,
  splitTabId,
}: MarkdownEditorModeTabsProps) => {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  const focusMode = useCallback(
    (nextMode: MarkdownEditorMode) => {
      onModeChange(nextMode)
      const index = MODE_ORDER.indexOf(nextMode)
      window.requestAnimationFrame(() => {
        tabRefs.current[index]?.focus()
      })
    },
    [onModeChange]
  )

  const handleTabKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>, currentMode: MarkdownEditorMode) => {
      const currentIndex = MODE_ORDER.indexOf(currentMode)
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        event.preventDefault()
        const delta = event.key === "ArrowRight" ? 1 : -1
        const nextIndex = (currentIndex + delta + MODE_ORDER.length) % MODE_ORDER.length
        focusMode(MODE_ORDER[nextIndex]!)
        return
      }
      if (event.key === "Home") {
        event.preventDefault()
        focusMode(MODE_ORDER[0]!)
        return
      }
      if (event.key === "End") {
        event.preventDefault()
        focusMode(MODE_ORDER[MODE_ORDER.length - 1]!)
      }
    },
    [focusMode]
  )

  const tabIdFor = (tabMode: MarkdownEditorMode) => {
    if (tabMode === "write") return writeTabId
    if (tabMode === "preview") return previewTabId
    return splitTabId
  }

  const ariaControlsFor = (tabMode: MarkdownEditorMode) => {
    if (tabMode === "write") return writePanelId
    if (tabMode === "preview") return previewPanelId
    return `${writePanelId} ${previewPanelId}`
  }

  return (
    <ModeTabs role="tablist" aria-label="Markdown editor mode">
      {MODE_ORDER.map((tabMode, index) => {
        const selected = mode === tabMode
        return (
          <ModeTab
            key={tabMode}
            ref={(node) => {
              tabRefs.current[index] = node
            }}
            id={tabIdFor(tabMode)}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={ariaControlsFor(tabMode)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onModeChange(tabMode)}
            onKeyDown={(event) => handleTabKeyDown(event, tabMode)}
          >
            {MODE_LABEL[tabMode]}
          </ModeTab>
        )
      })}
    </ModeTabs>
  )
}

const ModeTabs = styled.div`
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  gap: 4px;
  padding: 3px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.publicDesign.surfaceElevated};
`

const ModeTab = styled.button`
  border: 0;
  height: 30px;
  padding: 0 11px;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray10};
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;

  &[aria-selected="true"] {
    background: ${({ theme }) => theme.publicDesign.readableSurface};
    color: ${({ theme }) => theme.colors.gray12};
    box-shadow: 0 0 0 1px ${({ theme }) => theme.colors.gray6};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.blue8};
    outline-offset: 2px;
  }
`
