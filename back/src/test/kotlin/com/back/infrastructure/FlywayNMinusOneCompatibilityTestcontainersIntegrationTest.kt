package com.back.infrastructure

import org.flywaydb.core.Flyway
import org.flywaydb.core.api.FlywayException
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import org.springframework.core.io.ClassPathResource
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import org.testcontainers.utility.DockerImageName
import java.nio.file.Path
import java.sql.Statement
import kotlin.io.path.createDirectories
import kotlin.io.path.writeText
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

@Testcontainers
class FlywayNMinusOneCompatibilityTestcontainersIntegrationTest {
    @TempDir
    lateinit var migrations: Path

    companion object {
        @Container
        private val postgres =
            PostgreSQLContainer(
                DockerImageName.parse("jangka512/pgj:latest").asCompatibleSubstituteFor("postgres"),
            ).apply {
                withDatabaseName("blog_n_minus_one_compatibility")
                withUsername("postgres")
                withPassword("postgres")
            }
    }

    private val retiredPersistenceBaseline =
        """
        CREATE SEQUENCE member_signup_verification_seq;
        CREATE SEQUENCE pending_oauth_signup_seq;
        CREATE SEQUENCE member_privacy_request_seq;
        CREATE SEQUENCE member_notification_seq;
        CREATE SEQUENCE post_comment_seq;

        CREATE TABLE member (id bigint PRIMARY KEY);
        CREATE TABLE member_session (id bigint PRIMARY KEY);
        CREATE TABLE member_legal_acceptance (id bigint PRIMARY KEY);
        CREATE TABLE member_account_deletion (id bigint PRIMARY KEY);
        CREATE TABLE uploaded_file (id bigint PRIMARY KEY);
        CREATE TABLE cloud_file (id bigint PRIMARY KEY);
        CREATE TABLE auth_security_event (id bigint PRIMARY KEY);
        CREATE TABLE member_action_log (id bigint PRIMARY KEY);
        CREATE TABLE task (id bigint PRIMARY KEY);
        CREATE TABLE member_signup_verification (id bigint PRIMARY KEY);
        CREATE TABLE pending_oauth_signup (id bigint PRIMARY KEY);
        CREATE TABLE member_privacy_request (
            id bigint PRIMARY KEY,
            status text NOT NULL
        );
        CREATE TABLE member_notification (id bigint PRIMARY KEY);
        CREATE TABLE member_attr (
            id bigint PRIMARY KEY,
            name text NOT NULL
        );
        CREATE TABLE post_attr (
            id bigint PRIMARY KEY,
            name text NOT NULL
        );
        CREATE TABLE post (
            id bigint PRIMARY KEY,
            comments_count_attr_id bigint,
            CONSTRAINT fk_post_comments_count_attr
                FOREIGN KEY (comments_count_attr_id) REFERENCES post_attr (id)
        );
        CREATE TABLE post_comment (
            id bigint PRIMARY KEY,
            post_id bigint NOT NULL,
            CONSTRAINT fk_post_comment_post FOREIGN KEY (post_id) REFERENCES post (id)
        );
        """.trimIndent()

    private val taskPayloadV1Baseline =
        """
        CREATE TABLE task (
            id bigint PRIMARY KEY,
            uid uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
            aggregate_type text NOT NULL DEFAULT 'Post',
            aggregate_id bigint NOT NULL DEFAULT 1,
            task_type text NOT NULL,
            payload text NOT NULL,
            status text NOT NULL DEFAULT 'PENDING',
            modified_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE FUNCTION task_wrap_legacy_payload_v1(
            raw_payload text,
            raw_task_type text,
            raw_created_at timestamptz
        ) RETURNS text
        LANGUAGE sql
        IMMUTABLE
        STRICT
        AS ${'$'}${'$'} SELECT raw_payload ${'$'}${'$'};

        CREATE FUNCTION task_normalize_legacy_payload_v1_on_insert()
        RETURNS trigger
        LANGUAGE plpgsql
        AS ${'$'}${'$'}
        BEGIN
            RETURN NEW;
        END;
        ${'$'}${'$'};

        CREATE TRIGGER task_normalize_legacy_payload_v1_before_insert
        BEFORE INSERT ON task
        FOR EACH ROW
        EXECUTE FUNCTION task_normalize_legacy_payload_v1_on_insert();

        CREATE FUNCTION task_apply_terminal_retention_defaults()
        RETURNS trigger
        LANGUAGE plpgsql
        AS ${'$'}${'$'}
        BEGIN
            RETURN NEW;
        END;
        ${'$'}${'$'};

        CREATE TRIGGER task_apply_terminal_retention_before_update
        BEFORE UPDATE OF status ON task
        FOR EACH ROW
        EXECUTE FUNCTION task_apply_terminal_retention_defaults();
        """.trimIndent()

