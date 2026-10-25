package com.back.boundedContexts.post.application.service

import com.back.boundedContexts.member.domain.shared.Member
import com.back.boundedContexts.post.domain.Post
import com.back.global.system.application.SearchRuntimeControlQueryService
import com.back.standard.dto.post.type1.PostSearchSortType1
import com.sun.net.httpserver.HttpServer
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.mockito.Mockito.`when`
import tools.jackson.module.kotlin.jacksonObjectMapper
import java.net.InetSocketAddress
import java.time.Duration
import java.time.Instant
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference

class PostKeywordSearchPipelineServiceTest {
    private val objectMapper = jacksonObjectMapper()

    @Test
    fun `force control reads authoritative runtime control for every call`() {
        val queryService = mock(SearchRuntimeControlQueryService::class.java)
        `when`(queryService.isPipelineForceControlEnabled()).thenReturn(true, false, true)
        val service = pipeline(queryService)

        assertThat(service.isForceControlEnabled()).isTrue()
        assertThat(service.isForceControlEnabled()).isFalse()
        assertThat(service.isForceControlEnabled()).isTrue()
    }

    @Test
    fun `shouldApply and resolveCandidatePoolSize enforce pipeline guardrails`() {
        val queryService = mock(SearchRuntimeControlQueryService::class.java)
        val enabledService = pipeline(queryService)
        val disabledService = pipeline(queryService, enabled = false)

        assertThat(disabledService.shouldApply("kotlin", PostSearchSortType1.CREATED_AT, 1)).isFalse()
        assertThat(enabledService.shouldApply("   ", PostSearchSortType1.CREATED_AT, 1)).isFalse()
        assertThat(enabledService.shouldApply("kotlin", PostSearchSortType1.HIT_COUNT, 1)).isFalse()
        assertThat(enabledService.shouldApply("kotlin", PostSearchSortType1.CREATED_AT, 0)).isFalse()
        assertThat(enabledService.shouldApply("kotlin", PostSearchSortType1.CREATED_AT, 5)).isFalse()
        assertThat(enabledService.shouldApply("kotlin", PostSearchSortType1.CREATED_AT, 1)).isTrue()

        assertThat(enabledService.resolveCandidatePoolSize(10)).isEqualTo(220)
        assertThat(enabledService.resolveCandidatePoolSize(80)).isEqualTo(320)
        assertThat(enabledService.resolveCandidatePoolSize(15) % 15).isEqualTo(0)
        assertThat(enabledService.shouldApply("kotlin", PostSearchSortType1.CREATED_AT, 5, 20)).isTrue()
        assertThat(enabledService.shouldApply("kotlin", PostSearchSortType1.CREATED_AT, 11, 20)).isTrue()
        assertThat(enabledService.shouldApply("kotlin", PostSearchSortType1.CREATED_AT, 12, 20)).isFalse()
    }

    @Test
    fun `rerank fuses title tag and content token hits across freshness tiers and shadow ab`() {
        val queryService = mock(SearchRuntimeControlQueryService::class.java)
        `when`(queryService.isPipelineForceControlEnabled()).thenReturn(false)
        val meterRegistry = SimpleMeterRegistry()
        val service =
            pipeline(
                queryService = queryService,
                abEnabled = true,
                variantTrafficPercent = 100,
                shadowReadEnabled = true,
                warnDeltaThreshold = 0.0,
                meterRegistry = meterRegistry,
            )
        val now = Instant.now()
        val p1 =
            testPost(
                id = 1L,
                title = "kotlin spring",
                content = "tags: [kotlin, spring]\n\nkotlin spring guide",
                createdAt = now.minus(Duration.ofHours(2)),
            )
        val p2 =
            testPost(
                id = 2L,
                title = "kotlin notes",
                content = "tags: [kotlin]\n\nbody without second token",
                createdAt = now.minus(Duration.ofHours(12)),
            )
        val p3 =
            testPost(
                id = 3L,
                title = "general post",
                content = "tags: [spring]\n\nkotlin mention",
                createdAt = now.minus(Duration.ofHours(48)),
            )
        val p4 =
            testPost(
                id = 4L,
                title = "archive",
                content = "kotlin archive",
                createdAt = now.minus(Duration.ofHours(120)),
            )
        val p5 =
            testPost(
                id = 5L,
                title = "older archive",
                content = "other",
                createdAt = now.minus(Duration.ofHours(240)),
            )

        assertThat(service.rerank("kotlin", emptyList(), 1, 10, 0).content).isEmpty()

        val firstPage = service.rerank("kotlin spring a", listOf(p5, p4, p3, p2, p1), 1, 2, 10)
        val outOfRangePage = service.rerank("kotlin spring", listOf(p1, p2), 5, 2, 2)

        assertThat(firstPage.content.map { it.id }).containsExactly(1L, 2L)
        assertThat(firstPage.totalElements).isEqualTo(10L)
        assertThat(outOfRangePage.content).isEmpty()

        val controlService =
            pipeline(
                queryService = queryService,
                abEnabled = false,
                variantTrafficPercent = 0,
                shadowReadEnabled = false,
                meterRegistry = meterRegistry,
            )
        val controlPage = controlService.rerank("kotlin", listOf(p2, p1), 1, 5, 2)
        assertThat(controlPage.content.map { it.id }).containsExactly(1L, 2L)
    }

