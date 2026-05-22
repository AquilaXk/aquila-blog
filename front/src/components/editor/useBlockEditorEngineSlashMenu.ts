import type { Editor as TiptapEditor } from "@tiptap/core"
import { useCallback, useEffect, useMemo } from "react"
import type {
  Dispatch,
  KeyboardEvent as ReactKeyboardEvent,
  MutableRefObject,
  RefObject,
  SetStateAction,
} from "react"
import { type BlockEditorDoc } from "./serialization"
import { TABLE_CONTEXT_BLOCKED_INSERT_IDS, type BlockInsertCatalogItem } from "./writerEditorPreset"
import { isTableSelectionActive } from "./tableStructureModel"
import { getTopLevelBlockIndexFromSelection } from "./blockSelectionModel"
import {
  buildSlashMenuSections,
  getRankedSlashItems,
  normalizeSlashSearchText,
  type SlashMenuContext,
} from "./slashMenuModel"
import type { BlockEditorSlashMenuState } from "./BlockEditorEngine.layers"
import { getActiveSlashRangeFromEditor } from "./useBlockEditorEngineDocumentOps"

type SlashKeyboardEventLike = {
  key: string
  shiftKey?: boolean
  isComposing?: boolean
  timeStamp?: number
  preventDefault: () => void
  stopPropagation?: () => void
  nativeEvent?: {
    stopImmediatePropagation?: () => void
  }
}

type SlashInteractionMode = "keyboard" | "pointer"
type SetBoolean = Dispatch<SetStateAction<boolean>>

const SLASH_MENU_RECENT_IDS_STORAGE_KEY = "editor:block-slash-recent:v1"
const SLASH_MENU_MAX_RECENT_ITEMS = 6
const SLASH_MENU_EDGE_PADDING_PX = 16
const SLASH_MENU_VERTICAL_GAP_PX = 12
const SLASH_MENU_ESTIMATED_WIDTH_PX = 608
const SLASH_MENU_ESTIMATED_HEIGHT_PX = 560

type UseBlockEditorEngineSlashMenuArgs = {
  blockInsertCatalog: BlockInsertCatalogItem[]
  closeSlashMenu: (restoreFocus?: boolean) => void
  editor: TiptapEditor | null
  editorRef: RefObject<TiptapEditor | null>
  isSlashImeComposing: boolean
  isSlashMenuOpen: boolean
  recentSlashItemIds: string[]
  selectedSlashIndex: number
  setIsSlashMenuOpen: SetBoolean
  setRecentSlashItemIds: Dispatch<SetStateAction<string[]>>
  setSelectedSlashIndex: Dispatch<SetStateAction<number>>
  setSlashInteractionMode: Dispatch<SetStateAction<SlashInteractionMode>>
  setSlashMenuState: Dispatch<SetStateAction<BlockEditorSlashMenuState>>
  setSlashQuery: Dispatch<SetStateAction<string>>
  slashMenuRef: RefObject<HTMLDivElement | null>
  slashMenuState: BlockEditorSlashMenuState
  slashPointerResumeAtRef: MutableRefObject<number>
  slashQuery: string
  transformCurrentParagraphViaSlash: (itemId: string) => boolean
}

const stopSlashKeyboardEvent = (event: SlashKeyboardEventLike) => {
  event.preventDefault()
  event.stopPropagation?.()

  if ("nativeEvent" in event && event.nativeEvent) {
    event.nativeEvent.stopImmediatePropagation?.()
    return
  }

  ;(event as KeyboardEvent).stopImmediatePropagation?.()
}

