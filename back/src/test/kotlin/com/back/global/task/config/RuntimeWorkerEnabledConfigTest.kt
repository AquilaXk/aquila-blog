package com.back.global.task.config

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test

@DisplayName("Runtime worker 설정 계약 테스트")
class RuntimeWorkerEnabledConfigTest {
    @Test
    fun `worker flag is declared with the same kebab-case key used by scheduler conditions`() {
        val applicationYaml =
            checkNotNull(Thread.currentThread().contextClassLoader.getResource("application.yaml")) {
                "application.yaml resource not found"
            }.readText()

        assertThat(applicationYaml).contains("worker-enabled:")
        assertThat(applicationYaml).doesNotContain("workerEnabled:")
    }
}