    private data class Phase2DriftCase(
        val name: String,
        val seedStatements: List<String>,
        val residueCountSql: String,
    )

    private val phase2TargetTables =
        listOf(
            "member_signup_verification",
            "pending_oauth_signup",
            "member_privacy_request",
            "member_notification",
            "post_comment",
        )

    private val phase2TargetSequences =
        listOf(
            "member_signup_verification_seq",
            "pending_oauth_signup_seq",
            "member_privacy_request_seq",
            "member_notification_seq",
            "post_comment_seq",
        )

    private val phase2InspectedTables =
        phase2TargetTables + listOf("post", "post_attr", "member_attr")

    private val phase2RetainedTables =
        listOf(
            "member",
            "member_attr",
            "member_session",
            "member_legal_acceptance",
            "member_account_deletion",
            "post",
            "post_attr",
            "uploaded_file",
            "cloud_file",
            "auth_security_event",
            "member_action_log",
            "task",
        )

    private val phase2DriftCases =
        listOf(
            Phase2DriftCase(
                name = "member signup verification row",
                seedStatements = listOf("INSERT INTO member_signup_verification (id) VALUES (1)"),
                residueCountSql = "SELECT count(*) FROM member_signup_verification",
            ),
            Phase2DriftCase(
                name = "pending OAuth signup row",
                seedStatements = listOf("INSERT INTO pending_oauth_signup (id) VALUES (1)"),
                residueCountSql = "SELECT count(*) FROM pending_oauth_signup",
            ),
            Phase2DriftCase(
                name = "member privacy request row",
                seedStatements = listOf("INSERT INTO member_privacy_request (id, status) VALUES (1, 'COMPLETED')"),
                residueCountSql = "SELECT count(*) FROM member_privacy_request",
            ),
            Phase2DriftCase(
                name = "member notification row",
                seedStatements = listOf("INSERT INTO member_notification (id) VALUES (1)"),
                residueCountSql = "SELECT count(*) FROM member_notification",
            ),
            Phase2DriftCase(
                name = "post comment row",
                seedStatements =
                    listOf(
                        "INSERT INTO post (id) VALUES (1)",
                        "INSERT INTO post_comment (id, post_id) VALUES (1, 1)",
                    ),
                residueCountSql = "SELECT count(*) FROM post_comment",
            ),
            Phase2DriftCase(
                name = "post comments count reference",
                seedStatements =
                    listOf(
                        "INSERT INTO post_attr (id, name) VALUES (1, 'retainedControl')",
                        "INSERT INTO post (id, comments_count_attr_id) VALUES (1, 1)",
                    ),
                residueCountSql = "SELECT count(*) FROM post WHERE comments_count_attr_id IS NOT NULL",
            ),
            Phase2DriftCase(
                name = "comments count post attribute",
                seedStatements = listOf("INSERT INTO post_attr (id, name) VALUES (1, 'commentsCount')"),
                residueCountSql = "SELECT count(*) FROM post_attr WHERE name = 'commentsCount'",
            ),
            Phase2DriftCase(
                name = "post comments count member attribute",
                seedStatements = listOf("INSERT INTO member_attr (id, name) VALUES (1, 'postCommentsCount')"),
                residueCountSql = "SELECT count(*) FROM member_attr WHERE name = 'postCommentsCount'",
            ),
        )

