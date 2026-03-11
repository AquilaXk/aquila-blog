package com.back.boundedContexts.home.`in`

import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.transaction.annotation.Transactional

@ActiveProfiles("test")
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class HomeControllerTest {
    @Autowired
    private lateinit var mvc: MockMvc

    @Test
    fun `메인 페이지는 API 서버 안내 HTML을 반환한다`() {
        mvc.get("/").andExpect {
            status { isOk() }
            content { string(org.hamcrest.Matchers.containsString("API 서버")) }
            content { string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("/swagger-ui/index.html"))) }
        }
    }

    @Test
    fun `세션 조회는 맵 형태 응답을 반환한다`() {
        mvc.get("/session").andExpect {
            status { isOk() }
            content { contentTypeCompatibleWith("application/json") }
        }
    }
}
