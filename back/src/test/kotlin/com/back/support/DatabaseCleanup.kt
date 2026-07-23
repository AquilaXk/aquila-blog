package com.back.support

import com.back.boundedContexts.member.adapter.bootstrap.MemberNotProdInitData
import com.back.boundedContexts.post.adapter.bootstrap.PostNotProdInitData
import jakarta.persistence.EntityManager
import org.springframework.context.ApplicationContext
import org.springframework.dao.TransientDataAccessException
import org.springframework.data.redis.connection.RedisConnectionFactory
import org.springframework.jdbc.core.JdbcTemplate

class DatabaseCleanup(
    private val jdbcTemplate: JdbcTemplate,
    private val entityManager: EntityManager,
    private val applicationContext: ApplicationContext,
) {
    private val cleanupDeadlockMaxAttempts = 3

    fun cleanup() {
        entityManager.clear()

        truncateTables()

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

    private fun truncateTables() {
        var attempt = 1
        while (true) {
            try {
                jdbcTemplate.execute(TRUNCATE_TABLES_SQL)
                return
            } catch (exception: TransientDataAccessException) {
                if (attempt >= cleanupDeadlockMaxAttempts) {
                    throw exception
                }
                Thread.sleep(100L * attempt)
                attempt += 1
            }
        }
    }

    companion object {
        private val TRUNCATE_TABLES_SQL =
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
            """.trimIndent()
    }
}
