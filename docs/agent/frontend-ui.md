# Frontend UI Brief

- Next.js Pages Router
- 상세 canonical: `/posts/[id]`, legacy `/:slug`는 redirect only
- 관리자 경로: `/admin`, `/admin/profile`, `/admin/posts/new`, `/admin/tools`
- 관리자 서브페이지에 페이지 내부 로그아웃 버튼 금지
- 관리자 프로필의 Service/Contact 항목 편집은 `아이콘 선택`과 `표시 이름 입력`을 분리하고, 아이콘 패널은 짧은 고정폭 스크롤형으로 유지
- Service/Contact 링크는 빈 배열 저장을 허용한다(명시적으로 비웠다면 fallback를 강제로 다시 보여주지 않는다)
- 댓글은 평평한 리스트형, 답글은 깊이와 무관하게 한 칸만 들여쓰기
- 메인 피드 필터는 viewport가 아니라 중앙 컬럼 폭 기준으로 반응
- 카테고리 드롭다운은 `portal + fixed panel`, `min >= trigger`, `viewport-safe max-width`
