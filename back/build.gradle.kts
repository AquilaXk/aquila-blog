import org.gradle.api.artifacts.component.ModuleComponentIdentifier
import org.gradle.api.tasks.compile.JavaCompile
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    kotlin("jvm") version "2.4.10"
    kotlin("plugin.spring") version "2.4.10"
    jacoco
    id("org.springframework.boot") version "4.1.0"
    id("io.spring.dependency-management") version "1.1.7"
    kotlin("plugin.jpa") version "2.4.10"
    kotlin("kapt") version "2.4.10"
    id("org.jlleitschuh.gradle.ktlint") version "14.2.0"
    id("org.owasp.dependencycheck") version "13.0.0"
}

apply(from = "gradle/backend-test-infra.gradle.kts")
apply(from = "gradle/backend-jacoco.gradle.kts")
apply(from = "gradle/backend-ktlint.gradle.kts")

group = "com"
version = "0.0.1-SNAPSHOT"
description = "back"

// Pin above Spring Boot 4.1.0 BOM for NVD High CVEs blocking Deploy (#1387).
extra["tomcat.version"] = "11.0.24"
extra["netty.version"] = "4.2.16.Final"
extra["postgresql.version"] = "42.7.13"

val testcontainersVersion = "1.21.4"

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(25)
    }
}

tasks.withType<JavaCompile>().configureEach {
    options.release.set(24)
}

repositories {
    mavenCentral()
}

