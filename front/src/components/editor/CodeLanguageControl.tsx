import {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  useCallback,
  useRef,
} from "react"
import type { RefObject } from "react"
import AppIcon from "src/components/icons/AppIcon"
import { toLanguageLabel } from "src/libs/markdown/rendering"
import {
  CodeLanguageButton,
  CodeLanguageOptionButton,
  CodeLanguageOptionList,
  CodeLanguagePicker,
  CodeLanguagePopover,
  CodeLanguageSearchInput,
} from "./codeBlockNodeViewStyles"
import type { CodeLanguageOption } from "./codeBlockNodeViewLanguageModel"

type CodeLanguageControlProps = {
  applyLanguage: (value: string) => void
  draftLanguage: string
  exactSearchMatch: boolean
  filteredLanguageOptions: CodeLanguageOption[]
  isLanguageMenuOpen: boolean
  languageSearch: string
  menuId: string
  menuRef: RefObject<HTMLDivElement>
  searchInputRef: RefObject<HTMLInputElement>
  setLanguageSearch: (value: string) => void
  toggleLanguageMenu: () => void
}

const CODE_LANGUAGE_OPTION_SELECTOR = "[data-code-language-option]"

export const CodeLanguageControl = ({
  applyLanguage,
  draftLanguage,
  exactSearchMatch,
  filteredLanguageOptions,
  isLanguageMenuOpen,
  languageSearch,
  menuId,
  menuRef,
  searchInputRef,
  setLanguageSearch,
  toggleLanguageMenu,
}: CodeLanguageControlProps) => {
  const pointerTogglePendingRef = useRef(false)

  const handleButtonPointerDownCapture = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.pointerType && event.pointerType !== "mouse") return
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return
    pointerTogglePendingRef.current = true
    event.stopPropagation()
    toggleLanguageMenu()
  }, [toggleLanguageMenu])

  const handleButtonClickCapture = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    if (pointerTogglePendingRef.current) {
      pointerTogglePendingRef.current = false
      return
    }
    toggleLanguageMenu()
  }, [toggleLanguageMenu])

  const handleOptionPointerDownCapture = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target instanceof Element ? event.target : null
    if (!target?.closest(CODE_LANGUAGE_OPTION_SELECTOR)) return
    event.stopPropagation()
  }, [])

  const handleOptionClickCapture = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target instanceof Element ? event.target : null
    const optionButton = target?.closest<HTMLElement>(CODE_LANGUAGE_OPTION_SELECTOR)
    if (!optionButton) return
    event.stopPropagation()
    applyLanguage(optionButton.dataset.codeLanguageOption || "")
  }, [applyLanguage])

  return (
    <CodeLanguagePicker
      ref={menuRef}
      data-code-language-control="true"
      contentEditable={false}
      onPointerDownCapture={handleOptionPointerDownCapture}
      onClickCapture={handleOptionClickCapture}
    >
      <CodeLanguageButton
        type="button"
        contentEditable={false}
        aria-haspopup="dialog"
        aria-expanded={isLanguageMenuOpen}
        aria-controls={`${menuId}-language-menu`}
        onPointerDownCapture={handleButtonPointerDownCapture}
        onClickCapture={handleButtonClickCapture}
      >
        <span>{toLanguageLabel(draftLanguage)}</span>
        <AppIcon name="chevron-down" aria-hidden="true" />
      </CodeLanguageButton>
      {isLanguageMenuOpen ? (
        <CodeLanguagePopover id={`${menuId}-language-menu`} role="dialog" aria-label="코드 언어 선택">
          <CodeLanguageSearchInput
            ref={searchInputRef}
            value={languageSearch}
            placeholder="언어를 검색하세요"
            aria-label="언어 검색"
            onChange={(event) => setLanguageSearch(event.target.value)}
          />
          <CodeLanguageOptionList>
            {filteredLanguageOptions.map((option) => (
              <CodeLanguageOptionButton
                key={option.value}
                type="button"
                data-active={draftLanguage === option.value}
                data-code-language-option={option.value}
              >
                <span>{option.label}</span>
                {draftLanguage === option.value ? <AppIcon name="check-circle" aria-hidden="true" /> : null}
              </CodeLanguageOptionButton>
            ))}
            {languageSearch.trim() && !exactSearchMatch ? (
              <CodeLanguageOptionButton
                type="button"
                data-code-language-option={languageSearch.trim()}
              >
                <span>{languageSearch.trim()}</span>
                <small>직접 입력</small>
              </CodeLanguageOptionButton>
            ) : null}
          </CodeLanguageOptionList>
        </CodeLanguagePopover>
      ) : null}
    </CodeLanguagePicker>
  )
}
