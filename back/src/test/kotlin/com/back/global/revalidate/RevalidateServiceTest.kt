package com.back.global.revalidate

import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpServer
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Test
import java.net.InetSocketAddress
import java.net.URI
import java.util.concurrent.CopyOnWriteArrayList

class RevalidateServiceTest {
    private var server: HttpServer? = null

    @AfterEach
    fun tearDown() {
        server?.stop(0)
        server = null
    }

    @Test
    fun `revalidate 성공 후 같은 path warm-up GET을 이어서 호출한다`() {
        val requests = CopyOnWriteArrayList<Pair<String, String>>()
        val bodies = CopyOnWriteArrayList<String>()
        val tokens = CopyOnWriteArrayList<String?>()

        server =
            HttpServer.create(InetSocketAddress(0), 0).apply {
                createContext("/api/revalidate") { exchange ->
                    requests += exchange.requestMethod to exchange.requestURI.path
                    bodies += exchange.requestBody.bufferedReader().use { it.readText() }
                    tokens += exchange.requestHeaders.getFirst("x-revalidate-token")
                    exchange.respond(200)
                }
                createContext("/posts/42") { exchange ->
                    requests += exchange.requestMethod to exchange.requestURI.path
                    exchange.respond(200)
                }
                start()
            }

        val baseUrl = "http://127.0.0.1:${server?.address?.port}"
        val service =
            RevalidateService(
                revalidateUrl = "$baseUrl/api/revalidate",
                revalidateToken = "secret-token",
            )

        service.revalidatePath("/posts/42")

        assertThat(requests)
            .containsExactly(
                "POST" to "/api/revalidate",
                "GET" to "/posts/42",
            )
        assertThat(bodies).containsExactly("""{"path":"/posts/42"}""")
        assertThat(tokens).containsExactly("secret-token")
    }

    @Test
    fun `상대경로가 아닌 값은 홈으로 정규화하고 same-origin warm-up을 사용한다`() {
        val requests = CopyOnWriteArrayList<Pair<String, String>>()

        server =
            HttpServer.create(InetSocketAddress(0), 0).apply {
                createContext("/api/revalidate") { exchange ->
                    requests += exchange.requestMethod to exchange.requestURI.path
                    exchange.respond(200)
                }
                createContext("/") { exchange ->
                    requests += exchange.requestMethod to exchange.requestURI.path
                    exchange.respond(200)
                }
                start()
            }

        val baseUri = URI("http://127.0.0.1:${server?.address?.port}")
        val service =
            RevalidateService(
                revalidateUrl = baseUri.resolve("/api/revalidate").toString(),
                revalidateToken = "secret-token",
            )

        service.revalidatePath("posts/42")

        assertThat(requests)
            .containsExactly(
                "POST" to "/api/revalidate",
                "GET" to "/",
            )
    }

    private fun HttpExchange.respond(status: Int) {
        sendResponseHeaders(status, -1)
        close()
    }
}
