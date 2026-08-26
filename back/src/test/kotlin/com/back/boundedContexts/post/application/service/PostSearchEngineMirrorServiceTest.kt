package com.back.boundedContexts.post.application.service

import com.back.global.system.application.SearchRuntimeControlQueryService
import com.sun.net.httpserver.HttpServer
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.mockito.Mockito.`when`
import tools.jackson.databind.ObjectMapper
import java.net.InetSocketAddress
import java.util.concurrent.atomic.AtomicInteger

class PostSearchEngineMirrorServiceTest {
    @Test
    fun `mirror sends only when authoritative control permits it`() {
        val requests = AtomicInteger(0)
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/mirror") { exchange ->
            requests.incrementAndGet()
            exchange.sendResponseHeaders(204, -1)
            exchange.close()
        }
        server.start()
        try {
            val queryService = mock(SearchRuntimeControlQueryService::class.java)
            `when`(queryService.isMirrorForceDisabled()).thenReturn(false, true, true)
            val service = mirror("http://127.0.0.1:${server.address.port}/mirror", queryService)

            service.mirror(postId = 1, tags = listOf("tag"), deleted = false)
            service.mirror(postId = 2, tags = listOf("tag"), deleted = false)
            service.mirror(postId = 3, tags = listOf("tag"), deleted = false)

            assertThat(requests.get()).isEqualTo(1)
        } finally {
            server.stop(0)
        }
    }

    private fun mirror(
        endpoint: String,
        queryService: SearchRuntimeControlQueryService,
    ): PostSearchEngineMirrorService =
        PostSearchEngineMirrorService(
            enabled = true,
            endpoint = endpoint,
            apiKey = "",
            connectTimeoutMs = 1_200,
            requestTimeoutMs = 2_500,
            maxTags = 32,
            failureThreshold = 5,
            circuitOpenSeconds = 60,
            objectMapper = ObjectMapper(),
            searchRuntimeControlQueryService = queryService,
        )
}
