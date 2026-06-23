package com.back.boundedContexts.member.subContexts.privacy.job

import com.back.boundedContexts.member.subContexts.memberActionLog.model.MemberActionLog
import com.back.boundedContexts.member.subContexts.notification.model.MemberNotification
import com.back.boundedContexts.member.subContexts.privacy.model.MemberPrivacyRequest
import com.back.boundedContexts.member.subContexts.signupVerification.model.MemberSignupVerification
import com.back.global.jpa.domain.AfterDDL
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import kotlin.reflect.KClass

@DisplayName("Privacy retention 운영 인덱스 계약 테스트")
class PrivacyRetentionOperationalIndexContractTest {
    private val productionMigrationSql: String =
        listOf(
            "db/migration/R__operational_indexes.sql",
            "db/migration/V20260623_03__add_privacy_retention_indexes_concurrently.sql",
        ).joinToString("\n", transform = ::readResource)

    private val concurrentIndexConfig: String =
        readResource("db/migration/V20260623_03__add_privacy_retention_indexes_concurrently.sql.conf")

    @Test
    fun `retention cleanup indexes are declared in AfterDDL and production Flyway migration`() {
        val expectedIndexes =
            mapOf(
                MemberSignupVerification::class to
                    listOf(
                        "member_signup_verification_idx_consumed_at_id",
                        "member_signup_verification_idx_cancelled_at_id",
                        "member_signup_verification_idx_email_verification_expires_at_id",
                        "member_signup_verification_idx_signup_session_expires_at_id",
                    ),
                MemberNotification::class to
                    listOf("member_notification_idx_created_at_id"),
                MemberPrivacyRequest::class to
                    listOf("member_privacy_request_idx_status_closed_at_id"),
                MemberActionLog::class to
                    listOf("member_action_log_idx_created_at_id"),
            )

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
