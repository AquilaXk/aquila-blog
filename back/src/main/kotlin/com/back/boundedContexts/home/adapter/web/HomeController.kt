package com.back.boundedContexts.home.adapter.web

import com.back.global.app.application.AppFacade
import com.back.global.exception.application.AppException
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.servlet.http.HttpSession
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController
import java.net.InetAddress

/**
 * HomeController는 웹 계층에서 HTTP 요청/응답을 처리하는 클래스입니다.
 * 입력 DTO 검증과 응답 포맷팅을 담당하고 비즈니스 처리는 애플리케이션 계층에 위임합니다.
 */
@RestController
@Tag(name = "HomeController", description = "홈 컨트롤러")
class HomeController {
    /**
     * main 처리 로직을 수행하고 예외 경로를 함께 다룹니다.
     * 컨트롤러 계층에서 요청 파라미터를 검증하고 서비스 결과를 API 응답 형식으로 변환합니다.
     */
    @GetMapping(produces = [MediaType.TEXT_HTML_VALUE])
    @Operation(summary = "메인 페이지")
    fun main(): String {
        val hostInfoBlock =
            if (AppFacade.isProd) {
                ""
            } else {
                val localHost = InetAddress.getLocalHost()
                """
                |  <p>Host Name: ${localHost.hostName}</p>
                |  <p>Host Address: ${localHost.hostAddress}</p>
                """.trimMargin()
            }

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
            |$hostInfoBlock
            |</body>
            |</html>
            """.trimMargin()
    }

    /**
     * session 처리 로직을 수행하고 예외 경로를 함께 다룹니다.
     * 컨트롤러 계층에서 요청 파라미터를 검증하고 서비스 결과를 API 응답 형식으로 변환합니다.
     */
    @GetMapping("/session")
    @Operation(summary = "세션 확인")
    fun session(session: HttpSession): Map<String, Any> {
        if (AppFacade.isProd) throw AppException("404-1", "존재하지 않는 엔드포인트입니다.")

        return session.attributeNames
            .asSequence()
            .associateWith { name -> session.getAttribute(name) }
    }
}
