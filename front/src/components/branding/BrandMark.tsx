type Props = {
  className?: string
  priority?: boolean
}

const BrandMark: React.FC<Props> = ({ className, priority = false }) => {
  return (
    <span className={className} aria-hidden="true">
      {/* Hot path icon: keep native img to avoid next/image runtime cost in shared header bundle. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand-mascot.png"
        alt=""
        width={96}
        height={96}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        draggable={false}
        style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
      />
    </span>
  )
}

export default BrandMark
