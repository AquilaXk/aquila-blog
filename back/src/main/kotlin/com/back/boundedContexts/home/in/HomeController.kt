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
            |<!doctype html>
            |<html lang="ko">
            |<head>
            |  <meta charset="UTF-8" />
            |  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            |  <title>API 서버</title>
            |  <style>
            |    body {
            |      margin: 0;
            |      padding: 24px 16px;
            |      font-family: "Noto Sans KR", system-ui, -apple-system, "Segoe UI", sans-serif;
            |      color: #111;
            |      background: #fff;
            |    }
            |
            |    h1 {
            |      margin: 0 0 28px;
            |      font-size: 64px;
            |      font-weight: 900;
            |      line-height: 1.05;
            |      letter-spacing: -0.04em;
            |    }
            |
            |    p {
            |      margin: 0 0 22px;
            |      font-size: 48px;
            |      line-height: 1.2;
            |    }
            |
            |    a {
            |      font-size: 50px;
            |      line-height: 1.2;
            |    }
            |
            |    @media (max-width: 900px) {
            |      h1 { font-size: 44px; }
            |      p, a { font-size: 30px; }
            |    }
            |  </style>
            |</head>
            |<body>
            |  <h1>API 서버__</h1>
            |  <p>Host Name: ${localHost.hostName}</p>
            |  <p>Host Address: ${localHost.hostAddress}</p>
            |</body>
            |</html>
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
