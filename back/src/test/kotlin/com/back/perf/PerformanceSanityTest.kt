package com.back.perf

import com.back.boundedContexts.member.application.service.ActorApplicationService
import com.back.boundedContexts.post.application.service.PostApplicationService
import com.back.boundedContexts.post.model.PostSummaryMode
import com.back.support.BasePerformanceIntegrationTest
import jakarta.persistence.EntityManagerFactory
import org.assertj.core.api.Assertions.assertThat
import org.hibernate.SessionFactory
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.test.web.servlet.get

@org.junit.jupiter.api.DisplayName("PerformanceSanity 테스트")
class PerformanceSanityTest : BasePerformanceIntegrationTest() {
    @Autowired
    private lateinit var actorApplicationService: ActorApplicationService

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
        val admin = actorApplicationService.findByEmail("admin@test.com")!!
        postFacade.write(admin, "sanity list title", "sanity list content", true, true, summaryMode = PostSummaryMode.AUTO)
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
        val admin = actorApplicationService.findByEmail("admin@test.com")!!
        val post = postFacade.write(admin, "sanity detail title", "sanity detail content", true, true, summaryMode = PostSummaryMode.AUTO)
        statistics.clear()

        mvc
            .get("/post/api/v1/posts/${post.id}")
            .andExpect {
                status { isOk() }
            }

        assertQueryCountWithin("post-detail", 8)
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