    @Test
    fun `external shadow comparison handles array object empty non2xx and failure responses`() {
        val queryService = mock(SearchRuntimeControlQueryService::class.java)
        `when`(queryService.isPipelineForceControlEnabled()).thenReturn(true)
        val meterRegistry = SimpleMeterRegistry()
        val responseStatus = AtomicInteger(200)
        val responseBody = AtomicReference("[2, 1, -1]")
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/shadow") { exchange ->
            val bytes = responseBody.get().toByteArray()
            exchange.sendResponseHeaders(responseStatus.get(), bytes.size.toLong())
            exchange.responseBody.use { it.write(bytes) }
        }
        server.start()
        val endpoint = "http://127.0.0.1:${server.address.port}/shadow"
        val candidates =
            listOf(
                testPost(1L, "kotlin 1", "kotlin body", Instant.now()),
                testPost(2L, "kotlin 2", "kotlin body", Instant.now().minusSeconds(60)),
            )

        try {
            val externalService =
                pipeline(
                    queryService = queryService,
                    shadowExternalEnabled = true,
                    shadowExternalEndpoint = endpoint,
                    shadowExternalApiKey = "test-api-key",
                    meterRegistry = meterRegistry,
                )

            externalService.rerank("kotlin", candidates, 1, 10, 2)

            responseBody.set("""{"postIds":[1, 2, 0]}""")
            externalService.rerank("kotlin", candidates, 1, 10, 2)

            responseBody.set("""{"other":1}""")
            externalService.rerank("kotlin", candidates, 1, 10, 2)

            responseBody.set("not-json")
            externalService.rerank("kotlin", candidates, 1, 10, 2)

            responseStatus.set(503)
            responseBody.set("unavailable")
            externalService.rerank("kotlin", candidates, 1, 10, 2)
        } finally {
            server.stop(0)
        }

        val failedExternalService =
            pipeline(
                queryService = queryService,
                shadowExternalEnabled = true,
                shadowExternalEndpoint = "http://127.0.0.1:1/unreachable",
                shadowExternalApiKey = "",
                meterRegistry = meterRegistry,
            )
        failedExternalService.rerank("kotlin", candidates, 1, 10, 2)

        assertThat(
            meterRegistry
                .get("post.search.pipeline.shadow.external.result")
                .tag("status", "success")
                .counter()
                .count(),
        ).isEqualTo(2.0)
        assertThat(
            meterRegistry
                .get("post.search.pipeline.shadow.external.result")
                .tag("status", "empty")
                .counter()
                .count(),
        ).isEqualTo(2.0)
        assertThat(
            meterRegistry
                .get("post.search.pipeline.shadow.external.result")
                .tag("status", "non_success")
                .counter()
                .count(),
        ).isEqualTo(1.0)
        assertThat(
            meterRegistry
                .get("post.search.pipeline.shadow.external.result")
                .tag("status", "failed")
                .counter()
                .count(),
        ).isEqualTo(1.0)
    }

    private fun testPost(
        id: Long,
        title: String,
        content: String,
        createdAt: Instant,
    ): Post =
        Post(
            id = id,
            author = Member(id = 1L, username = "author", nickname = "작성자", apiKey = "key"),
            title = title,
            content = content,
            published = true,
            listed = true,
        ).also {
            it.createdAt = createdAt
            it.modifiedAt = createdAt
        }

    private fun pipeline(
        queryService: SearchRuntimeControlQueryService,
        enabled: Boolean = true,
        abEnabled: Boolean = true,
        variantTrafficPercent: Int = 25,
        shadowReadEnabled: Boolean = true,
        warnDeltaThreshold: Double = 0.45,
        shadowExternalEnabled: Boolean = false,
        shadowExternalEndpoint: String = "",
        shadowExternalApiKey: String = "",
        meterRegistry: SimpleMeterRegistry? = null,
    ) = PostKeywordSearchPipelineService(
        enabled = enabled,
        candidatePoolSize = 220,
        maxRerankPages = 4,
        abEnabled = abEnabled,
        variantTrafficPercent = variantTrafficPercent,
        controlTitleWeight = 300.0,
        controlTagWeight = 120.0,
        controlContentWeight = 40.0,
        controlFreshnessWeight = 1.0,
        variantTitleWeight = 260.0,
        variantTagWeight = 180.0,
        variantContentWeight = 70.0,
        variantFreshnessWeight = 1.1,
        shadowReadEnabled = shadowReadEnabled,
        compareTopN = 20,
        warnDeltaThreshold = warnDeltaThreshold,
        shadowExternalEnabled = shadowExternalEnabled,
        shadowExternalEndpoint = shadowExternalEndpoint,
        shadowExternalApiKey = shadowExternalApiKey,
        connectTimeoutMs = 300,
        requestTimeoutMs = 800,
        objectMapper = objectMapper,
        searchRuntimeControlQueryService = queryService,
        meterRegistry = meterRegistry,
    )
}
