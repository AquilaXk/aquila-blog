import org.gradle.testing.jacoco.tasks.JacocoCoverageVerification
import org.gradle.testing.jacoco.tasks.JacocoReport

plugins {
    kotlin("jvm") version "2.2.21"
    kotlin("plugin.spring") version "2.2.21"
    jacoco
    id("org.springframework.boot") version "4.0.3"
    id("io.spring.dependency-management") version "1.1.7"
    kotlin("plugin.jpa") version "2.2.21"
    kotlin("kapt") version "2.2.21"
    id("org.jlleitschuh.gradle.ktlint") version "12.1.1"
}

group = "com"
version = "0.0.1-SNAPSHOT"
description = "back"

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(24)
    }
}

repositories {
    mavenCentral()
}

val testInfraProjectName = "aquila_blog_test"
val testInfraComposeFile =
    layout.projectDirectory
        .file("testInfra/docker-compose.yml")
        .asFile
        .absolutePath
val defaultTestDbPassword = "test_db_password_change_me"
val defaultTestRedisPassword = "test_redis_password_change_me"
val defaultTestDbPort = "15432"
val defaultTestRedisPort = "16379"
val testInfraMode =
    providers
        .gradleProperty("testInfraMode")
        .orElse(providers.environmentVariable("TEST_INFRA_MODE"))
        .orElse("auto")
val testInfraMarkerFile =
    layout.buildDirectory
        .file("tmp/testInfra/running.marker")
        .get()
        .asFile

val resolvedTestDbPassword =
    providers
        .environmentVariable("TEST_DB_PASSWORD")
        .orElse(providers.environmentVariable("SPRING__DATASOURCE__PASSWORD"))
        .orElse(defaultTestDbPassword)

val resolvedTestRedisPassword =
    providers
        .environmentVariable("TEST_REDIS_PASSWORD")
        .orElse(providers.environmentVariable("SPRING__DATA__REDIS__PASSWORD"))
        .orElse(defaultTestRedisPassword)

val resolvedTestDbPort =
    providers
        .environmentVariable("TEST_DB_PORT")
        .orElse(providers.environmentVariable("CUSTOM__TEST__DB_PORT"))
        .orElse(defaultTestDbPort)

val resolvedTestRedisPort =
    providers
        .environmentVariable("TEST_REDIS_PORT")
        .orElse(providers.environmentVariable("CUSTOM__TEST__REDIS_PORT"))
        .orElse(defaultTestRedisPort)

fun testInfraEnvironment(): Map<String, String> =
    mapOf(
        "TEST_DB_PASSWORD" to resolvedTestDbPassword.get(),
        "TEST_REDIS_PASSWORD" to resolvedTestRedisPassword.get(),
        "TEST_DB_PORT" to resolvedTestDbPort.get(),
        "TEST_REDIS_PORT" to resolvedTestRedisPort.get(),
    )

fun Project.runTestInfraCommand(
    vararg command: String,
    ignoreExitValue: Boolean = false,
) {
    val process =
        ProcessBuilder(*command)
            .directory(projectDir)
            .apply {
                environment().putAll(testInfraEnvironment())
                redirectInput(ProcessBuilder.Redirect.INHERIT)
                redirectOutput(ProcessBuilder.Redirect.INHERIT)
                redirectError(ProcessBuilder.Redirect.INHERIT)
            }.start()

    val exitCode = process.waitFor()
    if (exitCode != 0 && !ignoreExitValue) {
        error("Command failed (${command.joinToString(" ")}), exitCode=$exitCode")
    }
}

fun Project.ensureTestInfraPrerequisites() {
    val process =
        ProcessBuilder("docker", "compose", "version")
            .directory(projectDir)
            .redirectInput(ProcessBuilder.Redirect.INHERIT)
            .redirectOutput(ProcessBuilder.Redirect.PIPE)
            .redirectError(ProcessBuilder.Redirect.PIPE)
            .start()
    val exitCode = process.waitFor()
    if (exitCode == 0) return

    val stdout =
        process.inputStream
            .bufferedReader()
            .readText()
            .trim()
    val stderr =
        process.errorStream
            .bufferedReader()
            .readText()
            .trim()
    error(
        """
        Backend test infra preflight failed.
        - Required command: docker compose
        - How to fix: Docker Desktop(or docker engine + compose plugin) 실행 후 다시 시도하세요.
        - stdout: $stdout
        - stderr: $stderr
        """.trimIndent(),
    )
}

