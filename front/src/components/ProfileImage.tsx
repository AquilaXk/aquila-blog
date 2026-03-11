/* eslint-disable @next/next/no-img-element */
import React from "react"

type Props = React.ImgHTMLAttributes<HTMLImageElement> & {
  fillContainer?: boolean
  priority?: boolean
}

const ProfileImage: React.FC<Props> = ({
  fillContainer = false,
  priority = false,
  loading,
  alt,
  style,
  ...props
}) => (
  <img
    alt={alt}
    loading={loading || (priority ? "eager" : "lazy")}
    fetchPriority={priority ? "high" : "auto"}
    decoding={priority ? "sync" : "async"}
    draggable={false}
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

export default ProfileImage
