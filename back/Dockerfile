# syntax=docker/dockerfile:1.7

# =========================
# 1️⃣ JDK Source Stage
# =========================
# Digest pin source:
# docker buildx imagetools inspect eclipse-temurin:24-jdk
FROM eclipse-temurin:24-jdk@sha256:7493205ffe6caa8074fa8a06a276bb1c5ac41d3dd0fd43a0db66d7f776e80b3e AS jdk-source

# =========================
# 2️⃣ Build Stage
# =========================
# jangka512/pgj: PGroonga + PostGIS + pgvector 포함 커스텀 이미지
# Digest pin source:
# docker buildx imagetools inspect jangka512/pgj:latest
FROM jangka512/pgj@sha256:a8bfcb8e5c64805429cd1406d0840ba1c13f70830e73d9f5e4a63cd7c1b62da7 AS builder

# Redis 설치 (Gradle은 gradlew 사용)
RUN apt-get update \
 && apt-get install -y --no-install-recommends redis-server \
 && rm -rf /var/lib/apt/lists/*

COPY --from=jdk-source /opt/java/openjdk /opt/java/openjdk

ENV JAVA_HOME=/opt/java/openjdk
ENV PATH="${JAVA_HOME}/bin:${PATH}"

WORKDIR /app

# 의존성 캐시 레이어 (소스 변경 시에도 캐시 유지)
COPY gradlew .
COPY gradle gradle
COPY build.gradle.kts settings.gradle.kts .
RUN chmod +x gradlew && ./gradlew dependencies --no-daemon

COPY .env.test .env.test
COPY src src

# PG 초기화 → 시작 → 테스트 DB 생성 → bootJar 빌드(테스트 제외) → PG 종료
RUN set -e \
 && PGDATA=/var/lib/postgresql/data \
 && BUILD_DB_PASSWORD="$(tr -dc 'A-Za-z0-9' </dev/urandom | head -c 24)" \
 && BUILD_REDIS_PASSWORD="$(tr -dc 'A-Za-z0-9' </dev/urandom | head -c 24)" \
 && mkdir -p "$PGDATA" && chown postgres:postgres "$PGDATA" \
 && su postgres -c "initdb -D $PGDATA --auth=trust" \
 && su postgres -c "pg_ctl -D $PGDATA start -o '-c listen_addresses=localhost' -w" \
 && su postgres -c "psql -c \"ALTER USER postgres PASSWORD '${BUILD_DB_PASSWORD}';\"" \
 && su postgres -c "psql -c \"CREATE DATABASE blog_test;\"" \
 && redis-server --daemonize yes --requirepass "${BUILD_REDIS_PASSWORD}" \
 && ./gradlew bootJar --no-daemon -x test \
 && su postgres -c "pg_ctl -D $PGDATA stop -w"

# =========================
# 3️⃣ Layer Extract Stage
# =========================
# Oracle GraalVM base can require x86-64-v3 on older CPUs.
# Use Temurin for broader CPU compatibility.
FROM eclipse-temurin:24-jdk@sha256:7493205ffe6caa8074fa8a06a276bb1c5ac41d3dd0fd43a0db66d7f776e80b3e AS extractor

WORKDIR /app

COPY --from=builder /app/build/libs/*.jar app.jar

# Spring Boot layered jar 추출 (deprecation 경고는 무시해도 됨 — Spring Boot 4.x에서 tools extract 명령은 다른 디렉토리 구조를 생성함)
RUN java -Djarmode=layertools -jar app.jar extract

# =========================
# 4️⃣ Runtime Stage
# =========================
FROM eclipse-temurin:24-jdk@sha256:7493205ffe6caa8074fa8a06a276bb1c5ac41d3dd0fd43a0db66d7f776e80b3e

ENV LANG=ko_KR.UTF-8
ENV LC_ALL=ko_KR.UTF-8
ENV JAVA_TOOL_OPTIONS="-Dfile.encoding=UTF-8 -Dstdout.encoding=UTF-8 -Dstderr.encoding=UTF-8"

WORKDIR /app

# Spring Boot layers (변경 빈도 낮은 순 → 높은 순으로 배치해 캐시 효율 극대화)
COPY --from=extractor /app/dependencies/ ./
COPY --from=extractor /app/snapshot-dependencies/ ./
COPY --from=extractor /app/spring-boot-loader/ ./
COPY --from=extractor /app/application/ ./

# ── t3.micro JVM 최적화 ──
ENTRYPOINT ["java", \
  "-XX:+UseSerialGC", \
  "-XX:MaxRAMPercentage=55", \
  "-XX:InitialRAMPercentage=25", \
  "-XX:+ExitOnOutOfMemoryError", \
  "-XX:+AlwaysPreTouch", \
  "-Dspring.profiles.active=prod", \
  "org.springframework.boot.loader.launch.JarLauncher"]
