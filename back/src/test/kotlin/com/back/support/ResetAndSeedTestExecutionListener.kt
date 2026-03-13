package com.back.support

import com.back.boundedContexts.member.adapter.`in`.bootstrap.MemberNotProdInitData
import com.back.boundedContexts.post.adapter.`in`.bootstrap.PostNotProdInitData
import jakarta.persistence.EntityManager
import org.springframework.core.Ordered
import org.springframework.data.redis.connection.RedisConnectionFactory
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.TestContext
import org.springframework.test.context.support.AbstractTestExecutionListener

class ResetAndSeedTestExecutionListener : AbstractTestExecutionListener() {
    override fun getOrder(): Int = Ordered.HIGHEST_PRECEDENCE

    override fun beforeTestMethod(testContext: TestContext) {
        val applicationContext = testContext.applicationContext
        val jdbcTemplate = applicationContext.getBean(JdbcTemplate::class.java)
        val entityManager = applicationContext.getBean(EntityManager::class.java)

        entityManager.clear()

        jdbcTemplate.execute(
            """
            TRUNCATE TABLE
                uploaded_file,
                task,
                member_notification,
                member_action_log,
                member_signup_verification,
                post_comment,
                post_like,
                post_attr,
                post,
                member_attr,
                member
            RESTART IDENTITY
            CASCADE
            """.trimIndent(),
        )

        entityManager.clear()

        applicationContext
            .getBeanProvider(RedisConnectionFactory::class.java)
            .ifAvailable
            ?.connection
            ?.use { redisConnection ->
                redisConnection.serverCommands().flushDb()
            }

        applicationContext.getBean(MemberNotProdInitData::class.java).makeBaseMembers()
        applicationContext.getBean(PostNotProdInitData::class.java).makeBasePosts()
    }
}
