# Cross-Repository Issue Map

## Status

이 문서는 Platform과 Web 사이의 공개 소유권 및 교차 저장소 이슈 관계를 기록한다. 문서 반영을 소유한 [Platform #1466](https://github.com/AquilaXk/aquila-blog/issues/1466)은 [Platform #1465](https://github.com/AquilaXk/aquila-blog/issues/1465)의 Platform 내 Web 소스 제거, 배포 검증, 최근 교차 저장소 PR의 close ownership 최종 감사가 끝날 때까지 열린 상태를 유지한다.

## Repository Ownership

- [Platform repository](https://github.com/AquilaXk/aquila-blog)는 API, data, DB migration, worker와 운영, home-server deployment, canonical public contract export, Web image deployment consumption을 소유한다.
- [Web repository](https://github.com/AquilaXk/aquila-blog-web)는 Next.js source, Web tests, public legal policy publication, imported Platform contract lock, frontend image build와 publication을 소유한다.
- Platform에서 Web으로 전달하는 public API contract는 source repository, 40자리 source commit SHA, 각 artifact의 SHA-256으로 식별한다.
- Web에서 Platform으로 전달하는 legal identity는 source repository, 40자리 source commit SHA, manifest 및 policy artifact의 SHA-256으로 식별한다.
- Web에서 Platform으로 전달하는 frontend release는 source repository, 40자리 source commit SHA, immutable image digest로 식별한다.
- 교차 저장소 전달에는 위 immutable identity를 대신하는 대체 입력이나 fallback이 없다.

## Active Cross-Repository Relationships

| Platform owner | Web counterpart | Ownership boundary |
|---|---|---|
| [Platform #1493](https://github.com/AquilaXk/aquila-blog/issues/1493), [Platform #1520](https://github.com/AquilaXk/aquila-blog/issues/1520), [Platform #1521](https://github.com/AquilaXk/aquila-blog/issues/1521) | [Web #35](https://github.com/AquilaXk/aquila-blog-web/issues/35) | Platform은 canonical summary resolver, backfill, export를 소유하고 Web은 editor·public surface와 imported fixture를 소유한다. |
| [Platform #1498](https://github.com/AquilaXk/aquila-blog/issues/1498) | [Web #35](https://github.com/AquilaXk/aquila-blog-web/issues/35), [Web #40](https://github.com/AquilaXk/aquila-blog-web/issues/40) | Platform은 AI 관련 environment, deployment, processor 제거를 소유하고 Web은 active AI/Gemini reference 제거와 검증을 소유한다. |
| [Platform #1593](https://github.com/AquilaXk/aquila-blog/issues/1593) | [Web #43](https://github.com/AquilaXk/aquila-blog-web/issues/43) | Platform은 OpenAPI canonical export를 소유하고 Web은 imported lock, runtime consumer, live fixture를 소유한다. |
| [Platform #1600](https://github.com/AquilaXk/aquila-blog/issues/1600) | [Web #40](https://github.com/AquilaXk/aquila-blog-web/issues/40) | Platform은 processor approval과 acceptance metadata를 소유하고 Web은 versioned public policy publication을 소유한다. |
| [Platform #1602](https://github.com/AquilaXk/aquila-blog/issues/1602), [Platform #1603](https://github.com/AquilaXk/aquila-blog/issues/1603) | [Web #39](https://github.com/AquilaXk/aquila-blog-web/issues/39) | Platform은 alert와 deployment dispatch source를 소유하고 Web은 live Playwright verification을 소유한다. |
| [Platform #1636](https://github.com/AquilaXk/aquila-blog/issues/1636) | [Web #44](https://github.com/AquilaXk/aquila-blog-web/issues/44) | Platform은 upload quarantine, scan, clean/active/public media contract를 소유하고 Web은 external-image authoring, rendering, privacy와 network policy를 소유한다. |
| [Platform #1639](https://github.com/AquilaXk/aquila-blog/issues/1639) | [Web #45](https://github.com/AquilaXk/aquila-blog-web/issues/45) | Platform은 sanitizer policy, persisted trust, revalidation, data cleanup을 소유하고 Web은 imported trust consumption, unknown-state failure, legacy renderer removal을 소유한다. |
| [Platform #1637](https://github.com/AquilaXk/aquila-blog/issues/1637) | [Web #47](https://github.com/AquilaXk/aquila-blog-web/issues/47) | Platform은 append-only audit ledger, actor, idempotency, result를 소유하고 Web은 reason, operation ID, terminal result, history UI를 소유한다. |
| [Platform #1642](https://github.com/AquilaXk/aquila-blog/issues/1642) | [Web #38](https://github.com/AquilaXk/aquila-blog-web/issues/38) | Platform은 backend artifact production과 backend/Web deploy attestation verification을 소유하고 Web은 image SBOM, provenance, scan attestation production을 소유한다. |
| [Platform #1638](https://github.com/AquilaXk/aquila-blog/issues/1638), [Platform #1641](https://github.com/AquilaXk/aquila-blog/issues/1641) | [Web #46](https://github.com/AquilaXk/aquila-blog-web/issues/46) | Platform은 central redaction, retention, SLI/SLO, burn과 release policy를 소유하고 Web은 Node·SSR metrics와 trace production을 소유한다. |

## Completed And Moved Lookup

전체 original-to-counterpart relocation 및 상태 표의 정본은 [Web #20](https://github.com/AquilaXk/aquila-blog-web/issues/20)이다.

- [Platform #1217](https://github.com/AquilaXk/aquila-blog/issues/1217)의 Web 잔여 책임은 [Web #21](https://github.com/AquilaXk/aquila-blog-web/issues/21)로 이동했다.
- [Platform #1497](https://github.com/AquilaXk/aquila-blog/issues/1497)의 Web 잔여 책임은 [Web #35](https://github.com/AquilaXk/aquila-blog-web/issues/35)로 이동했고, Platform 책임은 Platform 이슈에 유지된다.
- [Platform #1475](https://github.com/AquilaXk/aquila-blog/issues/1475)의 rename 후속은 [Platform PR #1526](https://github.com/AquilaXk/aquila-blog/pull/1526)에서 완료되어 Platform history로 유지된다.
- [Platform #1256](https://github.com/AquilaXk/aquila-blog/issues/1256)과 [Platform #1288](https://github.com/AquilaXk/aquila-blog/issues/1288)은 하위 구현 완료 후 종료됐다.
- [Platform #1542](https://github.com/AquilaXk/aquila-blog/issues/1542)의 hosting cleanup은 [Platform PR #1598](https://github.com/AquilaXk/aquila-blog/pull/1598)에서 완료됐다.
- [Platform #1530](https://github.com/AquilaXk/aquila-blog/issues/1530)은 Web root 분리로 전제가 사라져 종료됐다.
- [Platform #1574](https://github.com/AquilaXk/aquila-blog/issues/1574)의 deployment failure 책임은 [Platform #1620](https://github.com/AquilaXk/aquila-blog/issues/1620)에 흡수됐다.
- Web issue governance 정합화는 [Web #42](https://github.com/AquilaXk/aquila-blog-web/issues/42)와 [Web PR #49](https://github.com/AquilaXk/aquila-blog-web/pull/49)에서 완료됐다.

## Close Ownership

- Platform implementation PR은 자기 Platform issue만 `Closes`하고 Web counterpart는 `Depends on` 또는 `Part of`와 상대 이슈의 전체 URL로 연결한다.
- Web implementation PR은 자기 Web issue만 `Closes`하고 Platform counterpart는 `Depends on` 또는 `Part of`와 상대 이슈의 전체 URL로 연결한다.
- 한 저장소의 PR은 상대 저장소 issue의 close ownership을 갖지 않는다.
