package com.back.boundedContexts.home.`in`

import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.servlet.http.HttpSession
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController
import java.net.InetAddress

@RestController
@Tag(name = "HomeController", description = "홈 컨트롤러")
class HomeController {
    @GetMapping(produces = [MediaType.TEXT_HTML_VALUE])
    @Operation(summary = "메인 페이지")
    fun main(): String {
        val localHost = InetAddress.getLocalHost()

        return """
            |<h1>API 서버</h1>
            |<p>Host Name: ${localHost.hostName}</p>
            |<p>Host Address: ${localHost.hostAddress}</p>
            |<div>
            |    <a href="/swagger-ui/index.html">API 문서</a>
            |</div>
        """.trimMargin()
    }

    @GetMapping("/session")
    @Operation(summary = "세션 확인")
    fun session(session: HttpSession): Map<String, Any> {
        return session.attributeNames
            .asSequence()
            .associateWith { name -> session.getAttribute(name) }
    }
}
