package com.back.boundedContexts.member.adapter.web

import com.back.boundedContexts.member.application.service.AuthTokenService
import com.back.boundedContexts.member.application.service.LoginAttemptService
import com.back.boundedContexts.member.application.service.MemberApplicationService
import com.back.boundedContexts.member.subContexts.session.adapter.persistence.MemberSessionRepository
import com.back.global.security.config.AuthCookieNames
import com.back.support.BaseControllerIntegrationTest
import jakarta.servlet.http.Cookie
import org.assertj.core.api.Assertions.assertThat
import org.hamcrest.Matchers.startsWith
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Nested
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.request.RequestPostProcessor
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.handler

@org.junit.jupiter.api.DisplayName("ApiV1AuthController 테스트")
class ApiV1AuthControllerTest : BaseControllerIntegrationTest() {
    @Autowired
    private lateinit var memberFacade: MemberApplicationService

    @Autowired
    private lateinit var authTokenService: AuthTokenService

    @Autowired
    private lateinit var loginAttemptService: LoginAttemptService

    @Autowired
    private lateinit var memberSessionRepository: MemberSessionRepository

    @AfterEach
    fun clearLoginAttemptState() {
        loginAttemptService.clearAllForTest()
    }

    @Nested
    inner class Login {
        @Test
        fun `로그인 요청이 성공하면 회원 정보와 인증 쿠키를 반환한다`() {
            val member =
                memberFacade.join(
                    username = "login-success-user",
                    password = "Abcd1234!",
                    nickname = "로그인성공",
                    profileImgUrl = null,
                    email = "login-success-user@example.com",
                )

            val resultActions =
                mvc.post("/member/api/v1/auth/login") {
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                            "email": "login-success-user@example.com",
                            "password": "Abcd1234!"
                        }
                        """.trimIndent()
                }

            resultActions.andExpect {
                status { isOk() }
                match(handler().handlerType(ApiV1AuthController::class.java))
                match(handler().methodName("login"))
                jsonPath("$.resultCode") { value("200-1") }
                jsonPath("$.msg") { value("${member.nickname}님 환영합니다.") }
                jsonPath("$.data.item.id") { value(member.id) }
                jsonPath("$.data.item.createdAt") { value(startsWith(member.createdAt.toString().take(20))) }
                jsonPath("$.data.item.modifiedAt") { value(startsWith("20")) }
                jsonPath("$.data.item.isAdmin") { value(member.isAdmin) }
                jsonPath("$.data.item.name") { value(member.name) }
                jsonPath("$.data.item.profileImageUrl") { value(startsWith(member.redirectToProfileImgUrlOrDefault)) }
            }

            val result = resultActions.andReturn()

            val apiKeyCookie =
                result.response.cookies.firstOrNull { it.name == AuthCookieNames.API_KEY && it.value == member.apiKey }
            assertThat(apiKeyCookie).isNotNull
            assertThat(apiKeyCookie!!.value).isEqualTo(member.apiKey)
            assertThat(apiKeyCookie.path).isEqualTo("/")
            assertThat(apiKeyCookie.isHttpOnly).isTrue

            val accessTokenCookie =
                result.response.cookies.firstOrNull { it.name == AuthCookieNames.ACCESS_TOKEN && it.value.isNotBlank() }
            assertThat(accessTokenCookie).isNotNull
            assertThat(accessTokenCookie!!.value).isNotBlank()
            assertThat(accessTokenCookie.path).isEqualTo("/")
            assertThat(accessTokenCookie.isHttpOnly).isTrue

            val refreshTokenCookie =
                result.response.cookies.firstOrNull { it.name == AuthCookieNames.REFRESH_TOKEN && it.value.isNotBlank() }
            assertThat(refreshTokenCookie).isNotNull
            assertThat(refreshTokenCookie!!.value).isNotBlank()
            assertThat(refreshTokenCookie.path).isEqualTo("/")
            assertThat(refreshTokenCookie.isHttpOnly).isTrue

            val sessionKeyCookie =
                result.response.cookies.firstOrNull { it.name == AuthCookieNames.SESSION_KEY && it.value.isNotBlank() }
            assertThat(sessionKeyCookie).isNotNull
            val activeSession = memberSessionRepository.findBySessionKeyAndRevokedAtIsNull(sessionKeyCookie!!.value)
            assertThat(activeSession).isNotNull
            assertThat(activeSession!!.member.id).isEqualTo(member.id)
            assertThat(activeSession.refreshTokenHash).isNotBlank()
            assertThat(activeSession.refreshTokenHash).isNotEqualTo(refreshTokenCookie.value)
            assertThat(activeSession.refreshTokenExpiresAt).isNotNull
        }

        @Test
        fun `로그인 요청은 이메일 식별자도 수용한다`() {
            val member =
                memberFacade.join(
                    username = "email-login-user",
                    password = "Abcd1234!",
                    nickname = "이메일로그인",
                    profileImgUrl = null,
                    email = "email-login-user@example.com",
                )

            mvc
                .post("/member/api/v1/auth/login") {
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                            "email": "email-login-user@example.com",
                            "password": "Abcd1234!"
                        }
                        """.trimIndent()
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.data.item.id") { value(member.id) }
                    jsonPath("$.data.item.name") { value(member.nickname) }
                }
        }

