package com.back.perf

import com.back.boundedContexts.member.application.service.ActorApplicationService
import com.back.boundedContexts.member.application.service.MemberApplicationService
import com.back.boundedContexts.post.application.service.PostApplicationService
import com.back.support.SeededSpringBootTestSupport
import jakarta.persistence.EntityManagerFactory
import org.assertj.core.api.Assertions.assertThat
import org.hibernate.SessionFactory
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.security.test.context.support.WithUserDetails
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.TestPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import org.springframework.transaction.annotation.Transactional

@ActiveProfiles("test")
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@TestPropertySource(
    properties = [
        "spring.jpa.properties.hibernate.generate_statistics=true",
        "spring.task.scheduling.enabled=false",
    ],
)
@org.junit.jupiter.api.DisplayName("PerformanceSanity 테스트")
class PerformanceSanityTest : SeededSpringBootTestSupport() {
    @Autowired
    private lateinit var mvc: MockMvc

    @Autowired
    private lateinit var actorApplicationService: ActorApplicationService

    @Autowired
    private lateinit var memberApplicationService: MemberApplicationService

    @Autowired
    private lateinit var postFacade: PostApplicationService

    @Autowired
    private lateinit var entityManagerFactory: EntityManagerFactory

    private val statistics
        get() = entityManagerFactory.unwrap(SessionFactory::class.java).statistics

    @BeforeEach
    fun setUp() {
        statistics.clear()
    }

    @Test
    fun `post list query count sanity`() {
        val admin = actorApplicationService.findByUsername("admin")!!
        postFacade.write(admin, "sanity list title", "sanity list content", true, true)
        statistics.clear()

        mvc
            .get("/post/api/v1/posts?page=1&pageSize=10")
            .andExpect {
                status { isOk() }
            }

        assertQueryCountWithin("post-list", 18)
    }

    @Test
    fun `post detail query count sanity`() {
        val admin = actorApplicationService.findByUsername("admin")!!
        val post = postFacade.write(admin, "sanity detail title", "sanity detail content", true, true)
        statistics.clear()

        mvc
            .get("/post/api/v1/posts/${post.id}")
            .andExpect {
                status { isOk() }
            }

        assertQueryCountWithin("post-detail", 8)
    }

    @Test
    @WithUserDetails("user1")
    fun `write comment query count sanity`() {
        val admin = actorApplicationService.findByUsername("admin")!!
        val post = postFacade.write(admin, "sanity comment title", "sanity comment content", true, true)
        statistics.clear()

        mvc
            .post("/post/api/v1/posts/${post.id}/comments") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"content":"댓글 내용"}"""
            }.andExpect {
                status { isCreated() }
            }

        assertQueryCountWithin("comment-write", 20)
    }

    @Test
    @WithUserDetails("user1")
    fun `like put query count sanity`() {
        val admin = actorApplicationService.findByUsername("admin")!!
        val post = postFacade.write(admin, "sanity like title", "sanity like content", true, true)
        statistics.clear()

        mvc
            .put("/post/api/v1/posts/${post.id}/like")
            .andExpect {
                status { isOk() }
            }

        assertQueryCountWithin("like-put", 18)
    }

    @Test
    fun `auth login query count sanity`() {
        memberApplicationService.join(
            username = "perf-login-user",
            password = "Abcd1234!",
            nickname = "퍼프로그인",
            profileImgUrl = null,
            email = "perf-login-user@example.com",
        )
        statistics.clear()

        mvc
            .post("/member/api/v1/auth/login") {
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                        "email": "perf-login-user@example.com",
                        "password": "Abcd1234!"
                    }
                    """.trimIndent()
            }.andExpect {
                status { isOk() }
            }

        assertQueryCountWithin("auth-login", 10)
    }

    private fun assertQueryCountWithin(
        scenario: String,
        maxInclusive: Long,
    ) {
        val queryCount = statistics.prepareStatementCount
        println("PERF_SANITY scenario=$scenario queryCount=$queryCount max=$maxInclusive")
        assertThat(queryCount).isBetween(1, maxInclusive)
    }
}
