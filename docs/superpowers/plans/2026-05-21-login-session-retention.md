# Login Session Retention Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development while implementing. This plan is the source of truth for issue, scope, verification, and commit mapping.

**Goal:** Close #285 by bounding active member sessions and adding retention cleanup for authentication security events.

**Architecture:** Enforce an account-level active session cap immediately after creating a refresh-token-backed session, using a bulk repository update that keeps the most recent active sessions. Add a worker-only scheduled cleanup path for old `auth_security_event` rows so repeated login events do not grow without a retention boundary.

**Tech Stack:** Kotlin, Spring Boot, Spring Data JPA, Flyway SQL, ShedLock, JUnit 5, AssertJ.

---

## 문제
- 운영 DB에서 반복 `/member/api/v1/auth/login` 호출이 하루 약 3,000회 수준으로 쌓이며 단일 회원의 활성 `member_session`이 146k+까지 누적된다.
- `auth_security_event`도 `LOGIN_POLICY_APPLIED` 이벤트가 153k+ 누적되어 로그인 보안 관측성이 자동화 트래픽에 묻힌다.

## issue
- `#285`

## pr
- 생성 전

## repro
- `ssh aquila-home` 후 `blog_home-db_1-1/blog_prod`에서 `member_session where revoked_at is null`과 `auth_security_event where request_path='/member/api/v1/auth/login'`를 집계하면 반복 로그인 누적이 재현된다.

## done_when
- 새 로그인 세션 생성 후 계정별 활성 세션이 `custom.auth.session.maxActivePerMember` 이내로 유지된다.
- 오래된 `auth_security_event`는 `custom.auth.securityEvent.retentionDays`와 batch size 기준으로 worker cleanup에서 제거된다.
- 단위 테스트, ktlint, 백엔드 관련 테스트, 전체 백엔드 테스트가 통과한다.

## allow
- `back/src/main/kotlin/com/back/boundedContexts/member/subContexts/session/**`
- `back/src/main/kotlin/com/back/global/security/**`
- `back/src/main/resources/application*.yaml`
- `back/src/main/resources/db/migration/R__operational_indexes.sql`
- `back/src/test/kotlin/com/back/boundedContexts/member/subContexts/session/**`
- `back/src/test/kotlin/com/back/global/security/**`
- `docs/superpowers/plans/2026-05-21-login-session-retention.md`

## deny
- frontend, deploy workflow, unrelated auth API contract, unrelated open issues #286/#287

## verify
- `./gradlew -p back test --tests com.back.boundedContexts.member.subContexts.session.application.service.MemberSessionServiceTest`
- `./gradlew -p back test --tests com.back.global.security.application.AuthSecurityEventServiceTest`
- `./gradlew -p back ktlintCheck`
- `./gradlew -p back test`
- PR CI check

## commit_plan
1. `fix(auth): 로그인 세션 보존 정책 추가`
   - 기능 단위 1개: 활성 세션 상한, 보안 이벤트 retention, 운영 인덱스, 관련 테스트를 함께 반영한다.
