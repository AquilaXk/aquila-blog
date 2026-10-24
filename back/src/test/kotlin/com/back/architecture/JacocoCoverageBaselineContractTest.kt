package com.back.architecture

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.nio.file.Files
import java.nio.file.Path

class JacocoCoverageBaselineContractTest {
    private val baselinePath = Path.of("config/jacoco-coverage-baseline-excludes.txt")
    private val lockPath = Path.of("config/jacoco-coverage-baseline-lock.txt")
    private val mainKotlinRoot = Path.of("src/main/kotlin")

    @Test
    fun `Jacoco baseline exclusion은 lock 파일 밖으로 증가할 수 없다`() {
        val baselineEntries = coverageEntries(baselinePath)
        val lockedEntries = coverageEntries(lockPath)

        assertThat(baselineEntries)
            .describedAs("baseline exclusion 증가분은 lock 파일에 명시 승인되어야 한다")
            .isSubsetOf(lockedEntries)
    }

    @Test
    fun `Jacoco baseline exclusion 항목은 실제 Kotlin 소스에 존재해야 한다`() {
        val baselineEntries = coverageEntries(baselinePath)
        val missingEntries = baselineEntries.filterNot(::hasMatchingKotlinSource)

        assertThat(missingEntries)
            .describedAs("삭제된 클래스는 Jacoco baseline exclusion에 남을 수 없다")
            .isEmpty()
    }

    private fun hasMatchingKotlinSource(entry: String): Boolean {
        if (javaClass.classLoader.getResource(entry) == null) {
            return false
        }
        val outerClassPath =
            entry
                .removeSuffix(".class")
                .substringBefore("$")
                .removeSuffix("Kt")
        val directSource = mainKotlinRoot.resolve("$outerClassPath.kt")
        if (Files.isRegularFile(directSource)) {
            return true
        }
        val packageDir = directSource.parent ?: return false
        if (!Files.isDirectory(packageDir)) {
            return false
        }
        val simpleName = outerClassPath.substringAfterLast('/')
        val declarationRegex = Regex("""\b(class|interface|object)\s+$simpleName\b""")
        return Files.list(packageDir).use { stream ->
            stream
                .filter { path -> Files.isRegularFile(path) && path.fileName.toString().endsWith(".kt") }
                .anyMatch { path -> declarationRegex.containsMatchIn(Files.readString(path)) }
        }
    }

    private fun coverageEntries(path: Path): Set<String> {
        assertThat(path)
            .describedAs("coverage baseline contract file must exist: $path")
            .exists()

        return Files
            .readAllLines(path)
            .map(String::trim)
            .filter { line -> line.isNotEmpty() && !line.startsWith("#") }
            .toSet()
    }
}
