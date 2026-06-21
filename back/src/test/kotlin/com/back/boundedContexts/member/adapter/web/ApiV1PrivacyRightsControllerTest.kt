package com.back.boundedContexts.member.adapter.web

import com.back.boundedContexts.member.application.service.MemberApplicationService
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

class ApiV1PrivacyRightsControllerTest : BaseControllerIntegrationTest() {
    @Autowired
    private lateinit var memberFacade: MemberApplicationService

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
        assertThat(findSessionRevokedAt(firstSessionKey.value)).isNotNull()
        assertThat(findSessionRevokedAt(secondSessionKey.value)).isNotNull()
        assertThat(countDeletionTombstones(member.id, "서비스 이용 종료")).isEqualTo(1)
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
            select email, deleted_at
            from member
            where id = ?
            """.trimIndent(),
            { rs, _ ->
                MemberDeletionState(
                    email = rs.getString("email"),
                    deletedAt = rs.getTimestamp("deleted_at")?.toInstant(),
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
    )
}
