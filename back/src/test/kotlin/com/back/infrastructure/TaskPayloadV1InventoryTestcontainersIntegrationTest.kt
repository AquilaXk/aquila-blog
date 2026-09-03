package com.back.infrastructure

import org.junit.jupiter.api.Test
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import org.testcontainers.utility.DockerImageName
import java.nio.file.Path
import kotlin.test.assertEquals
import kotlin.test.assertTrue

@Testcontainers
class TaskPayloadV1InventoryTestcontainersIntegrationTest {
    companion object {
        @Container
        private val postgres =
            PostgreSQLContainer(
                DockerImageName
                    .parse("jangka512/pgj@sha256:a8bfcb8e5c64805429cd1406d0840ba1c13f70830e73d9f5e4a63cd7c1b62da7")
                    .asCompatibleSubstituteFor("postgres"),
            ).apply {
                withDatabaseName("blog_task_payload_inventory")
                withUsername("postgres")
                withPassword("postgres")
            }
    }

    @Test
    fun `tracked inventory executes on PostgreSQL and preserves exhaustive partitions`() {
        postgres.createConnection("").use { connection ->
            connection.createStatement().use { statement ->
                statement.execute(
                    """
                    CREATE TABLE task (
                        uid UUID NOT NULL,
                        aggregate_type TEXT NOT NULL,
                        aggregate_id BIGINT NOT NULL,
                        task_type TEXT NOT NULL,
                        status TEXT,
                        execution_lease_token UUID,
                        payload_redacted_at TIMESTAMPTZ,
                        payload TEXT
                    )
                    """.trimIndent(),
                )
                statement.executeUpdate(
                    """
                    INSERT INTO task (
                        uid, aggregate_type, aggregate_id, task_type, status, payload
                    ) VALUES (
                        '00000000-0000-0000-0000-000000000001',
                        'Post',
                        1,
                        'post.write.side-effect',
                        'PENDING',
                        jsonb_build_object(
                            'schemaVersion', 2,
                            'taskType', 'post.write.side-effect',
                            'sensitivity', 'INTERNAL',
                            'createdAtEpochMs', 1,
                            'expiresAtEpochMs', NULL,
                            'payloadJson', jsonb_build_object(
                                'uid', '00000000-0000-0000-0000-000000000001',
                                'aggregateType', 'Post',
                                'aggregateId', '1'
                            )::TEXT
                        )::TEXT
                    ), (
                        '00000000-0000-0000-0000-000000000002',
                        'Post',
                        2,
                        'post.write.side-effect',
                        'PENDING',
                        '{}'::JSONB::TEXT
                    )
                    """.trimIndent(),
                )
            }

            val sql =
                Path
                    .of("..", "deploy", "homeserver", "sql", "task_payload_v1_inventory.sql")
                    .toFile()
                    .readText()
            val statements = sql.split(';').map(String::trim).filter(String::isNotEmpty)
            assertEquals(5, statements.size)

            try {
                connection.createStatement().use { statement ->
                    statements.take(3).forEach(statement::execute)
                    statement.executeQuery(statements[3]).use { result ->
                        assertTrue(result.next())
                        assertTrue(result.getBoolean("read_only"))
                        assertEquals(2, result.getInt("total_count"))
                        assertEquals(1, result.getInt("schema_less_count"))
                        assertEquals(1, result.getInt("valid_v2_count"))
                        assertTrue(result.getBoolean("payload_partition_ok"))
                        assertTrue(result.getBoolean("flat_v1_status_partition_ok"))
                        assertTrue(result.getBoolean("flat_v1_type_partition_ok"))
                    }
                }
            } finally {
                connection.createStatement().use { statement ->
                    statement.execute(statements[4])
                }
            }
        }
    }
}
