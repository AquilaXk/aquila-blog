package com.back.boundedContexts.member.domain.shared

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class MemberTest {
    @Test
    fun `SYSTEM 회원은 system 고정 정보로 생성된다`() {
        assertThat(MemberPolicy.SYSTEM.id).isEqualTo(1)
        assertThat(MemberPolicy.SYSTEM.username).isEqualTo("system")
        assertThat(MemberPolicy.SYSTEM.nickname).isEqualTo("시스템")
        assertThat(MemberPolicy.SYSTEM.name).isEqualTo("시스템")
        assertThat(MemberPolicy.SYSTEM.isAdmin).isTrue()
    }

    @Test
    fun `genApiKey 는 UUID 형식의 문자열을 생성한다`() {
        val apiKey1 = MemberPolicy.genApiKey()
        val apiKey2 = MemberPolicy.genApiKey()

        assertThat(apiKey1).matches("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
        assertThat(apiKey2).matches("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
        assertThat(apiKey1).isNotEqualTo(apiKey2)
    }
}