    @Test
    fun `synthetic expand schema keeps N minus 1 and current JDBC queries compatible`() {
        migrations.resolve("V1__baseline.sql").writeText(
            "CREATE TABLE compatibility_probe (id bigint PRIMARY KEY, legacy_title text NOT NULL);",
        )
        migrations.resolve("V2__expand.sql").writeText(
            "ALTER TABLE compatibility_probe ADD COLUMN current_title text; " +
                "UPDATE compatibility_probe SET current_title = legacy_title;",
        )
        Flyway
            .configure()
            .dataSource(postgres.jdbcUrl, postgres.username, postgres.password)
            .locations("filesystem:$migrations")
            .validateOnMigrate(true)
            .load()
            .migrate()

        postgres.createConnection("").use { connection ->
            connection.createStatement().use { statement ->
                statement.execute("INSERT INTO compatibility_probe (id, legacy_title) VALUES (1, 'baseline')")
                statement.execute("UPDATE compatibility_probe SET current_title = legacy_title")
            }

            connection.prepareStatement("SELECT legacy_title FROM compatibility_probe WHERE id = ?").use { statement ->
                statement.setLong(1, 1)
                statement.executeQuery().use { result ->
                    result.next()
                    assertEquals("baseline", result.getString(1))
                }
            }
            connection.prepareStatement("SELECT current_title FROM compatibility_probe WHERE id = ?").use { statement ->
                statement.setLong(1, 1)
                statement.executeQuery().use { result ->
                    result.next()
                    assertEquals("baseline", result.getString(1))
                }
            }
        }
    }

    @Test
    fun `retired persistence schema migration removes only the proven Phase 2 targets`() {
        val phase1MigrationName = "V20260902_01__drain_retired_public_persistence.sql"
        val phase2MigrationName = "V20260902_02__drop_retired_public_persistence.sql"
        val compatibilitySchema = "retired_persistence_phase_2"
        val phase2Migrations = migrations.resolve("phase-2-success").createDirectories()
        val phase1Migration = readProductionMigration(phase1MigrationName)
        val productionMigration = readProductionMigration(phase2MigrationName)
        val testMigration = readTestMigration(phase2MigrationName)

        assertEquals(productionMigration, testMigration)
        assertFalse(Regex("\\bCASCADE\\b", RegexOption.IGNORE_CASE).containsMatchIn(productionMigration))
        assertFalse(Regex("\\bIF\\s+EXISTS\\b", RegexOption.IGNORE_CASE).containsMatchIn(productionMigration))
        val driftGuardStart = productionMigration.indexOf("DO $$")
        val lockStatement =
            Regex(
                "LOCK\\s+TABLE\\s+.+?\\s+IN\\s+SHARE\\s+MODE;",
                setOf(RegexOption.IGNORE_CASE, RegexOption.DOT_MATCHES_ALL),
            ).find(productionMigration)
        assertNotNull(lockStatement)
        assertTrue(lockStatement.range.first < driftGuardStart, "write-blocking locks must precede the drift guard")
        phase2InspectedTables.forEach { table ->
            assertTrue(
                Regex("\\b${Regex.escape(table)}\\b", RegexOption.IGNORE_CASE).containsMatchIn(lockStatement.value),
                "$table must be write-locked before the drift guard",
            )
        }

        phase2Migrations.resolve("V1__retired_persistence_baseline.sql").writeText(retiredPersistenceBaseline)
        phase2Migrations.resolve(phase1MigrationName).writeText(phase1Migration)
        flyway(compatibilitySchema, phase2Migrations).migrate()
        phase2Migrations.resolve(phase2MigrationName).writeText(productionMigration)
        flyway(compatibilitySchema, phase2Migrations).migrate()

        postgres.createConnection("").use { connection ->
            connection.createStatement().use { statement ->
                phase2TargetTables.forEach { table ->
                    assertFalse(relationExists(statement, compatibilitySchema, table), "$table must be absent")
                }
                phase2TargetSequences.forEach { sequence ->
                    assertFalse(relationExists(statement, compatibilitySchema, sequence), "$sequence must be absent")
                }
                assertFalse(columnExists(statement, compatibilitySchema, "post", "comments_count_attr_id"))
                phase2RetainedTables.forEach { table ->
                    assertTrue(relationExists(statement, compatibilitySchema, table), "$table must remain present")
                }
            }
        }
    }