        @Test
        fun `로그인 요청에서 로그인 상태 유지를 끄면 세션 쿠키로 발급한다`() {
            memberFacade.join(
                username = "session-login-user",
                password = "Abcd1234!",
                nickname = "세션로그인",
                profileImgUrl = null,
                email = "session-login-user@example.com",
            )

            val result =
                mvc
                    .post("/member/api/v1/auth/login") {
                        contentType = MediaType.APPLICATION_JSON
                        content =
                            """
                            {
                                "email": "session-login-user@example.com",
                                "password": "Abcd1234!",
                                "rememberMe": false
                            }
                            """.trimIndent()
                    }.andExpect {
                        status { isOk() }
                    }.andReturn()

            val apiKeyCookie = result.response.getCookie(AuthCookieNames.API_KEY)
            val issuedApiKeyCookie =
                result.response.cookies.firstOrNull { it.name == AuthCookieNames.API_KEY && it.value.isNotBlank() }
            val issuedAccessTokenCookie =
                result.response.cookies.firstOrNull { it.name == AuthCookieNames.ACCESS_TOKEN && it.value.isNotBlank() }
            val issuedRefreshTokenCookie =
                result.response.cookies.firstOrNull { it.name == AuthCookieNames.REFRESH_TOKEN && it.value.isNotBlank() }
            val issuedSessionKeyCookie =
                result.response.cookies.firstOrNull { it.name == AuthCookieNames.SESSION_KEY && it.value.isNotBlank() }

            assertThat(apiKeyCookie).isNotNull
            assertThat(issuedApiKeyCookie).isNotNull
            assertThat(issuedApiKeyCookie!!.maxAge).isEqualTo(-1)

            assertThat(issuedAccessTokenCookie).isNotNull
            assertThat(issuedAccessTokenCookie!!.maxAge).isEqualTo(-1)
            assertThat(issuedRefreshTokenCookie).isNotNull
            assertThat(issuedRefreshTokenCookie!!.maxAge).isEqualTo(-1)
            assertThat(issuedSessionKeyCookie).isNotNull
            assertThat(issuedSessionKeyCookie!!.maxAge).isEqualTo(-1)
        }

        @Test
        fun `로그인 직후 발급한 인증 쿠키로 세션 정보 조회가 즉시 가능하다`() {
            memberFacade.join(
                username = "session-snapshot-user",
                password = "Abcd1234!",
                nickname = "세션스냅샷",
                profileImgUrl = null,
                email = "session-snapshot-user@example.com",
            )

            val loginResult =
                mvc
                    .post("/member/api/v1/auth/login") {
                        contentType = MediaType.APPLICATION_JSON
                        content =
                            """
                            {
                                "email": "session-snapshot-user@example.com",
                                "password": "Abcd1234!"
                            }
                            """.trimIndent()
                    }.andExpect {
                        status { isOk() }
                    }.andReturn()

            val issuedCookies =
                loginResult.response.cookies.filter {
                    it.name in AuthCookieNames.AUTHENTICATION_COOKIE_NAMES &&
                        it.value.isNotBlank()
                }

            assertThat(issuedCookies.map { it.name })
                .contains(
                    AuthCookieNames.API_KEY,
                    AuthCookieNames.ACCESS_TOKEN,
                    AuthCookieNames.REFRESH_TOKEN,
                    AuthCookieNames.SESSION_KEY,
                )

            mvc
                .get("/member/api/v1/auth/session") {
                    issuedCookies.forEach { cookie(it) }
                }.andExpect {
                    status { isOk() }
                    match(handler().handlerType(ApiV1AuthController::class.java))
                    match(handler().methodName("session"))
                    jsonPath("$.username") { value("세션스냅샷") }
                    jsonPath("$.nickname") { value("세션스냅샷") }
                }
        }

