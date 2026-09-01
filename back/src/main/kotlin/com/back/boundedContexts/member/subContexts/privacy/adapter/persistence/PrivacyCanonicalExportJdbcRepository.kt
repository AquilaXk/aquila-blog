package com.back.boundedContexts.member.subContexts.privacy.adapter.persistence

import com.back.boundedContexts.member.subContexts.privacy.application.dto.PrivacyExportAccountRecord
import com.back.boundedContexts.member.subContexts.privacy.application.dto.PrivacyExportLegalAcceptanceRecord
import com.back.boundedContexts.member.subContexts.privacy.application.dto.PrivacyExportPublicPostRecord
import com.back.boundedContexts.member.subContexts.privacy.application.dto.PrivacyExportRequestRecord
import com.back.boundedContexts.member.subContexts.privacy.application.dto.PrivacyExportSessionRecord
import com.back.boundedContexts.member.subContexts.privacy.application.port.output.PrivacyCanonicalExportReadPort
import com.back.boundedContexts.member.subContexts.privacy.model.MemberPrivacyRequestHoldStatus
import com.back.boundedContexts.member.subContexts.privacy.model.MemberPrivacyRequestIdentityStatus
import com.back.boundedContexts.member.subContexts.privacy.model.MemberPrivacyRequestIntakeChannel
import com.back.boundedContexts.member.subContexts.privacy.model.MemberPrivacyRequestRequesterRole
import com.back.boundedContexts.member.subContexts.privacy.model.MemberPrivacyRequestStatus
import com.back.boundedContexts.member.subContexts.privacy.model.MemberPrivacyRequestType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.sql.ResultSet
import java.time.Instant

