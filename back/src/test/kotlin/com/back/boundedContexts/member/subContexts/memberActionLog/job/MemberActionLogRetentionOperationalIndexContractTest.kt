package com.back.boundedContexts.member.subContexts.memberActionLog.job

import com.back.boundedContexts.member.subContexts.memberActionLog.model.MemberActionLog
import com.back.global.jpa.domain.AfterDDL
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import kotlin.reflect.KClass

@DisplayName("Member action log retention 운영 인덱스 계약 테스트")
class MemberActionLogRetentionOperationalIndexContractTest {
    private val productionMigrationSql: String =
        readResource("db/migration/V20260623_03__add_privacy_retention_indexes_concurrently.sql")

    private val concurrentIndexConfig: String =
        readResource("db/migration/V20260623_03__add_privacy_retention_indexes_concurrently.sql.conf")

    @Test
    fun `retention cleanup indexes are declared in AfterDDL and production Flyway migration`() {
        val expectedIndexes =
            mapOf(MemberActionLog::class to listOf("member_action_log_idx_created_at_id"))

        expectedIndexes.forEach { (entityClass, indexNames) ->
            val afterDdlSql = entityClass.afterDdlSql()

            indexNames.forEach { indexName ->
                assertThat(afterDdlSql).contains(indexName)
                assertThat(productionMigrationSql).contains(indexName)
            }
        }
    }

    @Test
    fun `production retention index migration is non-transactional`() {
        assertThat(concurrentIndexConfig).contains("executeInTransaction=false")
        assertThat(productionMigrationSql).contains("CREATE INDEX CONCURRENTLY")
    }

    private fun KClass<*>.afterDdlSql(): String =
        java
            .getAnnotationsByType(AfterDDL::class.java)
            .joinToString("\n") { it.sql }

    private fun readResource(path: String): String =
        requireNotNull(javaClass.classLoader.getResource(path)) {
            "$path 리소스를 찾을 수 없습니다."
        }.readText()
}
