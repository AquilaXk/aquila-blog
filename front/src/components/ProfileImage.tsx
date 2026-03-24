/* eslint-disable @next/next/no-img-element */
import Head from "next/head"
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
}) => {
  const preloadHref =
    priority && typeof props.src === "string" && props.src.trim() && !props.src.startsWith("data:")
      ? props.src
      : null

  return (
    <>
      {preloadHref ? (
        <Head>
          <link key={`profile-image-preload:${preloadHref}`} rel="preload" as="image" href={preloadHref} />
        </Head>
      ) : null}
      <img
        alt={alt}
        loading={loading || (priority ? "eager" : "lazy")}
        {...({ fetchpriority: priority ? "high" : "auto" } as Record<string, string>)}
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
    </>
  )
}

export default ProfileImage
