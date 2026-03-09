import React, { useCallback, useEffect, useRef, useState } from "react"

type useDropdownType = () => [
  React.RefObject<HTMLDivElement>,
  boolean,
  () => void
]

const useDropdown: useDropdownType = () => {
  const menuRef = useRef<HTMLDivElement>(null)
  const [isDropdownOpened, setIsDropdownOpened] = useState(false)

  const handleClick = useCallback((e: MouseEvent) => {
    if (!menuRef.current) return
    const target = e.target
    if (!(target instanceof Node)) return
    if (!menuRef.current.contains(target)) {
      setIsDropdownOpened(false)
    }
  }, [])

  useEffect(() => {
    if (!isDropdownOpened) return
    window.addEventListener("click", handleClick)
    return () => {
      window.removeEventListener("click", handleClick)
    }
  }, [isDropdownOpened, handleClick])

  const onOpenBtn = () => {
    setIsDropdownOpened((prev) => !prev)
  }

  return [menuRef, isDropdownOpened, onOpenBtn]
}

export default useDropdown
