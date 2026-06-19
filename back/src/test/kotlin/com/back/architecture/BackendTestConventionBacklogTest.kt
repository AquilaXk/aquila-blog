package com.back.architecture

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test

@DisplayName("BackendTestConventionBacklog 테스트")
class BackendTestConventionBacklogTest {
    @Test
    @DisplayName("backend 테스트 명명 기준은 class와 method display name을 한국어 동작 설명으로 고정한다")
    fun `backend test naming convention is fixed`() {
        assertThat(BackendTestConvention.CLASS_DISPLAY_NAME_RULE)
            .isEqualTo("대상 기능 또는 guard 이름 뒤에 '테스트'를 붙인다")
        assertThat(BackendTestConvention.METHOD_DISPLAY_NAME_RULE)
            .isEqualTo("조건과 기대 동작을 한국어 문장으로 쓴다")
        assertThat(BackendTestConvention.METHOD_NAME_RULE)
            .isEqualTo("Kotlin backtick 이름은 display name과 같은 동작을 영어 또는 한국어로 설명한다")
    }

    @Test
    @DisplayName("failure injection backlog는 cache, task, cloud, retention 도메인을 모두 포함한다")
    fun `failure injection backlog covers core backend domains`() {
        val backlogDomains = BackendFailureInjectionBacklog.items.map { it.domain }.toSet()

        assertThat(backlogDomains)
            .containsExactlyInAnyOrder("cache", "task", "cloud", "retention")
        assertThat(BackendFailureInjectionBacklog.items)
            .allSatisfy { item ->
                assertThat(item.scenario).isNotBlank()
                assertThat(item.validationTarget).isNotBlank()
            }
    }

    private object BackendTestConvention {
        const val CLASS_DISPLAY_NAME_RULE = "대상 기능 또는 guard 이름 뒤에 '테스트'를 붙인다"
        const val METHOD_DISPLAY_NAME_RULE = "조건과 기대 동작을 한국어 문장으로 쓴다"
        const val METHOD_NAME_RULE = "Kotlin backtick 이름은 display name과 같은 동작을 영어 또는 한국어로 설명한다"
    }

    private object BackendFailureInjectionBacklog {
        val items =
            listOf(
                FailureInjectionBacklogItem(
                    domain = "cache",
                    scenario = "cache 저장소 장애 시 reader가 stale data 또는 fallback 경로로 안전하게 응답하는지 검증한다",
                    validationTarget = "cache adapter failure injection test",
                ),
                FailureInjectionBacklogItem(
                    domain = "task",
                    scenario = "task handler 예외와 stale lease 경합이 retry/fencing 규칙을 깨지 않는지 검증한다",
                    validationTarget = "task scheduler failure injection test",
                ),
                FailureInjectionBacklogItem(
                    domain = "cloud",
                    scenario = "cloud upload/delete provider 실패가 도메인 상태와 재시도 정책을 불일치시키지 않는지 검증한다",
                    validationTarget = "cloud storage failure injection test",
                ),
                FailureInjectionBacklogItem(
                    domain = "retention",
                    scenario = "retention archive/delete 실패가 cutoff 이후 데이터 조회와 재실행 안전성을 깨지 않는지 검증한다",
                    validationTarget = "retention job failure injection test",
                ),
            )
    }

    private data class FailureInjectionBacklogItem(
        val domain: String,
        val scenario: String,
        val validationTarget: String,
    )
}
