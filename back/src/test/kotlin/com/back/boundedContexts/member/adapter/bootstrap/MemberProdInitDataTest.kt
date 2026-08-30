package com.back.boundedContexts.member.adapter.bootstrap

import ch.qos.logback.classic.Logger
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
import com.back.boundedContexts.member.application.port.input.MemberUseCase
import com.back.boundedContexts.member.domain.shared.Member
import com.back.global.app.AdminProperties
import com.back.global.exception.application.AppException
import com.back.global.exception.application.ErrorCode
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.mockito.Mockito.mock
import org.slf4j.LoggerFactory

@DisplayName("MemberProdInitData 테스트")
class MemberProdInitDataTest {
    @Test
    @DisplayName("관리자 email 충돌은 identity를 로그나 예외 message에 남기지 않는다")
    fun `admin email conflict omits configured identity from log and exception`() {
        val memberUseCase = mock(MemberUseCase::class.java)
        val configuredEmail = "raw-admin-canary@example.com"
        val configuredNickname = "RAW_ADMIN_NICKNAME_CANARY"
        val configuredPassword = "configured-password"
        val existingAdmin = Member(1L, "admin-login", "encoded-password", "current-name", configuredEmail)
        val conflictingOwner = Member(2L, "other-login", "other-password", "other-name", configuredEmail)
        val bootstrap =
            MemberProdInitData(
                memberUseCase,
                AdminProperties(
                    username = configuredNickname,
                    email = configuredEmail,
                    password = configuredPassword,
                ),
            )
        given(memberUseCase.findByEmail(configuredEmail)).willReturn(existingAdmin, conflictingOwner)
        val appender = attachListAppender()

        try {
            assertThatThrownBy { bootstrap.ensureConfiguredAdminMember() }
                .isInstanceOfSatisfying(AppException::class.java) { exception ->
                    assertThat(exception.errorCode).isEqualTo(ErrorCode.RESOURCE_CONFLICT)
                    assertThat(exception.message)
                        .doesNotContain(configuredEmail)
                        .doesNotContain(configuredNickname)
                }
        } finally {
            detachListAppender(appender)
        }

        assertThat(appender.list).hasSize(1)
        assertThat(appender.list.single().formattedMessage)
            .contains("Configured admin identity bootstrap started")
            .doesNotContain(configuredEmail)
            .doesNotContain(configuredNickname)
        assertThat(existingAdmin.password).isEqualTo("encoded-password")
    }

    @Test
    fun `existing administrator bootstrap preserves credentials until verified email login`() {
        val memberUseCase = mock(MemberUseCase::class.java)
        val configuredEmail = "admin@example.com"
        val existingAdmin =
            Member(
                id = 1L,
                username = "admin-login",
                password = "encoded-password",
                nickname = "Admin",
                email = configuredEmail,
                apiKey = "admin-login",
                admin = true,
            )
        val bootstrap =
            MemberProdInitData(
                memberUseCase,
                AdminProperties(
                    email = configuredEmail,
                    password = "configured-password",
                ),
            )
        given(memberUseCase.findByEmail(configuredEmail)).willReturn(existingAdmin, existingAdmin)

        bootstrap.ensureConfiguredAdminMember()

        assertThat(existingAdmin.password).isEqualTo("encoded-password")
        assertThat(existingAdmin.apiKey).isEqualTo("admin-login")
    }

    private fun attachListAppender(): ListAppender<ILoggingEvent> {
        val logger = LoggerFactory.getLogger(MemberProdInitData::class.java) as Logger
        return ListAppender<ILoggingEvent>().also {
            it.start()
            logger.addAppender(it)
        }
    }

    private fun detachListAppender(appender: ListAppender<ILoggingEvent>) {
        val logger = LoggerFactory.getLogger(MemberProdInitData::class.java) as Logger
        logger.detachAppender(appender)
        appender.stop()
    }
}
