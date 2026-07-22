# Backend Logging Convention

핵심 상태 변경 유스케이스의 INFO 로그 규칙. prod 기본 레벨이 INFO이므로, 장애 조사에 필요한 완료 이벤트만 남긴다.

## 언제 남기는가

- 유스케이스 **완료 시점**에 info **1줄**만 남긴다.
- 진입(start) 로그는 남기지 않는다.
- 실패는 `ExceptionHandler` / 기존 예외 로깅 경로가 담당한다. 서비스에서 별도 error 로그를 만들지 않는다.

## 이벤트명과 포맷

- 이벤트명: `<domain>_<action>_completed` (snake_case)
- 메시지: 이벤트명 + `key=value` 공백 구분
- 예: `post_create_completed postId=42 actorId=7`

## 필수/선택 키

| 키 | 규칙 |
|---|---|
| 도메인 식별자 | 필수 (`postId`, `commentId`, `memberId`, `fileId`, `sessionId` 등) |
| `actorId` | 행위자가 있으면 필수. 자가 행위면 동일 id를 써도 된다 (`memberId`와 같음) |
| `requestId` | **넣지 않는다**. MDC로 자동 포함된다 |

## 금지

값 자체를 로그에 넣지 않는다. redaction에 기대지 않는다.

- 이메일
- 토큰 / API key / 세션 키
- 게시글·댓글 본문
- 원본 파일명
- 비밀번호 / 인증 코드

## 대상 유스케이스 (E9 / #1297)

| 서비스 | 이벤트 |
|---|---|
| `PostApplicationService` | `post_create_completed`, `post_update_completed`, `post_delete_completed` |
| `PostCommentApplicationService` | `post_comment_create_completed`, `post_comment_update_completed`, `post_comment_delete_completed` |
| `PostLikeApplicationService` | `post_like_completed`, `post_unlike_completed` |
| `MemberApplicationService` | `member_signup_completed` |
| `PrivacyRightsApplicationService` | `member_withdraw_completed` |
| `CloudFileService` | `cloud_file_upload_completed`, `cloud_file_delete_completed` |
| `CloudVideoUploadSessionService` | `cloud_video_session_create_completed`, `cloud_video_session_complete_completed`, `cloud_video_session_expire_completed` |

권한 변경(admin grant)은 현재 런타임 유스케이스 API가 없고 bootstrap 경로만 있어 대상에서 제외한다.

## Loki 조회 예시

```logql
{app="aquila-blog-back"} |= "post_create_completed"
```
