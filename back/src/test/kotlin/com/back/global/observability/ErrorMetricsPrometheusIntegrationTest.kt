package com.back.global.observability

import com.back.support.BaseControllerIntegrationTest
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.springframework.test.web.servlet.get

@DisplayName("ErrorMetrics Prometheus 통합 테스트")
class ErrorMetricsPrometheusIntegrationTest : BaseControllerIntegrationTest() {
    @Test
    @DisplayName("ExceptionHandler 404 후 /actuator/prometheus에 app_exception_total이 노출·증가한다")
    fun `handler 404 increments app_exception_total on prometheus scrape`() {
        val before =
            scrapeCounterValue(
                code = "404-1",
                status = "404",
                source = "handler",
                requireMetricPresent = false,
            )

        mvc.get("/post/api/v1/posts/${Int.MAX_VALUE}").andExpect {
            status { isNotFound() }
            jsonPath("$.resultCode") { value("404-1") }
        }

        val after =
            scrapeCounterValue(
                code = "404-1",
                status = "404",
                source = "handler",
                requireMetricPresent = true,
            )

        assertThat(after).isEqualTo(before + 1.0)
    }

    private fun scrapeCounterValue(
        code: String,
        status: String,
        source: String,
        requireMetricPresent: Boolean,
    ): Double {
        val body =
            mvc
                .get("/actuator/prometheus")
                .andExpect { status { isOk() } }
                .andReturn()
                .response
                .contentAsString

        if (requireMetricPresent) {
            assertThat(body).contains("app_exception_total")
        }

        val line =
            body
                .lineSequence()
                .firstOrNull { line ->
                    !line.startsWith("#") &&
                        line.startsWith("app_exception_total{") &&
                        line.contains("code=\"$code\"") &&
                        line.contains("status=\"$status\"") &&
                        line.contains("source=\"$source\"")
                }
                ?: return 0.0

        return line.substringAfterLast(' ').toDouble()
    }
}
