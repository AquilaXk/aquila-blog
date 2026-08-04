type Props = {
  className?: string
  priority?: boolean
}

/**
 * 회사 브랜드 마크. 블로그 헤더·관리자 shell·회사 표면이 같은 자산을 쓴다 - 마크는 표면별 장식이
 * 아니라 회사 정체성이므로 소비처마다 다른 파일을 두지 않는다.
 *
 * 자산은 256px 래스터(`/brand-mascot.png`)다. 가장 큰 소비처 슬롯이 36px라 한 장으로 7x DPR까지
 * 덮고, 크기별 사본을 두면 마크를 바꿀 때 갱신해야 할 파일만 늘어난다.
 */
const BrandMark: React.FC<Props> = ({ className, priority = false }) => {
  return (
    <span className={className} aria-hidden="true">
      {/* Hot path icon: keep native img to avoid next/image runtime cost in shared header bundle. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand-mascot.png"
        alt=""
        width={256}
        height={256}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        draggable={false}
        style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
      />
    </span>
  )
}

export default BrandMark
