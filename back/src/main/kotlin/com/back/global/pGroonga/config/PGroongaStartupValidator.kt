package com.back.global.pGroonga.config

import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.ApplicationRunner
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.context.annotation.Profile
import org.springframework.core.annotation.Order
import javax.sql.DataSource

@Profile("prod")
@Configuration
class PGroongaStartupValidator(
    @param:Value("\${custom.pgroonga.required:true}")
    private val required: Boolean,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    @Bean
    @Order(-1)
    fun pGroongaStartupValidationRunner(dataSource: DataSource): ApplicationRunner =
        ApplicationRunner {
            if (!required) {
                log.info("PGroonga startup validation skipped (custom.pgroonga.required=false)")
                return@ApplicationRunner
            }

            dataSource.connection.use { connection ->
                val extensionInstalled =
                    connection.createStatement().use { statement ->
                        statement
                            .executeQuery(
                                """
                                SELECT EXISTS (
                                    SELECT 1
                                    FROM pg_extension
                                    WHERE extname = 'pgroonga'
                                )
                                """.trimIndent(),
                            ).use { rs ->
                                rs.next()
                                rs.getBoolean(1)
                            }
                    }

                check(extensionInstalled) {
                    "PGroonga extension is required in prod but not installed. " +
                        "Install extension 'pgroonga' before starting the service."
                }

                val operatorWorks =
                    connection.createStatement().use { statement ->
                        statement
                            .executeQuery("SELECT (ARRAY['ping'::text, 'pong'::text] &@~ 'ping')")
                            .use { rs ->
                                rs.next()
                                rs.getBoolean(1)
                            }
                    }

                check(operatorWorks) {
                    "PGroonga operator check failed. Verify pgroonga extension and SQL permissions."
                }
            }
            log.info("PGroonga startup validation passed")
        }
}
