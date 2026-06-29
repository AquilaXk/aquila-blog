# syntax=docker/dockerfile:1.7

# =========================
# 1️⃣ JDK Source Stage
# =========================
# Digest pin source:
# docker buildx imagetools inspect eclipse-temurin:25-jdk
FROM eclipse-temurin:25-jdk@sha256:dfc0093e3dbf43dae57827111c6e374f5b44fac19a9451584b2b336b81474d64 AS jdk-source

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
FROM eclipse-temurin:25-jdk@sha256:dfc0093e3dbf43dae57827111c6e374f5b44fac19a9451584b2b336b81474d64 AS extractor

WORKDIR /app

COPY --from=builder /app/build/libs/*.jar app.jar

# Spring Boot 4.1 tools jarmode extracts a thin runnable jar plus lib directory.
RUN java -Djarmode=tools -jar app.jar extract

# =========================
# 4️⃣ Runtime Stage
# =========================
FROM eclipse-temurin:25-jdk@sha256:dfc0093e3dbf43dae57827111c6e374f5b44fac19a9451584b2b336b81474d64

ENV LANG=ko_KR.UTF-8
ENV LC_ALL=ko_KR.UTF-8
ENV JAVA_TOOL_OPTIONS="-Dfile.encoding=UTF-8 -Dstdout.encoding=UTF-8 -Dstderr.encoding=UTF-8"

RUN apt-get update \
 && apt-get install -y --no-install-recommends wget \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Spring Boot extracted app (library jars first for Docker cache reuse)
COPY --from=extractor /app/app/lib/ ./lib/
COPY --from=extractor /app/app/app.jar ./app.jar

# ── t3.micro JVM 최적화 ──
ENTRYPOINT ["java", \
  "-XX:+UseSerialGC", \
  "-XX:MaxRAMPercentage=55", \
  "-XX:InitialRAMPercentage=25", \
  "-XX:+ExitOnOutOfMemoryError", \
  "-XX:+AlwaysPreTouch", \
  "-Dspring.profiles.active=prod", \
  "-jar", \
  "app.jar"]
