package com.back.boundedContexts.post.`in`

import com.back.boundedContexts.member.app.shared.ActorFacade
import com.back.boundedContexts.post.app.PostFacade
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

    @Autowired
    private lateinit var postFacade: PostFacade

    @Autowired
    private lateinit var actorFacade: ActorFacade

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

    @Test
    @WithUserDetails("admin")
    fun `관리자는 숨김글을 포함한 전체 글 목록을 조회할 수 있다`() {
        val actor = actorFacade.findByUsername("user1")!!
        val privatePost = postFacade.write(
            author = actor,
            title = "관리자 검색용 숨김 글",
            content = "숨김 내용",
            published = false,
            listed = false
        )

        mvc.get("/post/api/v1/adm/posts") {
            param("kw", "관리자 검색용 숨김")
        }.andExpect {
            status { isOk() }
            jsonPath("$.content.length()") { value(1) }
            jsonPath("$.content[0].id") { value(privatePost.id) }
            jsonPath("$.content[0].published") { value(false) }
            jsonPath("$.content[0].listed") { value(false) }
        }
    }

    @Test
    @WithUserDetails("user1")
    fun `일반 사용자는 관리자 글 목록을 조회할 수 없다`() {
        mvc.get("/post/api/v1/adm/posts").andExpect {
            status { isForbidden() }
            jsonPath("$.resultCode") { value("403-1") }
        }
    }

    @Test
    fun `비로그인 사용자는 관리자 글 목록을 조회할 수 없다`() {
        mvc.get("/post/api/v1/adm/posts").andExpect {
            status { isUnauthorized() }
            jsonPath("$.resultCode") { value("401-1") }
        }
    }
}
