package com.back.infrastructure

import org.flywaydb.core.Flyway
import org.junit.jupiter.api.Test
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import org.testcontainers.utility.DockerImageName
import java.sql.Connection
import java.sql.Types
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

@Testcontainers(disabledWithoutDocker = true)
class SearchRuntimeControlTestcontainersIntegrationTest {
    companion object {
        @Container
        private val postgres =
            PostgreSQLContainer(
                DockerImageName.parse("jangka512/pgj:latest").asCompatibleSubstituteFor("postgres"),
            ).apply {
                withDatabaseName("blog_search_runtime_control")
                withUsername("postgres")
                withPassword("postgres")
            }

        private const val PIPELINE_CONTROL_KEY = "PIPELINE_FORCE_CONTROL"
        private const val MIRROR_CONTROL_KEY = "MIRROR_FORCE_DISABLE"
        private const val UNSET = "UNSET"
        private const val ENABLED = "ENABLED"
        private const val DISABLED = "DISABLED"
        private const val PIPELINE_ACTION = "SEARCH_PIPELINE_FORCE_CONTROL"
        private const val MIRROR_ACTION = "SEARCH_ENGINE_MIRROR_FORCE_DISABLE"
        private const val PIPELINE_RESULT = "SEARCH_PIPELINE_FORCE_CONTROL_UPDATED"
        private const val MIRROR_RESULT = "SEARCH_ENGINE_MIRROR_FORCE_DISABLE_UPDATED"
    }

    @Test
    fun `search runtime controls seed receipts enforce control constraints and persist a locked terminal update`() {
        val jdbcTemplate = JdbcTemplate(dataSource())
        migrate()

        assertEquals(
            listOf(
                ControlState(MIRROR_CONTROL_KEY, ENABLED, 0, null),
                ControlState(PIPELINE_CONTROL_KEY, UNSET, 0, null),
            ),
            states(jdbcTemplate),
        )

        val pipelineOperationId = UUID.randomUUID()
        val mirrorOperationId = UUID.randomUUID()
        insertReceipt(
            jdbcTemplate,
            pipelineOperationId,
            PIPELINE_ACTION,
            null,
            null,
            null,
            PIPELINE_CONTROL_KEY,
            ENABLED,
            null,
            null,
        )
        insertReceipt(
            jdbcTemplate,
            mirrorOperationId,
            MIRROR_ACTION,
            null,
            null,
            null,
            MIRROR_CONTROL_KEY,
            DISABLED,
            1,
            MIRROR_RESULT,
            "SUCCEEDED",
        )
        insertReceipt(
            jdbcTemplate,
            UUID.randomUUID(),
            "TASK_DLQ_REPLAY",
            "MAIL_SIGNUP",
            1,
            false,
            null,
            null,
            null,
            null,
        )

        assertRejected {
            jdbcTemplate.update(
                "INSERT INTO search_runtime_control_state (control_key, control_value, version) VALUES (?, ?, 0)",
                "UNKNOWN",
                ENABLED,
            )
        }
        assertRejected {
            jdbcTemplate.update(
                "INSERT INTO search_runtime_control_state (control_key, control_value, version) VALUES (?, ?, 0)",
                PIPELINE_CONTROL_KEY,
                "UNKNOWN",
            )
        }
        assertRejected {
            jdbcTemplate.update(
                "INSERT INTO search_runtime_control_state (control_key, control_value, version) VALUES (?, ?, 0)",
                MIRROR_CONTROL_KEY,
                UNSET,
            )
        }
        assertRejected {
            jdbcTemplate.update(
                "UPDATE search_runtime_control_state SET version = -1 WHERE control_key = ?",
                PIPELINE_CONTROL_KEY,
            )
        }
        assertRejected {
            jdbcTemplate.update(
                "UPDATE search_runtime_control_state SET applied_operation_id = ? WHERE control_key = ?",
                UUID.randomUUID(),
                PIPELINE_CONTROL_KEY,
            )
        }
        assertRejected {
            insertReceipt(
                jdbcTemplate,
                UUID.randomUUID(),
                PIPELINE_ACTION,
                null,
                null,
                null,
                MIRROR_CONTROL_KEY,
                ENABLED,
                null,
                null,
            )
        }
        assertRejected {
            insertReceipt(
                jdbcTemplate,
                UUID.randomUUID(),
                PIPELINE_ACTION,
                "MAIL_SIGNUP",
                1,
                false,
                PIPELINE_CONTROL_KEY,
                ENABLED,
                null,
                null,
            )
        }

        postgres.createConnection("").use { connection ->
            connection.autoCommit = false
            val locked = stateForUpdate(connection, PIPELINE_CONTROL_KEY)
            assertEquals(ControlState(PIPELINE_CONTROL_KEY, UNSET, 0, null), locked)
            assertEquals(
                1,
                connection
                    .prepareStatement(
                        """
                        UPDATE search_runtime_control_state
                        SET control_value = ?, version = version + 1,
                        applied_operation_id = ?, modified_at = CURRENT_TIMESTAMP
                        WHERE control_key = ?
                        """.trimIndent(),
                    ).use { statement ->
                        statement.setString(1, ENABLED)
                        statement.setObject(2, pipelineOperationId)
                        statement.setString(3, PIPELINE_CONTROL_KEY)
                        statement.executeUpdate()
                    },
            )
            assertEquals(
                1,
                connection
                    .prepareStatement(
                        "UPDATE admin_operation_receipt SET status = ?, result_code = ?, " +
                            "control_version = ? WHERE operation_id = ?",
                    ).use { statement ->
                        statement.setString(1, "SUCCEEDED")
                        statement.setString(2, PIPELINE_RESULT)
                        statement.setInt(3, 1)
                        statement.setObject(4, pipelineOperationId)
                        statement.executeUpdate()
                    },
            )
            connection.commit()
        }

        postgres.createConnection("").use { connection ->
            assertEquals(
                ControlState(PIPELINE_CONTROL_KEY, ENABLED, 1, pipelineOperationId),
                state(connection, PIPELINE_CONTROL_KEY),
            )
            connection
                .prepareStatement(
                    "SELECT status, result_code, control_key, control_value, " +
                        "control_version FROM admin_operation_receipt WHERE operation_id = ?",
                ).use { statement ->
                    statement.setObject(1, pipelineOperationId)
                    statement.executeQuery().use { result ->
                        assertEquals(true, result.next())
                        assertEquals("SUCCEEDED", result.getString("status"))
                        assertEquals(PIPELINE_RESULT, result.getString("result_code"))
                        assertEquals(PIPELINE_CONTROL_KEY, result.getString("control_key"))
                        assertEquals(ENABLED, result.getString("control_value"))
                        assertEquals(1, result.getInt("control_version"))
                    }
                }
        }
    }

