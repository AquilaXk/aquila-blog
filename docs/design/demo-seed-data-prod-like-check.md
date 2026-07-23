# Demo Seed Data Prod-Like Check

## 목적

#1188 정책에 따라 demo seed 회원과 게시글은 `local`, `dev`, `test` profile에서 `custom.bootstrap.seed-demo-data-enabled=true`일 때만 생성되어야 한다. `staging`, `preview`, `qa`, `release*`, `prod*` profile이나 외부에 노출되는 운영 유사 DB에서는 아래 흔적이 없어야 한다.

## 배포 전 설정 점검

- `CUSTOM__BOOTSTRAP__SEED_DEMO_DATA_ENABLED`는 운영 유사 환경에서 설정하지 않거나 `false`로 둔다.
- backend active profile에 `staging`, `preview`, `qa`, `release*`, `prod*`가 포함되면 demo seed bean은 flag가 `true`여도 로드되지 않아야 한다.
- CI release gate는 `.github/workflows`, `deploy`, production application config에 `admin@test.com`, `user*@test.com`, `"1234"`, `제목 1`, `비공개 글` 같은 demo seed 흔적이 들어오면 실패해야 한다.

## 기존 데이터 점검 Query

운영 유사 DB에서 실제 schema/table 명을 확인한 뒤 실행한다. 기본 JPA table 명은 `member`, `post`다.

```sql
select id, email, login_id, nickname, is_admin
from member
where email in ('system@test.com', 'holding@test.com', 'admin@test.com', 'user1@test.com', 'user2@test.com', 'user3@test.com')
   or login_id in ('system', 'holding', 'admin', 'user1', 'user2', 'user3');

select id, title, published, listed, author_id
from post
where title in ('제목 1', '제목 2', '제목 3', '비공개 글')
   or content in ('내용 1', '내용 2', '내용 3', '비공개 내용');
```

## 발견 시 정리 원칙

- 외부 노출 계정이면 먼저 password/session/api key를 폐기하고 admin 권한을 제거한다.
- demo 게시글은 운영자가 소유권과 노출 여부를 확인한 뒤 삭제 또는 비공개 전환한다.
- 실제 이용자가 같은 email/title을 정당하게 사용 중이면 자동 삭제하지 말고 issue에 증거와 판단을 남긴다.
- 정리 후 위 query를 재실행해 0건 또는 승인된 예외만 남는지 기록한다.