dependencies {
    // Spring
    implementation("org.springframework.boot:spring-boot-starter-data-jpa")
    implementation("org.springframework.boot:spring-boot-starter-data-redis")
    implementation("org.springframework.boot:spring-boot-starter-mail")
    implementation("org.springframework.boot:spring-boot-starter-security")
    implementation("org.springframework.boot:spring-boot-starter-security-oauth2-client")
    implementation("org.springframework.boot:spring-boot-starter-session-data-redis")
    implementation("org.springframework.boot:spring-boot-starter-validation")
    implementation("org.springframework.boot:spring-boot-starter-webmvc")
    implementation("org.springframework.boot:spring-boot-starter-cache")
    implementation("org.springframework.boot:spring-boot-starter-actuator")
    implementation("org.springframework.boot:spring-boot-starter-flyway")
    implementation("io.micrometer:micrometer-registry-prometheus")
    implementation("org.flywaydb:flyway-database-postgresql")
    developmentOnly("org.springframework.boot:spring-boot-devtools")

    // Kotlin
    implementation("org.jetbrains.kotlin:kotlin-reflect")
    implementation("tools.jackson.module:jackson-module-kotlin")

    // Auth
    implementation("io.jsonwebtoken:jjwt-api:0.13.0")
    runtimeOnly("io.jsonwebtoken:jjwt-impl:0.13.0")
    runtimeOnly("io.jsonwebtoken:jjwt-jackson:0.13.0")

    // QueryDSL
    implementation("io.github.openfeign.querydsl:querydsl-jpa:7.5") {
        exclude("jakarta.persistence", "jakarta.persistence-api")
    }
    implementation("io.github.openfeign.querydsl:querydsl-kotlin:7.5")
    kapt("io.github.openfeign.querydsl:querydsl-apt:7.5:jpa")

    // SpringDoc
    implementation("org.springdoc:springdoc-openapi-starter-webmvc-ui:3.0.2")
    implementation("org.webjars:swagger-ui:5.32.11") // DOMPurify 3.4.12; fixes CVE-2026-65898 (#1451).
    implementation("net.logstash.logback:logstash-logback-encoder:9.0")

    // ShedLock
    implementation("net.javacrumbs.shedlock:shedlock-spring:7.7.0")
    implementation("net.javacrumbs.shedlock:shedlock-provider-redis-spring:7.7.0")

    // Database
    runtimeOnly("org.postgresql:postgresql")
    // Sync S3Client uses UrlConnection only (#1387/#1388/#1391). Drop unused AWS HTTP clients.
    implementation("software.amazon.awssdk:s3:2.33.13") {
        exclude(group = "software.amazon.awssdk", module = "apache-client")
        exclude(group = "software.amazon.awssdk", module = "netty-nio-client")
    }
    implementation("software.amazon.awssdk:url-connection-client:2.33.13")
    implementation("org.jsoup:jsoup:1.21.2")

    // Test
    testImplementation("org.springframework.boot:spring-boot-starter-data-jpa-test")
    testImplementation("org.springframework.boot:spring-boot-starter-data-redis-test")
    testImplementation("org.springframework.boot:spring-boot-starter-security-oauth2-client-test")
    testImplementation("org.springframework.boot:spring-boot-starter-security-test")
    testImplementation("org.springframework.boot:spring-boot-starter-session-data-redis-test")
    testImplementation("org.springframework.boot:spring-boot-starter-validation-test")
    testImplementation("org.springframework.boot:spring-boot-starter-webmvc-test")
    testImplementation("com.tngtech.archunit:archunit:1.5.0")
    testImplementation("org.jetbrains.kotlin:kotlin-test-junit5")
    testImplementation("org.testcontainers:junit-jupiter:$testcontainersVersion")
    testImplementation("org.testcontainers:postgresql:$testcontainersVersion")
    testImplementation("org.testcontainers:testcontainers:$testcontainersVersion")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

tasks.register("verifyTestcontainersVersionAlignment") {
    description = "Verifies the resolved Testcontainers modules use the approved version."
    group = "verification"

    doLast {
        val testcontainersComponents =
            configurations
                .getByName("testRuntimeClasspath")
                .incoming
                .resolutionResult
                .allComponents
                .mapNotNull { component -> component.id as? ModuleComponentIdentifier }
                .filter { component -> component.group == "org.testcontainers" }

        if (testcontainersComponents.isEmpty()) {
            throw GradleException("No org.testcontainers modules resolved in testRuntimeClasspath.")
        }

        val misalignedComponents =
            testcontainersComponents.filter { component -> component.version != testcontainersVersion }
        if (misalignedComponents.isNotEmpty()) {
            val resolvedModules =
                testcontainersComponents
                    .map { component -> "${component.module}:${component.version}" }
                    .sorted()
                    .joinToString(separator = ", ")
            throw GradleException(
                "Testcontainers version alignment failed: expected $testcontainersVersion, resolved $resolvedModules",
            )
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_24)
        freeCompilerArgs.addAll(
            "-Xjsr305=strict",
            "-Xannotation-default-target=param-property",
        )
    }
}

allOpen {
    annotation("jakarta.persistence.Entity")
    annotation("jakarta.persistence.MappedSuperclass")
    annotation("jakarta.persistence.Embeddable")
}

dependencyCheck {
    formats = listOf("HTML", "JSON", "SARIF")
    failBuildOnCVSS = 7.0f
    // Keep fail-closed on update/analysis errors (#1383).
    failOnError = true
    // Prefer ODC Builder datafeed over NVD REST crawl — API full updates hang CI for hours (#1389).
    // See https://github.com/dependency-check/DependencyCheck/issues/8618
    nvd.datafeedUrl =
        "https://dependency-check.github.io/DependencyCheck_Builder/nvd_cache/nvdcve-{0}.json.gz"
    // Retained for any residual API paths / local tooling; datafeed is primary update source.
    nvd.maxRetryCount = 20
    nvd.delay = 4000
    // OWASP-only suppressions (YAML vulnerability-exceptions.yml does not apply here) (#1387).
    suppressionFiles.add("config/dependency-check-suppressions.xml")
    providers.environmentVariable("NVD_API_KEY").orNull?.takeIf(String::isNotBlank)?.let { apiKey ->
        nvd.apiKey = apiKey
    }
}
