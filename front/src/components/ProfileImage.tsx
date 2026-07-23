/* eslint-disable @next/next/no-img-element */
import React from "react"

type Props = React.ImgHTMLAttributes<HTMLImageElement> & {
  fallbackSrc?: string
  fillContainer?: boolean
  priority?: boolean
}

const ProfileImage: React.FC<Props> = ({
  fallbackSrc,
  fillContainer = false,
  priority = false,
  loading,
  alt,
  onError,
  src,
  style,
  ...props
}) => {
  const requestedSrc = src || fallbackSrc
  const fallbackAttemptKey = typeof requestedSrc === "string" ? requestedSrc : fallbackSrc
  const [resolvedSrc, setResolvedSrc] = React.useState(requestedSrc)
  const fallbackAttemptSourceRef = React.useRef<string | undefined>(undefined)

  React.useEffect(() => {
    fallbackAttemptSourceRef.current = undefined
    setResolvedSrc(requestedSrc)
  }, [requestedSrc])

  const handleImageError: React.ReactEventHandler<HTMLImageElement> = (event) => {
    onError?.(event)

    if (!fallbackSrc || fallbackAttemptSourceRef.current === fallbackAttemptKey) return

    // Keep persisted broken profile URLs from leaving the UI with alt text only.
    fallbackAttemptSourceRef.current = fallbackAttemptKey
    setResolvedSrc(fallbackSrc)
  }

  return (
    <img
      alt={alt}
      src={resolvedSrc}
      loading={loading || (priority ? "eager" : "lazy")}
      {...({ fetchpriority: priority ? "high" : "auto" } as Record<string, string>)}
      decoding={priority ? "sync" : "async"}
      draggable={false}
      onError={handleImageError}
      style={{
        display: "block",
        objectFit: "cover",
        objectPosition: "center 38%",
        ...(fillContainer
          ? {
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
            }
          : {}),
        ...style,
      }}
      {...props}
    />
  )
}

export default ProfileImage
