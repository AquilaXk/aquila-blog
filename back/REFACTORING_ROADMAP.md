# Backend Refactoring Roadmap & Plan

## 1. Background
- Current architecture has clear bounded contexts (`member`, `post`, `global`) and decent test coverage.
- Main structural risk is domain-to-infrastructure coupling through global mutable repository references in domain entities/mixins.
- Recent fixes stabilized tests, but they are tactical. A strategic refactor is needed for maintainability and correctness.

## 2. Refactoring Goals
1. Remove global mutable repository wiring from domain models.
2. Restore clear layering: `domain` (pure rules) -> `application` (use case orchestration) -> `infrastructure` (repository/query/event adapters).
3. Reduce hidden side effects and transactional ambiguity.
4. Keep behavior backward compatible for existing APIs and tests.

## 3. Target Architecture
- Domain layer:
  - Entities/VOs/domain services contain business rules only.
  - No direct Spring repository access.
  - No static mutable state for persistence objects.
- Application layer:
  - Facades/use-case services load/save aggregates and coordinate transactional flow.
  - Domain events emitted from domain/application; publishing handled in application/infrastructure.
- Infrastructure layer:
  - Repository implementations, QueryDSL, external integrations (OAuth2, storage, Redis).

## 4. Scope
- In scope:
  - `member` + `post` domain/app layers, related mixins, attribute counters, repository access paths.
  - Supporting base entity equality/new-state semantics.
- Out of scope (phase 1):
  - API contract changes.
  - Full package rename or module split.
  - DB schema redesign beyond minimal compatibility changes.

## 5. Roadmap (Phased)

## Phase 0: Safety Net (0.5~1 day)
- Freeze baseline:
  - Capture full `clean test --no-daemon` green run in CI.
  - Add architecture guard tests (or ArchUnit-like checks) for forbidden dependencies:
    - `domain` must not depend on `out` repositories.
- Deliverables:
  - Baseline test report
  - Initial architecture constraints test

## Phase 1: Remove Static Repository Coupling (2~3 days)
- Refactor targets:
  - `Member` companion repository usage
  - `Post` companion repository usage
  - Mixins (`PostMember`, `PostHasComments`, `MemberHasProfileImgUrl`) that currently persist directly
- Approach:
  - Move persistence operations to application services (`MemberFacade`, `PostFacade`) and dedicated domain/application helper services.
  - Domain methods return intent/state change only.
- Deliverables:
  - No repository references in domain entities/mixins
  - Delete `syncDomainRepositories()` workaround
  - Existing tests green

## Phase 2: Aggregate Operation Recomposition (2~3 days)
- Split use cases explicitly:
  - `WritePost`, `WriteComment`, `ToggleLike`, `JoinMember`, `ModifyMember` service methods/components
- Ensure each use case:
  - Loads aggregate roots through repository
  - Executes domain logic
  - Persists in a clear transactional boundary
- Deliverables:
  - Smaller cohesive application services
  - Reduced method complexity in facades

## Phase 3: Domain Model Hardening (1~2 days)
- Fix entity identity/equality semantics:
  - Avoid treating multiple transient entities as equal (`id == 0` issue).
- Normalize id generation annotations:
  - Align `@SequenceGenerator(name=...)` and `@GeneratedValue(generator=...)`.
- Deliverables:
  - Deterministic entity equality behavior
  - Stable id generation configuration

## Phase 4: Kotlin-Style & Maintainability Pass (1~2 days)
- Improve Kotlin idioms:
  - Reduce nullable side-effect patterns where not required.
  - Replace mutable/global patterns with explicit constructor dependencies.
  - Clarify naming for intent-driven methods.
- Deliverables:
  - Style-aligned code with lower incidental complexity
  - Updated developer guide notes

## Phase 5: Performance/Optimization Validation (1 day)
- Validate no regression:
  - Query counts for key endpoints (post list/detail/comment/like, member auth flows).
  - Check indexes and QueryDSL query plans remain effective.
- Deliverables:
  - Before/after perf sanity report
  - Any targeted optimization patch if needed

## 6. Detailed Execution Plan (Sprint-ready)

## Sprint A (Week 1)
1. Add architecture constraints test.
2. Refactor `member` path first:
   - Move `profileImgUrl`, `postsCount`, `postCommentsCount` persistence writes to app layer.
3. Refactor `post` path:
   - `addComment/deleteComment/toggleLike` persistence orchestration to app layer.
4. Remove static repository fields from domain classes.
5. Run full regression tests.

## Sprint B (Week 2)
1. Decompose large facades into use-case services.
2. Fix entity equality/id generator consistency.
3. Kotlin-style cleanup pass.
4. Performance validation and docs update.

## 7. Risk Management
- Risk: behavior drift in comment/like/count updates.
  - Mitigation: add focused tests for counter consistency and transactional rollback cases.
- Risk: hidden dependency on static repository state in untested paths.
  - Mitigation: temporarily add runtime assertions detecting domain->repository direct access.
- Risk: refactor fatigue from broad changes.
  - Mitigation: vertical slicing (member first, then post), merge in small PRs.

## 8. Validation Checklist (Definition of Done)
- [ ] Domain packages have no direct repository dependency.
- [ ] No global mutable repository state in domain entities.
- [ ] Full backend tests pass (`./gradlew clean test --no-daemon`).
- [ ] Key API integration tests pass for member/post/comment/like.
- [ ] Query/performance sanity check completed.
- [ ] Refactoring decisions documented (short ADRs recommended).

## 9. Recommended PR Strategy
1. PR-1: Architecture constraints + safety tests only.
2. PR-2: Member domain decoupling.
3. PR-3: Post domain decoupling.
4. PR-4: Equality/id generator hardening.
5. PR-5: Kotlin-style cleanup + docs/perf checks.

This sequence minimizes blast radius and keeps each review focused.
