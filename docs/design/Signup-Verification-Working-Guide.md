# Signup Verification Working Guide

Last updated: 2026-03-12

## 목적

이 문서는 이메일 인증 기반 회원가입을 구현할 때 프론트/백엔드가 같은 전제를 보도록 만드는 로컬 작업 기준 문서다.

## 목표 흐름

1. 사용자가 로그인 모달 안에서 회원가입 진입
2. 이메일 입력
3. 백엔드가 인증 메일 발송
4. 메일 링크 클릭
5. 프론트가 verification token으로 인증 완료 API 호출
6. 백엔드가 최종 가입용 signup session token 발급
7. 프론트가 이메일 고정 상태로 최종 가입 폼 표시
8. 최종 가입 API로 username/password/nickname 등록

## 구현 원칙

- 로그인 식별자는 계속 `username`을 유지한다.
- 이메일은 가입 검증과 계정 식별에 사용하되, 로그인 식별자로 강제 전환하지 않는다.
- 인증 메일 링크 token과 최종 가입 token은 분리한다.
- 이메일 링크 token은 메일에서만 사용한다.
- 최종 가입 token은 프론트가 최종 가입 API 호출 시에만 사용한다.
- verification row는 추적 가능해야 하므로 DB 테이블로 둔다.

## 토큰 구조

- `emailVerificationToken`
  - 메일 링크 클릭용
  - 24시간 만료
- `signupSessionToken`
  - 이메일 검증 완료 후 최종 가입용
  - 비교적 짧은 TTL (권장 30분 ~ 2시간)

## 상태 모델

한 row는 아래 상태를 가진다.

- created
- verified
- consumed
- expired
- cancelled

구현은 enum 또는 timestamp 조합 중 하나로 단순하게 유지한다.

## 프론트 연결 기준

- 로그인 모달 하단 `회원가입` 클릭 -> 이메일 입력 단계 진입
- `AuthEntryModal`과 `/signup` 페이지 모두 같은 start API를 쓴다.
- 메일 전송 성공 후에는 즉시 전체 폼을 띄우지 않는다.
- 이메일 링크를 통해 들어왔을 때만 `/signup/verify` 최종 가입 폼 진입
- 최종 가입 폼에서 이메일은 읽기 전용으로 보인다.
- 가능하면 `next` 경로를 보존해서 가입 후 로그인까지 흐름이 이어지게 한다.

## 백엔드 구현 기준

필수 API:

- `POST /member/api/v1/signup/email/start`
- `GET /member/api/v1/signup/email/verify?token=...`
- `POST /member/api/v1/signup/complete`

현재 구현 파일:

- `front/src/components/auth/AuthEntryModal.tsx`
- `front/src/pages/signup.tsx`
- `front/src/pages/signup/verify.tsx`
- `back/src/main/kotlin/com/back/boundedContexts/member/subContexts/signupVerification/application/service/MemberSignupVerificationService.kt`

필수 저장소:

- signup verification token table

필수 인프라:

- mail sender port
- smtp adapter
- test profile용 fake mail sender

## 주의할 점

- verification token과 signup session token을 재사용하지 않는다.
- 이미 가입된 email이면 verification start 단계에서 막는다.
- username 중복은 최종 가입 단계에서 다시 검사한다.
- 링크 재클릭은 가능한 한 idempotent 하게 처리하되, consumed 이후에는 막는다.