    @Test
    fun `retired persistence schema migration rejects every Phase 2 drift atomically`() {
        val phase1MigrationName = "V20260902_01__drain_retired_public_persistence.sql"
        val phase2MigrationName = "V20260902_02__drop_retired_public_persistence.sql"
        val phase1Migration = readProductionMigration(phase1MigrationName)
        val phase2Migration = readProductionMigration(phase2MigrationName)

        phase2DriftCases.forEachIndexed { index, driftCase ->
            val compatibilitySchema = "retired_persistence_phase_2_drift_$index"
            val driftMigrations = migrations.resolve("phase-2-drift-$index").createDirectories()
            driftMigrations.resolve("V1__retired_persistence_baseline.sql").writeText(retiredPersistenceBaseline)
            driftMigrations.resolve(phase1MigrationName).writeText(phase1Migration)
            flyway(compatibilitySchema, driftMigrations).migrate()

            postgres.createConnection("").use { connection ->
                connection.createStatement().use { statement ->
                    statement.execute("SET search_path TO $compatibilitySchema")
                    driftCase.seedStatements.forEach(statement::execute)
                }
            }

            driftMigrations.resolve(phase2MigrationName).writeText(phase2Migration)
            assertFailsWith<FlywayException>(driftCase.name) {
                flyway(compatibilitySchema, driftMigrations).migrate()
            }

            postgres.createConnection("").use { connection ->
                connection.createStatement().use { statement ->
                    statement.execute("SET search_path TO $compatibilitySchema")
                    phase2TargetTables.forEach { table ->
                        assertTrue(
                            relationExists(statement, compatibilitySchema, table),
                            "${driftCase.name}: $table must remain after rollback",
                        )
                    }
                    phase2TargetSequences.forEach { sequence ->
                        assertTrue(
                            relationExists(statement, compatibilitySchema, sequence),
                            "${driftCase.name}: $sequence must remain after rollback",
                        )
                    }
                    assertTrue(
                        columnExists(statement, compatibilitySchema, "post", "comments_count_attr_id"),
                        "${driftCase.name}: comments_count_attr_id must remain after rollback",
                    )
                    statement.executeQuery(driftCase.residueCountSql).use { result ->
                        result.next()
                        assertEquals(1, result.getInt(1), "${driftCase.name}: drift row must remain after rollback")
                    }
                }
            }
        }
    }

    @Test
    fun `retired legal acceptance migration removes only the retired table and sequence`() {
        val migrationName = "V20260902_03__drop_retired_member_legal_acceptance.sql"
        val compatibilitySchema = "retired_legal_acceptance_success"
        val legalAcceptanceMigrations = migrations.resolve("legal-acceptance-success").createDirectories()
        val productionMigration = readProductionMigration(migrationName)
        val testMigration = readTestMigration(migrationName)

        assertEquals(productionMigration, testMigration)
        assertFalse(Regex("\\bCASCADE\\b", RegexOption.IGNORE_CASE).containsMatchIn(productionMigration))
        assertFalse(Regex("\\bIF\\s+EXISTS\\b", RegexOption.IGNORE_CASE).containsMatchIn(productionMigration))
        legalAcceptanceMigrations.resolve("V1__retired_legal_acceptance_baseline.sql").writeText(
            retiredPersistenceBaseline + "\nCREATE SEQUENCE member_legal_acceptance_seq;",
        )
        flyway(compatibilitySchema, legalAcceptanceMigrations).migrate()
        legalAcceptanceMigrations.resolve(migrationName).writeText(productionMigration)
        flyway(compatibilitySchema, legalAcceptanceMigrations).migrate()

        postgres.createConnection("").use { connection ->
            connection.createStatement().use { statement ->
                assertFalse(
                    relationExists(statement, compatibilitySchema, "member_legal_acceptance"),
                    "member_legal_acceptance must be absent",
                )
                assertFalse(
                    relationExists(statement, compatibilitySchema, "member_legal_acceptance_seq"),
                    "member_legal_acceptance_seq must be absent",
                )
                phase2RetainedTables.filterNot { it == "member_legal_acceptance" }.forEach { table ->
                    assertTrue(relationExists(statement, compatibilitySchema, table), "$table must remain present")
                }
            }
        }
    }

