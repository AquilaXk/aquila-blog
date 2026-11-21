package com.back.infrastructure

import com.back.boundedContexts.post.adapter.persistence.PostTagIndexJdbcRepository
import org.flywaydb.core.Flyway
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DataSourceTransactionManager
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.springframework.transaction.support.TransactionTemplate
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import org.testcontainers.utility.DockerImageName
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

@Testcontainers(disabledWithoutDocker = true)
class PostTagIndexCutoverTestcontainersIntegrationTest {
    companion object {
        @Container
        private val postgres =
            PostgreSQLContainer(
                DockerImageName.parse("jangka512/pgj:latest").asCompatibleSubstituteFor("postgres"),
            ).apply {
                withDatabaseName("blog_post_tag_index_cutover")
                withUsername("postgres")
                withPassword("postgres")
            }
    }

    private lateinit var jdbcTemplate: JdbcTemplate
    private lateinit var transactionTemplate: TransactionTemplate
    private lateinit var repository: PostTagIndexJdbcRepository

    @BeforeEach
    fun setUp() {
        val dataSource =
            DriverManagerDataSource(
                postgres.jdbcUrl,
                postgres.username,
                postgres.password,
            )
        Flyway
            .configure()
            .dataSource(dataSource)
            .locations("classpath:db/migration-test")
            .baselineOnMigrate(true)
            .validateOnMigrate(true)
            .load()
            .migrate()

        jdbcTemplate = JdbcTemplate(dataSource)
        transactionTemplate = TransactionTemplate(DataSourceTransactionManager(dataSource))
        repository = PostTagIndexJdbcRepository(jdbcTemplate)

        jdbcTemplate.execute("TRUNCATE TABLE post_tag_index, post, member CASCADE")
        jdbcTemplate.update(
            "INSERT INTO member (id, login_id, nickname, api_key) VALUES (?, ?, ?, ?)",
            1L,
            "tag-cutover",
            "tag-cutover",
            "tag-cutover-key",
        )
        jdbcTemplate.update(
            """
            INSERT INTO post (id, author_id, title, content, published, listed)
            VALUES (?, ?, ?, ?, TRUE, TRUE)
            """.trimIndent(),
            100L,
            1L,
            "tag cutover",
            "fixture",
        )
    }

    @Test
    fun `caller rollback leaves previously committed tags unchanged`() {
        transactionTemplate.executeWithoutResult {
            repository.replacePostTags(100L, listOf("committed"))
        }

        transactionTemplate.executeWithoutResult { status ->
            repository.replacePostTags(100L, listOf("rolled-back"))
            status.setRollbackOnly()
        }

        assertEquals(listOf("committed"), tagsFor(100L))
    }

    @Test
    fun `source row lock serializes concurrent source update and replacement`() {
        val firstLocked = CountDownLatch(1)
        val releaseFirst = CountDownLatch(1)
        val secondTransactionStarted = CountDownLatch(1)
        val secondFinished = CountDownLatch(1)

        Executors.newFixedThreadPool(2).use { executor ->
            val first =
                executor.submit<Unit> {
                    transactionTemplate.executeWithoutResult {
                        repository.findPostSourceForUpdate(100L)
                        repository.replacePostTags(100L, listOf("first"))
                        firstLocked.countDown()
                        check(releaseFirst.await(10, TimeUnit.SECONDS)) {
                            "first source lock release timed out"
                        }
                    }
                }

            assertTrue(firstLocked.await(10, TimeUnit.SECONDS), "first source read did not acquire lock")

            val second =
                executor.submit<Unit> {
                    transactionTemplate.executeWithoutResult {
                        secondTransactionStarted.countDown()
                        jdbcTemplate.update("UPDATE post SET content = ? WHERE id = ?", "tags: winner", 100L)
                        repository.replacePostTags(100L, listOf("winner"))
                        secondFinished.countDown()
                    }
                }

            try {
                assertTrue(
                    secondTransactionStarted.await(10, TimeUnit.SECONDS),
                    "second transaction did not start",
                )
                assertFalse(
                    secondFinished.await(500, TimeUnit.MILLISECONDS),
                    "concurrent source update bypassed the parent-row lock",
                )
            } finally {
                releaseFirst.countDown()
            }

            first.get(10, TimeUnit.SECONDS)
            second.get(10, TimeUnit.SECONDS)
        }

        assertEquals(listOf("winner"), tagsFor(100L))
    }

    private fun tagsFor(postId: Long): List<String> =
        jdbcTemplate.query(
            "SELECT tag FROM post_tag_index WHERE post_id = ? ORDER BY tag",
            { resultSet, _ -> resultSet.getString("tag") },
            postId,
        )
}
