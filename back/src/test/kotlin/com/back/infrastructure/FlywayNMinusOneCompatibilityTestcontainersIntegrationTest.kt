package com.back.infrastructure

import org.flywaydb.core.Flyway
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
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
}