    @Test
    fun `retired legal acceptance migration rolls back on an external sequence dependency`() {
        val migrationName = "V20260902_03__drop_retired_member_legal_acceptance.sql"
        val compatibilitySchema = "retired_legal_acceptance_dependency"
        val legalAcceptanceMigrations = migrations.resolve("legal-acceptance-dependency").createDirectories()
        val productionMigration = readProductionMigration(migrationName)

        legalAcceptanceMigrations.resolve("V1__retired_legal_acceptance_baseline.sql").writeText(
            retiredPersistenceBaseline +
                "\n" +
                """
                CREATE SEQUENCE member_legal_acceptance_seq;
                CREATE TABLE legal_acceptance_sequence_consumer (
                    id bigint PRIMARY KEY DEFAULT nextval('member_legal_acceptance_seq')
                );
                INSERT INTO member_legal_acceptance (id) VALUES (1);
                """.trimIndent(),
        )
        flyway(compatibilitySchema, legalAcceptanceMigrations).migrate()
        legalAcceptanceMigrations.resolve(migrationName).writeText(productionMigration)

        assertFailsWith<FlywayException> {
            flyway(compatibilitySchema, legalAcceptanceMigrations).migrate()
        }

        postgres.createConnection("").use { connection ->
            connection.createStatement().use { statement ->
                statement.execute("SET search_path TO $compatibilitySchema")
                assertTrue(relationExists(statement, compatibilitySchema, "member_legal_acceptance"))
                assertTrue(relationExists(statement, compatibilitySchema, "member_legal_acceptance_seq"))
                assertTrue(relationExists(statement, compatibilitySchema, "legal_acceptance_sequence_consumer"))
                statement.executeQuery("SELECT count(*) FROM member_legal_acceptance").use { result ->
                    result.next()
                    assertEquals(1, result.getInt(1), "retired legal acceptance row must remain after rollback")
                }
            }
        }
    }

    @Test
    fun `task payload v2 migration rejects residual v1 atomically`() {
        val migrationName = "V20260903_01__enforce_task_payload_v2_storage.sql"
        val compatibilitySchema = "task_payload_v2_residual_v1"
        val taskMigrations = migrations.resolve("task-payload-v2-residual-v1").createDirectories()
        val productionMigration = readProductionMigration(migrationName)

        assertEquals(productionMigration, readTestMigration(migrationName))
        taskMigrations.resolve("V1__task_payload_v1_baseline.sql").writeText(taskPayloadV1Baseline)
        flyway(compatibilitySchema, taskMigrations).migrate()

        postgres.createConnection("").use { connection ->
            connection.createStatement().use { statement ->
                statement.execute("SET search_path TO $compatibilitySchema")
                statement.execute(
                    """
                    INSERT INTO task (id, task_type, payload)
                    VALUES (
                        1,
                        'post.search-index.sync',
                        '{"schemaVersion":1,"taskType":"post.search-index.sync","uid":"legacy"}'
                    )
                    """.trimIndent(),
                )
            }
        }

        taskMigrations.resolve(migrationName).writeText(productionMigration)
        assertFailsWith<FlywayException> {
            flyway(compatibilitySchema, taskMigrations).migrate()
        }

        postgres.createConnection("").use { connection ->
            connection.createStatement().use { statement ->
                statement.execute("SET search_path TO $compatibilitySchema")
                statement.executeQuery("SELECT count(*) FROM task WHERE id = 1").use { result ->
                    result.next()
                    assertEquals(1, result.getInt(1))
                }
                assertTrue(triggerExists(statement, compatibilitySchema, "task_normalize_legacy_payload_v1_before_insert"))
                assertTrue(functionExists(statement, compatibilitySchema, "task_normalize_legacy_payload_v1_on_insert"))
                assertTrue(functionExists(statement, compatibilitySchema, "task_wrap_legacy_payload_v1"))
                assertFalse(constraintExists(statement, compatibilitySchema, "task_payload_v2_or_exact_redacted"))
            }
        }
    }

