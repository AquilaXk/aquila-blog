.PHONY: help dev-infra dev-infra-down dev-infra-logs test-fast test lint lint-fix check-contracts validate-env

help:
	@echo "Available commands for aquila-blog (Platform Backend & Infra):"
	@echo "  make dev-infra         - Start local development infra (Postgres, Redis, MinIO)"
	@echo "  make dev-infra-down    - Stop local development infra"
	@echo "  make dev-infra-logs    - Tail logs of local development infra"
	@echo "  make test-fast         - Run fast PR checks (ciFastCheck)"
	@echo "  make test              - Run all backend unit/integration tests"
	@echo "  make lint              - Run ktlint checks"
	@echo "  make lint-fix          - Auto-format Kotlin sources with ktlint"
	@echo "  make check-contracts   - Verify public contract manifest"
	@echo "  make validate-env      - Validate local environment contract"

dev-infra:
	docker compose -f back/devInfra/docker-compose.yml up -d

dev-infra-down:
	docker compose -f back/devInfra/docker-compose.yml down

dev-infra-logs:
	docker compose -f back/devInfra/docker-compose.yml logs -f

test-fast:
	./back/gradlew -p back ciFastCheck

test:
	./back/gradlew -p back test

lint:
	./back/gradlew -p back ktlintCheck

lint-fix:
	./back/gradlew -p back ktlintFormat

check-contracts:
	node tools/contracts/check-public-contracts.mjs

validate-env:
	node tools/env/validate-env.mjs --target back-local --file back/.env.default
