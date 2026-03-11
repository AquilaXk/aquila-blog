package com.back.perf

import com.back.boundedContexts.member.app.shared.ActorFacade
import com.back.boundedContexts.post.app.PostFacade
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
import org.springframework.transaction.annotation.Transactional

@ActiveProfiles("test")
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@TestPropertySource(
    properties = [
        "spring.jpa.properties.hibernate.generate_statistics=true",
    ],
)
class PerformanceSanityTest {
    @Autowired
    private lateinit var mvc: MockMvc

    @Autowired
    private lateinit var actorFacade: ActorFacade

    @Autowired
    private lateinit var postFacade: PostFacade

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
        val admin = actorFacade.findByUsername("admin")!!
        postFacade.write(admin, "sanity list title", "sanity list content", true, true)
        statistics.clear()

        mvc.get("/post/api/v1/posts?page=1&pageSize=10")
            .andExpect {
                status { isOk() }
            }

        assertQueryCountWithin("post-list", 18)
    }

    @Test
    fun `post detail query count sanity`() {
        val admin = actorFacade.findByUsername("admin")!!
        val post = postFacade.write(admin, "sanity detail title", "sanity detail content", true, true)
        statistics.clear()

        mvc.get("/post/api/v1/posts/${post.id}")
            .andExpect {
                status { isOk() }
            }

        assertQueryCountWithin("post-detail", 12)
    }

    @Test
    @WithUserDetails("user1")
    fun `write comment query count sanity`() {
        val admin = actorFacade.findByUsername("admin")!!
        val post = postFacade.write(admin, "sanity comment title", "sanity comment content", true, true)
        statistics.clear()

        mvc.post("/post/api/v1/posts/${post.id}/comments") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"content":"댓글 내용"}"""
        }.andExpect {
            status { isCreated() }
        }

        assertQueryCountWithin("comment-write", 20)
    }

    @Test
    @WithUserDetails("user1")
    fun `toggle like query count sanity`() {
        val admin = actorFacade.findByUsername("admin")!!
        val post = postFacade.write(admin, "sanity like title", "sanity like content", true, true)
        statistics.clear()

        mvc.post("/post/api/v1/posts/${post.id}/like")
            .andExpect {
                status { isOk() }
            }

        assertQueryCountWithin("like-toggle", 18)
    }

    @Test
    fun `auth login query count sanity`() {
        statistics.clear()

        mvc.post("/member/api/v1/auth/login") {
            contentType = MediaType.APPLICATION_JSON
            content =
                """
                {
                    "username": "user1",
                    "password": "1234"
                }
                """.trimIndent()
        }.andExpect {
            status { isOk() }
        }

        assertQueryCountWithin("auth-login", 10)
    }

    private fun assertQueryCountWithin(scenario: String, maxInclusive: Long) {
        val queryCount = statistics.prepareStatementCount
        println("PERF_SANITY scenario=$scenario queryCount=$queryCount max=$maxInclusive")
        assertThat(queryCount).isBetween(1, maxInclusive)
    }
}
