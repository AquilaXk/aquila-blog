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
import kotlin.io.path.createDirectories
import kotlin.io.path.writeText
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull

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
}
