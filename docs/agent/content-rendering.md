# Content Rendering Brief

- `<aside>...</aside>`는 콜아웃으로 변환
- marker 매핑: `ℹ️ Information`, `💡 Tip`, `⚠️ Warning`, `📋 개요`, `✅ 정답`, `📚 정리`
- marker 다음 첫 `**제목**` 또는 heading은 콜아웃 헤더로 승격
- 코드블럭은 IDE형 패널: 상단 chrome, 언어 라벨, 줄번호, 우하단 복사 액션
- 코드 하이라이팅은 `rehype-pretty-code + Shiki`를 기본으로 사용한다 (클라이언트 후처리 금지)
- Mermaid는 GitHub 유사 프리셋으로 렌더한다(`light=neutral`, `dark=dark`)
- Mermaid 컨테이너에 gradient/그림자/과한 배경 효과를 넣지 않는다
