package com.back.support

import com.back.boundedContexts.member.adapter.bootstrap.MemberNotProdInitData
import com.back.boundedContexts.post.adapter.bootstrap.PostNotProdInitData
import jakarta.persistence.EntityManager
import org.springframework.context.ApplicationContext
import org.springframework.data.redis.connection.RedisConnectionFactory
import org.springframework.jdbc.core.JdbcTemplate

class DatabaseCleanup(
    private val jdbcTemplate: JdbcTemplate,
    private val entityManager: EntityManager,
    private val applicationContext: ApplicationContext,
) {
    fun cleanup() {
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
    }

    fun resetAndSeed() {
        cleanup()
        applicationContext.getBean(MemberNotProdInitData::class.java).makeBaseMembers()
        applicationContext.getBean(PostNotProdInitData::class.java).makeBasePosts()
        entityManager.clear()
    }
}
