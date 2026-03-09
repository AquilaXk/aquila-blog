# infra

Terraform으로 AWS 인프라를 관리한다.

---

## 구성 리소스

- VPC, Subnet, Internet Gateway, Route Table
- Security Group (전체 개방)
- IAM Role + Instance Profile (S3FullAccess, SSMManagedInstanceCore)
- EC2 (t3.micro, Amazon Linux 2023)

## EC2 부트스트랩

EC2 기동 시 `user_data`로 자동 실행된다.

- 타임존: Asia/Seoul
- 패키지: git, docker (dnf)
- swap 4GB 설정
- Docker 컨테이너: npm_1 (NPMplus), redis_1, pg_1 (PostgreSQL)
- GitHub Container Registry 로그인

## 사용법

```bash
cp secrets.tf.example secrets.tf   # 시크릿 값 설정
terraform init
terraform plan
terraform apply
```

## 파일 구조

| 파일 | 역할 |
|------|------|
| `main.tf` | 전체 리소스 정의 |
| `variables.tf` | 변수 선언 |
| `secrets.tf` | 민감한 변수값 (gitignore) |