        @Test
        fun `동일 계정 재로그인 후에도 기존 apiKey 세션은 계속 유효하다`() {
            val member =
                memberFacade.join(
                    username = "multi-session-user",
                    password = "Abcd1234!",
                    nickname = "다중세션",
                    profileImgUrl = null,
                    email = "multi-session-user@example.com",
                )

            val firstLogin =
                mvc
                    .post("/member/api/v1/auth/login") {
                        contentType = MediaType.APPLICATION_JSON
                        content =
                            """
                            {
                                "email": "${member.email}",
                                "password": "Abcd1234!"
                            }
                            """.trimIndent()
                    }.andExpect {
                        status { isOk() }
                    }.andReturn()

            val firstApiKeyCookie =
                firstLogin.response.cookies.firstOrNull { it.name == AuthCookieNames.API_KEY && it.value.isNotBlank() }
            val firstAccessTokenCookie =
                firstLogin.response.cookies.firstOrNull { it.name == AuthCookieNames.ACCESS_TOKEN && it.value.isNotBlank() }
            val firstSessionKeyCookie =
                firstLogin.response.cookies.firstOrNull { it.name == AuthCookieNames.SESSION_KEY && it.value.isNotBlank() }
            assertThat(firstApiKeyCookie).isNotNull
            assertThat(firstAccessTokenCookie).isNotNull
            assertThat(firstSessionKeyCookie).isNotNull

            val secondLogin =
                mvc
                    .post("/member/api/v1/auth/login") {
                        contentType = MediaType.APPLICATION_JSON
                        content =
                            """
                            {
                                "email": "${member.email}",
                                "password": "Abcd1234!"
                            }
                            """.trimIndent()
                    }.andExpect {
                        status { isOk() }
                    }.andReturn()

            val secondApiKeyCookie =
                secondLogin.response.cookies.firstOrNull { it.name == AuthCookieNames.API_KEY && it.value.isNotBlank() }
            assertThat(secondApiKeyCookie).isNotNull
            assertThat(secondApiKeyCookie!!.value).isEqualTo(firstApiKeyCookie!!.value)

            mvc
                .get("/member/api/v1/auth/me") {
                    cookie(Cookie(AuthCookieNames.API_KEY, firstApiKeyCookie.value))
                    cookie(Cookie(AuthCookieNames.ACCESS_TOKEN, firstAccessTokenCookie!!.value))
                    cookie(Cookie(AuthCookieNames.SESSION_KEY, firstSessionKeyCookie!!.value))
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.id") { value(member.id) }
                    jsonPath("$.nickname") { value(member.nickname) }
                }
        }

