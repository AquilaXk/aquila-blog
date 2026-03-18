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

/**
 * AfterDDLConfig는 글로벌 런타임 동작을 정의하는 설정 클래스입니다.
 * 보안, 캐시, 세션, JPA, 스케줄링 등 공통 인프라 설정을 등록합니다.
 */

@Configuration
class AfterDDLConfig(
    @param:Value("\${custom.jpa.after-ddl.enabled:true}")
    private val enabled: Boolean,
    @param:Value("\${custom.jpa.after-ddl.failOnError:false}")
    private val failOnError: Boolean,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    /**
     * afterDDLRunner 처리 흐름에서 예외 경로와 운영 안정성을 함께 고려합니다.
     * 설정 계층에서 등록된 정책이 전체 애플리케이션 동작에 일관되게 적용되도록 구성합니다.
     */
    @Bean
    @Order(0)
    fun afterDDLRunner(
        dataSource: DataSource,
        entityManagerFactory: EntityManagerFactory,
    ) = ApplicationRunner {
        if (!enabled) {
            log.info("AfterDDL is disabled by configuration.")
            return@ApplicationRunner
        }

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
