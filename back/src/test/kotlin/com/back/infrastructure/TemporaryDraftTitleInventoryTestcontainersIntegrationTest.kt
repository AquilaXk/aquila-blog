package com.back.infrastructure

import org.junit.jupiter.api.Test
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import org.testcontainers.utility.DockerImageName
import java.nio.file.Path
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

@Testcontainers
class TemporaryDraftTitleInventoryTestcontainersIntegrationTest {
    companion object {
        @Container
        private val postgres =
            PostgreSQLContainer(
                DockerImageName
                    .parse("jangka512/pgj@sha256:a8bfcb8e5c64805429cd1406d0840ba1c13f70830e73d9f5e4a63cd7c1b62da7")
                    .asCompatibleSubstituteFor("postgres"),
            ).apply {
                withDatabaseName("blog_temporary_draft_title_inventory")
                withUsername("postgres")
                withPassword("postgres")
            }
    }

    @Test
    fun `inventory aggregates draft title migration candidates without exposing row data`() {
        postgres.createConnection("").use { connection ->
            connection.createStatement().use { statement ->
                statement.execute(
                    """
                    CREATE TABLE member_attr (
                        subject_id BIGINT NOT NULL,
                        name TEXT NOT NULL,
                        str_value TEXT
                    )
                    """.trimIndent(),
                )
                statement.execute(
                    """
                    CREATE TABLE post (
                        id BIGINT PRIMARY KEY,
                        author_id BIGINT NOT NULL,
                        title TEXT NOT NULL,
                        listed BOOLEAN NOT NULL,
                        published BOOLEAN NOT NULL,
                        deleted_at TIMESTAMPTZ
                    )
                    """.trimIndent(),
                )
                seedFixtures(statement)
            }

            val statements =
                Path
                    .of("..", "deploy", "homeserver", "sql", "temporary_draft_title_inventory.sql")
                    .toFile()
                    .readText()
                    .split(';')
                    .map(String::trim)
                    .filter(String::isNotEmpty)
            assertEquals(5, statements.size)

            try {
                connection.createStatement().use { statement ->
                    statements.take(3).forEach(statement::execute)
                    statement.executeQuery(statements[3]).use { result ->
                        assertEquals(17, result.metaData.columnCount)
                        assertEquals(
                            listOf(
                                "read_only",
                                "marker_count",
                                "cleared_marker_count",
                                "nonblank_marker_count",
                                "valid_active_marker_count",
                                "invalid_nonblank_marker_count",
                                "legacy_title_candidate_count",
                                "tracked_legacy_title_candidate_count",
                                "untracked_legacy_title_candidate_count",
                                "untracked_legacy_author_count",
                                "ambiguous_untracked_author_count",
                                "untracked_author_with_active_marker_count",
                                "legacy_title_listed_count",
                                "canonical_nonlegacy_title_count",
                                "canonical_listed_count",
                                "marker_partition_ok",
                                "legacy_partition_ok",
                            ),
                            (1..result.metaData.columnCount).map(result.metaData::getColumnLabel),
                        )
                        assertTrue(result.next())
                        assertTrue(result.getBoolean("read_only"))
                        assertEquals(9, result.getInt("marker_count"))
                        assertEquals(1, result.getInt("cleared_marker_count"))
                        assertEquals(8, result.getInt("nonblank_marker_count"))
                        assertEquals(3, result.getInt("valid_active_marker_count"))
                        assertEquals(5, result.getInt("invalid_nonblank_marker_count"))
                        assertEquals(5, result.getInt("legacy_title_candidate_count"))
                        assertEquals(1, result.getInt("tracked_legacy_title_candidate_count"))
                        assertEquals(4, result.getInt("untracked_legacy_title_candidate_count"))
                        assertEquals(3, result.getInt("untracked_legacy_author_count"))
                        assertEquals(1, result.getInt("ambiguous_untracked_author_count"))
                        assertEquals(1, result.getInt("untracked_author_with_active_marker_count"))
                        assertEquals(1, result.getInt("legacy_title_listed_count"))
                        assertEquals(2, result.getInt("canonical_nonlegacy_title_count"))
                        assertEquals(1, result.getInt("canonical_listed_count"))
                        assertTrue(result.getBoolean("marker_partition_ok"))
                        assertTrue(result.getBoolean("legacy_partition_ok"))
                        assertFalse(result.next())
                    }
                }
            } finally {
                connection.createStatement().use { statement ->
                    statement.execute(statements[4])
                }
            }
        }
    }

    private fun seedFixtures(statement: java.sql.Statement) {
        statement.executeUpdate(
            """
            INSERT INTO post (id, author_id, title, listed, published, deleted_at) VALUES
                (11, 2, 'renamed draft', FALSE, FALSE, NULL),
                (12, 3, '임시글', FALSE, FALSE, NULL),
                (13, 4, 'listed canonical draft', TRUE, FALSE, NULL),
                (21, 10, '임시글', TRUE, FALSE, NULL),
                (22, 11, '임시글', FALSE, FALSE, NULL),
                (23, 11, '임시글', FALSE, FALSE, NULL),
                (24, 2, '임시글', FALSE, FALSE, NULL),
                (31, 70, 'foreign draft', FALSE, FALSE, NULL),
                (32, 8, 'published draft', FALSE, TRUE, NULL),
                (33, 9, 'deleted draft', FALSE, FALSE, CURRENT_TIMESTAMP),
                (40, 14, 'missing marker draft', FALSE, FALSE, NULL)
            """.trimIndent(),
        )
        statement.executeUpdate(
            """
            INSERT INTO member_attr (subject_id, name, str_value) VALUES
                (1, 'activeTempDraftPostId', '   '),
                (2, 'activeTempDraftPostId', '11'),
                (3, 'activeTempDraftPostId', '12'),
                (4, 'activeTempDraftPostId', '13'),
                (5, 'activeTempDraftPostId', 'not-a-number'),
                (6, 'activeTempDraftPostId', '999'),
                (7, 'activeTempDraftPostId', '31'),
                (8, 'activeTempDraftPostId', '32'),
                (9, 'activeTempDraftPostId', '33')
            """.trimIndent(),
        )
    }
}
