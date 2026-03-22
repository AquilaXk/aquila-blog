# Documentation Guide

## Read This First

- 이 문서는 사람용 문서 인덱스다.
- AI 에이전트 기본 진입점은 이 문서가 아니다.
- 에이전트는 `AGENTS.md` -> [Agent Context](AGENT-CONTEXT.md) -> `docs/agent/*.md` 브리프 순서를 따른다.

## Quick Start (For Humans)

1. 저장소 개요: `../README.md`
2. 전체 구조: [System Architecture](design/System-Architecture.md)
3. 운영/배포: [Infrastructure Architecture](design/Infrastructure-Architecture.md), [DevOps](design/DevOps.md)
4. 실무 점검 순서: [Session Handoff](session-handoff.md)

## Reading Path

```mermaid
flowchart LR
    A["README"] --> B["System Architecture"]
    B --> C["Domain Design"]
    C --> D["Infrastructure / DevOps"]
    D --> E["Session Handoff"]
```

## 1) Architecture

| 문서 | 목적 |
| --- | --- |
| [System Architecture](design/System-Architecture.md) | 시스템 전체 흐름과 인터페이스 경계 |
| [Domain Design](design/Domain-Design.md) | 도메인 모델/규칙과 bounded context |
| [Database Design](design/Database-Design.md) | 저장소 구조와 데이터 설계 |
| [Package Structure](design/package-structure.md) | 코드베이스 구조 및 네이밍 규칙 |

## 2) Delivery & Operations

| 문서 | 목적 |
| --- | --- |
| [Infrastructure Architecture](design/Infrastructure-Architecture.md) | 홈서버 + Vercel 하이브리드 운영 구조 |
| [DevOps](design/DevOps.md) | CI/CD, blue/green 배포, 품질 게이트 |
| [Git Workflow](design/Git-Workflow.md) | 브랜치/검증/릴리즈 흐름 |
| [Session Handoff](session-handoff.md) | 운영 장애 트리아지 체크리스트 |

## 3) Frontend Guides

| 문서 | 목적 |
| --- | --- |
| [Frontend Working Guide](design/Frontend-Working-Guide.md) | 화면/UX 수정 기준 |
| [Frontend Working Guide Compact](design/Frontend-Working-Guide.compact.md) | 프론트 작업용 축약판 |
| [Frontend Performance Guide](design/Frontend-Performance-Guide.md) | 번들/하이드레이션/렌더 성능 기준 |
| [Frontend Component Specs](design/Frontend-Component-Specs.md) | 컴포넌트 계약 및 동작 규칙 |
| [Frontend UI Tokens](design/Frontend-UI-Tokens.md) | 디자인 토큰/스타일 시스템 |

## 4) Auth & Signup Guides

| 문서 | 목적 |
| --- | --- |
| [Backend Auth Member Guide](design/Backend-Auth-Member-Guide.md) | 인증/회원 백엔드 설계 |
| [Backend Auth Member Guide Compact](design/Backend-Auth-Member-Guide.compact.md) | 인증/회원 축약판 |
| [Signup Verification Working Guide](design/Signup-Verification-Working-Guide.md) | 이메일 인증 가입 흐름 |

## 5) Policies & Plans

| 문서 | 목적 |
| --- | --- |
| [Flyway Test Baseline Policy](design/Flyway-Test-Baseline-Policy.md) | 마이그레이션/테스트 데이터 기준 |
| [SW Connect Service Plan](design/sw-connect-service-plan.md) | 서비스 연동 계획/제약 |

## Notes

- 문서는 코드와 함께 유지한다. 문서-코드 불일치는 버그로 본다.
- 새 기능을 도입하면 해당 카테고리 문서를 갱신하고 이 인덱스에도 링크를 추가한다.
