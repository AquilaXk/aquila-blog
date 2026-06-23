package com.back.boundedContexts.member.subContexts.privacy.job

import com.back.boundedContexts.member.subContexts.memberActionLog.model.MemberActionLog
import com.back.boundedContexts.member.subContexts.notification.model.MemberNotification
import com.back.boundedContexts.member.subContexts.privacy.model.MemberPrivacyRequest
import com.back.boundedContexts.member.subContexts.signupVerification.model.MemberSignupVerification
import com.back.global.jpa.domain.AfterDDL
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import java.nio.file.Files
import java.nio.file.Path
import kotlin.reflect.KClass

@DisplayName("Privacy retention 운영 인덱스 계약 테스트")
class PrivacyRetentionOperationalIndexContractTest {
    private val migrationSql: String =
        Files.readString(Path.of("src/main/resources/db/migration/R__operational_indexes.sql"))

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
                assertThat(migrationSql).contains(indexName)
            }
        }
    }

    private fun KClass<*>.afterDdlSql(): String =
        java
            .getAnnotationsByType(AfterDDL::class.java)
            .joinToString("\n") { it.sql }
}
