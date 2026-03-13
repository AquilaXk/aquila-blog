import React from "react"
import type { CategoryIconId } from "src/libs/utils/category"

type Props = {
  iconId: CategoryIconId
  className?: string
} & React.SVGProps<SVGSVGElement>

const CategoryGlyph: React.FC<Props> = ({ iconId, className, ...props }) => {
  switch (iconId) {
    case "all":
    case "folder-open":
      return (
        <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true" {...props}>
          <path d="M3.5 7.5h6l1.8 2h9.2v7a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z" strokeLinejoin="round" />
          <path d="M3.5 9.5h17" />
        </svg>
      )
    case "folder":
      return (
        <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true" {...props}>
          <path d="M3.5 8.5a2 2 0 0 1 2-2h4.3l1.8 2h6.9a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-8Z" strokeLinejoin="round" />
        </svg>
      )
    case "stack":
      return (
        <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true" {...props}>
          <path d="M12 4 4.5 8l7.5 4 7.5-4L12 4Zm-7.5 7 7.5 4 7.5-4M4.5 14l7.5 4 7.5-4" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      )
    case "book-open":
      return (
        <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true" {...props}>
          <path d="M12 6.5c-1.2-1-2.8-1.5-4.7-1.5H5.5a1.5 1.5 0 0 0-1.5 1.5v11a1 1 0 0 0 1.2 1c2.2-.5 4.9-.2 6.8 1" />
          <path d="M12 6.5c1.2-1 2.8-1.5 4.7-1.5h1.8A1.5 1.5 0 0 1 20 6.5v11a1 1 0 0 1-1.2 1c-2.2-.5-4.9-.2-6.8 1M12 6.5V19.5" />
        </svg>
      )
    case "book":
      return (
        <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true" {...props}>
          <path d="M6 4.5h10.5A1.5 1.5 0 0 1 18 6v12.5H7.5A1.5 1.5 0 0 1 6 17V4.5Z" />
          <path d="M6 6.5h12" />
        </svg>
      )
    case "note":
      return (
        <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true" {...props}>
          <path d="M6 3.5h8l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 5 19V5A1.5 1.5 0 0 1 6.5 3.5H6Z" strokeLinejoin="round" />
          <path d="M14 3.5V8h4M8 12h8M8 15.5h8" />
        </svg>
      )
    case "monitor":
      return (
        <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true" {...props}>
          <rect x="4" y="5" width="16" height="10" rx="1.8" />
          <path d="M9 19h6M12 15v4" />
        </svg>
      )
    case "lab":
      return (
        <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true" {...props}>
          <path d="M10 3.5v5l-4.8 7.6A2 2 0 0 0 6.9 19h10.2a2 2 0 0 0 1.7-2.9L14 8.5v-5" strokeLinejoin="round" />
          <path d="M8 12.5h8" />
        </svg>
      )
    case "settings":
      return (
        <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true" {...props}>
          <circle cx="12" cy="12" r="3.2" />
          <path d="M12 3.5v2M12 18.5v2M4.9 6.4l1.4 1.4M17.7 19.2l1.4 1.4M3.5 12h2M18.5 12h2M4.9 17.6l1.4-1.4M17.7 4.8l1.4-1.4" strokeLinecap="round" />
        </svg>
      )
    case "rocket":
      return (
        <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true" {...props}>
          <path d="M14.5 4.5c2.7 0 5 2.3 5 5 0 4.2-3.8 8.2-9.8 10 .5-1.8.9-3.6 1.9-5.1l-3-3c1.5-1 3.3-1.4 5.1-1.9.8-3.8 2.2-5 0 0Z" strokeLinejoin="round" />
          <circle cx="15.8" cy="8.2" r="1.1" />
          <path d="m5 14 3 3M4.5 19.5l2.2-5.2" strokeLinecap="round" />
        </svg>
      )
    case "chart":
      return (
        <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true" {...props}>
          <path d="M4.5 19.5h15M7 16v-5M12 16V9M17 16v-8" strokeLinecap="round" />
        </svg>
      )
    case "archive":
      return (
        <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true" {...props}>
          <path d="M4.5 6.5h15v3h-15zM6 9.5h12V18a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 18V9.5Z" />
          <path d="M10 13h4" />
        </svg>
      )
    default:
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
          <path d="M3.5 8.5a2 2 0 0 1 2-2h4.3l1.8 2h6.9a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-8Z" strokeLinejoin="round" />
        </svg>
      )
  }
}

export default CategoryGlyph
