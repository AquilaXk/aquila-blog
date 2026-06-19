package com.back.architecture

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.nio.file.Files
import java.nio.file.Path

class JacocoCoverageBaselineContractTest {
    private val baselinePath = Path.of("config/jacoco-coverage-baseline-excludes.txt")
    private val lockPath = Path.of("config/jacoco-coverage-baseline-lock.txt")

    @Test
    fun `Jacoco baseline exclusion은 lock 파일 밖으로 증가할 수 없다`() {
        val baselineEntries = coverageEntries(baselinePath)
        val lockedEntries = coverageEntries(lockPath)

        assertThat(baselineEntries)
            .describedAs("baseline exclusion 증가분은 lock 파일에 명시 승인되어야 한다")
            .isSubsetOf(lockedEntries)
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
