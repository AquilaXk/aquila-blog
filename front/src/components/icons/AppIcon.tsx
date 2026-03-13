import React from "react"

type IconName =
  | "search"
  | "tag"
  | "chevron-down"
  | "moon"
  | "sun"
  | "service"
  | "github"
  | "instagram"
  | "mail"
  | "linkedin"
  | "heart"
  | "heart-filled"
  | "reply"
  | "edit"
  | "trash"
  | "copy"
  | "message"
  | "check-circle"
  | "close"
  | "kakao"
  | "laptop"
  | "spark"
  | "briefcase"
  | "camera"
  | "question"
  | "rocket"

type Props = {
  name: IconName
  className?: string
} & React.SVGProps<SVGSVGElement>

const AppIcon: React.FC<Props> = ({ name, className, ...props }) => {
  switch (name) {
    case "search":
      return (
        <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true" {...props}>
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4.5 4.5" strokeLinecap="round" />
        </svg>
      )
    case "tag":
      return (
        <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true" {...props}>
          <path d="M20 13.6 10.4 4H4v6.4l9.6 9.6a1.8 1.8 0 0 0 2.6 0l3.8-3.8a1.8 1.8 0 0 0 0-2.6Z" strokeLinejoin="round" />
          <circle cx="7.5" cy="7.5" r="1.1" fill="currentColor" stroke="none" />
        </svg>
      )
    case "chevron-down":
      return (
        <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true" {...props}>
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case "moon":
      return (
        <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" className={className} aria-hidden="true" {...props}>
          <path d="M20 14.2A8.3 8.3 0 0 1 9.8 4a.7.7 0 0 0-1 .8A9.5 9.5 0 1 0 19.2 15a.7.7 0 0 0 .8-1Z" />
        </svg>
      )
    case "sun":
      return (
        <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true" {...props}>
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 2.5v2.1M12 19.4v2.1M4.6 4.6l1.5 1.5M17.9 17.9l1.5 1.5M2.5 12h2.1M19.4 12h2.1M4.6 19.4l1.5-1.5M17.9 6.1l1.5-1.5" strokeLinecap="round" />
        </svg>
      )
    case "service":
      return (
        <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true" {...props}>
          <path d="M12 3 4.5 7.2v9.6L12 21l7.5-4.2V7.2L12 3Z" strokeLinejoin="round" />
          <path d="M4.5 7.2 12 11.4l7.5-4.2M12 11.4V21" strokeLinejoin="round" />
        </svg>
      )
    case "github":
      return (
        <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" className={className} aria-hidden="true" {...props}>
          <path d="M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.8c-2.8.6-3.4-1.2-3.4-1.2-.5-1.1-1.1-1.4-1.1-1.4-.9-.6 0-.6 0-.6 1 .1 1.6 1 1.6 1 .9 1.6 2.4 1.1 2.9.9.1-.7.4-1.1.7-1.4-2.2-.2-4.6-1.1-4.6-5A3.9 3.9 0 0 1 7 8.3c-.1-.2-.4-1.3.1-2.8 0 0 .8-.3 2.9 1A10 10 0 0 1 12 6.2c.7 0 1.4.1 2 .3 2.1-1.3 2.9-1 2.9-1 .5 1.5.2 2.6.1 2.8a4 4 0 0 1 1 2.8c0 3.8-2.3 4.7-4.6 5 .4.3.8 1 .8 2v2.9c0 .3.2.6.7.5A10 10 0 0 0 12 2Z" />
        </svg>
      )
    case "instagram":
      return (
        <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true" {...props}>
          <rect x="4" y="4" width="16" height="16" rx="4.5" />
          <circle cx="12" cy="12" r="3.6" />
          <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
        </svg>
      )
    case "mail":
      return (
        <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true" {...props}>
          <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
          <path d="m5.5 7.5 6.5 5 6.5-5" strokeLinejoin="round" />
        </svg>
      )
    case "message":
      return (
        <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true" {...props}>
          <path d="M6.5 18.5 4 20V6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H6.5Z" strokeLinejoin="round" />
        </svg>
      )
    case "laptop":
      return (
        <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true" {...props}>
          <rect x="4" y="5" width="16" height="10" rx="1.8" />
          <path d="M2.8 18.5h18.4M9 18.5h6" strokeLinecap="round" />
        </svg>
      )
    case "spark":
      return (
        <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" className={className} aria-hidden="true" {...props}>
          <path d="m12 2.8 1.7 5 5.5.4-4.3 3.3 1.4 5.2-4.3-3-4.3 3 1.4-5.2-4.3-3.3 5.5-.4L12 2.8Zm7.2 13.7.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z" />
        </svg>
      )
    case "briefcase":
      return (
        <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true" {...props}>
          <rect x="3.5" y="7" width="17" height="11.5" rx="2" />
          <path d="M9 7V5.8A1.8 1.8 0 0 1 10.8 4h2.4A1.8 1.8 0 0 1 15 5.8V7M3.5 11.2h17" />
        </svg>
      )
    case "camera":
      return (
        <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true" {...props}>
          <path d="M7.5 6.5 9 4.5h6l1.5 2H19a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8.5a2 2 0 0 1 2-2h2.5Z" strokeLinejoin="round" />
          <circle cx="12" cy="12.5" r="3.6" />
        </svg>
      )
    case "question":
      return (
        <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true" {...props}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M9.6 9.2a2.5 2.5 0 1 1 4.4 1.6c-.7.7-1.6 1.1-1.6 2.2M12 16.8h.01" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case "rocket":
      return (
        <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true" {...props}>
          <path d="M14.6 4.6c2.7 0 4.9 2.2 4.9 4.9 0 4.1-3.6 8-9.5 9.8.5-1.8.9-3.5 1.9-4.9l-3-3c1.4-1 3.1-1.4 4.9-1.9.8-3.7 2.1-4.9.8-4.9Z" strokeLinejoin="round" />
          <circle cx="15.8" cy="8.3" r="1.1" />
          <path d="m5 14 3 3M4.5 19.5l2.3-5.1" strokeLinecap="round" />
        </svg>
      )
    case "check-circle":
      return (
        <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true" {...props}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="m8.5 12.3 2.2 2.2 4.8-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case "close":
      return (
        <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true" {...props}>
          <path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5" strokeLinecap="round" />
        </svg>
      )
    case "kakao":
      return (
        <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" className={className} aria-hidden="true" {...props}>
          <path d="M12 4.5c-4.5 0-8.2 2.8-8.2 6.4 0 2.3 1.5 4.3 3.9 5.4l-.8 3.2c-.1.4.3.7.7.5l3.9-2.6c.2 0 .3 0 .5 0 4.5 0 8.2-2.8 8.2-6.5S16.5 4.5 12 4.5Z" />
        </svg>
      )
    case "linkedin":
      return (
        <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" className={className} aria-hidden="true" {...props}>
          <path d="M6.4 8.7a1.7 1.7 0 1 1 0-3.3 1.7 1.7 0 0 1 0 3.3ZM4.9 10h3V19h-3V10Zm4.8 0h2.9v1.3h.1c.4-.8 1.5-1.6 3-1.6 3.2 0 3.8 2.1 3.8 4.9V19h-3v-3.8c0-.9 0-2-1.3-2s-1.5 1-1.5 1.9V19h-3V10Z" />
        </svg>
      )
    case "heart":
      return (
        <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true" {...props}>
          <path d="M12 20.2 4.9 13.4a4.6 4.6 0 0 1 6.5-6.5L12 7.5l.6-.6a4.6 4.6 0 1 1 6.5 6.5L12 20.2Z" strokeLinejoin="round" />
        </svg>
      )
    case "heart-filled":
      return (
        <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" className={className} aria-hidden="true" {...props}>
          <path d="M12 20.7 4.4 13.3a5.1 5.1 0 0 1 7.2-7.2L12 6.5l.4-.4a5.1 5.1 0 0 1 7.2 7.2L12 20.7Z" />
        </svg>
      )
    case "reply":
      return (
        <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true" {...props}>
          <path d="m9.5 7.5-4 4 4 4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M5.5 11.5H14a4.5 4.5 0 0 1 4.5 4.5v.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case "edit":
      return (
        <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true" {...props}>
          <path d="m4.5 16.8-.8 3.7 3.7-.8L18 9a2.1 2.1 0 1 0-3-3L4.5 16.8Z" strokeLinejoin="round" />
          <path d="m13.8 7.2 3 3" strokeLinecap="round" />
        </svg>
      )
    case "trash":
      return (
        <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true" {...props}>
          <path d="M4.5 7.5h15M9.5 3.8h5l.7 1.7H19v1.6l-.9 11a1.5 1.5 0 0 1-1.5 1.4H7.4a1.5 1.5 0 0 1-1.5-1.4L5 7.1V5.5h3.8l.7-1.7Z" strokeLinejoin="round" />
          <path d="M10 10.5v5.5M14 10.5v5.5" strokeLinecap="round" />
        </svg>
      )
    case "copy":
      return (
        <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true" {...props}>
          <rect x="9" y="8" width="10" height="12" rx="2.2" />
          <path d="M6.8 16H6A2 2 0 0 1 4 14V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    default:
      return null
  }
}

export default AppIcon
