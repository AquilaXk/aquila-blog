package com.back.boundedContexts.member.adapter.web

import com.back.boundedContexts.member.application.service.MemberApplicationService
import com.back.boundedContexts.member.subContexts.legalAcceptance.adapter.persistence.MemberLegalAcceptanceRepository
import com.back.boundedContexts.member.subContexts.legalAcceptance.model.MemberLegalAcceptance
import com.back.boundedContexts.member.subContexts.privacy.adapter.persistence.MemberAccountDeletionRepository
import com.back.boundedContexts.member.subContexts.privacy.model.MemberAccountDeletion
import com.back.boundedContexts.member.subContexts.session.adapter.persistence.MemberSessionRepository
import com.back.global.security.config.AuthCookieNames
import com.back.support.BaseControllerIntegrationTest
import com.jayway.jsonpath.JsonPath
import jakarta.servlet.http.Cookie
import org.assertj.core.api.Assertions.assertThat
import org.hamcrest.Matchers.startsWith
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import java.time.Instant

class ApiV1PrivacyRightsControllerTest : BaseControllerIntegrationTest() {
    @Autowired
    private lateinit var memberFacade: MemberApplicationService

    @Autowired
    private lateinit var memberLegalAcceptanceRepository: MemberLegalAcceptanceRepository

    @Autowired
    private lateinit var memberAccountDeletionRepository: MemberAccountDeletionRepository

    @Autowired
    private lateinit var memberSessionRepository: MemberSessionRepository

    @Autowired
    private lateinit var jdbcTemplate: JdbcTemplate

    @Test
    fun `개인정보 export 는 로그인 사용자의 계정 스냅샷을 반환한다`() {
        val member =
            memberFacade.join(
                username = "privacy-export-user",
                password = "Abcd1234!",
                nickname = "정보내보내기",
                profileImgUrl = null,
                email = "privacy-export-user@example.com",
            )
        memberLegalAcceptanceRepository.save(
            MemberLegalAcceptance(
                member = member,
                termsVersion = "2026-06-21",
                termsContentSha256 = "terms-content-sha-256",
                privacyVersion = "2026-06-21",
                privacyContentSha256 = "privacy-content-sha-256",
                age14OrOlder = true,
                requiredPrivacyConfirmed = true,
                analyticsConsent = false,
                overseasTransferAcknowledged = true,
                source = "EMAIL_SIGNUP",
                acceptedAt = Instant.parse("2026-06-21T00:00:00Z"),
            ),
        )
        val authCookies = loginAuthCookies(member.email!!)

        mvc
            .get("/member/api/v1/privacy/export") {
                authCookies.forEach { cookie(it) }
            }.andExpect {
                status { isOk() }
                jsonPath("$.resultCode") { value("200-1") }
                jsonPath("$.msg") { value("개인정보 내보내기 데이터를 조회했습니다.") }
                jsonPath("$.data.member.id") { value(member.id) }
                jsonPath("$.data.member.email") { value("privacy-export-user@example.com") }
                jsonPath("$.data.member.username") { value("privacy-export-user") }
                jsonPath("$.data.member.nickname") { value("정보내보내기") }
                jsonPath("$.data.member.createdAt") { value(startsWith(member.createdAt.toString().take(20))) }
                jsonPath("$.data.latestLegalAcceptance.termsVersion") { value("2026-06-21") }
                jsonPath("$.data.latestLegalAcceptance.termsContentSha256") { value("terms-content-sha-256") }
                jsonPath("$.data.latestLegalAcceptance.privacyVersion") { value("2026-06-21") }
                jsonPath("$.data.latestLegalAcceptance.privacyContentSha256") { value("privacy-content-sha-256") }
                jsonPath("$.data.latestLegalAcceptance.age14OrOlder") { value(true) }
                jsonPath("$.data.latestLegalAcceptance.requiredPrivacyConfirmed") { value(true) }
                jsonPath("$.data.latestLegalAcceptance.analyticsConsent") { value(false) }
                jsonPath("$.data.latestLegalAcceptance.overseasTransferAcknowledged") { value(true) }
                jsonPath("$.data.latestLegalAcceptance.source") { value("EMAIL_SIGNUP") }
                jsonPath("$.data.latestLegalAcceptance.acceptedAt") { value("2026-06-21T00:00:00Z") }
                jsonPath("$.data.generatedAt") { value(startsWith("20")) }
            }
    }

