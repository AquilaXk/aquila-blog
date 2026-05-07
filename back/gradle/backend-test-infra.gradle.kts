import org.gradle.api.Project
import org.gradle.api.tasks.SourceSetContainer
import org.gradle.api.tasks.testing.Test
import org.gradle.kotlin.dsl.getByName
import org.gradle.kotlin.dsl.getByType
import org.gradle.kotlin.dsl.named
import org.gradle.kotlin.dsl.register
import org.gradle.kotlin.dsl.withType

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

val testSourceSet = extensions.getByType<SourceSetContainer>().getByName("test")

val testInfraDown =
    tasks.register("testInfraDown") {
        group = "verification"
        description = "Stop isolated Postgres/Redis infrastructure used for backend tests."
        onlyIf { testInfraMarkerFile.exists() }
        doLast {
            project.stopTestInfra()
        }
    }

tasks.withType<Test>().configureEach {
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

tasks.named<Test>("test") {
    filter {
        // Testcontainers 검증은 별도 태스크(testcontainersTest)에서만 수행한다.
        excludeTestsMatching("com.back.infrastructure.*")
    }
}

tasks.register<Test>("testcontainersTest") {
    group = "verification"
    description = "Run integration tests that bootstrap infra with Testcontainers."
    testClassesDirs = testSourceSet.output.classesDirs
    classpath = testSourceSet.runtimeClasspath
    useJUnitPlatform()
    filter {
        includeTestsMatching("com.back.infrastructure.*")
    }
    systemProperty("spring.profiles.active", "test")
    environment("TEST_INFRA_MODE", "none")
    shouldRunAfter("test")
}
