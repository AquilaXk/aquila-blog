export const variables = {
  breakpoint: 960,
  headerHeight: 60,
  paddingLg: 24,
  paddingMd: 20,
  widthLg: 1480,
  widthMd: 1280,
  navControl: {
    height: 40,
    radius: 10,
    fontSize: 0.96,
  },
  ui: {
    card: {
      radius: 8,
      radiusLg: 16,
      borderWidth: 1,
      padding: 16,
      paddingLg: 20,
      shadow: "0 8px 20px rgba(0, 0, 0, 0.18)",
      shadowHover: "0 14px 28px rgba(0, 0, 0, 0.24)",
      /**
       * 랜딩 표면의 플로팅 시각 요소(hero 스크린샷 카드, 폰 목업 패널) 전용 그림자.
       * 카드 목록에 쓰는 `shadow`보다 훨씬 옅고 넓다 - 면을 띄우는 것이 목적이고 카드를 구획하는
       * 것이 목적이 아니다. 그림자는 그 두 용도에만 쓴다.
       */
      shadowFloating: "0 24px 48px rgba(0, 0, 0, 0.08)",
      shadowFloatingDark: "0 28px 56px rgba(0, 0, 0, 0.45)",
    },
    button: {
      radius: 10,
      radiusPill: 999,
      minHeight: 44,
      minHeightSm: 36,
      fontSize: 0.93,
    },
    field: {
      radius: 12,
      minHeight: 44,
      fontSize: 0.95,
    },
  },
}
