type Props = {
  className?: string
  priority?: boolean
}

/**
 * 회사 브랜드 마크. 블로그 헤더·관리자 shell·회사 표면이 같은 자산을 쓴다 - 마크는 표면별 장식이
 * 아니라 회사 정체성이므로 소비처마다 다른 파일을 두지 않는다.
 *
 * 자산은 벡터(`/brand-mascot.svg`)다. 이 마크는 34~36px 헤더부터 footer 원판까지 여러 크기로 나가고
 * 앞으로 더 큰 자리에도 쓰이므로, 래스터 사본을 크기마다 만들지 않고 한 장으로 모든 배율을 덮는다.
 */
const BrandMark: React.FC<Props> = ({ className, priority = false }) => {
  return (
    <span className={className} aria-hidden="true">
      {/* Hot path icon: keep native img to avoid next/image runtime cost in shared header bundle. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand-mascot.svg"
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
