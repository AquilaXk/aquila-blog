package com.back.infrastructure

import com.back.boundedContexts.post.adapter.persistence.PUBLIC_TAG_COUNTS_SQL
import com.back.boundedContexts.post.adapter.persistence.PostTagIndexJdbcRepository
import org.flywaydb.core.Flyway
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import org.testcontainers.utility.DockerImageName
import tools.jackson.databind.JsonNode
import tools.jackson.module.kotlin.jacksonObjectMapper
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

@Testcontainers
class PostTagIndexQueryPlanTestcontainersIntegrationTest {
    companion object {
        @Container
        private val postgres =
            PostgreSQLContainer(
                DockerImageName
                    .parse("jangka512/pgj@sha256:a8bfcb8e5c64805429cd1406d0840ba1c13f70830e73d9f5e4a63cd7c1b62da7")
                    .asCompatibleSubstituteFor("postgres"),
            ).apply {
                withDatabaseName("blog_tag_count_plan")
                withUsername("postgres")
                withPassword("postgres")
            }
    }

    private val objectMapper = jacksonObjectMapper()
    private lateinit var jdbcTemplate: JdbcTemplate
    private lateinit var repository: PostTagIndexJdbcRepository

    @BeforeEach
    fun setUp() {
        val dataSource = DriverManagerDataSource(postgres.jdbcUrl, postgres.username, postgres.password)
        Flyway
            .configure()
            .dataSource(dataSource)
            .locations("classpath:db/migration-test")
            .baselineOnMigrate(true)
            .validateOnMigrate(true)
            .load()
            .migrate()
        jdbcTemplate = JdbcTemplate(dataSource)
        repository = PostTagIndexJdbcRepository(jdbcTemplate)
        assertEquals(
            1,
            jdbcTemplate.queryForObject(
                "SELECT count(*) FROM flyway_schema_history WHERE version = '20260320.02' AND success",
                Int::class.java,
            ),
        )

        jdbcTemplate.execute("TRUNCATE TABLE post_tag_index, post_attr, post, member CASCADE")
        jdbcTemplate.update(
            "INSERT INTO member (id, login_id, nickname, api_key) VALUES (1, 'tag-plan', 'tag-plan', 'tag-plan-key')",
        )
        insertPost(1, published = true, listed = true, deleted = false)
        insertPost(2, published = true, listed = true, deleted = false)
        insertPost(3, published = false, listed = true, deleted = false)
        insertPost(4, published = true, listed = false, deleted = false)
        insertPost(5, published = true, listed = true, deleted = true)
        insertPost(6, published = true, listed = true, deleted = false)
        jdbcTemplate.batchUpdate(
            "INSERT INTO post_tag_index (post_id, tag) VALUES (?, ?)",
            listOf(
                arrayOf<Any>(1L, "Kotlin"),
                arrayOf<Any>(1L, "Alpha"),
                arrayOf<Any>(2L, "Kotlin"),
                arrayOf<Any>(2L, "Spring"),
                arrayOf<Any>(3L, "hidden-unpublished"),
                arrayOf<Any>(4L, "hidden-unlisted"),
                arrayOf<Any>(5L, "hidden-deleted"),
            ),
        )
        jdbcTemplate.update("INSERT INTO post_attr (subject_id, name, str_value) VALUES (6, 'metaTagsIndex', 'legacy-only')")
    }

    @Test
    fun `public tag counts use the migrated tag index aggregate plan`() {
        assertEquals(
            listOf("Kotlin" to 2, "Alpha" to 1, "Spring" to 1),
            repository.findAllPublicTagCounts().map { it.tag to it.count },
        )

        jdbcTemplate.execute("ANALYZE post")
        jdbcTemplate.execute("ANALYZE post_tag_index")
        val plan = explain(PUBLIC_TAG_COUNTS_SQL)
        assertTrue(isPublicTagCountAggregate(plan))

        val legacyPlan =
            explain(
                """
                SELECT pa.str_value, COUNT(*)::int
                FROM post_attr pa
                JOIN post p ON p.id = pa.subject_id
                WHERE pa.name = 'metaTagsIndex' AND p.deleted_at IS NULL AND p.published IS TRUE AND p.listed IS TRUE
                GROUP BY pa.str_value
                """.trimIndent(),
            )
        assertFalse(isPublicTagCountAggregate(legacyPlan))
    }

    private fun insertPost(
        id: Long,
        published: Boolean,
        listed: Boolean,
        deleted: Boolean,
    ) {
        jdbcTemplate.update(
            """
            INSERT INTO post (id, author_id, title, content, published, listed, deleted_at)
            VALUES (?, 1, ?, 'fixture', ?, ?, CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE NULL END)
            """.trimIndent(),
            id,
            "post-$id",
            published,
            listed,
            deleted,
        )
    }

    private fun explain(sql: String): JsonNode {
        val json = jdbcTemplate.queryForObject("EXPLAIN (FORMAT JSON) $sql") { resultSet, _ -> resultSet.getString(1) }
        return objectMapper.readTree(json).single()
    }

    private fun isPublicTagCountAggregate(plan: JsonNode): Boolean {
        val root = plan.path("Plan").takeUnless(JsonNode::isMissingNode) ?: return false
        return nodes(root).any { node ->
            node.path("Node Type").asText() == "Aggregate" &&
                descendants(node).containsAll(setOf("post_tag_index", "post")) &&
                "post_attr" !in descendants(node)
        }
    }

    private fun nodes(node: JsonNode): Sequence<JsonNode> =
        sequence {
            yield(node)
            childPlans(node).forEach { yieldAll(nodes(it)) }
        }

    private fun descendants(node: JsonNode): Set<String> =
        nodes(node)
            .map { it.path("Relation Name") }
            .filter(JsonNode::isTextual)
            .map(JsonNode::asText)
            .toSet()

    private fun childPlans(node: JsonNode): List<JsonNode> = node.path("Plans").toList()
}