    @Test
    fun `task payload v2 migration keeps only current storage and retention contracts`() {
        val migrationName = "V20260903_01__enforce_task_payload_v2_storage.sql"
        val compatibilitySchema = "task_payload_v2_success"
        val taskMigrations = migrations.resolve("task-payload-v2-success").createDirectories()
        val productionMigration = readProductionMigration(migrationName)
        val v2Payload =
            """{"schemaVersion":2,"taskType":"post.search-index.sync","sensitivity":"PUBLIC","createdAtEpochMs":1786406400000,"expiresAtEpochMs":null,"payloadJson":"{\"uid\":\"00000000-0000-0000-0000-000000000001\",\"aggregateType\":\"Post\",\"aggregateId\":1}"}"""

        assertEquals(productionMigration, readTestMigration(migrationName))
        taskMigrations.resolve("V1__task_payload_v1_baseline.sql").writeText(taskPayloadV1Baseline)
        flyway(compatibilitySchema, taskMigrations).migrate()
        postgres.createConnection("").use { connection ->
            connection.createStatement().use { statement ->
                statement.execute("SET search_path TO $compatibilitySchema")
                statement.execute(
                    "INSERT INTO task (id, task_type, payload) VALUES (1, 'post.search-index.sync', '$v2Payload')",
                )
                statement.execute(
                    "INSERT INTO task (id, task_type, payload) VALUES (2, 'post.search-index.sync', '{\"redacted\":true}')",
                )
            }
        }

        taskMigrations.resolve(migrationName).writeText(productionMigration)
        flyway(compatibilitySchema, taskMigrations).migrate()

        postgres.createConnection("").use { connection ->
            connection.createStatement().use { statement ->
                statement.execute("SET search_path TO $compatibilitySchema")
                assertFalse(triggerExists(statement, compatibilitySchema, "task_normalize_legacy_payload_v1_before_insert"))
                assertFalse(functionExists(statement, compatibilitySchema, "task_normalize_legacy_payload_v1_on_insert"))
                assertFalse(functionExists(statement, compatibilitySchema, "task_wrap_legacy_payload_v1"))
                assertTrue(triggerExists(statement, compatibilitySchema, "task_apply_terminal_retention_before_update"))
                assertTrue(functionExists(statement, compatibilitySchema, "task_apply_terminal_retention_defaults"))
                assertTrue(constraintExists(statement, compatibilitySchema, "task_payload_v2_or_exact_redacted"))

                statement.execute(
                    "INSERT INTO task (id, task_type, payload) VALUES (3, 'post.search-index.sync', '$v2Payload')",
                )
                statement.execute(
                    "INSERT INTO task (id, task_type, payload) VALUES (4, 'post.search-index.sync', '{\"redacted\":true}')",
                )
                listOf(
                    "{}",
                    """{"schemaVersion":2,"taskType":"post.search-index.sync","sensitivity":"PUBLIC","createdAtEpochMs":1786406400000,"expiresAtEpochMs":null}""",
                    """{"schemaVersion":1,"taskType":"post.search-index.sync","uid":"legacy"}""",
                    """{"schemaVersion":1,"taskType":"post.search-index.sync","sensitivity":"PUBLIC","createdAtEpochMs":1786406400000,"expiresAtEpochMs":null,"payloadJson":"{}"}""",
                    """{"schemaVersion":2,"taskType":"post.search-index.sync","sensitivity":"PUBLIC","createdAtEpochMs":9223372036854775808,"expiresAtEpochMs":null,"payloadJson":"{}"}""",
                    """{"schemaVersion":2,"taskType":"post.search-index.sync","sensitivity":"PUBLIC","createdAtEpochMs":1786406400000,"expiresAtEpochMs":9223372036854775808,"payloadJson":"{}"}""",
                ).forEachIndexed { index, rejectedPayload ->
                    assertFailsWith<java.sql.SQLException> {
                        statement.execute(
                            "INSERT INTO task (id, task_type, payload) VALUES (${index + 10}, 'post.search-index.sync', '$rejectedPayload')",
                        )
                    }
                }
            }
        }
    }