        @Test
        fun `로그인 요청에서 비밀번호가 틀리면 401을 반환한다`() {
            memberFacade.join(
                username = "wrong-password-user",
                password = "Abcd1234!",
                nickname = "잘못된비번",
                profileImgUrl = null,
                email = "wrong-password-user@example.com",
            )

            mvc
                .post("/member/api/v1/auth/login") {
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                            "email": "wrong-password-user@example.com",
                            "password": "wrong-password"
                        }
                        """.trimIndent()
                }.andExpect {
                    status { isUnauthorized() }
                    match(handler().handlerType(ApiV1AuthController::class.java))
                    match(handler().methodName("login"))
                    jsonPath("$.resultCode") { value("401-1") }
                    jsonPath("$.msg") { value("이메일 또는 비밀번호가 올바르지 않습니다.") }
                }
        }

        @Test
        fun `로그인 요청에서 존재하지 않는 이메일을 보내면 401을 반환한다`() {
            mvc
                .post("/member/api/v1/auth/login") {
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                            "email": "nonexistent@example.com",
                            "password": "1234"
                        }
                        """.trimIndent()
                }.andExpect {
                    status { isUnauthorized() }
                    match(handler().handlerType(ApiV1AuthController::class.java))
                    match(handler().methodName("login"))
                    jsonPath("$.resultCode") { value("401-1") }
                    jsonPath("$.msg") { value("이메일 또는 비밀번호가 올바르지 않습니다.") }
                }
        }

        @Test
        fun `로그인 요청에서 식별자가 비어 있으면 400을 반환한다`() {
            mvc
                .post("/member/api/v1/auth/login") {
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                            "password": "1234"
                        }
                        """.trimIndent()
                }.andExpect {
                    status { isBadRequest() }
                    jsonPath("$.resultCode") { value("400-1") }
                    jsonPath("$.msg") { value("이메일을 입력해주세요.") }
                }
        }

        @Test
        fun `로그인 요청에서 이메일 형식이 아니면 400을 반환한다`() {
            mvc
                .post("/member/api/v1/auth/login") {
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                            "email": "admin",
                            "password": "1234"
                        }
                        """.trimIndent()
                }.andExpect {
                    status { isBadRequest() }
                    jsonPath("$.resultCode") { value("400-2") }
                    jsonPath("$.msg") { value("이메일 형식을 확인해주세요.") }
                }
        }

        @Test
        fun `로그인 실패가 누적되면 429를 반환한다`() {
            memberFacade.join(
                username = "rate-limit-user",
                password = "Abcd1234!",
                nickname = "레이트리밋",
                profileImgUrl = null,
                email = "rate-limit-user@example.com",
            )

            repeat(4) {
                mvc
                    .post("/member/api/v1/auth/login") {
                        contentType = MediaType.APPLICATION_JSON
                        content =
                            """
                            {
                                "email": "rate-limit-user@example.com",
                                "password": "wrong-password"
                            }
                            """.trimIndent()
                    }.andExpect {
                        status { isUnauthorized() }
                        jsonPath("$.resultCode") { value("401-1") }
                    }
            }

            mvc
                .post("/member/api/v1/auth/login") {
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                            "email": "rate-limit-user@example.com",
                            "password": "wrong-password"
                        }
                        """.trimIndent()
                }.andExpect {
                    status { isTooManyRequests() }
                    jsonPath("$.resultCode") { value("429-1") }
                }
        }
    }

    @Nested
    inner class Logout {
        @Test
        fun `로그아웃 요청이 성공하면 인증 쿠키를 만료시킨다`() {
            val member =
                memberFacade.join(
                    username = "logout-session-user",
                    password = "Abcd1234!",
                    nickname = "로그아웃세션",
                    profileImgUrl = null,
                    email = "logout-session-user@example.com",
                )
            val loginResponse =
                mvc
                    .post("/member/api/v1/auth/login") {
                        contentType = MediaType.APPLICATION_JSON
                        content =
                            """
                            {
                                "email": "${member.email}",
                                "password": "Abcd1234!"
                            }
                            """.trimIndent()
                    }.andExpect {
                        status { isOk() }
                    }.andReturn()
            val sessionKeyCookie =
                loginResponse.response.cookies.firstOrNull { it.name == AuthCookieNames.SESSION_KEY && it.value.isNotBlank() }
            assertThat(sessionKeyCookie).isNotNull
            val resultActions =
                mvc
                    .delete("/member/api/v1/auth/logout") {
                        cookie(sessionKeyCookie!!)
                        header("X-Aquila-CSRF", "1")
                    }.andExpect {
                        status { isOk() }
                        match(handler().handlerType(ApiV1AuthController::class.java))
                        match(handler().methodName("logout"))
                        jsonPath("$.resultCode") { value("200-1") }
                        jsonPath("$.msg") { value("로그아웃 되었습니다.") }
                    }

            val result = resultActions.andReturn()

            val apiKeyCookie: Cookie? = result.response.getCookie(AuthCookieNames.API_KEY)
            assertThat(apiKeyCookie).isNotNull
            assertThat(apiKeyCookie!!.value).isEmpty()
            assertThat(apiKeyCookie.maxAge).isEqualTo(0)
            assertThat(apiKeyCookie.path).isEqualTo("/")
            assertThat(apiKeyCookie.isHttpOnly).isTrue

            val accessTokenCookie: Cookie? = result.response.getCookie(AuthCookieNames.ACCESS_TOKEN)
            assertThat(accessTokenCookie).isNotNull
            assertThat(accessTokenCookie!!.value).isEmpty()
            assertThat(accessTokenCookie.maxAge).isEqualTo(0)
            assertThat(accessTokenCookie.path).isEqualTo("/")
            assertThat(accessTokenCookie.isHttpOnly).isTrue

            val refreshTokenCookie: Cookie? = result.response.getCookie(AuthCookieNames.REFRESH_TOKEN)
            assertThat(refreshTokenCookie).isNotNull
            assertThat(refreshTokenCookie!!.value).isEmpty()
            assertThat(refreshTokenCookie.maxAge).isEqualTo(0)
            assertThat(refreshTokenCookie.path).isEqualTo("/")
            assertThat(refreshTokenCookie.isHttpOnly).isTrue

            val expiredSessionKeyCookie: Cookie? = result.response.getCookie(AuthCookieNames.SESSION_KEY)
            assertThat(expiredSessionKeyCookie).isNotNull
            assertThat(expiredSessionKeyCookie!!.value).isEmpty()
            assertThat(expiredSessionKeyCookie.maxAge).isEqualTo(0)
            assertThat(expiredSessionKeyCookie.path).isEqualTo("/")
            assertThat(expiredSessionKeyCookie.isHttpOnly).isTrue

            val revokedSession = memberSessionRepository.findBySessionKey(sessionKeyCookie!!.value)
            assertThat(revokedSession).isNotNull
            assertThat(revokedSession!!.revokedAt).isNotNull
        }
    }

    @Nested
    inner class Me {
        @Test
        fun `내 정보 조회는 apiKey 와 sessionKey 쿠키가 있으면 회원 정보를 반환한다`() {
            val member =
                memberFacade.join(
                    username = "session-bound-me-user",
                    password = "Abcd1234!",
                    nickname = "세션조회",
                    profileImgUrl = null,
                    email = "session-bound-me-user@example.com",
                )
            val authCookies = loginAuthCookies(member.email!!)

            mvc
                .get("/member/api/v1/auth/me") {
                    authCookies.forEach { cookie(it) }
                }.andExpect {
                    status { isOk() }
                    match(handler().handlerType(ApiV1AuthController::class.java))
                    match(handler().methodName("me"))
                    jsonPath("$.id") { value(member.id) }
                    jsonPath("$.createdAt") { value(startsWith(member.createdAt.toString().take(20))) }
                    jsonPath("$.modifiedAt") { value(startsWith(member.modifiedAt.toString().take(20))) }
                    jsonPath("$.isAdmin") { value(member.isAdmin) }
                    jsonPath("$.username") { value(member.name) }
                    jsonPath("$.name") { value(member.name) }
                    jsonPath("$.nickname") { value(member.nickname) }
                    jsonPath("$.profileImageUrl") { value(startsWith(member.redirectToProfileImgUrlOrDefault)) }
                }
        }

        @Test
        fun `세션 정보 조회는 apiKey 와 sessionKey 쿠키가 있으면 경량 회원 정보를 반환한다`() {
            val member =
                memberFacade.join(
                    username = "session-bound-session-user",
                    password = "Abcd1234!",
                    nickname = "세션경량조회",
                    profileImgUrl = null,
                    email = "session-bound-session-user@example.com",
                )
            val authCookies = loginAuthCookies(member.email!!)

            mvc
                .get("/member/api/v1/auth/session") {
                    authCookies.forEach { cookie(it) }
                }.andExpect {
                    status { isOk() }
                    match(handler().handlerType(ApiV1AuthController::class.java))
                    match(handler().methodName("session"))
                    jsonPath("$.id") { value(member.id) }
                    jsonPath("$.isAdmin") { value(member.isAdmin) }
                    jsonPath("$.username") { value(member.name) }
                    jsonPath("$.nickname") { value(member.nickname) }
                }
        }

        @Test
        fun `내 정보 조회는 apiKey 쿠키만 있으면 세션 만료로 거부한다`() {
            val member = memberFacade.findByLoginId("user1")!!

            mvc
                .get("/member/api/v1/auth/me") {
                    cookie(Cookie(AuthCookieNames.API_KEY, member.apiKey))
                }.andExpect {
                    status { isUnauthorized() }
                    jsonPath("$.resultCode") { value("401-8") }
                    jsonPath("$.msg") { value("세션이 만료되었습니다. 다시 로그인해주세요.") }
                    cookie { maxAge(AuthCookieNames.API_KEY, 0) }
                    cookie { maxAge(AuthCookieNames.ACCESS_TOKEN, 0) }
                    cookie { maxAge(AuthCookieNames.REFRESH_TOKEN, 0) }
                    cookie { maxAge(AuthCookieNames.SESSION_KEY, 0) }
                }
        }

        @Test
        fun `내 정보 조회는 apiKey 쿠키가 없으면 401을 반환한다`() {
            mvc
                .get("/member/api/v1/auth/me")
                .andExpect {
                    status { isUnauthorized() }
                    jsonPath("$.resultCode") { value("401-1") }
                    jsonPath("$.msg") { value("로그인 후 이용해주세요.") }
                }
        }

        @Test
        fun `내 정보 조회에서 Authorization 헤더가 Bearer 형식이 아니면 401을 반환한다`() {
            mvc
                .get("/member/api/v1/auth/me") {
                    header(HttpHeaders.AUTHORIZATION, "key")
                }.andExpect {
                    status { isUnauthorized() }
                    jsonPath("$.resultCode") { value("401-2") }
                    jsonPath("$.msg") { value("Authorization 헤더가 Bearer 형식이 아닙니다.") }
                }
        }

        @Test
        fun `내 정보 조회에서 accessToken 이 잘못되어도 refreshToken 과 sessionKey 가 유효하면 토큰을 회전한다`() {
            val member =
                memberFacade.join(
                    username = "session-bound-rotate-user",
                    password = "Abcd1234!",
                    nickname = "세션재발급",
                    profileImgUrl = null,
                    email = "session-bound-rotate-user@example.com",
                )
            val authCookies = loginAuthCookies(member.email!!)
            val sessionKeyCookie = requireAuthCookie(authCookies, AuthCookieNames.SESSION_KEY)
            val refreshTokenCookie = requireAuthCookie(authCookies, AuthCookieNames.REFRESH_TOKEN)

            val resultActions =
                mvc
                    .get("/member/api/v1/auth/me") {
                        cookie(Cookie(AuthCookieNames.ACCESS_TOKEN, "wrong-access-token"))
                        cookie(refreshTokenCookie)
                        cookie(sessionKeyCookie)
                    }.andExpect {
                        status { isOk() }
                        match(handler().handlerType(ApiV1AuthController::class.java))
                        match(handler().methodName("me"))
                        jsonPath("$.id") { value(member.id) }
                        jsonPath("$.createdAt") { value(startsWith(member.createdAt.toString().take(20))) }
                        jsonPath("$.modifiedAt") { value(startsWith(member.modifiedAt.toString().take(20))) }
                        jsonPath("$.isAdmin") { value(member.isAdmin) }
                        jsonPath("$.username") { value(member.name) }
                        jsonPath("$.name") { value(member.name) }
                        jsonPath("$.nickname") { value(member.nickname) }
                        jsonPath("$.profileImageUrl") { value(startsWith(member.redirectToProfileImgUrlOrDefault)) }
                    }

            val result = resultActions.andReturn()
            val accessTokenCookie =
                result.response.cookies.firstOrNull { it.name == AuthCookieNames.ACCESS_TOKEN && it.value.isNotBlank() }
            val rotatedRefreshTokenCookie =
                result.response.cookies.firstOrNull { it.name == AuthCookieNames.REFRESH_TOKEN && it.value.isNotBlank() }

            assertThat(accessTokenCookie).isNotNull
            assertThat(accessTokenCookie!!.value).isNotBlank()
            assertThat(accessTokenCookie.path).isEqualTo("/")
            assertThat(accessTokenCookie.isHttpOnly).isTrue
            assertThat(rotatedRefreshTokenCookie).isNotNull
            assertThat(rotatedRefreshTokenCookie!!.value).isNotBlank()
            assertThat(rotatedRefreshTokenCookie.value).isNotEqualTo(refreshTokenCookie.value)
            assertThat(rotatedRefreshTokenCookie.path).isEqualTo("/")
            assertThat(rotatedRefreshTokenCookie.isHttpOnly).isTrue
            assertThat(result.response.getHeader(HttpHeaders.AUTHORIZATION))
                .isEqualTo("Bearer ${accessTokenCookie.value}")
        }

        @Test
        fun `내 정보 조회에서 이미 회전된 refreshToken 을 다시 사용하면 세션을 폐기한다`() {
            val member =
                memberFacade.join(
                    username = "session-bound-reuse-user",
                    password = "Abcd1234!",
                    nickname = "세션재사용",
                    profileImgUrl = null,
                    email = "session-bound-reuse-user@example.com",
                )
            val authCookies = loginAuthCookies(member.email!!)
            val sessionKeyCookie = requireAuthCookie(authCookies, AuthCookieNames.SESSION_KEY)
            val staleRefreshTokenCookie = requireAuthCookie(authCookies, AuthCookieNames.REFRESH_TOKEN)

            mvc
                .get("/member/api/v1/auth/me") {
                    cookie(Cookie(AuthCookieNames.ACCESS_TOKEN, "wrong-access-token"))
                    cookie(staleRefreshTokenCookie)
                    cookie(sessionKeyCookie)
                }.andExpect {
                    status { isOk() }
                }

            mvc
                .get("/member/api/v1/auth/me") {
                    cookie(Cookie(AuthCookieNames.ACCESS_TOKEN, "wrong-access-token"))
                    cookie(staleRefreshTokenCookie)
                    cookie(sessionKeyCookie)
                }.andExpect {
                    status { isUnauthorized() }
                    jsonPath("$.resultCode") { value("401-8") }
                    jsonPath("$.msg") { value("세션이 만료되었습니다. 다시 로그인해주세요.") }
                    cookie { maxAge(AuthCookieNames.API_KEY, 0) }
                    cookie { maxAge(AuthCookieNames.ACCESS_TOKEN, 0) }
                    cookie { maxAge(AuthCookieNames.REFRESH_TOKEN, 0) }
                    cookie { maxAge(AuthCookieNames.SESSION_KEY, 0) }
                }

            val revokedSession = memberSessionRepository.findBySessionKey(sessionKeyCookie.value)
            assertThat(revokedSession).isNotNull
            assertThat(revokedSession!!.refreshTokenReusedAt).isNotNull
            assertThat(revokedSession.revokedAt).isNotNull
        }

        @Test
        fun `내 정보 조회에서 Authorization 헤더의 apiKey 와 accessToken 이 모두 유효하면 회원 정보를 반환하고 accessToken 을 재발급하지 않는다`() {
            val member =
                memberFacade.join(
                    username = "session-bound-bearer-user",
                    password = "Abcd1234!",
                    nickname = "세션토큰유저",
                    profileImgUrl = null,
                    email = "session-bound-bearer-user@example.com",
                )
            val authCookies = loginAuthCookies(member.email!!)
            val apiKeyCookie = requireAuthCookie(authCookies, AuthCookieNames.API_KEY)
            val accessTokenCookie = requireAuthCookie(authCookies, AuthCookieNames.ACCESS_TOKEN)
            val sessionKeyCookie = requireAuthCookie(authCookies, AuthCookieNames.SESSION_KEY)

            val resultActions =
                mvc
                    .get("/member/api/v1/auth/me") {
                        header(HttpHeaders.AUTHORIZATION, "Bearer ${apiKeyCookie.value} ${accessTokenCookie.value}")
                        cookie(sessionKeyCookie)
                    }.andExpect {
                        status { isOk() }
                        match(handler().handlerType(ApiV1AuthController::class.java))
                        match(handler().methodName("me"))
                        jsonPath("$.id") { value(member.id) }
                        jsonPath("$.createdAt") { value(startsWith(member.createdAt.toString().take(20))) }
                        jsonPath("$.modifiedAt") { value(startsWith(member.modifiedAt.toString().take(20))) }
                        jsonPath("$.isAdmin") { value(member.isAdmin) }
                        jsonPath("$.username") { value(member.name) }
                        jsonPath("$.name") { value(member.name) }
                        jsonPath("$.nickname") { value(member.nickname) }
                        jsonPath("$.profileImageUrl") { value(startsWith(member.redirectToProfileImgUrlOrDefault)) }
                    }

            val result = resultActions.andReturn()

            assertThat(result.response.getCookie(AuthCookieNames.ACCESS_TOKEN)).isNull()
            assertThat(result.response.getHeader(HttpHeaders.AUTHORIZATION)).isNull()
        }

        @Test
        fun `내 정보 조회에서 sessionKey 없는 Bearer accessToken 은 세션 만료로 거부한다`() {
            val member = memberFacade.findByLoginId("user1")!!
            val accessToken = authTokenService.genAccessToken(member)

            mvc
                .get("/member/api/v1/auth/me") {
                    header(HttpHeaders.AUTHORIZATION, "Bearer $accessToken")
                }.andExpect {
                    status { isUnauthorized() }
                    jsonPath("$.resultCode") { value("401-8") }
                    jsonPath("$.msg") { value("세션이 만료되었습니다. 다시 로그인해주세요.") }
                    cookie { maxAge(AuthCookieNames.API_KEY, 0) }
                    cookie { maxAge(AuthCookieNames.ACCESS_TOKEN, 0) }
                    cookie { maxAge(AuthCookieNames.REFRESH_TOKEN, 0) }
                    cookie { maxAge(AuthCookieNames.SESSION_KEY, 0) }
                }
        }

        @Test
        fun `아이피 보안이 켜진 세션에서 아이피가 바뀌면 401을 반환하고 인증 쿠키를 만료시킨다`() {
            val member =
                memberFacade.join(
                    username = "ip-security-user",
                    password = "Abcd1234!",
                    nickname = "아이피보안유저",
                    profileImgUrl = null,
                    email = "ip-security-user@example.com",
                )

            val loginResponse =
                mvc
                    .post("/member/api/v1/auth/login") {
                        contentType = MediaType.APPLICATION_JSON
                        content =
                            """
                            {
                                "email": "${member.email}",
                                "password": "Abcd1234!",
                                "ipSecurity": true
                            }
                            """.trimIndent()
                    }.andExpect {
                        status { isOk() }
                    }.andReturn()

            val apiKeyCookie =
                loginResponse.response.cookies.firstOrNull { it.name == AuthCookieNames.API_KEY && it.value.isNotBlank() }
            val accessTokenCookie =
                loginResponse.response.cookies.firstOrNull { it.name == AuthCookieNames.ACCESS_TOKEN && it.value.isNotBlank() }
            val sessionKeyCookie =
                loginResponse.response.cookies.firstOrNull { it.name == AuthCookieNames.SESSION_KEY && it.value.isNotBlank() }
            assertThat(apiKeyCookie).isNotNull
            assertThat(accessTokenCookie).isNotNull
            assertThat(sessionKeyCookie).isNotNull

            mvc
                .get("/member/api/v1/auth/me") {
                    cookie(apiKeyCookie!!)
                    cookie(accessTokenCookie!!)
                    cookie(sessionKeyCookie!!)
                    with(remoteAddr("10.0.0.77"))
                }.andExpect {
                    status { isUnauthorized() }
                    jsonPath("$.resultCode") { value("401-7") }
                    jsonPath("$.msg") { value("IP 보안 검증에 실패했습니다. 다시 로그인해주세요.") }
                }.andExpect {
                    cookie { maxAge(AuthCookieNames.API_KEY, 0) }
                    cookie { maxAge(AuthCookieNames.ACCESS_TOKEN, 0) }
                    cookie { maxAge(AuthCookieNames.REFRESH_TOKEN, 0) }
                    cookie { maxAge(AuthCookieNames.SESSION_KEY, 0) }
                }
        }

        @Test
        fun `아이피 보안이 켜져도 프록시 remoteAddr 변경만 발생하고 원본 클라이언트 IP가 같으면 세션을 유지한다`() {
            val member =
                memberFacade.join(
                    username = "ip-security-proxy-user",
                    password = "Abcd1234!",
                    nickname = "아이피보안프록시",
                    profileImgUrl = null,
                    email = "ip-security-proxy-user@example.com",
                )

            val loginResponse =
                mvc
                    .post("/member/api/v1/auth/login") {
                        contentType = MediaType.APPLICATION_JSON
                        header("CF-Connecting-IP", "198.51.100.34")
                        with(remoteAddr("172.18.0.5"))
                        content =
                            """
                            {
                                "email": "${member.email}",
                                "password": "Abcd1234!",
                                "ipSecurity": true
                            }
                            """.trimIndent()
                    }.andExpect {
                        status { isOk() }
                    }.andReturn()

            val apiKeyCookie =
                loginResponse.response.cookies.firstOrNull { it.name == AuthCookieNames.API_KEY && it.value.isNotBlank() }
            val accessTokenCookie =
                loginResponse.response.cookies.firstOrNull { it.name == AuthCookieNames.ACCESS_TOKEN && it.value.isNotBlank() }
            val sessionKeyCookie =
                loginResponse.response.cookies.firstOrNull { it.name == AuthCookieNames.SESSION_KEY && it.value.isNotBlank() }
            assertThat(apiKeyCookie).isNotNull
            assertThat(accessTokenCookie).isNotNull
            assertThat(sessionKeyCookie).isNotNull

            mvc
                .get("/member/api/v1/auth/me") {
                    cookie(apiKeyCookie!!)
                    cookie(accessTokenCookie!!)
                    cookie(sessionKeyCookie!!)
                    header("CF-Connecting-IP", "198.51.100.34")
                    with(remoteAddr("172.18.0.9"))
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.id") { value(member.id) }
                    jsonPath("$.nickname") { value(member.nickname) }
                }
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

    private fun remoteAddr(ip: String): RequestPostProcessor =
        RequestPostProcessor { request ->
            request.remoteAddr = ip
            request
        }
}