    private fun dataSource(): DriverManagerDataSource = DriverManagerDataSource(postgres.jdbcUrl, postgres.username, postgres.password)

    private fun migrate() {
        Flyway
            .configure()
            .dataSource(postgres.jdbcUrl, postgres.username, postgres.password)
            .locations("classpath:db/migration-test")
            .baselineOnMigrate(true)
            .validateOnMigrate(true)
            .load()
            .migrate()
    }

    private fun states(jdbcTemplate: JdbcTemplate): List<ControlState> =
        jdbcTemplate.query(
            "SELECT control_key, control_value, version, applied_operation_id FROM search_runtime_control_state ORDER BY control_key",
            { result, _ ->
                ControlState(
                    result.getString("control_key"),
                    result.getString("control_value"),
                    result.getLong("version"),
                    result.getObject("applied_operation_id", UUID::class.java),
                )
            },
        )

    private fun insertReceipt(
        jdbcTemplate: JdbcTemplate,
        operationId: UUID,
        action: String,
        taskType: String?,
        requestedLimit: Int?,
        resetRetryCount: Boolean?,
        controlKey: String?,
        controlValue: String?,
        controlVersion: Int?,
        resultCode: String?,
        status: String = "ACCEPTED",
    ) {
        jdbcTemplate.update(
            """
            INSERT INTO admin_operation_receipt (
                operation_id, actor_id, session_row_id, fingerprint, action, task_type, requested_limit,
                reset_retry_count, reason, status, selected_count, replayed_count, quarantined_count, result_code,
                control_key, control_value, control_version
            ) VALUES (?, 7, NULL, ?, ?, ?, ?, ?, 'search runtime control', ?, 0, 0, 0, ?, ?, ?, ?)
            """.trimIndent(),
        ) { statement ->
            statement.setObject(1, operationId)
            statement.setString(2, "a".repeat(64))
            statement.setString(3, action)
            statement.setNullableString(4, taskType)
            statement.setNullableInt(5, requestedLimit)
            statement.setNullableBoolean(6, resetRetryCount)
            statement.setString(7, status)
            statement.setNullableString(8, resultCode)
            statement.setNullableString(9, controlKey)
            statement.setNullableString(10, controlValue)
            statement.setNullableInt(11, controlVersion)
        }
    }

    private fun stateForUpdate(
        connection: Connection,
        controlKey: String,
    ): ControlState =
        connection
            .prepareStatement(
                "SELECT control_key, control_value, version, applied_operation_id " +
                    "FROM search_runtime_control_state WHERE control_key = ? FOR UPDATE",
            ).use { statement ->
                statement.setString(1, controlKey)
                statement.executeQuery().use { result ->
                    assertEquals(true, result.next())
                    ControlState(
                        result.getString("control_key"),
                        result.getString("control_value"),
                        result.getLong("version"),
                        result.getObject("applied_operation_id", UUID::class.java),
                    )
                }
            }

    private fun state(
        connection: Connection,
        controlKey: String,
    ): ControlState =
        connection
            .prepareStatement(
                "SELECT control_key, control_value, version, applied_operation_id " +
                    "FROM search_runtime_control_state WHERE control_key = ?",
            ).use { statement ->
                statement.setString(1, controlKey)
                statement.executeQuery().use { result ->
                    assertEquals(true, result.next())
                    ControlState(
                        result.getString("control_key"),
                        result.getString("control_value"),
                        result.getLong("version"),
                        result.getObject("applied_operation_id", UUID::class.java),
                    )
                }
            }

    private fun java.sql.PreparedStatement.setNullableString(
        index: Int,
        value: String?,
    ) {
        if (value == null) setNull(index, Types.VARCHAR) else setString(index, value)
    }

    private fun java.sql.PreparedStatement.setNullableInt(
        index: Int,
        value: Int?,
    ) {
        if (value == null) setNull(index, Types.INTEGER) else setInt(index, value)
    }

    private fun java.sql.PreparedStatement.setNullableBoolean(
        index: Int,
        value: Boolean?,
    ) {
        if (value == null) setNull(index, Types.BOOLEAN) else setBoolean(index, value)
    }

    private fun assertRejected(operation: () -> Unit) {
        assertFailsWith<Exception> { operation() }
    }

    private data class ControlState(
        val key: String,
        val value: String,
        val version: Long,
        val appliedOperationId: UUID?,
    )
}