    @Test
    fun `retired persistence migration drains data and keeps both hard delete orders compatible`() {
        val migrationName = "V20260902_01__drain_retired_public_persistence.sql"
        val compatibilitySchema = "retired_persistence_n_minus_one"
        val productionMigration =
            ClassPathResource("db/migration/$migrationName").inputStream.bufferedReader().use { it.readText() }
        val testMigration =
            ClassPathResource("db/migration-test/$migrationName").inputStream.bufferedReader().use { it.readText() }
        assertEquals(productionMigration, testMigration)
        migrations.resolve("V1__post_comment_baseline.sql").writeText(retiredPersistenceBaseline)
        Flyway
            .configure()
            .dataSource(postgres.jdbcUrl, postgres.username, postgres.password)
            .defaultSchema(compatibilitySchema)
            .schemas(compatibilitySchema)
            .createSchemas(true)
            .locations("filesystem:$migrations")
            .validateOnMigrate(true)
            .load()
            .migrate()

        postgres.createConnection("").use { connection ->
            connection.createStatement().use { statement ->
                statement.execute("SET search_path TO $compatibilitySchema")
                statement.execute("INSERT INTO member_signup_verification (id) VALUES (1)")
                statement.execute("INSERT INTO pending_oauth_signup (id) VALUES (1)")
                statement.execute("INSERT INTO member_privacy_request (id, status) VALUES (1, 'COMPLETED')")
                statement.execute("INSERT INTO member_notification (id) VALUES (1)")
                statement.execute(
                    "INSERT INTO member_attr (id, name) VALUES (101, 'postCommentsCount'), (102, 'profileImgUrl')",
                )
                statement.execute(
                    "INSERT INTO post_attr (id, name) VALUES (201, 'commentsCount'), (202, 'hitCount')",
                )
                statement.execute("INSERT INTO post (id, comments_count_attr_id) VALUES (1, 201)")
                statement.execute("INSERT INTO post_comment (id, post_id) VALUES (11, 1)")
            }

            migrations.resolve(migrationName).writeText(productionMigration)
            Flyway
                .configure()
                .dataSource(postgres.jdbcUrl, postgres.username, postgres.password)
                .defaultSchema(compatibilitySchema)
                .schemas(compatibilitySchema)
                .createSchemas(true)
                .locations("filesystem:$migrations")
                .validateOnMigrate(true)
                .load()
                .migrate()

            connection.createStatement().use { statement ->
                listOf(
                    "member_signup_verification",
                    "pending_oauth_signup",
                    "member_privacy_request",
                    "member_notification",
                    "post_comment",
                ).forEach { table ->
                    statement.executeQuery("SELECT count(*) FROM $table").use { result ->
                        result.next()
                        assertEquals(0, result.getInt(1), "$table must remain present and be empty")
                    }
                }
                statement.executeQuery("SELECT comments_count_attr_id FROM post WHERE id = 1").use { result ->
                    result.next()
                    assertNull(result.getObject(1))
                }
                statement.executeQuery("SELECT count(*) FROM post_attr WHERE name = 'commentsCount'").use { result ->
                    result.next()
                    assertEquals(0, result.getInt(1))
                }
                statement.executeQuery("SELECT count(*) FROM member_attr WHERE name = 'postCommentsCount'").use { result ->
                    result.next()
                    assertEquals(0, result.getInt(1))
                }
                statement.executeQuery("SELECT name FROM post_attr WHERE id = 202").use { result ->
                    result.next()
                    assertEquals("hitCount", result.getString(1))
                }
                statement.executeQuery("SELECT name FROM member_attr WHERE id = 102").use { result ->
                    result.next()
                    assertEquals("profileImgUrl", result.getString(1))
                }

                statement.execute("INSERT INTO post (id) VALUES (2), (3)")
                statement.execute("INSERT INTO post_comment (id, post_id) VALUES (22, 2)")
                statement.execute("INSERT INTO post_comment (id, post_id) VALUES (33, 3)")

                assertEquals(1, statement.executeUpdate("DELETE FROM post_comment WHERE post_id = 2"))
                assertEquals(1, statement.executeUpdate("DELETE FROM post WHERE id = 2"))

                assertEquals(1, statement.executeUpdate("DELETE FROM post WHERE id = 3"))
                statement.executeQuery("SELECT count(*) FROM post_comment WHERE post_id IN (2, 3)").use { result ->
                    result.next()
                    assertEquals(0, result.getInt(1))
                }
                statement
                    .executeQuery(
                        """
                        SELECT delete_rule
                        FROM information_schema.referential_constraints
                        WHERE constraint_schema = '$compatibilitySchema'
                          AND constraint_name = 'fk_post_comment_post'
                        """.trimIndent(),
                    ).use { result ->
                        result.next()
                        assertEquals("CASCADE", result.getString(1))
                    }
            }
        }

        Flyway
            .configure()
            .dataSource(postgres.jdbcUrl, postgres.username, postgres.password)
            .defaultSchema(compatibilitySchema)
            .schemas(compatibilitySchema)
            .createSchemas(true)
            .locations("filesystem:$migrations")
            .validateOnMigrate(true)
            .load()
            .migrate()
    }

