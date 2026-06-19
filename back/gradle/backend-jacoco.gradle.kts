import org.gradle.api.GradleException
import org.gradle.api.tasks.SourceSetContainer
import org.gradle.kotlin.dsl.getByName
import org.gradle.kotlin.dsl.getByType
import org.gradle.kotlin.dsl.named
import org.gradle.kotlin.dsl.register
import org.gradle.testing.jacoco.tasks.JacocoCoverageVerification
import org.gradle.testing.jacoco.tasks.JacocoReport

val sourceSets = extensions.getByType<SourceSetContainer>()
val mainSourceSet = sourceSets.getByName("main")

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
val jacocoCoverageBaselineLock =
    layout.projectDirectory.file("config/jacoco-coverage-baseline-lock.txt")

val fastTestTaskNames = listOf("test")
val fullTestTaskNames = fastTestTaskNames + "testcontainersTest"

fun coverageBaselineEntries(file: File): List<String> =
    file
        .takeIf { it.exists() }
        ?.readLines()
        .orEmpty()
        .map(String::trim)
        .filter { it.isNotEmpty() && !it.startsWith("#") }

fun jacocoCoverageBaselineEntries(): List<String> =
    coverageBaselineEntries(jacocoCoverageBaselineExclusions.asFile)

fun jacocoCoverageBaselineLockEntries(): List<String> =
    coverageBaselineEntries(jacocoCoverageBaselineLock.asFile)

fun jacocoCoverageExclusions(): List<String> =
    jacocoStaticCoverageExclusions + jacocoCoverageBaselineEntries()

fun jacocoMainClassDirectories() =
    files(
        mainSourceSet.output.classesDirs.files.map {
            fileTree(it) {
                // 기존 미커버 baseline을 파일로 고정해 신규 코드의 100% 게이트를 유지한다.
                exclude(jacocoCoverageExclusions())
            }
        },
    )

fun jacocoAllClassDirectories() =
    files(
        mainSourceSet.output.classesDirs,
    )

fun jacocoMainSourceDirectories() =
    files(
        mainSourceSet.allSource.srcDirs,
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
    description = "Generates baseline-filtered PR Jacoco coverage for the 100% line gate."
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

tasks.register<JacocoReport>("jacocoPrFullCoverageReport") {
    description = "Generates unfiltered PR Jacoco coverage so CI can show baseline exclusion impact."
    group = "verification"
    dependsOn(fastTestTaskNames)
    classDirectories.setFrom(jacocoAllClassDirectories())
    sourceDirectories.setFrom(jacocoMainSourceDirectories())
    executionData.setFrom(jacocoExecutionDataFor(fastTestTaskNames))
    reports {
        xml.required.set(true)
        html.required.set(true)
        csv.required.set(false)
        xml.outputLocation.set(layout.buildDirectory.file("reports/jacoco/pr-full/jacocoPrFullCoverageReport.xml"))
        html.outputLocation.set(layout.buildDirectory.dir("reports/jacoco/pr-full/html"))
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
    description = "Verifies 100% line coverage after static and baseline exclusions."
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

tasks.register("verifyJacocoBaselineExclusions") {
    description = "Fails when Jacoco baseline exclusions increase beyond the reviewed lock file."
    group = "verification"
    inputs.file(jacocoCoverageBaselineExclusions)
    inputs.file(jacocoCoverageBaselineLock)

    doLast {
        val baselineEntries = jacocoCoverageBaselineEntries().toSet()
        val lockEntries = jacocoCoverageBaselineLockEntries().toSet()
        val addedEntries = baselineEntries - lockEntries

        if (addedEntries.isNotEmpty()) {
            throw GradleException(
                buildString {
                    appendLine("Jacoco baseline exclusions increased without lock approval:")
                    addedEntries.sorted().forEach { appendLine("- $it") }
                    append("Remove the new exclusion or update config/jacoco-coverage-baseline-lock.txt with reviewer intent.")
                },
            )
        }
    }
}

tasks.register("ciFastCheck") {
    description = "Runs PR fast backend checks with baseline-filtered Jacoco coverage reporting."
    group = "verification"
    dependsOn(
        "test",
        "jacocoPrReport",
        "jacocoPrFullCoverageReport",
        "ciFastCoverageVerification",
        "verifyJacocoBaselineExclusions",
        "ktlintCheck",
    )
}

tasks.named("check") {
    dependsOn("testcontainersTest")
    dependsOn("verifyJacocoBaselineExclusions")
    dependsOn(tasks.named<JacocoCoverageVerification>("jacocoTestCoverageVerification"))
}
