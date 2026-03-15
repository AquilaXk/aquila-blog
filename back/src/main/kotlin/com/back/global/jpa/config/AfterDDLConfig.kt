package com.back.global.jpa.config

import com.back.global.jpa.domain.AfterDDL
import jakarta.persistence.EntityManagerFactory
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.ApplicationRunner
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.annotation.Order
import javax.sql.DataSource

@Configuration
class AfterDDLConfig(
    @param:Value("\${custom.jpa.after-ddl.failOnError:false}")
    private val failOnError: Boolean,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    @Bean
    @Order(0)
    fun afterDDLRunner(
        dataSource: DataSource,
        entityManagerFactory: EntityManagerFactory,
    ) = ApplicationRunner {
        val entityClasses =
            entityManagerFactory.metamodel.entities
                .mapNotNull { it.javaType }

        val ddlStatements =
            entityClasses.flatMap { entityClass ->
                entityClass.getAnnotationsByType(AfterDDL::class.java).map { it.sql }
            }

        if (ddlStatements.isEmpty()) return@ApplicationRunner

        dataSource.connection.use { conn ->
            conn.autoCommit = true

            for (sql in ddlStatements) {
                runCatching {
                    conn.createStatement().use { it.execute(sql) }
                    log.info("AfterDDL 실행: {}", sql)
                }.onFailure { ex ->
                    if (failOnError) {
                        throw IllegalStateException("AfterDDL failed in strict mode. SQL: $sql", ex)
                    }
                    log.warn("AfterDDL 실패: {} (SQL: {})", ex.message, sql)
                }
            }
        }
    }
}
