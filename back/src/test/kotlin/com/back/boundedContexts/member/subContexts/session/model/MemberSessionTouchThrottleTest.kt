package com.back.boundedContexts.member.subContexts.session.model

import com.back.boundedContexts.member.domain.shared.MemberPolicy
import com.back.boundedContexts.member.model.shared.Member
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test
import java.time.Instant

@DisplayName("MemberSession touch throttle 테스트")
class MemberSessionTouchThrottleTest {
    @Test
    fun `최소 간격 이내면 lastAuthenticatedAt 을 다시 쓰지 않는다`() {
        val member = Member(1L, "admin@test.com", null, "관리자", "admin@test.com", MemberPolicy.genApiKey())
        val session = MemberSession(id = 1L, member = member, sessionKey = MemberPolicy.genApiKey())
        val firstTouchedAt = Instant.parse("2026-04-03T00:00:00Z")
        val secondAttemptAt = firstTouchedAt.plusSeconds(30)

        val firstTouched = session.touchAuthenticatedIfDue(minIntervalSeconds = 60, now = firstTouchedAt)
        val secondTouched = session.touchAuthenticatedIfDue(minIntervalSeconds = 60, now = secondAttemptAt)

        assertThat(firstTouched).isTrue()
        assertThat(secondTouched).isFalse()
        assertThat(session.lastAuthenticatedAt).isEqualTo(firstTouchedAt)
    }

    @Test
    fun `최소 간격이 지나면 lastAuthenticatedAt 을 다시 갱신한다`() {
        val member = Member(1L, "admin@test.com", null, "관리자", "admin@test.com", MemberPolicy.genApiKey())
        val session = MemberSession(id = 1L, member = member, sessionKey = MemberPolicy.genApiKey())
        val firstTouchedAt = Instant.parse("2026-04-03T00:00:00Z")
        val secondAttemptAt = firstTouchedAt.plusSeconds(61)

        session.touchAuthenticatedIfDue(minIntervalSeconds = 60, now = firstTouchedAt)
        val secondTouched = session.touchAuthenticatedIfDue(minIntervalSeconds = 60, now = secondAttemptAt)

        assertThat(secondTouched).isTrue()
        assertThat(session.lastAuthenticatedAt).isEqualTo(secondAttemptAt)
    }
}