    @Test
    fun `개인정보 처리 요청은 생성 후 본인 상태 조회가 가능하다`() {
        val member =
            memberFacade.join(
                username = "privacy-request-user",
                password = "Abcd1234!",
                nickname = "권리요청",
                profileImgUrl = null,
                email = "privacy-request-user@example.com",
            )
        val authCookies = loginAuthCookies(member.email!!)

        val created =
            mvc
                .post("/member/api/v1/privacy/requests") {
                    authCookies.forEach { cookie(it) }
                    header("X-Aquila-CSRF", "1")
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                            "type": "EXPORT",
                            "message": "가입 정보와 운영 로그 열람을 요청합니다."
                        }
                        """.trimIndent()
                }.andExpect {
                    status { isCreated() }
                    jsonPath("$.resultCode") { value("201-1") }
                    jsonPath("$.msg") { value("개인정보 처리 요청을 접수했습니다.") }
                    jsonPath("$.data.item.id") { isNumber() }
                    jsonPath("$.data.item.type") { value("EXPORT") }
                    jsonPath("$.data.item.status") { value("RECEIVED") }
                    jsonPath("$.data.item.message") { value("가입 정보와 운영 로그 열람을 요청합니다.") }
                    jsonPath("$.data.item.requestedAt") { value(startsWith("20")) }
                    jsonPath("$.data.item.dueAt") { value(startsWith("20")) }
                }.andReturn()

        val requestId = JsonPath.read<Int>(created.response.contentAsString, "$.data.item.id").toLong()

        mvc
            .get("/member/api/v1/privacy/requests/$requestId") {
                authCookies.forEach { cookie(it) }
            }.andExpect {
                status { isOk() }
                jsonPath("$.resultCode") { value("200-1") }
                jsonPath("$.msg") { value("개인정보 처리 요청 상태를 조회했습니다.") }
                jsonPath("$.data.item.id") { value(requestId) }
                jsonPath("$.data.item.memberId") { value(member.id) }
                jsonPath("$.data.item.type") { value("EXPORT") }
                jsonPath("$.data.item.status") { value("RECEIVED") }
            }

        mvc
            .post("/member/api/v1/privacy/requests") {
                authCookies.forEach { cookie(it) }
                header("X-Aquila-CSRF", "1")
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                        "type": "CORRECTION"
                    }
                    """.trimIndent()
            }.andExpect {
                status { isCreated() }
                jsonPath("$.data.item.type") { value("CORRECTION") }
                jsonPath("$.data.item.message") { doesNotExist() }
            }
    }

    @Test
    fun `존재하지 않는 개인정보 처리 요청은 404를 반환한다`() {
        val member =
            memberFacade.join(
                username = "privacy-request-missing-user",
                password = "Abcd1234!",
                nickname = "권리요청없음",
                profileImgUrl = null,
                email = "privacy-request-missing-user@example.com",
            )
        val authCookies = loginAuthCookies(member.email!!)

        mvc
            .get("/member/api/v1/privacy/requests/999999") {
                authCookies.forEach { cookie(it) }
            }.andExpect {
                status { isNotFound() }
                jsonPath("$.resultCode") { value("404-1") }
                jsonPath("$.msg") { value("개인정보 처리 요청을 찾을 수 없습니다.") }
            }
    }

    @Test
    fun `개인정보 처리 요청은 다른 회원이 조회할 수 없다`() {
        val owner =
            memberFacade.join(
                username = "privacy-request-owner",
                password = "Abcd1234!",
                nickname = "요청소유자",
                profileImgUrl = null,
                email = "privacy-request-owner@example.com",
            )
        val attacker =
            memberFacade.join(
                username = "privacy-request-attacker",
                password = "Abcd1234!",
                nickname = "다른사용자",
                profileImgUrl = null,
                email = "privacy-request-attacker@example.com",
            )
        val ownerCookies = loginAuthCookies(owner.email!!)
        val attackerCookies = loginAuthCookies(attacker.email!!)
        val created =
            mvc
                .post("/member/api/v1/privacy/requests") {
                    ownerCookies.forEach { cookie(it) }
                    header("X-Aquila-CSRF", "1")
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                            "type": "EXPORT"
                        }
                        """.trimIndent()
                }.andExpect {
                    status { isCreated() }
                }.andReturn()
        val requestId = JsonPath.read<Int>(created.response.contentAsString, "$.data.item.id").toLong()

        mvc
            .get("/member/api/v1/privacy/requests/$requestId") {
                attackerCookies.forEach { cookie(it) }
            }.andExpect {
                status { isNotFound() }
                jsonPath("$.resultCode") { value("404-1") }
                jsonPath("$.msg") { value("개인정보 처리 요청을 찾을 수 없습니다.") }
            }
    }

    @Test
    fun `계정 탈퇴는 비밀번호 재확인 후 회원을 삭제 상태로 전환하고 모든 세션을 폐기한다`() {
        val member =
            memberFacade.join(
                username = "account-delete-user",
                password = "Abcd1234!",
                nickname = "탈퇴유저",
                profileImgUrl = null,
                email = "account-delete-user@example.com",
            )
        val firstAuthCookies = loginAuthCookies(member.email!!)
        val secondAuthCookies = loginAuthCookies(member.email!!)
        member.applyLoginSecurityPolicy(
            rememberLoginEnabled = true,
            ipSecurityEnabled = true,
            ipSecurityFingerprint = "fingerprint-before-delete",
        )
        val firstSessionKey = requireAuthCookie(firstAuthCookies, AuthCookieNames.SESSION_KEY)
        val secondSessionKey = requireAuthCookie(secondAuthCookies, AuthCookieNames.SESSION_KEY)

        mvc
            .delete("/member/api/v1/privacy/account") {
                firstAuthCookies.forEach { cookie(it) }
                header("X-Aquila-CSRF", "1")
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                        "password": "Abcd1234!",
                        "reason": "서비스 이용 종료"
                    }
                    """.trimIndent()
            }.andExpect {
                status { isOk() }
                jsonPath("$.resultCode") { value("200-1") }
                jsonPath("$.msg") { value("계정 탈퇴가 완료되었습니다.") }
                cookie { maxAge(AuthCookieNames.API_KEY, 0) }
                cookie { maxAge(AuthCookieNames.ACCESS_TOKEN, 0) }
                cookie { maxAge(AuthCookieNames.REFRESH_TOKEN, 0) }
                cookie { maxAge(AuthCookieNames.SESSION_KEY, 0) }
            }

        assertThat(memberFacade.findByEmail("account-delete-user@example.com")).isNull()
        assertThat(findMemberDeletionState(member.id).email).isNull()
        assertThat(findMemberDeletionState(member.id).deletedAt).isNotNull()
        assertThat(findMemberDeletionState(member.id).ipSecurityEnabled).isFalse()
        assertThat(findMemberDeletionState(member.id).ipSecurityFingerprint).isNull()
        assertThat(findSessionRevokedAt(firstSessionKey.value)).isNotNull()
        assertThat(findSessionRevokedAt(secondSessionKey.value)).isNotNull()
        assertThat(countDeletionTombstones(member.id, "서비스 이용 종료")).isEqualTo(1)
        val deletion =
            memberAccountDeletionRepository
                .findAll()
                .single { it.member.id == member.id }
        assertThat(deletion.member.id).isEqualTo(member.id)
        assertThat(deletion.reason).isEqualTo("서비스 이용 종료")
        assertThat(deletion.deletedAt).isNotNull()
    }

    @Test
    fun `계정 탈퇴는 비밀번호가 틀리면 세션과 회원 상태를 유지한다`() {
        val member =
            memberFacade.join(
                username = "account-delete-wrong-password-user",
                password = "Abcd1234!",
                nickname = "탈퇴실패",
                profileImgUrl = null,
                email = "account-delete-wrong-password-user@example.com",
            )
        val authCookies = loginAuthCookies(member.email!!)
        val sessionKey = requireAuthCookie(authCookies, AuthCookieNames.SESSION_KEY)

        mvc
            .delete("/member/api/v1/privacy/account") {
                authCookies.forEach { cookie(it) }
                header("X-Aquila-CSRF", "1")
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                        "password": "wrong-password",
                        "reason": "서비스 이용 종료"
                    }
                    """.trimIndent()
            }.andExpect {
                status { isUnauthorized() }
                jsonPath("$.resultCode") { value("401-1") }
                jsonPath("$.msg") { value("비밀번호가 일치하지 않습니다.") }
            }

        assertThat(memberFacade.findByEmail("account-delete-wrong-password-user@example.com")).isNotNull()
        assertThat(memberSessionRepository.findBySessionKey(sessionKey.value)?.revokedAt).isNull()
    }

    @Test
    fun `계정 탈퇴는 기존 탈퇴 tombstone 이 있으면 409를 반환한다`() {
        val member =
            memberFacade.join(
                username = "account-delete-duplicate-user",
                password = "Abcd1234!",
                nickname = "중복탈퇴",
                profileImgUrl = null,
                email = "account-delete-duplicate-user@example.com",
            )
        memberAccountDeletionRepository.save(
            MemberAccountDeletion(
                member = member,
                deletedAt = Instant.parse("2026-06-21T00:00:00Z"),
            ),
        )
        val authCookies = loginAuthCookies(member.email!!)

        mvc
            .delete("/member/api/v1/privacy/account") {
                authCookies.forEach { cookie(it) }
                header("X-Aquila-CSRF", "1")
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                        "password": "Abcd1234!"
                    }
                    """.trimIndent()
            }.andExpect {
                status { isConflict() }
                jsonPath("$.resultCode") { value("409-1") }
                jsonPath("$.msg") { value("이미 탈퇴 처리된 계정입니다.") }
            }
    }

    private fun loginAuthCookies(email: String): List<Cookie> =
        mvc
            .post("/member/api/v1/auth/login") {
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                        "email": "$email",
                        "password": "Abcd1234!"
                    }
                    """.trimIndent()
            }.andExpect {
                status { isOk() }
            }.andReturn()
            .response
            .cookies
            .filter {
                it.name in AuthCookieNames.AUTHENTICATION_COOKIE_NAMES &&
                    it.value.isNotBlank()
            }

    private fun requireAuthCookie(
        cookies: List<Cookie>,
        name: String,
    ): Cookie = cookies.firstOrNull { it.name == name } ?: error("$name cookie not issued")

    private fun countDeletionTombstones(
        memberId: Long,
        reason: String,
    ): Int =
        jdbcTemplate.queryForObject(
            """
            select count(*)
            from member_account_deletion
            where member_id = ?
              and reason = ?
            """.trimIndent(),
            Int::class.java,
            memberId,
            reason,
        ) ?: 0

    private fun findMemberDeletionState(memberId: Long): MemberDeletionState =
        jdbcTemplate.queryForObject(
            """
            select email, deleted_at, ip_security_enabled, ip_security_fingerprint
            from member
            where id = ?
            """.trimIndent(),
            { rs, _ ->
                MemberDeletionState(
                    email = rs.getString("email"),
                    deletedAt = rs.getTimestamp("deleted_at")?.toInstant(),
                    ipSecurityEnabled = rs.getBoolean("ip_security_enabled"),
                    ipSecurityFingerprint = rs.getString("ip_security_fingerprint"),
                )
            },
            memberId,
        ) ?: error("member not found")

    private fun findSessionRevokedAt(sessionKey: String): java.time.Instant? =
        jdbcTemplate.queryForObject(
            """
            select revoked_at
            from member_session
            where session_key = ?
            """.trimIndent(),
            { rs, _ -> rs.getTimestamp("revoked_at")?.toInstant() },
            sessionKey,
        )

    private data class MemberDeletionState(
        val email: String?,
        val deletedAt: java.time.Instant?,
        val ipSecurityEnabled: Boolean,
        val ipSecurityFingerprint: String?,
    )
}