    @Test
    fun `retired persistence drain rejects unresolved privacy requests without deleting data`() {
        val migrationName = "V20260902_01__drain_retired_public_persistence.sql"
        val compatibilitySchema = "retired_persistence_unresolved"
        val unresolvedMigrations = migrations.resolve("unresolved").createDirectories()
        val productionMigration =
            ClassPathResource("db/migration/$migrationName").inputStream.bufferedReader().use { it.readText() }
        unresolvedMigrations.resolve("V1__retired_persistence_baseline.sql").writeText(retiredPersistenceBaseline)
        Flyway
            .configure()
            .dataSource(postgres.jdbcUrl, postgres.username, postgres.password)
            .defaultSchema(compatibilitySchema)
            .schemas(compatibilitySchema)
            .createSchemas(true)
            .locations("filesystem:$unresolvedMigrations")
            .validateOnMigrate(true)
            .load()
            .migrate()

        postgres.createConnection("").use { connection ->
            connection.createStatement().use { statement ->
                statement.execute("SET search_path TO $compatibilitySchema")
                statement.execute("INSERT INTO member_privacy_request (id, status) VALUES (1, 'IN_PROGRESS')")
            }

            unresolvedMigrations.resolve(migrationName).writeText(productionMigration)
            assertFailsWith<FlywayException> {
                Flyway
                    .configure()
                    .dataSource(postgres.jdbcUrl, postgres.username, postgres.password)
                    .defaultSchema(compatibilitySchema)
                    .schemas(compatibilitySchema)
                    .createSchemas(true)
                    .locations("filesystem:$unresolvedMigrations")
                    .validateOnMigrate(true)
                    .load()
                    .migrate()
            }

            connection.createStatement().use { statement ->
                statement.executeQuery("SELECT status FROM member_privacy_request WHERE id = 1").use { result ->
                    result.next()
                    assertEquals("IN_PROGRESS", result.getString(1))
                }
                statement
                    .executeQuery(
                        """
                        SELECT delete_rule
                        FROM information_schema.referential_constraints
                        WHERE constraint_schema = '$compatibilitySchema'
                          AND constraint_name = 'fk_post_comment_post'
                        """.trimIndent(),
                    ).use { result ->
                        result.next()
                        assertEquals("NO ACTION", result.getString(1))
                    }
            }
        }
    }

    private fun readProductionMigration(name: String): String =
        ClassPathResource("db/migration/$name").inputStream.bufferedReader().use { it.readText() }

    private fun readTestMigration(name: String): String =
        ClassPathResource("db/migration-test/$name").inputStream.bufferedReader().use { it.readText() }

    private fun flyway(
        schema: String,
        migrationDirectory: Path,
    ): Flyway =
        Flyway
            .configure()
            .dataSource(postgres.jdbcUrl, postgres.username, postgres.password)
            .defaultSchema(schema)
            .schemas(schema)
            .createSchemas(true)
            .locations("filesystem:$migrationDirectory")
            .validateOnMigrate(true)
            .load()

    private fun relationExists(
        statement: Statement,
        schema: String,
        relation: String,
    ): Boolean =
        statement.executeQuery("SELECT to_regclass('$schema.$relation') IS NOT NULL").use { result ->
            result.next()
            result.getBoolean(1)
        }

    private fun columnExists(
        statement: Statement,
        schema: String,
        table: String,
        column: String,
    ): Boolean =
        statement
            .executeQuery(
                """
                SELECT EXISTS (
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_schema = '$schema'
                      AND table_name = '$table'
                      AND column_name = '$column'
                )
                """.trimIndent(),
            ).use { result ->
                result.next()
                result.getBoolean(1)
            }

    private fun triggerExists(
        statement: Statement,
        schema: String,
        trigger: String,
    ): Boolean =
        statement
            .executeQuery(
                """
                SELECT EXISTS (
                    SELECT 1
                    FROM pg_trigger AS trigger_catalog
                    JOIN pg_class AS relation ON relation.oid = trigger_catalog.tgrelid
                    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
                    WHERE namespace.nspname = '$schema'
                      AND trigger_catalog.tgname = '$trigger'
                      AND NOT trigger_catalog.tgisinternal
                )
                """.trimIndent(),
            ).use { result ->
                result.next()
                result.getBoolean(1)
            }

    private fun functionExists(
        statement: Statement,
        schema: String,
        function: String,
    ): Boolean =
        statement
            .executeQuery(
                """
                SELECT EXISTS (
                    SELECT 1
                    FROM pg_proc AS procedure
                    JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
                    WHERE namespace.nspname = '$schema'
                      AND procedure.proname = '$function'
                )
                """.trimIndent(),
            ).use { result ->
                result.next()
                result.getBoolean(1)
            }

    private fun constraintExists(
        statement: Statement,
        schema: String,
        constraint: String,
    ): Boolean =
        statement
            .executeQuery(
                """
                SELECT EXISTS (
                    SELECT 1
                    FROM pg_constraint AS constraint_catalog
                    JOIN pg_namespace AS namespace ON namespace.oid = constraint_catalog.connamespace
                    WHERE namespace.nspname = '$schema'
                      AND constraint_catalog.conname = '$constraint'
                )
                """.trimIndent(),
            ).use { result ->
                result.next()
                result.getBoolean(1)
            }
}
