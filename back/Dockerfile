# syntax=docker/dockerfile:1.7

# =========================
# 1️⃣ Build Stage
# =========================
# jangka512/pgj: PGroonga + PostGIS + pgvector 포함 커스텀 이미지
FROM jangka512/pgj:latest AS builder

# JDK 24 + Redis 설치 (Gradle은 gradlew 사용)
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl redis-server \
 && curl -sL https://download.java.net/java/GA/jdk24/1f9ff9062db4449d8ca828c504ffae90/36/GPL/openjdk-24_linux-x64_bin.tar.gz | tar xz -C /opt \
 && ln -s /opt/jdk-24 /opt/java \
 && rm -rf /var/lib/apt/lists/*

ENV JAVA_HOME=/opt/java
ENV PATH="${JAVA_HOME}/bin:${PATH}"

WORKDIR /app

# 의존성 캐시 레이어 (소스 변경 시에도 캐시 유지)
COPY gradlew .
COPY gradle gradle
COPY build.gradle.kts settings.gradle.kts .
RUN chmod +x gradlew && ./gradlew dependencies --no-daemon

COPY .env.test .env
COPY src src

# PG 초기화 → 시작 → 테스트 DB 생성 → 빌드(테스트 포함) → PG 종료
RUN set -e \
 && PGDATA=/var/lib/postgresql/data \
 && mkdir -p "$PGDATA" && chown postgres:postgres "$PGDATA" \
 && su postgres -c "initdb -D $PGDATA --auth=trust" \
 && su postgres -c "pg_ctl -D $PGDATA start -o '-c listen_addresses=localhost' -w" \
 && su postgres -c "psql -c \"ALTER USER postgres PASSWORD 'lldj123414';\"" \
 && su postgres -c "psql -c \"CREATE DATABASE slog_test;\"" \
 && redis-server --daemonize yes --requirepass lldj123414 \
 && ./gradlew build --no-daemon \
 && su postgres -c "pg_ctl -D $PGDATA stop -w"

# =========================
# 2️⃣ Layer Extract Stage
# =========================
FROM container-registry.oracle.com/graalvm/jdk:24 AS extractor

WORKDIR /app

COPY --from=builder /app/build/libs/*.jar app.jar

# Spring Boot layered jar 추출
RUN java -Djarmode=layertools -jar app.jar extract

# =========================
# 3️⃣ Runtime Stage
# =========================
FROM container-registry.oracle.com/graalvm/jdk:24

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
  "-XX:+UseJVMCICompiler", \
  "-XX:+UseSerialGC", \
  "-XX:MaxRAMPercentage=55", \
  "-XX:InitialRAMPercentage=25", \
  "-XX:+ExitOnOutOfMemoryError", \
  "-XX:+AlwaysPreTouch", \
  "-Dspring.profiles.active=prod", \
  "org.springframework.boot.loader.launch.JarLauncher"]