fun Project.startTestInfra() {
    if (testInfraMarkerFile.exists()) return
    ensureTestInfraPrerequisites()

    runTestInfraCommand("docker", "compose", "-p", testInfraProjectName, "-f", testInfraComposeFile, "up", "-d")

    try {
        runTestInfraCommand(
            "bash",
            "-lc",
            """
            set -euo pipefail

            for i in {1..45}; do
              if docker compose -p $testInfraProjectName -f $testInfraComposeFile exec -T db pg_isready -U postgres -d postgres >/dev/null 2>&1 \
                && [ "$(docker compose -p $testInfraProjectName -f $testInfraComposeFile exec -T redis redis-cli --no-auth-warning -a "${'$'}TEST_REDIS_PASSWORD" PING 2>/dev/null | tr -d '\r')" = "PONG" ]; then
                exit 0
              fi
              sleep 2
            done

            docker compose -p $testInfraProjectName -f $testInfraComposeFile logs
            exit 1
            """.trimIndent(),
        )
    } catch (e: Exception) {
        runTestInfraCommand(
            "docker",
            "compose",
            "-p",
            testInfraProjectName,
            "-f",
            testInfraComposeFile,
            "down",
            "-v",
            "--remove-orphans",
            ignoreExitValue = true,
        )
        throw e
    }

    testInfraMarkerFile.parentFile.mkdirs()
    testInfraMarkerFile.writeText("started")
}

fun Project.stopTestInfra() {
    if (!testInfraMarkerFile.exists()) return

    try {
        runTestInfraCommand(
            "docker",
            "compose",
            "-p",
            testInfraProjectName,
            "-f",
            testInfraComposeFile,
            "down",
            "-v",
            "--remove-orphans",
            ignoreExitValue = true,
        )
    } finally {
        testInfraMarkerFile.delete()
    }
}

fun Test.commandLineIncludePatternsOrEmpty(): Set<String> {
    val getter =
        filter.javaClass.methods.firstOrNull { method ->
            method.name == "getCommandLineIncludePatterns" && method.parameterCount == 0
        } ?: return emptySet()

    val raw = getter.invoke(filter) as? Iterable<*> ?: return emptySet()
    return raw.mapNotNull { it?.toString() }.toSet()
}

val jacocoStaticCoverageExclusions =
    listOf(
        "com/back/BackApplication.class",
        "com/back/BackApplicationKt.class",
        "com/back/**/*Config.class",
        "com/back/**/*Config$*.class",
        "com/back/**/*Configuration.class",
        "com/back/**/*Configuration$*.class",
        "com/back/**/*Properties.class",
        "com/back/**/*Properties$*.class",
        "com/back/**/*Exception.class",
        "com/back/**/*Exception$*.class",
    )

val jacocoCoverageBaselineExclusions =
    layout.projectDirectory.file("config/jacoco-coverage-baseline-excludes.txt")

val fastTestTaskNames = listOf("test")
val fullTestTaskNames = fastTestTaskNames + "testcontainersTest"

fun jacocoCoverageExclusions(): List<String> =
    jacocoStaticCoverageExclusions +
        jacocoCoverageBaselineExclusions.asFile
            .takeIf { it.exists() }
            ?.readLines()
            .orEmpty()
            .map(String::trim)
            .filter { it.isNotEmpty() && !it.startsWith("#") }

fun jacocoMainClassDirectories() =
    files(
        sourceSets.main.get().output.classesDirs.files.map {
            fileTree(it) {
                // 기존 미커버 baseline을 파일로 고정해 신규 코드의 100% 게이트를 유지한다.
                exclude(jacocoCoverageExclusions())
            }
        },
    )

fun jacocoAllClassDirectories() =
    files(
        sourceSets
            .main
            .get()
            .output
            .classesDirs,
    )