@Repository
class PrivacyCanonicalExportJdbcRepository(
    private val jdbcTemplate: JdbcTemplate,
) : PrivacyCanonicalExportReadPort {
    override fun findAccount(memberId: Long): PrivacyExportAccountRecord? =
        jdbcTemplate
            .query(
                """
                select id, email, login_id as username, nickname, created_at, modified_at
                from member
                where id = ?
                """.trimIndent(),
                { resultSet, _ ->
                    PrivacyExportAccountRecord(
                        id = resultSet.getLong("id"),
                        email = resultSet.getString("email"),
                        username = resultSet.getString("username"),
                        nickname = resultSet.getString("nickname"),
                        createdAt = resultSet.instant("created_at"),
                        modifiedAt = resultSet.instant("modified_at"),
                    )
                },
                memberId,
            ).singleOrNull()

    override fun findLatestLegalAcceptance(memberId: Long): PrivacyExportLegalAcceptanceRecord? =
        jdbcTemplate
            .query(
                """
                select terms_version,
                       terms_content_sha256,
                       privacy_version,
                       privacy_content_sha256,
                       age14_or_older,
                       required_privacy_confirmed,
                       analytics_consent,
                       overseas_transfer_acknowledged,
                       source,
                       accepted_at
                from member_legal_acceptance
                where member_id = ?
                order by accepted_at desc, id desc
                limit 1
                """.trimIndent(),
                { resultSet, _ ->
                    PrivacyExportLegalAcceptanceRecord(
                        termsVersion = resultSet.getString("terms_version"),
                        termsContentSha256 = resultSet.getString("terms_content_sha256"),
                        privacyVersion = resultSet.getString("privacy_version"),
                        privacyContentSha256 = resultSet.getString("privacy_content_sha256"),
                        age14OrOlder = resultSet.getBoolean("age14_or_older"),
                        requiredPrivacyConfirmed = resultSet.getBoolean("required_privacy_confirmed"),
                        analyticsConsent = resultSet.getBoolean("analytics_consent"),
                        overseasTransferAcknowledged = resultSet.getBoolean("overseas_transfer_acknowledged"),
                        source = resultSet.getString("source"),
                        acceptedAt = resultSet.instant("accepted_at"),
                    )
                },
                memberId,
            ).singleOrNull()

    override fun findRequestHistory(memberId: Long): List<PrivacyExportRequestRecord> =
        jdbcTemplate.query(
            """
            select request.id,
                   request.type,
                   request.status,
                   request.intake_channel,
                   request.identity_status,
                   request.requester_role,
                   request.hold_status,
                   request.message,
                   request.requested_at,
                   request.due_at,
                   request.completed_at
            from member_privacy_request request
            where request.member_id = ?
               or request.account_deletion_id in (
                    select deletion.id
                    from member_account_deletion deletion
                    where deletion.member_id = ?
               )
            order by request.requested_at asc, request.id asc
            """.trimIndent(),
            { resultSet, _ ->
                PrivacyExportRequestRecord(
                    id = resultSet.getLong("id"),
                    type = MemberPrivacyRequestType.valueOf(resultSet.getString("type")),
                    status = MemberPrivacyRequestStatus.valueOf(resultSet.getString("status")),
                    intakeChannel = MemberPrivacyRequestIntakeChannel.valueOf(resultSet.getString("intake_channel")),
                    identityStatus = MemberPrivacyRequestIdentityStatus.valueOf(resultSet.getString("identity_status")),
                    requesterRole = MemberPrivacyRequestRequesterRole.valueOf(resultSet.getString("requester_role")),
                    holdStatus = MemberPrivacyRequestHoldStatus.valueOf(resultSet.getString("hold_status")),
                    message = resultSet.getString("message"),
                    requestedAt = resultSet.instant("requested_at"),
                    dueAt = resultSet.instant("due_at"),
                    completedAt = resultSet.nullableInstant("completed_at"),
                )
            },
            memberId,
            memberId,
        )

    override fun findOwnedPublicContent(memberId: Long): List<PrivacyExportPublicPostRecord> =
        jdbcTemplate.query(
            """
            select id, title, content, content_html, listed, created_at, modified_at
            from post
            where author_id = ?
              and published is true
              and deleted_at is null
            order by id asc
            """.trimIndent(),
            { resultSet, _ ->
                PrivacyExportPublicPostRecord(
                    id = resultSet.getLong("id"),
                    title = resultSet.getString("title"),
                    content = resultSet.getString("content"),
                    contentHtml = resultSet.getString("content_html"),
                    listed = resultSet.getBoolean("listed"),
                    createdAt = resultSet.instant("created_at"),
                    modifiedAt = resultSet.instant("modified_at"),
                )
            },
            memberId,
        )

    override fun countOwnedPublicContent(memberId: Long): Long =
        requireNotNull(
            jdbcTemplate.queryForObject(
                """
                select count(*)
                from post
                where author_id = ?
                  and published is true
                  and deleted_at is null
                """.trimIndent(),
                Long::class.java,
                memberId,
            ),
        )

    override fun summarizeSessions(memberId: Long): PrivacyExportSessionRecord =
        requireNotNull(
            jdbcTemplate.queryForObject(
                """
                select count(*) as total_count,
                       count(*) filter (where revoked_at is null) as active_count,
                       min(created_at) as first_created_at,
                       max(last_authenticated_at) as last_authenticated_at
                from member_session
                where member_id = ?
                """.trimIndent(),
                { resultSet, _ ->
                    PrivacyExportSessionRecord(
                        totalCount = resultSet.getLong("total_count"),
                        activeCount = resultSet.getLong("active_count"),
                        firstCreatedAt = resultSet.nullableInstant("first_created_at"),
                        lastAuthenticatedAt = resultSet.nullableInstant("last_authenticated_at"),
                    )
                },
                memberId,
            ),
        )

    private fun ResultSet.instant(column: String): Instant = requireNotNull(getTimestamp(column)).toInstant()

    private fun ResultSet.nullableInstant(column: String): Instant? = getTimestamp(column)?.toInstant()
}
