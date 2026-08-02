import type { CompanyIconName } from "src/routes/Company/CompanyPageModel"

/**
 * 회사 표면의 아이콘 세트.
 *
 * ## 정본(provenance)
 * 도형은 직접 그리지 않고 **Lucide**(https://lucide.dev) 아이콘을 골라 그대로 옮겨 적었다.
 * 실측 출처는 `lucide-static` **v1.28.0**의 `icons/<이름>.svg`이며(2026-08-03 unpkg에서 받음)
 * 아래 키는 그 파일 이름 그대로다 - 키를 보면 원본 아이콘을 바로 대조할 수 있다.
 *
 * 패키지를 의존성으로 추가하지 않는 이유는 번들이다. 이 표면이 쓰는 아이콘은 11개뿐이라
 * tree-shaking에 의존하는 런타임 의존성보다 선별 복사가 작고 예측 가능하다.
 *
 * ## 라이선스
 * Lucide는 ISC, 그중 Feather 유래 아이콘(이 파일의 `check`·`server`)은 MIT다. 두 고지를 함께
 * 남긴다(원문: https://github.com/lucide-icons/lucide/blob/main/LICENSE).
 *
 * > ISC License — Copyright (c) 2026 Lucide Icons and Contributors
 * >
 * > Permission to use, copy, modify, and/or distribute this software for any purpose with or
 * > without fee is hereby granted, provided that the above copyright notice and this permission
 * > notice appear in all copies.
 * >
 * > THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS
 * > SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL
 * > THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY
 * > DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF
 * > CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE
 * > OR PERFORMANCE OF THIS SOFTWARE.
 *
 * > MIT License (Feather 유래 아이콘) — Copyright (c) 2013-present Cole Bemis
 * >
 * > Permission is hereby granted, free of charge, to any person obtaining a copy of this software
 * > and associated documentation files (the "Software"), to deal in the Software without
 * > restriction, including without limitation the rights to use, copy, modify, merge, publish,
 * > distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the
 * > Software is furnished to do so, subject to the following conditions:
 * >
 * > The above copyright notice and this permission notice shall be included in all copies or
 * > substantial portions of the Software.
 * >
 * > THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING
 * > BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * > NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
 * > DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * > FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
const ICON_PATHS: Record<CompanyIconName, React.ReactNode> = {
  /** 접근성. 회사·제품 양쪽에서 접근성을 말하는 자리에 같은 아이콘을 쓴다. */
  accessibility: (
    <>
      <circle cx="16" cy="4" r="1" />
      <path d="m18 19 1-7-6 1" />
      <path d="m5 8 3-3 5.5 3-2.36 3.5" />
      <path d="M4.24 14.5a5 5 0 0 0 6.88 6" />
      <path d="M13.76 17.5a5 5 0 0 0-6.88-6" />
    </>
  ),
  /** 지도 위 지점 지정 = 노선도 한 화면에서 출발·경유·도착을 고르는 것. */
  "map-pinned": (
    <>
      <path d="M18 8c0 3.613-3.869 7.429-5.393 8.795a1 1 0 0 1-1.214 0C9.87 15.429 6 11.613 6 8a6 6 0 0 1 12 0" />
      <circle cx="12" cy="8" r="2" />
      <path d="M8.714 14h-3.71a1 1 0 0 0-.948.683l-2.004 6A1 1 0 0 0 3 22h18a1 1 0 0 0 .948-1.316l-2-6a1 1 0 0 0-.949-.684h-3.712" />
    </>
  ),
  /** 원본 문서 대조 통과 = 화면과 원본을 배포마다 맞춰 보는 검증. */
  "file-check-2": (
    <>
      <path d="M10.5 22H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v6" />
      <path d="M14 2v5a1 1 0 0 0 1 1h5" />
      <path d="m14 20 2 2 4-4" />
    </>
  ),
  /** 끊긴 연결 = 실시간이 끊겨도 멈추지 않는다는 사실. */
  "wifi-off": (
    <>
      <path d="M12 20h.01" />
      <path d="M8.5 16.429a5 5 0 0 1 7 0" />
      <path d="M5 12.859a10 10 0 0 1 5.17-2.69" />
      <path d="M19 12.859a10 10 0 0 0-2.007-1.523" />
      <path d="M2 8.82a15 15 0 0 1 4.177-2.643" />
      <path d="M22 8.82a15 15 0 0 0-11.288-3.764" />
      <path d="m2 2 20 20" />
    </>
  ),
  /** 서버 = 우리가 소유한 런타임에서 직접 운영한다. (Feather 유래 · MIT) */
  server: (
    <>
      <rect width="20" height="8" x="2" y="2" rx="2" ry="2" />
      <rect width="20" height="8" x="2" y="14" rx="2" ry="2" />
      <line x1="6" x2="6.01" y1="6" y2="6" />
      <line x1="6" x2="6.01" y1="18" y2="18" />
    </>
  ),
  /** 방패 + 확인 = 통과하지 않으면 배포하지 않는 품질 게이트. */
  "shield-check": (
    <>
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  /** 전동차 정면 = EasySubway. 타일 그리드의 대표 아이콘이다. */
  "train-front": (
    <>
      <path d="M8 3.1V7a4 4 0 0 0 8 0V3.1" />
      <path d="m9 15-1-1" />
      <path d="m15 15 1-1" />
      <path d="M9 19c-2.8 0-5-2.2-5-5v-4a8 8 0 0 1 16 0v4c0 2.8-2.2 5-5 5Z" />
      <path d="m8 19-2 3" />
      <path d="m16 19 2 3" />
    </>
  ),
  /** 노트 + 펜 = 기술 블로그. */
  "notebook-pen": (
    <>
      <path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4" />
      <path d="M2 6h4" />
      <path d="M2 10h4" />
      <path d="M2 14h4" />
      <path d="M2 18h4" />
      <path d="M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z" />
    </>
  ),
  /** 단계가 이어진 흐름 = 데이터 검증 파이프라인. */
  workflow: (
    <>
      <rect width="8" height="8" x="3" y="3" rx="2" />
      <path d="M7 11v4a2 2 0 0 0 2 2h4" />
      <rect width="8" height="8" x="13" y="13" rx="2" />
    </>
  ),
  /** 물리 저장 장치 = 우리가 들고 있는 자체 인프라. */
  "hard-drive": (
    <>
      <path d="M10 16h.01" />
      <path d="M2.212 11.577a2 2 0 0 0-.212.896V18a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5.527a2 2 0 0 0-.212-.896L18.55 5.11A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
      <path d="M21.946 12.013H2.054" />
      <path d="M6 16h.01" />
    </>
  ),
  /** 목록 항목 앞의 확인 표시. (Feather 유래 · MIT) */
  check: <path d="M20 6 9 17l-5-5" />,
}

type Props = {
  name: CompanyIconName
}

/**
 * 색은 `currentColor`라 카드·타일이 정한 톤을 그대로 따르고, 의미는 옆 텍스트가 전달하므로
 * 접근성 트리에서는 숨긴다.
 *
 * **크기와 획 두께는 소비하는 styled 컴포넌트가 CSS(`width`/`height`/`stroke-width`)로 정한다.**
 * 여기 attribute 값은 CSS가 없을 때의 기본값(Lucide 원본 24px · stroke 2)이다. 크기를 prop으로
 * 받지 않는 이유는 타일 아이콘이 타일 폭의 비율로 커져야 해서다 - px 숫자로는 열 수가 바뀌는
 * 구간에서 같은 밀도를 유지할 수 없다. `stroke-width`는 상속되는 SVG 속성이라 svg에 준 CSS 값이
 * 내부 path까지 그대로 내려간다(path에는 자기 stroke-width가 없다).
 */
const CompanyIcon: React.FC<Props> = ({ name }) => (
  <svg
    viewBox="0 0 24 24"
    width="24"
    height="24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    {ICON_PATHS[name]}
  </svg>
)

export default CompanyIcon