export const useBlockEditorEngineSlashMenu = ({
  blockInsertCatalog,
  closeSlashMenu,
  editor,
  editorRef,
  isSlashImeComposing,
  isSlashMenuOpen,
  recentSlashItemIds,
  selectedSlashIndex,
  setIsSlashMenuOpen,
  setRecentSlashItemIds,
  setSelectedSlashIndex,
  setSlashInteractionMode,
  setSlashMenuState,
  setSlashQuery,
  slashMenuRef,
  slashMenuState,
  slashPointerResumeAtRef,
  slashQuery,
  transformCurrentParagraphViaSlash,
}: UseBlockEditorEngineSlashMenuArgs) => {
  const normalizedSlashQuery = normalizeSlashSearchText(slashQuery)

  const getSlashMenuContextFromEditor = useCallback((activeEditor: TiptapEditor | null | undefined): SlashMenuContext => {
    if (!activeEditor) {
      return {
        currentBlockType: null,
        previousBlockType: null,
        atDocumentStart: true,
      }
    }

    const blocks = (((activeEditor.getJSON() as BlockEditorDoc).content ?? []) as BlockEditorDoc[])
    const currentBlockIndex = Math.max(0, Math.min(getTopLevelBlockIndexFromSelection(activeEditor), blocks.length - 1))

    return {
      currentBlockType: blocks[currentBlockIndex]?.type ?? null,
      previousBlockType: currentBlockIndex > 0 ? blocks[currentBlockIndex - 1]?.type ?? null : null,
      atDocumentStart: currentBlockIndex === 0,
    }
  }, [])

  const rankSlashItems = useCallback(
    (query: string, context: SlashMenuContext) =>
      getRankedSlashItems(blockInsertCatalog, query, recentSlashItemIds, context),
    [blockInsertCatalog, recentSlashItemIds]
  )

  const slashMenuContext = useMemo((): SlashMenuContext => {
    return getSlashMenuContextFromEditor(editor)
  }, [editor, getSlashMenuContextFromEditor])

  const rankedSlashItems = useMemo(() => {
    return rankSlashItems(normalizedSlashQuery, slashMenuContext)
  }, [rankSlashItems, normalizedSlashQuery, slashMenuContext])

  const slashSections = useMemo(() => {
    return buildSlashMenuSections(rankedSlashItems, recentSlashItemIds, normalizedSlashQuery)
  }, [normalizedSlashQuery, rankedSlashItems, recentSlashItemIds])

  const flatSlashEntries = useMemo(
    () =>
      slashSections.flatMap((section) =>
        section.items.map((item) => ({
          key: `${section.title}-${item.id}`,
          sectionTitle: section.title,
          item,
        }))
      ),
    [slashSections]
  )

  useEffect(() => {
    if (typeof window === "undefined") return

    try {
      const raw = window.localStorage.getItem(SLASH_MENU_RECENT_IDS_STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return
      const sanitized = parsed.filter((value): value is string => typeof value === "string").slice(0, SLASH_MENU_MAX_RECENT_ITEMS)
      setRecentSlashItemIds(sanitized)
    } catch {
      window.localStorage.removeItem(SLASH_MENU_RECENT_IDS_STORAGE_KEY)
    }
  }, [setRecentSlashItemIds])

  const executeSlashCatalogAction = useCallback(
    async (item: BlockInsertCatalogItem) => {
      if (!editor || item.disabled) return
      if (isTableSelectionActive(editor) && TABLE_CONTEXT_BLOCKED_INSERT_IDS.has(item.id)) return

      const activeSlashRange = getActiveSlashRangeFromEditor(editor) ?? slashMenuState
      let handledByWholeParagraphReplacement = false
      if (activeSlashRange) {
        const { selection } = editor.state
        const paragraph = selection.$from.parent
        const paragraphContentStart = selection.$from.start()
        const paragraphContentEnd = selection.$from.end()
        const slashStartOffset = Math.max(0, activeSlashRange.from - paragraphContentStart)
        const slashEndOffset = Math.max(0, activeSlashRange.to - paragraphContentStart)
        const textBeforeSlash = paragraph.textContent.slice(0, slashStartOffset)
        const textAfterSlash = paragraph.textContent.slice(slashEndOffset)
        const shouldReplaceWholeParagraph =
          paragraph.type.name === "paragraph" &&
          textBeforeSlash.trim().length === 0 &&
          textAfterSlash.trim().length === 0

        if (shouldReplaceWholeParagraph) {
          handledByWholeParagraphReplacement = transformCurrentParagraphViaSlash(item.id)
        }

        if (!handledByWholeParagraphReplacement) {
          if (shouldReplaceWholeParagraph) {
            editor
              .chain()
              .focus()
              .deleteRange({
                from: paragraphContentStart,
                to: paragraphContentEnd,
              })
              .run()
          } else {
            editor.chain().focus().deleteRange({ from: activeSlashRange.from, to: activeSlashRange.to }).run()
          }
        } else {
          closeSlashMenu()
        }
      }

      setRecentSlashItemIds((prev) => {
        const next = [item.id, ...prev.filter((id) => id !== item.id)].slice(0, SLASH_MENU_MAX_RECENT_ITEMS)
        if (typeof window !== "undefined") {
          window.localStorage.setItem(SLASH_MENU_RECENT_IDS_STORAGE_KEY, JSON.stringify(next))
        }
        return next
      })

      if (!handledByWholeParagraphReplacement) {
        closeSlashMenu()
        await item.insertAtCursor()
      }
    },
    [closeSlashMenu, editor, setRecentSlashItemIds, slashMenuState, transformCurrentParagraphViaSlash]
  )

  const resolveSlashMenuState = useCallback(() => {
    if (!editor || typeof window === "undefined") return null

    const selection = editor.state.selection

    if (!selection.empty || !editor.isFocused) {
      return null
    }
    if (isTableSelectionActive(editor)) {
      return null
    }

    const parent = selection.$from.parent
    if (parent.type.name !== "paragraph") {
      return null
    }

    const activeSlashRange = getActiveSlashRangeFromEditor(editor)
    if (!activeSlashRange) {
      return null
    }
    const paragraphContentStart = selection.$from.start()
    const slashStartOffset = Math.max(0, activeSlashRange.from - paragraphContentStart)
    const slashEndOffset = Math.max(0, activeSlashRange.to - paragraphContentStart)
    const query = parent.textContent.slice(slashStartOffset + 1, slashEndOffset)
    const coords = editor.view.coordsAtPos(selection.from)
    const viewportPadding = SLASH_MENU_EDGE_PADDING_PX
    const estimatedMenuWidth = Math.min(SLASH_MENU_ESTIMATED_WIDTH_PX, window.innerWidth - viewportPadding * 2)
    const estimatedMenuHeight = Math.min(
      SLASH_MENU_ESTIMATED_HEIGHT_PX,
      Math.max(320, window.innerHeight - viewportPadding * 2)
    )
    const spaceBelow = window.innerHeight - coords.bottom - viewportPadding
    const spaceAbove = coords.top - viewportPadding
    const placeAbove = spaceBelow < 280 && spaceAbove > spaceBelow + 48
    const nextLeft = Math.min(
      Math.max(coords.left, viewportPadding),
      Math.max(viewportPadding, window.innerWidth - estimatedMenuWidth - viewportPadding)
    )
    const rawTop = placeAbove
      ? coords.top - estimatedMenuHeight - SLASH_MENU_VERTICAL_GAP_PX
      : coords.bottom + SLASH_MENU_VERTICAL_GAP_PX
    const nextTop = Math.min(rawTop, Math.max(viewportPadding, window.innerHeight - estimatedMenuHeight - viewportPadding))

    return {
      query,
      menuState: {
        left: Math.round(nextLeft),
        top: Math.round(Math.max(viewportPadding, nextTop)),
        from: activeSlashRange.from,
        to: activeSlashRange.to,
        placement: placeAbove ? "top" : "bottom",
      } satisfies Exclude<BlockEditorSlashMenuState, null>,
    }
  }, [editor])

  const applyResolvedSlashMenuState = useCallback(
    (nextSlashState: ReturnType<typeof resolveSlashMenuState>) => {
      if (!nextSlashState) {
        setIsSlashMenuOpen(false)
        setSlashMenuState(null)
        setSlashQuery("")
        setSelectedSlashIndex(0)
        setSlashInteractionMode("keyboard")
        return
      }

      setSlashQuery(nextSlashState.query)
      setIsSlashMenuOpen(true)
      setSlashMenuState(nextSlashState.menuState)
    },
    [setIsSlashMenuOpen, setSelectedSlashIndex, setSlashInteractionMode, setSlashMenuState, setSlashQuery]
  )

  const syncSlashMenuWhileComposing = useCallback(() => {
    const nextSlashState = resolveSlashMenuState()
    if (!nextSlashState) {
      return
    }

    setSlashQuery(nextSlashState.query)
    setIsSlashMenuOpen(true)
    setSlashMenuState(nextSlashState.menuState)
  }, [resolveSlashMenuState, setIsSlashMenuOpen, setSlashMenuState, setSlashQuery])

  useEffect(() => {
    if (!editor) return
    let rafId: number | null = null

    const syncSlashMenu = () => {
      if (isSlashImeComposing || editor.view.composing) {
        syncSlashMenuWhileComposing()
        return
      }

      applyResolvedSlashMenuState(resolveSlashMenuState())
    }

    const scheduleSyncSlashMenu = () => {
      if (typeof window === "undefined") {
        syncSlashMenu()
        return
      }
      if (rafId !== null) return
      rafId = window.requestAnimationFrame(() => {
        rafId = null
        syncSlashMenu()
      })
    }

    scheduleSyncSlashMenu()
    editor.on("selectionUpdate", scheduleSyncSlashMenu)
    editor.on("transaction", scheduleSyncSlashMenu)
    editor.on("focus", scheduleSyncSlashMenu)

    return () => {
      editor.off("selectionUpdate", scheduleSyncSlashMenu)
      editor.off("transaction", scheduleSyncSlashMenu)
      editor.off("focus", scheduleSyncSlashMenu)
      if (rafId !== null && typeof window !== "undefined") {
        window.cancelAnimationFrame(rafId)
      }
    }
  }, [applyResolvedSlashMenuState, editor, isSlashImeComposing, resolveSlashMenuState, syncSlashMenuWhileComposing])

  useEffect(() => {
    if (typeof window === "undefined" || !isSlashMenuOpen) return

    const syncSlashMenuPlacement = () => {
      const nextSlashState = resolveSlashMenuState()
      if (!nextSlashState) return
      setSlashQuery(nextSlashState.query)
      setSlashMenuState(nextSlashState.menuState)
    }

    window.addEventListener("resize", syncSlashMenuPlacement)
    window.addEventListener("scroll", syncSlashMenuPlacement, true)

    return () => {
      window.removeEventListener("resize", syncSlashMenuPlacement)
      window.removeEventListener("scroll", syncSlashMenuPlacement, true)
    }
  }, [isSlashMenuOpen, resolveSlashMenuState, setSlashMenuState, setSlashQuery])

  const resolveSlashExecutionTarget = useCallback(() => {
    const activeEditor = editorRef.current ?? editor
    if (!activeEditor) return null
    if (isTableSelectionActive(activeEditor)) return null

    const resolvedSlashState = resolveSlashMenuState()
    const activeSlashRange = resolvedSlashState?.menuState ?? getActiveSlashRangeFromEditor(activeEditor)
    if (!activeSlashRange) return null

    const query = resolvedSlashState?.query ?? ""
    const context = getSlashMenuContextFromEditor(activeEditor)
    const rankedItems = rankSlashItems(query, context)
    if (!rankedItems.length) return null

    const preferredItemId = flatSlashEntries[selectedSlashIndex]?.item.id
    const selectedItem =
      (preferredItemId ? rankedItems.find((item) => item.id === preferredItemId) : null) ??
      rankedItems[0] ??
      null
    if (!selectedItem || selectedItem.disabled) return null
    const insideTableCell = activeEditor.isActive("tableCell") || activeEditor.isActive("tableHeader")
    if (insideTableCell && selectedItem.section === "structure") return null

    return {
      item: selectedItem,
      range: activeSlashRange,
      query,
    }
  }, [
    editor,
    editorRef,
    flatSlashEntries,
    getSlashMenuContextFromEditor,
    rankSlashItems,
    resolveSlashMenuState,
    selectedSlashIndex,
  ])

  const handleSlashMenuKeyboard = useCallback((event: SlashKeyboardEventLike) => {
    if (event.isComposing) return

    const liveSlashTarget = resolveSlashExecutionTarget()

    if (event.key === "Enter") {
      if (!liveSlashTarget) return
      stopSlashKeyboardEvent(event)
      queueMicrotask(() => {
        void executeSlashCatalogAction(liveSlashTarget.item)
      })
      return
    }

    if (event.key === "Backspace" && !liveSlashTarget?.query.trim().length && liveSlashTarget && editor) {
      stopSlashKeyboardEvent(event)
      setSlashInteractionMode("keyboard")
      editor.chain().focus().deleteRange({ from: liveSlashTarget.range.from, to: liveSlashTarget.range.to }).run()
      closeSlashMenu()
      return
    }

    if (!isSlashMenuOpen) return

    if (!flatSlashEntries.length && event.key === "Escape") {
      stopSlashKeyboardEvent(event)
      setSlashInteractionMode("keyboard")
      closeSlashMenu(true)
      return
    }

    if (event.key === "ArrowDown" || (event.key === "Tab" && !event.shiftKey)) {
      stopSlashKeyboardEvent(event)
      slashPointerResumeAtRef.current = typeof performance !== "undefined" ? performance.now() + 180 : Date.now() + 180
      setSlashInteractionMode("keyboard")
      setSelectedSlashIndex((prev) => {
        if (!flatSlashEntries.length) return 0
        return (prev + 1) % flatSlashEntries.length
      })
      return
    }

    if (event.key === "ArrowUp" || (event.key === "Tab" && event.shiftKey)) {
      stopSlashKeyboardEvent(event)
      slashPointerResumeAtRef.current = typeof performance !== "undefined" ? performance.now() + 180 : Date.now() + 180
      setSlashInteractionMode("keyboard")
      setSelectedSlashIndex((prev) => {
        if (!flatSlashEntries.length) return 0
        return (prev - 1 + flatSlashEntries.length) % flatSlashEntries.length
      })
      return
    }

    if (event.key === "Home") {
      stopSlashKeyboardEvent(event)
      slashPointerResumeAtRef.current = typeof performance !== "undefined" ? performance.now() + 180 : Date.now() + 180
      setSlashInteractionMode("keyboard")
      setSelectedSlashIndex(0)
      return
    }

    if (event.key === "End") {
      stopSlashKeyboardEvent(event)
      slashPointerResumeAtRef.current = typeof performance !== "undefined" ? performance.now() + 180 : Date.now() + 180
      setSlashInteractionMode("keyboard")
      setSelectedSlashIndex(Math.max(flatSlashEntries.length - 1, 0))
      return
    }

    if (event.key === "Escape") {
      stopSlashKeyboardEvent(event)
      setSlashInteractionMode("keyboard")
      closeSlashMenu(true)
    }
  }, [
    closeSlashMenu,
    editor,
    executeSlashCatalogAction,
    flatSlashEntries,
    isSlashMenuOpen,
    resolveSlashExecutionTarget,
    setSelectedSlashIndex,
    setSlashInteractionMode,
    slashPointerResumeAtRef,
  ])

  const handleSlashActionPointerMove = useCallback((flatIndex: number) => {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now()
    if (now < slashPointerResumeAtRef.current) return
    setSlashInteractionMode((prev) => (prev === "pointer" ? prev : "pointer"))
    setSelectedSlashIndex((prev) => (prev === flatIndex ? prev : flatIndex))
  }, [setSelectedSlashIndex, setSlashInteractionMode, slashPointerResumeAtRef])

  const handleSlashMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    handleSlashMenuKeyboard(event)
  }

  useEffect(() => {
    if (!isSlashMenuOpen) return
    setSelectedSlashIndex(0)
  }, [isSlashMenuOpen, setSelectedSlashIndex, slashQuery])

  useEffect(() => {
    if (!flatSlashEntries.length) {
      setSelectedSlashIndex(0)
      return
    }

    setSelectedSlashIndex((prev) => Math.min(prev, flatSlashEntries.length - 1))
  }, [flatSlashEntries, setSelectedSlashIndex])

  useEffect(() => {
    if (!isSlashMenuOpen || !slashMenuRef.current) return
    const activeElement = slashMenuRef.current.querySelector<HTMLButtonElement>("[data-active='true']")
    activeElement?.scrollIntoView({ block: "nearest" })
  }, [isSlashMenuOpen, selectedSlashIndex, slashMenuRef])

  useEffect(() => {
    if (typeof window === "undefined") return

    const closeMenu = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (!["ArrowDown", "ArrowUp", "Tab", "Home", "End", "Enter", "Escape", "Backspace"].includes(event.key)) return
        const activeEditor = editorRef.current ?? editor
        const hasActiveSlashRange = Boolean(activeEditor && getActiveSlashRangeFromEditor(activeEditor))
        if (!isSlashMenuOpen && !hasActiveSlashRange) return
        handleSlashMenuKeyboard(event)
        return
      }

      if (!isSlashMenuOpen) return

      const target = event.target
      if (slashMenuRef.current && target instanceof Node && slashMenuRef.current.contains(target)) {
        return
      }

      closeSlashMenu()
    }

    window.addEventListener("pointerdown", closeMenu)
    window.addEventListener("keydown", closeMenu, true)

    return () => {
      window.removeEventListener("pointerdown", closeMenu)
      window.removeEventListener("keydown", closeMenu, true)
    }
  }, [closeSlashMenu, editor, editorRef, handleSlashMenuKeyboard, isSlashMenuOpen, slashMenuRef])

  return {
    applyResolvedSlashMenuState,
    executeSlashCatalogAction,
    flatSlashEntries,
    handleSlashActionPointerMove,
    handleSlashMenuKeyDown,
    handleSlashMenuKeyboard,
    resolveSlashMenuState,
    slashSections,
    syncSlashMenuWhileComposing,
  }
}
