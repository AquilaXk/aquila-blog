package com.back.boundedContexts.post.application.service

import com.back.global.system.application.SearchRuntimeControlQueryService
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.mockito.Mockito.`when`
import tools.jackson.databind.ObjectMapper

class PostKeywordSearchPipelineServiceTest {
    @Test
    fun `force control reads authoritative runtime control for every call`() {
        val queryService = mock(SearchRuntimeControlQueryService::class.java)
        `when`(queryService.isPipelineForceControlEnabled()).thenReturn(true, false, true)
        val service = pipeline(queryService)

        assertThat(service.isForceControlEnabled()).isTrue()
        assertThat(service.isForceControlEnabled()).isFalse()
        assertThat(service.isForceControlEnabled()).isTrue()
    }

    private fun pipeline(queryService: SearchRuntimeControlQueryService) =
        PostKeywordSearchPipelineService(
            enabled = true,
            candidatePoolSize = 220,
            maxRerankPages = 4,
            abEnabled = true,
            variantTrafficPercent = 25,
            controlTitleWeight = 300.0,
            controlTagWeight = 120.0,
            controlContentWeight = 40.0,
            controlFreshnessWeight = 1.0,
            variantTitleWeight = 260.0,
            variantTagWeight = 180.0,
            variantContentWeight = 70.0,
            variantFreshnessWeight = 1.1,
            shadowReadEnabled = true,
            compareTopN = 20,
            warnDeltaThreshold = 0.45,
            shadowExternalEnabled = false,
            shadowExternalEndpoint = "",
            shadowExternalApiKey = "",
            connectTimeoutMs = 300,
            requestTimeoutMs = 800,
            objectMapper = mock(ObjectMapper::class.java),
            searchRuntimeControlQueryService = queryService,
        )
}
