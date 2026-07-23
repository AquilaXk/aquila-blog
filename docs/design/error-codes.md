# Backend ErrorCode Registry

단일 레지스트리: `com.back.global.exception.application.ErrorCode`

- wire 포맷: `RsData { resultCode, msg, data? }` (변경 금지)
- `resultCode` = `{HttpStatus}-{n}`
- 두 번째 숫자 대역: `1–9` global/security, `10–19` post, `20–29` member/auth, `30–39` cloud/storage, `40–49` admin/system, `50+` reserved
- `kind`: `USER`(warn 1-line) / `DEVELOPER`(error + stack)
- `409-4`는 oauth signup policy 전용. 값/의미 변경 금지

## Codes

| code | status | kind | where used | user message |
|---|---|---|---|---|
| 400-1 | 400 | USER | validation / bad request 일반 | 잘못된 요청입니다. |
| 400-2 | 400 | USER | member/oauth signup 입력 검증 | 요청이 올바르지 않습니다. |
| 400-3 | 400 | USER | AuthIpSecurityVerifier IP 정보 부재 | IP 보안 정보를 확인할 수 없습니다. 잠시 후 다시 시도해주세요. |
| 401-1 | 401 | USER | Security entryPoint / 미인증 | 로그인 후 이용해주세요. |
| 401-2 | 401 | USER | AuthTokenExtractor Bearer 형식 | Authorization 헤더가 Bearer 형식이 아닙니다. |
| 401-4 | 401 | USER | email 미인증 로그인 | 이메일 인증이 완료되지 않았습니다. |
| 401-7 | 401 | USER | AuthIpSecurityVerifier IP 검증 실패 | IP 보안 검증에 실패했습니다. 다시 로그인해주세요. |
| 401-8 | 401 | USER | session/refresh 만료 | 세션이 만료되었습니다. 다시 로그인해주세요. |
| 403-1 | 403 | USER | Security AccessDenied only | 권한이 없습니다. |
| 403-2 | 403 | USER | ApiMutationCsrfGuardFilter Origin | 허용되지 않은 Origin의 요청입니다. |
| 403-3 | 403 | USER | ApiMutationCsrfGuardFilter CSRF preflight | CSRF preflight 헤더가 필요합니다. |
| 403-4 | 403 | USER | OAuth signup required (failure handler) | 소셜 로그인 신규 가입은 현재 지원하지 않습니다. |
| 403-10 | 403 | USER | PostHasPolicy edit denied | 작성자만 글을 수정할 수 있습니다. |
| 403-11 | 403 | USER | PostHasPolicy view denied | 글 조회권한이 없습니다. |
| 403-12 | 403 | USER | PostHasPolicy delete denied | 작성자만 글을 삭제할 수 있습니다. |
| 403-13 | 403 | USER | PostCommentHasPolicy edit denied | 작성자만 댓글을 수정할 수 있습니다. |
| 403-14 | 403 | USER | PostCommentHasPolicy delete denied | 작성자만 댓글을 삭제할 수 있습니다. |
| 403-30 | 403 | USER | CloudExternalPlaybackTokenService | 외부 재생 token이 올바르지 않거나 만료되었습니다. |
| 404-1 | 404 | USER | 일반 not found / ExceptionHandler | 해당 데이터가 존재하지 않습니다. |
| 404-2 | 404 | USER | member/oauth signup session not found | 유효하지 않은 세션입니다. |
| 409-1 | 409 | USER | DB integrity / optimistic lock only | 동시에 처리된 요청 충돌이 발생했습니다. 잠시 후 다시 시도해주세요. |
| 409-2 | 409 | USER | resource conflict (email 등) | 이미 사용 중인 리소스입니다. |
| 409-3 | 409 | USER | member signup race | 동시에 처리된 회원가입 요청입니다. 다시 시도해주세요. |
| 409-4 | 409 | USER | oauth signup policy (front depends) | 약관 또는 개인정보처리방침이 변경되었습니다. 최신 내용을 확인하고 다시 동의해주세요. |
| 409-10 | 409 | USER | PostApplicationService concurrent edit | 다른 세션에서 이미 수정되었습니다. 최신 글을 다시 불러온 뒤 수정해주세요. |
| 409-20 | 409 | USER | MemberApplicationService duplicate | 이미 존재하는 회원 아이디입니다. |
| 409-21 | 409 | USER | withdrawn member / privacy delete | 이미 탈퇴 처리된 계정입니다. |
| 409-30 | 409 | USER | cloud upload session conflict | 대용량 업로드 세션 상태가 변경되었습니다. |
| 410-1 | 410 | USER | gone (oauth pending session 등) | 요청한 리소스가 더 이상 유효하지 않습니다. |
| 413-1 | 413 | USER | upload payload too large | 업로드 가능한 파일 용량을 초과했습니다. 허용 크기 이내 파일로 다시 시도해주세요. |
| 429-1 | 429 | USER | login rate limit | 로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요. |
| 429-2 | 429 | USER | signup rate limit | 이메일 인증 요청이 너무 많습니다. 잠시 후 다시 시도해주세요. |
| 429-10 | 429 | USER | ApiRateLimitBackstopFilter | 요청이 너무 많습니다. |
| 500-1 | 500 | DEVELOPER | unexpected / storage internal | 서버 내부 오류가 발생했습니다. 잠시 후 다시 시도해주세요. |
| 500-2 | 500 | DEVELOPER | member username generate failed | 회원가입 사용자 식별자 생성에 실패했습니다. |
| 503-1 | 503 | USER | service unavailable / runtime boundary | 서비스를 일시적으로 사용할 수 없습니다. 잠시 후 다시 시도해주세요. |
| 503-2 | 503 | DEVELOPER | dependency not ready | 보호 시스템이 준비되지 않았습니다. 잠시 후 다시 시도해주세요. |
| 503-3 | 503 | DEVELOPER | signup protection not ready | 회원가입 보호 시스템이 준비되지 않았습니다. 잠시 후 다시 시도해주세요. |
| 503-4 | 503 | DEVELOPER | ApiRateLimitBackstopFilter redis 미준비 | API 보호 시스템이 준비되지 않았습니다. |
| 503-5 | 503 | USER | signup not launched | 회원가입은 출시 준비 중입니다. |

## Add a new code (3 steps)

1. 대역을 확인한 뒤 `ErrorCode` enum에 `code/status/defaultUserMessage/kind`를 추가한다. (prefix digits는 `status.value()`와 일치해야 한다)
2. 이 문서 표에 같은 행을 추가한다.
3. throw/response 생성은 `AppException(ErrorCode.…)`, `RsData.fail(ErrorCode.…)`, `ErrorCode.toRsData()`만 사용한다. 문자열 `AppException("…")` 금지.
