import { useRouter } from "next/router"
import React from "react"
import { COLOR_SET } from "./constants"
import styled from "@emotion/styled"

export const getColorClassByName = (name: string): string => {
  try {
    let sum = 0
    name.split("").forEach((alphabet) => (sum = sum + alphabet.charCodeAt(0)))
    const colorKey = sum
      .toString(16)
      ?.[sum.toString(16).length - 1].toUpperCase()
    return COLOR_SET[colorKey]
  } catch {
    return COLOR_SET[0]
  }
}

const getReadableTextColor = (backgroundColor: string): string => {
  const channels = backgroundColor.match(/\d+/g)?.map(Number)
  if (!channels || channels.length < 3) return "#111827"

  const [r, g, b] = channels
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.6 ? "#111827" : "#f8fafc"
}

type Props = {
  children: string
  readOnly?: boolean
}

const Category: React.FC<Props> = ({ readOnly = false, children }) => {
  const router = useRouter()
  const backgroundColor = getColorClassByName(children)
  const textColor = getReadableTextColor(backgroundColor)

  const handleClick = (event?: React.SyntheticEvent) => {
    if (readOnly) return
    event?.preventDefault()
    event?.stopPropagation()
    router.push({
      query: {
        ...router.query,
        category: children,
      },
    }, undefined, { shallow: true, scroll: false })
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLSpanElement>) => {
    if (readOnly) return
    if (event.key !== "Enter" && event.key !== " ") return
    event.preventDefault()
    handleClick()
  }
  return (
    <StyledWrapper
      role={readOnly ? undefined : "button"}
      tabIndex={readOnly ? undefined : 0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-label={readOnly ? undefined : `Filter by category: ${children}`}
      css={{
        backgroundColor,
        color: textColor,
        cursor: readOnly ? "default" : "pointer",
      }}
    >
      {children}
    </StyledWrapper>
  )
}

export default Category

const StyledWrapper = styled.span`
  display: inline-block;
  padding-top: 0.25rem;
  padding-bottom: 0.25rem;
  padding-left: 0.5rem;
  padding-right: 0.5rem;
  border-radius: 9999px;
  width: fit-content;
  font-size: 0.875rem;
  line-height: 1.25rem;
  opacity: 0.9;
  color: inherit;
`
