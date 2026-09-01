package com.back.infrastructure

import org.flywaydb.core.Flyway
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import org.springframework.core.io.ClassPathResource
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import org.testcontainers.utility.DockerImageName
import java.nio.file.Path
import kotlin.io.path.writeText
import kotlin.test.assertEquals

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
    fun `post comment cascade migration keeps N minus 1 and current hard delete compatible`() {
        val migrationName = "V20260902_01__cascade_retired_post_comments_on_post_delete.sql"
        val compatibilitySchema = "post_comment_n_minus_one"
        val productionMigration =
            ClassPathResource("db/migration/$migrationName").inputStream.bufferedReader().use { it.readText() }
        val testMigration =
            ClassPathResource("db/migration-test/$migrationName").inputStream.bufferedReader().use { it.readText() }
        assertEquals(productionMigration, testMigration)

        migrations.resolve("V1__post_comment_baseline.sql").writeText(
            """
            CREATE TABLE post (id bigint PRIMARY KEY);
            CREATE TABLE post_comment (
                id bigint PRIMARY KEY,
                post_id bigint NOT NULL,
                CONSTRAINT fk_post_comment_post FOREIGN KEY (post_id) REFERENCES post (id)
            );
            """.trimIndent(),
        )
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
                statement.execute("INSERT INTO post (id) VALUES (1)")
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
                statement.execute("INSERT INTO post (id) VALUES (2)")
                statement.execute("INSERT INTO post_comment (id, post_id) VALUES (22, 2)")

                statement.execute("DELETE FROM post_comment WHERE post_id = 1")
                assertEquals(1, statement.executeUpdate("DELETE FROM post WHERE id = 1"))

                assertEquals(1, statement.executeUpdate("DELETE FROM post WHERE id = 2"))
                statement.executeQuery("SELECT count(*) FROM post_comment").use { result ->
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
}
