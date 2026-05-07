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
