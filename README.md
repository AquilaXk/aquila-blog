# p-14141-1

Kotlin + Spring Boot + Next.js 풀스택 프로젝트.

---

## 구성

| 폴더 | 역할 | 문서 |
|------|------|------|
| `back/` | Kotlin + Spring Boot API 서버 | [back/README.md](back/README.md) |
| `front/` | Next.js 클라이언트 | [front/README.md](front/README.md) |
| `infra/` | Terraform AWS 인프라 | [infra/README.md](infra/README.md) |

---

## 빠른 시작

**백엔드**

```bash
cd back
./gradlew bootRun
```

**프론트엔드**

```bash
cd front
pnpm install
pnpm dev
```

**인프라**

```bash
cd infra
terraform init
terraform apply
```
