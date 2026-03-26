import Image from "next/image"

type Props = {
  className?: string
  priority?: boolean
  sizes?: string
}

const BrandMark: React.FC<Props> = ({ className, priority = false, sizes = "28px" }) => {
  return (
    <span className={className} aria-hidden="true">
      <Image
        src="/brand-mascot.png"
        alt=""
        width={96}
        height={96}
        priority={priority}
        sizes={sizes}
        draggable={false}
        style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
      />
    </span>
  )
}

export default BrandMark
