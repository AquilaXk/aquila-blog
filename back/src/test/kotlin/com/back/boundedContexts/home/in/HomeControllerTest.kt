package com.back.boundedContexts.home.`in`

import com.back.global.app.app.AppFacade
import org.junit.jupiter.api.Test
import org.springframework.mock.env.MockEnvironment
import org.springframework.mock.web.MockHttpSession
import tools.jackson.databind.ObjectMapper

class HomeControllerTest {
    private val controller = HomeController()

    init {
        AppFacade(
            environment = MockEnvironment(),
            objectMapper = ObjectMapper(),
        )
    }

    @Test
    fun `메인 페이지는 API 서버 안내 HTML을 반환한다`() {
        val html = controller.main()

        org.assertj.core.api.Assertions
            .assertThat(html)
            .contains("API 서버")
        org.assertj.core.api.Assertions
            .assertThat(html)
            .doesNotContain("/swagger-ui/index.html")
    }

    @Test
    fun `세션 조회는 맵 형태 응답을 반환한다`() {
        val session = MockHttpSession().apply { setAttribute("memberId", 1) }

        val result = controller.session(session)

        org.assertj.core.api.Assertions
            .assertThat(result)
            .containsEntry("memberId", 1)
    }
}
