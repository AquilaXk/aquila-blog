package com.back.boundedContexts.post.`in`

import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.security.test.context.support.WithUserDetails
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.transaction.annotation.Transactional

@ActiveProfiles("test")
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class ApiV1AdmPostControllerTest {
    @Autowired
    private lateinit var mvc: MockMvc

    @Test
    @WithUserDetails("admin")
    fun `관리자는 글 통계를 조회할 수 있다`() {
        mvc.get("/post/api/v1/adm/posts/count").andExpect {
            status { isOk() }
            jsonPath("$.all") { isNumber() }
            jsonPath("$.secureTip") { isString() }
        }
    }

    @Test
    @WithUserDetails("user1")
    fun `일반 사용자는 관리자 글 통계를 조회할 수 없다`() {
        mvc.get("/post/api/v1/adm/posts/count").andExpect {
            status { isForbidden() }
            jsonPath("$.resultCode") { value("403-1") }
        }
    }

    @Test
    fun `비로그인 사용자는 관리자 글 통계를 조회할 수 없다`() {
        mvc.get("/post/api/v1/adm/posts/count").andExpect {
            status { isUnauthorized() }
            jsonPath("$.resultCode") { value("401-1") }
        }
    }
}