fun jacocoMainSourceDirectories() =
    files(
        sourceSets
            .main
            .get()
            .allSource
            .srcDirs,
    )

fun jacocoExecutionDataFor(taskNames: List<String>) =
    fileTree(layout.buildDirectory.dir("jacoco")) {
        include(taskNames.map { "$it.exec" })
    }

fun JacocoCoverageVerification.configureLineCoverageRule() {
    violationRules {
        rule {
            limit {
                counter = "LINE"
                value = "COVEREDRATIO"
                minimum = "1.00".toBigDecimal()
            }
        }
    }
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
    implementation("io.github.openfeign.querydsl:querydsl-jpa:7.1") {
        exclude("jakarta.persistence", "jakarta.persistence-api")
    }
    implementation("io.github.openfeign.querydsl:querydsl-kotlin:7.1")
    kapt("io.github.openfeign.querydsl:querydsl-apt:7.1:jpa")

    // SpringDoc
    implementation("org.springdoc:springdoc-openapi-starter-webmvc-ui:3.0.2")
    implementation("net.logstash.logback:logstash-logback-encoder:8.0")

    // ShedLock
    implementation("net.javacrumbs.shedlock:shedlock-spring:7.6.0")
    implementation("net.javacrumbs.shedlock:shedlock-provider-redis-spring:7.6.0")

    // Database
    runtimeOnly("org.postgresql:postgresql")
    implementation("software.amazon.awssdk:s3:2.33.13")
    implementation("org.jsoup:jsoup:1.21.2")

    // Test
    testImplementation("org.springframework.boot:spring-boot-starter-data-jpa-test")
    testImplementation("org.springframework.boot:spring-boot-starter-data-redis-test")
    testImplementation("org.springframework.boot:spring-boot-starter-security-oauth2-client-test")
    testImplementation("org.springframework.boot:spring-boot-starter-security-test")
    testImplementation("org.springframework.boot:spring-boot-starter-session-data-redis-test")
    testImplementation("org.springframework.boot:spring-boot-starter-validation-test")
    testImplementation("org.springframework.boot:spring-boot-starter-webmvc-test")
    testImplementation("com.tngtech.archunit:archunit:1.4.1")
    testImplementation("org.jetbrains.kotlin:kotlin-test-junit5")
    testImplementation("org.testcontainers:junit-jupiter:1.21.3")
    testImplementation("org.testcontainers:postgresql:1.21.3")
    testImplementation("org.testcontainers:testcontainers:1.21.3")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

kotlin {
    compilerOptions {
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

ktlint {
    version.set("1.5.0")
    outputToConsole.set(true)
    ignoreFailures.set(false)
    filter {
        exclude("**/build/**")
        exclude("**/generated/**")
    }
}

tasks {
    val testInfraDown by registering {
        group = "verification"
        description = "Stop isolated Postgres/Redis infrastructure used for backend tests."
        onlyIf { testInfraMarkerFile.exists() }
        doLast {
            project.stopTestInfra()
        }
    }

    withType<Test> {
        val infraMode = testInfraMode.get().trim().lowercase()
        val resolvedTestMaxHeapMb =
            providers
                .gradleProperty("testMaxHeapMb")
                .orElse("2048")
                .get()
                .toIntOrNull()
                ?.coerceIn(1024, 8192)
                ?: 2048
        useJUnitPlatform()
        maxHeapSize = "${resolvedTestMaxHeapMb}m"
        maxParallelForks = 1
        forkEvery = 80
        environment("SPRING__DATASOURCE__PASSWORD", resolvedTestDbPassword.get())
        environment("SPRING__DATA__REDIS__PASSWORD", resolvedTestRedisPassword.get())
        environment("CUSTOM__TEST__DB_PORT", resolvedTestDbPort.get())
        environment("CUSTOM__TEST__REDIS_PORT", resolvedTestRedisPort.get())
        doFirst {
            val commandLineIncludes = commandLineIncludePatternsOrEmpty()
            val hasCommandLineIncludes = commandLineIncludes.isNotEmpty()
            val onlyTestcontainersIncludes =
                hasCommandLineIncludes &&
                    commandLineIncludes.all { include ->
                        include.startsWith("com.back.infrastructure.")
                    }
            val composeInfraEnabled =
                when (infraMode) {
                    "compose" -> true
                    "none" -> false
                    else -> !onlyTestcontainersIncludes
                }

            if (composeInfraEnabled) {
                project.startTestInfra()
            } else {
                logger.lifecycle(
                    "test infra bootstrap skipped (mode={}, includePatterns={})",
                    infraMode,
                    commandLineIncludes,
                )
            }
        }
        finalizedBy(testInfraDown)
    }

    named<Test>("test") {
        filter {
            // Testcontainers 검증은 별도 태스크(testcontainersTest)에서만 수행한다.
            excludeTestsMatching("com.back.infrastructure.*")
        }
    }

    register<Test>("testcontainersTest") {
        group = "verification"
        description = "Run integration tests that bootstrap infra with Testcontainers."
        testClassesDirs = sourceSets["test"].output.classesDirs
        classpath = sourceSets["test"].runtimeClasspath
        useJUnitPlatform()
        filter {
            includeTestsMatching("com.back.infrastructure.*")
        }
        systemProperty("spring.profiles.active", "test")
        environment("TEST_INFRA_MODE", "none")
        shouldRunAfter("test")
    }
}

tasks.named<JacocoReport>("jacocoTestReport") {
    dependsOn(fullTestTaskNames)
    classDirectories.setFrom(jacocoMainClassDirectories())
    sourceDirectories.setFrom(jacocoMainSourceDirectories())
    executionData.setFrom(jacocoExecutionDataFor(fullTestTaskNames))
    reports {
        xml.required.set(true)
        html.required.set(true)
        csv.required.set(false)
    }
}

tasks.register<JacocoReport>("jacocoPrReport") {
    dependsOn(fastTestTaskNames)
    classDirectories.setFrom(jacocoMainClassDirectories())
    sourceDirectories.setFrom(jacocoMainSourceDirectories())
    executionData.setFrom(jacocoExecutionDataFor(fastTestTaskNames))
    reports {
        xml.required.set(true)
        html.required.set(true)
        csv.required.set(false)
        xml.outputLocation.set(layout.buildDirectory.file("reports/jacoco/pr/jacocoPrReport.xml"))
        html.outputLocation.set(layout.buildDirectory.dir("reports/jacoco/pr/html"))
    }
}

tasks.register<JacocoReport>("jacocoFullTestReport") {
    dependsOn(fullTestTaskNames)
    classDirectories.setFrom(jacocoAllClassDirectories())
    sourceDirectories.setFrom(jacocoMainSourceDirectories())
    executionData.setFrom(jacocoExecutionDataFor(fullTestTaskNames))
    reports {
        xml.required.set(true)
        html.required.set(true)
        csv.required.set(false)
        xml.outputLocation.set(layout.buildDirectory.file("reports/jacoco/full/jacocoFullTestReport.xml"))
        html.outputLocation.set(layout.buildDirectory.dir("reports/jacoco/full/html"))
    }
}

tasks.register<JacocoCoverageVerification>("ciFastCoverageVerification") {
    dependsOn(fastTestTaskNames)
    classDirectories.setFrom(jacocoMainClassDirectories())
    executionData.setFrom(jacocoExecutionDataFor(fastTestTaskNames))
    configureLineCoverageRule()
}

tasks.named<JacocoCoverageVerification>("jacocoTestCoverageVerification") {
    dependsOn(tasks.named<JacocoReport>("jacocoTestReport"))
    classDirectories.setFrom(jacocoMainClassDirectories())
    executionData.setFrom(jacocoExecutionDataFor(fullTestTaskNames))
    configureLineCoverageRule()
}

tasks.register("ciFastCheck") {
    description = "Runs PR fast backend checks with Jacoco coverage reporting."
    group = "verification"
    dependsOn("test", "jacocoPrReport", "ciFastCoverageVerification", "ktlintCheck")
}

tasks.named("check") {
    dependsOn("testcontainersTest")
    dependsOn(tasks.named<JacocoCoverageVerification>("jacocoTestCoverageVerification"))
}
